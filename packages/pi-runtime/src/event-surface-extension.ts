/**
 * Wire the UpUp Pi event surface onto a live `ExtensionAPI`.
 *
 * This is the only place where Pi types and UpUp behavior meet. Every decision
 * it makes is delegated to a pure helper in `investment-event-behaviors.ts`, so
 * the interesting logic is tested without an agent session, and this file stays
 * a readable list of "which Pi event teaches UpUp what".
 *
 * Two rules keep this file from breaking Pi:
 *
 *  - **`contractBehaviors` own a return value** (`resources_discover`, `input`,
 *    `session_before_tree`, `before_agent_start`). Pi consumes what they return,
 *    so they are kept separate from ordinary behaviors and never return
 *    metadata.
 *  - **`describe` carries metadata.** Handlers for the remaining
 *    result-contract events (`context`, `before_provider_request`, `message_end`,
 *    `tool_call`, `tool_result`, `user_bash`, `session_before_*`) only read the
 *    event; the router rejects a return value from them, because returning an
 *    object there would *replace* the payload instead of annotating it.
 *
 * Dependency direction: all side effects arrive through `UpUpEventSurfacePorts`
 * (settings persistence, watchlist, research subject, audit sink) because
 * `@upup/pi-runtime` sits below the packages that own them. Injection is what
 * keeps this module free of cycles — and makes it testable with fakes.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  InputEventResult,
} from '@earendil-works/pi-coding-agent';
import { createEventAuditSink, type EventAuditSink } from './event-audit-sink';
import {
  mountUpUpEventSurfaceOnPi,
  type PiCanonicalEventName,
  type PiEventAuditRecord,
} from './event-surface';
import {
  buildUpUpProviderHeaders,
  classifyProviderHealth,
  describeContext,
  discoverUpUpResourceDirs,
  expandInvestmentInput,
  findUnsourcedNumbers,
  guessMarketLabel,
  repairDegenerateOutputBudget,
  resolveOutputBudgetTarget,
  resolveSessionDisplayName,
  summarizeCompaction,
  summarizeToolExecution,
  type UpUpResourceDirs,
} from './investment-event-behaviors';

/** Research subject for the current session (set by `/invest`, dossier, …). */
export interface UpUpResearchSubject {
  readonly ticker?: string;
  readonly market?: string;
  readonly planId?: string;
  readonly phase?: string;
  /** SOP id when the turn runs a user-authored methodology. */
  readonly sopId?: string;
}

export interface UpUpEventSurfacePorts {
  readonly audit?: (record: PiEventAuditRecord) => void;
  /** Persist one key into `$UPUP_HOME/settings.json`. */
  readonly persistSetting?: (key: string, value: unknown) => void;
  /** Tickers the user is tracking, used by `@watchlist` expansion. */
  readonly readWatchlist?: () => readonly string[];
  /** Current research subject, used for naming, attribution and tree labels. */
  readonly readSubject?: () => UpUpResearchSubject | undefined;
  /** UpUp home root; defaults to `$UPUP_HOME` then `~/.upup`. */
  readonly upupHome?: string;
  /** Client identity for provider attribution headers. */
  readonly client?: string;
  readonly now?: () => number;
  readonly onError?: (event: string, error: unknown) => void;
  /** Disable the JSONL audit trail (hosts that supply their own sink). */
  readonly disableAuditFile?: boolean;
}

/** Entry type appended for answers that assert numbers without a source. */
export const UNSOURCED_NUMBERS_ENTRY = 'upup_unsourced_numbers';

/** Entry type appended with per-session provider/tool health. */
export const SESSION_HEALTH_ENTRY = 'upup_session_health';

/** Custom message type used to announce a flag-derived session directive. */
export const SESSION_DIRECTIVE_ENTRY = 'upup_session_directive';

/**
 * Tools that must not stay active in a read-only session. Mirrors the five
 * high-risk tools the Pi policy layer already denies by default — removing them
 * from the active set is defence in depth for `--no-trade-advice` runs.
 */
