/**
 * Wire the UpUp Pi event surface onto a live `ExtensionAPI`.
 *
 * This is the only place where Pi types and UpUp behavior meet. Every decision
 * it makes is delegated to a pure helper in `investment-event-behaviors.ts`, so
 * the interesting logic is tested without an agent session, and this file stays
 * a readable list of "which Pi event teaches UpUp what".
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
  resolveSessionDisplayName,
  summarizeCompaction,
  summarizeToolExecution,
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
  /** Disable the JSONL audit trail (tests usually inject their own `audit`). */
  readonly disableAuditFile?: boolean;
}

/** Entry type appended for answers that assert numbers without a source. */
export const UNSOURCED_NUMBERS_ENTRY = 'upup_unsourced_numbers';

/** Entry type appended with per-session provider/tool health. */
export const SESSION_HEALTH_ENTRY = 'upup_session_health';

/** Flags the UpUp surface registers and consumes. */
export const UPUP_FLAGS = {
  market: { description: '限定本次会话的市场范围: cn | hk | us | any', type: 'string' as const },
  sop: { description: '指定本次会话遵循的投研 SOP id（见 /sop list）', type: 'string' as const },
  focus: { description: '本次会话的额外研究重点', type: 'string' as const },
  noTradeAdvice: { description: '只做研究与证据，不给交易建议', type: 'boolean' as const },
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
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
    .join('');
}

function resolveUpUpHome(ports: UpUpEventSurfacePorts, context: unknown): string {
  if (ports.upupHome) return ports.upupHome;
  const fromEnv = process.env.UPUP_HOME?.trim();
  if (fromEnv) return fromEnv;
  const cwd = (context as { cwd?: string } | undefined)?.cwd ?? process.cwd();
  void cwd;
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

/** Code-style bare A-share / HK tickers so they read as data, not prose. */
export function codeStyleTickers(markdown: string): string {
  if (!markdown || !/\d{6}\.(SH|SZ|BJ)|\d{4,5}\.HK/i.test(markdown)) return markdown;
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || line.includes('`')) return line;
      return line.replace(/\b(\d{6}\.(?:SH|SZ|BJ)|\d{4,5}\.HK)\b/gi, '`$1`');
    })
    .join('\n');
}

/**
 * Create the UpUp event surface extension. Mount it via `extensionFactories`
 * (or `-e`) so both the interactive TUI and the embedded/headless session
 * paths observe the same 36 Pi events.
 */