export const READ_ONLY_BLOCKED_TOOLS: readonly string[] = [
  'place_trade_order',
  'config_set',
  'write_file',
  'mcp_auth_get',
  'notify',
];

const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);

/** Flags the UpUp surface registers and consumes. */
export const UPUP_FLAGS = {
  market: { description: '限定本次会话的市场范围: cn | hk | us | any', type: 'string' as const },
  sop: { description: '指定本次会话遵循的投研 SOP id（见 /sop list）', type: 'string' as const },
  focus: { description: '本次会话的额外研究重点', type: 'string' as const },
  noTradeAdvice: { description: '只做研究与证据，不给交易建议（同时关闭高风险工具）', type: 'boolean' as const },
  thinkingLevel: { description: '本次会话的 thinking level: off | minimal | low | medium | high | xhigh', type: 'string' as const },
} as const;

/**
 * Structural view of a Pi/UpUp agent message. Deliberately not imported from
 * Pi: the surface only needs `role` + text, and keeping it structural means a
 * Pi message-shape change degrades to "audit a bit less" instead of a
 * compile-time break in the event surface.
 */
export interface PiMessageLike {
  readonly role?: string;
  readonly content?: unknown;
}

function pickText(message: PiMessageLike | undefined): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
    .join('');
}

function resolveUpUpHome(ports: UpUpEventSurfacePorts): string {
  if (ports.upupHome) return ports.upupHome;
  const fromEnv = process.env.UPUP_HOME?.trim();
  if (fromEnv) return fromEnv;
  return process.env.HOME ? `${process.env.HOME}/.upup` : `${process.cwd()}/.upup`;
}

/**
 * Build the per-session investment directive injected into the system prompt
 * when the user passed a flag on the command line (`upup --market cn --sop graham`).
 * Returns `undefined` when no flag applies, so the default prompt is untouched.
 */
export function buildFlagDirective(flags: {
  readonly market?: string | boolean;
  readonly sop?: string | boolean;
  readonly focus?: string | boolean;
  readonly noTradeAdvice?: string | boolean;
}): string | undefined {
  const lines: string[] = [];
  const market = typeof flags.market === 'string' ? flags.market.trim() : undefined;
  if (market && market !== 'any') {
    lines.push(`- 本次会话只分析 ${market.toUpperCase()} 市场的标的；标的不在该市场时先说明并按该市场口径重述。`);
  }
  const sop = typeof flags.sop === 'string' ? flags.sop.trim() : undefined;
  if (sop) {
    lines.push(`- 本次会话遵循 SOP \`${sop}\`（可用 /sop show ${sop} 查看阶段，/invest --sop ${sop} <TICKER> 运行）。`);
  }
  const focus = typeof flags.focus === 'string' ? flags.focus.trim() : undefined;
  if (focus) lines.push(`- 研究重点: ${focus}`);
  if (flags.noTradeAdvice === true || flags.noTradeAdvice === 'true') {
    lines.push('- 只输出研究与证据，不给出买卖建议、目标价或仓位指令。');
  }
  if (lines.length === 0) return undefined;
  return ['## 本次会话的投资约束（由 UpUp 启动参数设置）', ...lines].join('\n');
}

/**
 * Code-style bare tickers so they read as data, not prose.
 *
 * Recognises the four ticker idioms a finance user actually types:
 *   - 6 digits + .SH / .SZ / .BJ       (A-share)
 *   - 4-5 digits + .HK                 (HK share)
 *   - $ + 1-5 uppercase letters        (US-prefix, e.g. `$AAPL`)
 *   - 1-5 uppercase letters alone      (US-bare, e.g. `AAPL`)
 *
 * Honours fenced code blocks and inline backticks — never touches text
 * inside an existing code span. Pure function; the markdown is rewritten
 * in a single pass with no external state.
 */