export function createUpUpEventSurfaceExtension(ports: UpUpEventSurfacePorts = {}): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    const now = ports.now ?? Date.now;
    const auditSink: EventAuditSink | undefined = ports.disableAuditFile
      ? undefined
      : createEventAuditSink(ports.audit ? { enabled: false } : {});
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
    const sessionHealth = { turns: 0, toolCalls: 0, toolErrors: 0, providerErrors: 0, compactions: 0, unsourcedNumberFindings: 0, startedAt: now() };

    const subject = (): UpUpResearchSubject | undefined => {
      try {
        return ports.readSubject?.();
      } catch (error) {
        ports.onError?.('readSubject', error);
        return undefined;
      }
    };

    const attachFlags = (): void => {
      for (const [name, options] of Object.entries(UPUP_FLAGS)) {
        try {
          pi.registerFlag(name, options);
        } catch (error) {
          ports.onError?.(`registerFlag:${name}`, error);
        }
      }
      try {
        pi.registerMarkdownTransformer(codeStyleTickers);
      } catch (error) {
        ports.onError?.('registerMarkdownTransformer', error);
      }
    };

    attachFlags();

    mountUpUpEventSurfaceOnPi(pi, {
      sink: record,
      ...(ports.onError ? { onHandlerError: (event: PiCanonicalEventName, error: unknown) => ports.onError?.(`event:${event}`, error) } : {}),
      behaviors: {
        resources_discover: (event, context) => {
          const evt = event as { cwd?: string };
          const home = resolveUpUpHome(ports, context);
          const dirs = discoverUpUpResourceDirs({ cwd: evt.cwd ?? cwd ?? process.cwd(), upupHome: home });
          const result = {
            ...(dirs.skillPaths.length ? { skillPaths: [...dirs.skillPaths] } : {}),
            ...(dirs.promptPaths.length ? { promptPaths: [...dirs.promptPaths] } : {}),
            ...(dirs.themePaths.length ? { themePaths: [...dirs.themePaths] } : {}),
          };
          return Object.keys(result).length > 0 ? result : undefined;
        },

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
          return undefined;
        },

        'session_info_changed': (event) => ({ name: (event as { name?: string }).name ?? null }),

        'session_before_switch': (event) => {
          const evt = event as { reason?: string; targetSessionFile?: string };
          return { reason: evt.reason ?? null, target: evt.targetSessionFile ? 'set' : null };
        },

        'session_before_fork': (event) => {
          const evt = event as { entryId?: string; position?: string };
          const current = subject();
          return { entryId: evt.entryId ?? null, position: evt.position ?? null, ...(current?.planId ? { planId: current.planId } : {}) };
        },

        'session_before_compact': (event) => {
          const evt = event as { reason?: string; willRetry?: boolean; preparation?: { tokensBefore?: number; firstKeptEntryId?: string } };
          return {
            reason: evt.reason ?? null,
            willRetry: evt.willRetry ?? null,
            tokensBefore: evt.preparation?.tokensBefore ?? null,
            firstKeptEntryId: evt.preparation?.firstKeptEntryId ?? null,
            owner: 'finance-session-policy',
          };
        },

        'session_compact': (event) => {
          const evt = event as { reason?: string; fromExtension?: boolean; compactionEntry?: { tokensBefore?: number; tokensAfter?: number } };
          sessionHealth.compactions += 1;
          const summary = summarizeCompaction({
            tokensBefore: evt.compactionEntry?.tokensBefore,
            tokensAfter: evt.compactionEntry?.tokensAfter,
          });
          return { reason: evt.reason ?? null, fromExtension: evt.fromExtension ?? null, ...summary };
        },

        'session_compact_failed': (event) => {
          const evt = event as { reason?: string; errorMessage?: string };
          sessionHealth.compactions += 1;
          return { reason: evt.reason ?? null, failed: true, message: evt.errorMessage ?? null };
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

        'session_before_tree': () => {
          const current = subject();
          const label = current?.ticker
            ? current.sopId ? `${current.ticker} · ${current.sopId}` : current.ticker
            : current?.planId;
          return label ? { label } : undefined;
        },

        'session_tree': (event) => {
          const evt = event as { newLeafId?: string | null; oldLeafId?: string | null };
          return { newLeaf: evt.newLeafId ?? null, oldLeaf: evt.oldLeafId ?? null };
        },

        context: (event) => {
          const evt = event as { messages?: readonly unknown[] };
          return describeContext(evt.messages ?? []);
        },

        before_provider_request: (event) => {
          const evt = event as { payload?: unknown };
          const json = safeJsonSize(evt.payload);
          return { payloadBytes: json, ...(subject()?.phase ? { phase: subject()?.phase } : {}) };
        },

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

        before_agent_start: (event, context) => {
          const flags = readFlags(pi, ports);
          const directive = buildFlagDirective(flags);
          if (!directive) return undefined;
          const evt = event as { systemPrompt?: string };
          const base = evt.systemPrompt ?? '';
          if (base.includes(directive)) return undefined;
          void context;
          return { systemPrompt: `${base}\n\n${directive}\n` };
        },

        agent_start: () => {
          agentStartedAt = now();
          return undefined;
        },

        agent_end: (event) => {
          const evt = event as { messages?: readonly unknown[] };
          return { messages: evt.messages?.length ?? 0, durationMs: agentStartedAt ? now() - agentStartedAt : undefined };
        },

        agent_settled: () => ({ durationMs: agentStartedAt ? now() - agentStartedAt : undefined }),

        ui_prompt_start: (event) => {
          uiPromptStartedAt = now();
          const evt = event as { kind?: string; title?: string };
          return { kind: evt.kind ?? null, title: evt.title ?? null };
        },

        ui_prompt_end: (event) => {
          const evt = event as { kind?: string };
          return { kind: evt.kind ?? null, waitMs: uiPromptStartedAt ? now() - uiPromptStartedAt : undefined };
        },

        turn_start: (event) => {
          const evt = event as { turnIndex?: number };
          turnStartedAt = now();
          sessionHealth.turns += 1;
          return { turnIndex: evt.turnIndex ?? null };
        },

        turn_end: (event) => {
          const evt = event as { turnIndex?: number; toolResults?: readonly unknown[] };
          return {
            turnIndex: evt.turnIndex ?? null,
            toolResults: evt.toolResults?.length ?? 0,
            durationMs: turnStartedAt ? now() - turnStartedAt : undefined,
          };
        },

        message_start: (event) => ({ role: (event as { message?: { role?: string } }).message?.role ?? null }),

        message_update: () => {
          messageUpdates += 1;
          return undefined;
        },

        message_end: (event) => {
          const evt = event as { message?: PiMessageLike };
          const role = evt.message?.role;
          const text = pickText(evt.message);
          const findings = role === 'assistant' ? findUnsourcedNumbers(text) : [];
          if (findings.length > 0) {
            sessionHealth.unsourcedNumberFindings += findings.length;
            try {
              pi.appendEntry(UNSOURCED_NUMBERS_ENTRY, { count: findings.length, lines: findings.map((finding) => finding.fragment) });
            } catch (error) {
              ports.onError?.('appendEntry:unsourced', error);
            }
          }
          return { role: role ?? null, chars: text.length, updates: messageUpdates, unsourcedNumbers: findings.length };
        },

        tool_execution_start: (event) => {
          const evt = event as { toolCallId?: string; toolName?: string };
          if (evt.toolCallId) toolStartedAt.set(evt.toolCallId, now());
          toolUpdates.delete(evt.toolCallId ?? '');
          sessionHealth.toolCalls += 1;
          return { tool: evt.toolName ?? null };
        },

        tool_execution_update: (event) => {
          const evt = event as { toolCallId?: string };
          const key = evt.toolCallId ?? '';
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
          const modelId = evt.model?.id;
          if (modelId) persist(ports, 'modelId', modelId);
          return {
            model: modelId ?? null,
            provider: evt.model?.provider ?? null,
            previousModel: evt.previousModel?.id ?? null,
            source: evt.source ?? null,
            persisted: Boolean(modelId),
          };
        },

        thinking_level_select: (event) => {
          const evt = event as { level?: string; previousLevel?: string };
          persist(ports, 'thinkingLevel', evt.level);
          return { level: evt.level ?? null, previousLevel: evt.previousLevel ?? null };
        },

        tool_call: (event) => {
          const evt = event as { toolName?: string; toolCallId?: string };
          return { tool: evt.toolName ?? null, owner: 'policy-chain' };
        },

        tool_result: (event) => {
          const evt = event as { toolName?: string };
          return { tool: evt.toolName ?? null, owner: 'tool-error-bridge' };
        },

        user_bash: (event) => {
          const evt = event as { command?: string; excludeFromContext?: boolean; cwd?: string };
          const command = evt.command ?? '';
          return {
            commandLength: command.length,
            commandHead: command.slice(0, 120),
            excludeFromContext: evt.excludeFromContext ?? null,
            commandCount: command.split(/\s*(?:&&|;|\|)\s*/).filter(Boolean).length,
          };
        },

        input: (event: never) => {
          const evt = event as unknown as InputEvent;
          const watchlist = safeWatchlist(ports);
          const expanded = expandInvestmentInput(evt.text, {
            ...(watchlist.length ? { watchlist } : {}),
            ...(subject()?.market ? { market: subject()?.market as string } : {}),
          });
          if (!expanded) return undefined;
          const result: InputEventResult = { action: 'transform', text: expanded.text, ...(evt.images ? { images: evt.images } : {}) };
          return result;
        },
      },
      describe: {
        // Market label is attached to every tool call so the trail shows which
        // market a research run was operating on.
        'tool_execution_start': () => {
          const market = subject()?.market;
          return market ? { market } : undefined;
        },
      },
    });
  };
}

function persist(ports: UpUpEventSurfacePorts, key: string, value: unknown): void {
  if (!ports.persistSetting || value === undefined || value === null) return;
  try {
    ports.persistSetting(key, value);
  } catch (error) {
    ports.onError?.(`persistSetting:${key}`, error);
  }
}

function readFlags(pi: ExtensionAPI, ports: UpUpEventSurfacePorts): {
  readonly market?: string | boolean;
  readonly sop?: string | boolean;
  readonly focus?: string | boolean;
  readonly noTradeAdvice?: string | boolean;
} {
  const get = (name: string): string | boolean | undefined => {
    try {
      return pi.getFlag(name);
    } catch (error) {
      ports.onError?.(`getFlag:${name}`, error);
      return undefined;
    }
  };
  const market = get('market');
  const sop = get('sop') ?? subject_sopId(ports);
  const focus = get('focus');
  const noTradeAdvice = get('noTradeAdvice');
  return {
    ...(market !== undefined ? { market } : {}),
    ...(sop !== undefined ? { sop } : {}),
    ...(focus !== undefined ? { focus } : {}),
    ...(noTradeAdvice !== undefined ? { noTradeAdvice } : {}),
  };
}

function subject_sopId(ports: UpUpEventSurfacePorts): string | undefined {
  try {
    return ports.readSubject?.()?.sopId;
  } catch {
    return undefined;
  }
}

function safeWatchlist(ports: UpUpEventSurfacePorts): readonly string[] {
  try {
    return ports.readWatchlist?.() ?? [];
  } catch (error) {
    ports.onError?.('readWatchlist', error);
    return [];
  }
}

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return -1;
  }
}

/** Market-aware ticker label helper re-exported for hosts that render tickers. */
export { guessMarketLabel };

export default createUpUpEventSurfaceExtension;