export function codeStyleTickers(markdown: string): string {
  if (!markdown) return markdown;
  if (!/\d{6}\.(?:SH|SZ|BJ)|\d{4,5}\.HK|\$\s?[A-Z]{1,5}|(?<![\w`])(?:[A-Z]{2,5})(?![\w`])/.test(markdown)) return markdown;
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || line.includes('`')) return line;
      let out = line;
      // A-share + HK first (explicit suffix disambiguates).
      out = out.replace(/\b(\d{6}\.(?:SH|SZ|BJ))\b/gi, '`$1`');
      out = out.replace(/\b(\d{4,5}\.HK)\b/gi, '`$1`');
      // $AAPL — preserve the dollar sign outside the backticks so it reads as a quote prefix.
      out = out.replace(/(\$\s?)([A-Z]{1,5})(?![\w`])/g, '$1`$2`');
      // Bare AAPL — only when not already inside backticks and not preceded by $ (already handled).
      out = out.replace(/(?<![\w`$])([A-Z]{2,5})(?![\w`])/g, '`$1`');
      return out;
    })
    .join('\n');
}

/** Read the active tool set, degrading to "unknown" instead of throwing. */
function safeActiveTools(pi: ExtensionAPI, ports: UpUpEventSurfacePorts): readonly string[] {
  try {
    const tools = pi.getActiveTools();
    return Array.isArray(tools) ? tools : [];
  } catch (error) {
    ports.onError?.('getActiveTools', error);
    return [];
  }
}

/**
 * Drop the fail-closed high-risk tools from the active set for a read-only
 * session. Returns how many tools were removed.
 */
function applyReadOnlyToolScope(pi: ExtensionAPI, ports: UpUpEventSurfacePorts, activeTools: readonly string[]): number {
  const blocked = new Set(READ_ONLY_BLOCKED_TOOLS);
  const next = activeTools.filter((name) => !blocked.has(name));
  const removed = activeTools.length - next.length;
  if (removed === 0) return 0;
  try {
    pi.setActiveTools([...next]);
  } catch (error) {
    ports.onError?.('setActiveTools', error);
    return 0;
  }
  return removed;
}

/**
 * Create the UpUp event surface extension. Mount it via `extensionFactories`
 * (or `-e`) so both the interactive TUI and the embedded/headless session
 * paths observe the same 36 Pi events.
 */
export function createUpUpEventSurfaceExtension(ports: UpUpEventSurfacePorts = {}): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    const now = ports.now ?? Date.now;
    // The file trail is the default sink. A host can add its own sink on top
    // (`ports.audit`) or turn the file off entirely (`disableAuditFile`).
    const auditSink: EventAuditSink | undefined = ports.disableAuditFile ? undefined : createEventAuditSink();
    const record = (entry: PiEventAuditRecord): void => {
      auditSink?.record(entry);
      ports.audit?.(entry);
    };

    const toolStartedAt = new Map<string, number>();
    const toolUpdates = new Map<string, number>();
    let agentStartedAt: number | undefined;
    let turnStartedAt: number | undefined;
    let uiPromptStartedAt: number | undefined;
    let messageUpdates = 0;
    let sessionId: string | undefined;
    let cwd: string | undefined;
    let announcedDirective = false;
    let discoveredResources: UpUpResourceDirs | undefined;
    let lastInputExpansions: readonly string[] = [];
    let lastMessageAudit: Record<string, unknown> | undefined;
    let lastOutputBudgetRepair: { field: string; before: number; after: number } | undefined;
    const sessionHealth = {
      turns: 0,
      toolCalls: 0,
      toolErrors: 0,
      providerErrors: 0,
      compactions: 0,
      unsourcedNumberFindings: 0,
      readOnlyToolsDisabled: 0,
      commandCount: 0,
      resolvedSessionName: undefined as string | undefined,
      thinkingLevel: undefined as string | undefined,
      startedAt: now(),
    };

    const subject = (): UpUpResearchSubject | undefined => {
      try {
        return ports.readSubject?.();
      } catch (error) {
        ports.onError?.('readSubject', error);
        return undefined;
      }
    };

    const safeWatchlist = (): readonly string[] => {
      try {
        return ports.readWatchlist?.() ?? [];
      } catch (error) {
        ports.onError?.('readWatchlist', error);
        return [];
      }
    };

    const persist = (key: string, value: unknown): void => {
      if (!ports.persistSetting || value === undefined || value === null) return;
      try {
        ports.persistSetting(key, value);
      } catch (error) {
        ports.onError?.(`persistSetting:${key}`, error);
      }
    };

    const readFlags = (): Record<string, string | boolean | undefined> => {
      const out: Record<string, string | boolean | undefined> = {};
      for (const name of Object.keys(UPUP_FLAGS)) {
        try {
          out[name] = pi.getFlag(name);
        } catch (error) {
          ports.onError?.(`getFlag:${name}`, error);
        }
      }
      if (out.sop === undefined) out.sop = subject()?.sopId;
      return out;
    };

    // Flags must be registered before Pi parses argv, so this happens at
    // extension-load time rather than inside an event handler.
    for (const [name, flagOptions] of Object.entries(UPUP_FLAGS)) {
      try {
        pi.registerFlag(name, flagOptions);
      } catch (error) {
        ports.onError?.(`registerFlag:${name}`, error);
      }
    }
    try {
      pi.registerMarkdownTransformer(codeStyleTickers);
    } catch (error) {
      ports.onError?.('registerMarkdownTransformer', error);
    }

    mountUpUpEventSurfaceOnPi(pi, {
      sink: record,
      ...(ports.onError ? { onHandlerError: (event: PiCanonicalEventName, error: unknown) => ports.onError?.(`event:${event}`, error) } : {}),

      // ---------------------------------------------------------------------
      // Handlers that own Pi's return value.
      // ---------------------------------------------------------------------
      contractBehaviors: {
        resources_discover: (event) => {
          const evt = event as { cwd?: string };
          const dirs = discoverUpUpResourceDirs({ cwd: evt.cwd ?? cwd ?? process.cwd(), upupHome: resolveUpUpHome(ports) });
          discoveredResources = dirs;
          const result = {
            ...(dirs.skillPaths.length ? { skillPaths: [...dirs.skillPaths] } : {}),
            ...(dirs.promptPaths.length ? { promptPaths: [...dirs.promptPaths] } : {}),
            ...(dirs.themePaths.length ? { themePaths: [...dirs.themePaths] } : {}),
          };
          return Object.keys(result).length > 0 ? result : undefined;
        },

        session_before_tree: () => {
          const current = subject();
          const label = current?.ticker
            ? current.sopId ? `${current.ticker} · ${current.sopId}` : current.ticker
            : current?.planId;
          return label ? { label } : undefined;
        },

        before_agent_start: (event) => {
          const directive = buildFlagDirective(readFlags());
          if (!directive) return undefined;
          const base = (event as { systemPrompt?: string }).systemPrompt ?? '';
          if (base.includes(directive)) return undefined;
          return { systemPrompt: `${base}\n\n${directive}\n` };
        },

        input: (event) => {
          const evt = event as InputEvent;
          const watchlist = safeWatchlist();
          const market = subject()?.market;
          const expanded = expandInvestmentInput(evt.text, {
            ...(watchlist.length ? { watchlist } : {}),
            ...(market ? { market } : {}),
          });
          if (!expanded) return undefined;
          lastInputExpansions = expanded.expansions;
          return { action: 'transform', text: expanded.text } satisfies InputEventResult;
        },

        /**
         * Keep the outgoing request from carrying an unusable output budget.
         *
         * Pi clamps `maxTokens` to `contextWindow - estimate - 4096` with a
         * one-token floor. When the provider catalog under-reports
         * `contextWindow` (the `ax` gateway declares 128k for a model that
         * really serves 260k+), a long session drives that expression below
         * one, so Pi sends `max_tokens: 1` and the gateway answers with a
         * 128-token ceiling plus `finish_reason: "length"` — rendered to the
         * user as "Response was truncated before completion." on every turn.
         *
         * `context.model.maxTokens` is the value Pi fed into the clamp, so
         * restoring to it undoes exactly the clamp that starved the request
         * while leaving a genuinely small budget untouched. This hook is the
         * only lever UpUp has: the clamp runs inside Pi's provider adapters,
         * after every extension-visible budget decision.
         */
        before_provider_request: (event, context) => {
          lastOutputBudgetRepair = undefined;
          const payload = (event as { payload?: unknown }).payload;
          const declaredMax = (context as { model?: { maxTokens?: number } } | undefined)?.model?.maxTokens;
          const target = resolveOutputBudgetTarget(declaredMax);
          const { payload: repaired, repair } = repairDegenerateOutputBudget(payload, { target });
          if (!repair) return undefined;
          lastOutputBudgetRepair = repair;
          return repaired;
        },
      },

      // ---------------------------------------------------------------------
      // Handlers that only act — Pi ignores what they return.
      // ---------------------------------------------------------------------
      behaviors: {
        session_start: (event, context) => {
          const evt = event as { reason?: string };
          sessionId = (context as ExtensionContext | undefined)?.sessionManager?.getSessionId?.();
          cwd = (context as ExtensionContext | undefined)?.cwd;
          sessionHealth.startedAt = now();
          const current = subject();
          try {
            pi.setSessionName(resolveSessionDisplayName({
              cwd: cwd ?? process.cwd(),
              ...(current?.ticker ? { ticker: current.ticker } : {}),
              ...(current?.market ? { market: current.market } : {}),
              ...(current?.planId && !current.ticker ? { planId: current.planId } : {}),
            }));
          } catch (error) {
            ports.onError?.('setSessionName', error);
          }

          const flags = readFlags();
          const activeTools = safeActiveTools(pi, ports);
          if (flags.noTradeAdvice === true || flags.noTradeAdvice === 'true') {
            sessionHealth.readOnlyToolsDisabled = applyReadOnlyToolScope(pi, ports, activeTools);
          }
          try {
            const commands = pi.getCommands();
            sessionHealth.commandCount = Array.isArray(commands) ? commands.length : 0;
          } catch (error) {
            ports.onError?.('getCommands', error);
          }
          try {
            const resolved = pi.getSessionName();
            if (resolved) sessionHealth.resolvedSessionName = resolved;
          } catch (error) {
            ports.onError?.('getSessionName', error);
          }
          const thinkingLevel = typeof flags.thinkingLevel === 'string' ? flags.thinkingLevel.trim().toLowerCase() : undefined;
          if (thinkingLevel && VALID_THINKING_LEVELS.has(thinkingLevel)) {
            try {
              pi.setThinkingLevel(thinkingLevel as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh');
              sessionHealth.thinkingLevel = thinkingLevel;
            } catch (error) {
              ports.onError?.('setThinkingLevel', error);
            }
          }
          const directive = buildFlagDirective(flags);
          if (directive && !announcedDirective) {
            announcedDirective = true;
            try {
              pi.sendMessage(
                { customType: SESSION_DIRECTIVE_ENTRY, content: directive, display: true },
                { triggerTurn: false, deliverAs: 'nextTurn' },
              );
            } catch (error) {
              ports.onError?.('sendMessage:session_directive', error);
            }
          }
          return { reason: evt.reason ?? null, activeTools: activeTools.length };
        },

        'session_info_changed': () => undefined,

        'session_compact': (event) => {
          const evt = event as { compactionEntry?: { tokensBefore?: number; tokensAfter?: number } };
          sessionHealth.compactions += 1;
          return summarizeCompaction({ tokensBefore: evt.compactionEntry?.tokensBefore, tokensAfter: evt.compactionEntry?.tokensAfter });
        },

        'session_compact_failed': () => {
          sessionHealth.compactions += 1;
          return { failed: true };
        },

        'session_shutdown': () => {
          try {
            pi.appendEntry(SESSION_HEALTH_ENTRY, { ...sessionHealth, endedAt: now() });
          } catch (error) {
            ports.onError?.('appendEntry:session_health', error);
          }
          auditSink?.flush();
          return undefined;
        },

        'session_tree': () => undefined,

        before_provider_headers: (event) => {
          const evt = event as { headers?: Record<string, string | null> };
          if (!evt.headers) return undefined;
          const current = subject();
          const headers = buildUpUpProviderHeaders({
            client: ports.client ?? 'upup',
            ...(sessionId ? { sessionId } : {}),
            ...(current?.planId ? { planId: current.planId } : {}),
            ...(current?.phase ? { phase: current.phase } : {}),
            ...(current?.market ? { market: current.market } : {}),
            ...(current?.ticker ? { ticker: current.ticker } : {}),
          });
          for (const [key, value] of Object.entries(headers)) {
            if (value === null) delete evt.headers[key];
            else evt.headers[key] = value;
          }
          return { injected: Object.keys(headers).length };
        },

        after_provider_response: (event) => {
          const evt = event as { status?: number; headers?: Record<string, string> };
          const health = classifyProviderHealth({ status: evt.status ?? 0, ...(evt.headers ? { headers: evt.headers } : {}) });
          if (health.level !== 'ok') sessionHealth.providerErrors += 1;
          return { ...health };
        },

        agent_start: () => {
          agentStartedAt = now();
          return undefined;
        },

        agent_end: (event) => ({
          messages: (event as { messages?: readonly unknown[] }).messages?.length ?? 0,
          durationMs: agentStartedAt ? now() - agentStartedAt : undefined,
        }),

        agent_settled: () => ({ durationMs: agentStartedAt ? now() - agentStartedAt : undefined }),

        ui_prompt_start: (event) => {
          uiPromptStartedAt = now();
          return { kind: (event as { kind?: string }).kind ?? null };
        },

        ui_prompt_end: (event) => ({
          kind: (event as { kind?: string }).kind ?? null,
          waitMs: uiPromptStartedAt ? now() - uiPromptStartedAt : undefined,
        }),

        turn_start: (event) => {
          turnStartedAt = now();
          sessionHealth.turns += 1;
          return { turnIndex: (event as { turnIndex?: number }).turnIndex ?? null };
        },

        turn_end: (event) => {
          const evt = event as { turnIndex?: number; toolResults?: readonly unknown[] };
          return {
            turnIndex: evt.turnIndex ?? null,
            toolResults: evt.toolResults?.length ?? 0,
            durationMs: turnStartedAt ? now() - turnStartedAt : undefined,
          };
        },

        message_start: () => undefined,

        message_update: () => {
          messageUpdates += 1;
          return undefined;
        },

        message_end: (event) => {
          const evt = event as { message?: PiMessageLike };
          const role = evt.message?.role;
          const text = pickText(evt.message);
          const findings = role === 'assistant' ? findUnsourcedNumbers(text) : [];
          lastMessageAudit = { role: role ?? null, chars: text.length, updates: messageUpdates, unsourcedNumbers: findings.length };
          if (findings.length > 0) {
            sessionHealth.unsourcedNumberFindings += findings.length;
            try {
              pi.appendEntry(UNSOURCED_NUMBERS_ENTRY, { count: findings.length, lines: findings.map((finding) => finding.fragment) });
            } catch (error) {
              ports.onError?.('appendEntry:unsourced', error);
            }
          }
          return undefined;
        },

        tool_execution_start: (event) => {
          const evt = event as { toolCallId?: string; toolName?: string };
          if (evt.toolCallId) toolStartedAt.set(evt.toolCallId, now());
          toolUpdates.delete(evt.toolCallId ?? '');
          sessionHealth.toolCalls += 1;
          return undefined;
        },

        tool_execution_update: (event) => {
          const key = (event as { toolCallId?: string }).toolCallId ?? '';
          toolUpdates.set(key, (toolUpdates.get(key) ?? 0) + 1);
          return { updates: toolUpdates.get(key) ?? 0 };
        },

        tool_execution_end: (event) => {
          const evt = event as { toolCallId?: string; toolName?: string; isError?: boolean };
          const key = evt.toolCallId ?? '';
          const startedAt = toolStartedAt.get(key);
          toolStartedAt.delete(key);
          const summary = summarizeToolExecution({
            toolName: evt.toolName ?? 'unknown',
            ...(evt.isError !== undefined ? { isError: evt.isError } : {}),
            durationMs: startedAt !== undefined ? now() - startedAt : 0,
          });
          if (!summary.ok) sessionHealth.toolErrors += 1;
          return { ...summary, updates: toolUpdates.get(key) ?? 0 };
        },

        model_select: (event) => {
          const evt = event as { model?: { id?: string; provider?: string }; previousModel?: { id?: string }; source?: string };
          persist('modelId', evt.model?.id);
          return {
            model: evt.model?.id ?? null,
            provider: evt.model?.provider ?? null,
            previousModel: evt.previousModel?.id ?? null,
            source: evt.source ?? null,
          };
        },

        thinking_level_select: (event) => {
          const evt = event as { level?: string; previousLevel?: string };
          persist('thinkingLevel', evt.level);
          return { level: evt.level ?? null, previousLevel: evt.previousLevel ?? null };
        },
      },

      // ---------------------------------------------------------------------
      // Metadata for the events whose return value belongs to Pi or to another
      // extension. `describe` cannot affect Pi, so it is the safe place for it.
      // ---------------------------------------------------------------------
      describe: {
        'project_trust': (event) => ({ cwd: (event as { cwd?: string }).cwd ?? null }),

        'session_before_switch': (event) => {
          const evt = event as { reason?: string; targetSessionFile?: string };
          return { reason: evt.reason ?? null, target: evt.targetSessionFile ? 'set' : null };
        },

        'session_before_fork': (event) => {
          const evt = event as { entryId?: string; position?: string };
          const planId = subject()?.planId;
          return { entryId: evt.entryId ?? null, position: evt.position ?? null, ...(planId ? { planId } : {}) };
        },

        'session_before_compact': (event) => {
          const evt = event as { reason?: string; willRetry?: boolean; preparation?: { tokensBefore?: number; firstKeptEntryId?: string } };
          return {
            reason: evt.reason ?? null,
            willRetry: evt.willRetry ?? null,
            tokensBefore: evt.preparation?.tokensBefore ?? null,
            owner: 'finance-session-policy',
          };
        },

        context: (event) => describeContext((event as { messages?: readonly unknown[] }).messages ?? []),

        before_provider_request: (event) => {
          const payload = (event as { payload?: unknown }).payload;
          let bytes = -1;
          try {
            bytes = JSON.stringify(payload ?? null).length;
          } catch {
            bytes = -1;
          }
          const phase = subject()?.phase;
          return {
            payloadBytes: bytes,
            ...(phase ? { phase } : {}),
            // Present only when this request was repaired, so the trail explains
            // why the outgoing budget differs from the model's configured cap.
            ...(lastOutputBudgetRepair ? { outputBudgetRepair: { ...lastOutputBudgetRepair } } : {}),
          };
        },

        tool_call: (event) => ({ tool: (event as { toolName?: string }).toolName ?? null, owner: 'policy-chain' }),

        tool_result: (event) => ({ tool: (event as { toolName?: string }).toolName ?? null, owner: 'tool-error-bridge' }),

        user_bash: (event) => {
          const command = (event as { command?: string }).command ?? '';
          return {
            commandLength: command.length,
            commandHead: command.slice(0, 120),
            excludeFromContext: (event as { excludeFromContext?: boolean }).excludeFromContext ?? null,
            commandCount: command.split(/\s*(?:&&|;|\|)\s*/).filter(Boolean).length,
          };
        },

        tool_execution_start: () => {
          const market = subject()?.market;
          return market ? { market } : undefined;
        },

        input: () => (lastInputExpansions.length ? { expansions: [...lastInputExpansions] } : undefined),

        message_end: () => lastMessageAudit,

        resources_discover: () => (discoveredResources
          ? { skills: discoveredResources.skillPaths.length, prompts: discoveredResources.promptPaths.length, missing: discoveredResources.missing.length }
          : undefined),

        session_compact: () => undefined,
      },
    });
  };
}

/** Market-aware ticker label helper re-exported for hosts that render tickers. */
export { guessMarketLabel };

export default createUpUpEventSurfaceExtension;
