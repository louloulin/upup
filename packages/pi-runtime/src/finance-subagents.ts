/**
 * UpUp finance subagent registration — wraps Pi ecosystem's
 * `pi-subagents` runtime agent registry with the four canonical
 * finance-domain subagents UpUp `/invest --sop debate` (and similar
 * SOPs) need.
 *
 * Why register explicitly:
 *   pi-subagents itself only ships generic roles (`advisor`, `researcher`,
 *   `reviewer`, …). Finance-domain debate needs domain-tuned prompts and
 *   tool budgets; rather than bake those into pi-subagents, UpUp registers
 *   `bull` / `bear` / `synthesizer` / `risk` at session start. Each one is
 *   a thin wrapper around a system prompt + tool allowlist — no business
 *   logic, just configuration that `pi-subagents`' DAG scheduler consumes.
 *
 * Failure isolation:
 *   `pi-subagents` validates every field of `RuntimeAgentDefinition`. If
 *   a name collides with a built-in (`BUILTIN_AGENT_NAMES`), the call
 *   throws. We swallow the throw and log it via `sink?.onError` so the
 *   session keeps booting — the user's `/invest` flow still works through
 *   the legacy `research-coordinator` even if subagent registration fails.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type RuntimeAgentDefinition = {
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly excludeTools?: readonly string[];
  readonly thinking?: string | false;
  readonly defaultTimeoutMs?: number;
  readonly defaultAsync?: boolean;
  readonly inheritProjectContext?: boolean;
  readonly inheritSkills?: boolean;
};

type RegisterAgentFn = (input: {
  readonly pi: ExtensionAPI;
  readonly name: string;
  readonly definition: RuntimeAgentDefinition;
}) => { dispose: () => void };

/** Sink for failure isolation. Optional — defaults to console.error. */
export interface UpUpFinanceSubagentSink {
  readonly onError?: (agent: string, error: unknown) => void;
}

export interface UpUpFinanceSubagentOptions {
  /** The four canonical agents; null entries are skipped (useful for tests). */
  readonly agents?: readonly UpUpFinanceSubagentSpec[];
  /** Defaults to the bull / bear / synthesizer / risk set. */
  readonly sink?: UpUpFinanceSubagentSink;
}

export interface UpUpFinanceSubagentSpec {
  readonly name: 'bull' | 'bear' | 'synthesizer' | 'risk' | string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools?: readonly string[];
  readonly excludeTools?: readonly string[];
  readonly thinking?: 'low' | 'medium' | 'high' | 'xhigh' | false;
  readonly defaultTimeoutMs?: number;
  readonly defaultAsync?: boolean;
}

/**
 * The four canonical UpUp finance subagents. Each prompt is intentionally
 * generic — domain specialisation belongs in the per-agent `systemPrompt`
 * the host injects at SOP-loading time. The defaults here are what a fresh
 * user gets when they run `/invest --sop debate <TICKER>` without any
 * custom SOP loaded.
 */
export const UPUP_FINANCE_SUBAGENT_DEFAULTS: readonly UpUpFinanceSubagentSpec[] = [
  {
    name: 'bull',
    description: 'Argue the bullish case for a ticker; surface catalysts, growth drivers, valuation upside.',
    systemPrompt:
      'You are UpUp bull analyst. Read every piece of available evidence ' +
      '(filings, market data, news, technicals) and build the strongest ' +
      'argument for owning this ticker. Cite every number with its source. ' +
      'Do not fabricate numbers — when evidence is missing, say so. End with ' +
      'one paragraph on what would invalidate your thesis.',
    excludeTools: ['place_trade_order', 'cancel_trade_order', 'config_set', 'write_file'],
    thinking: 'high',
    defaultTimeoutMs: 180_000,
  },
  {
    name: 'bear',
    description: 'Argue the bearish case for a ticker; surface risks, downside catalysts, valuation traps.',
    systemPrompt:
      'You are UpUp bear analyst. Same evidence as the bull run, but ' +
      'build the strongest argument for *not* owning (or shorting) this ' +
      'ticker. Cite every number. End with one paragraph on what would ' +
      'invalidate your thesis.',
    excludeTools: ['place_trade_order', 'cancel_trade_order', 'config_set', 'write_file'],
    thinking: 'high',
    defaultTimeoutMs: 180_000,
  },
  {
    name: 'synthesizer',
    description: 'Combine bull + bear reports into a balanced view with explicit disagreement map.',
    systemPrompt:
      'You are UpUp synthesizer. Read the bull and bear reports for the ' +
      'same ticker and produce a balanced view: (1) facts both sides agree ' +
      'on, (2) facts only one side weighted, (3) the disagreement map ' +
      '(which numbers / assumptions drive the split), (4) recommended ' +
      'action with reasoning and confidence. Do not invent a new thesis.',
    excludeTools: ['place_trade_order', 'cancel_trade_order', 'config_set', 'write_file'],
    thinking: 'medium',
    defaultTimeoutMs: 120_000,
    defaultAsync: false,
  },
  {
    name: 'risk',
    description: 'Independent risk review: position sizing, drawdown scenarios, correlation risk.',
    systemPrompt:
      'You are UpUp risk reviewer. Given the bull + bear + synthesizer ' +
      'output for a ticker, evaluate position sizing (Kelly fraction, max ' +
      'drawdown), correlation risk against the existing portfolio, ' +
      'and stop-loss / take-profit levels. Do not revise the directional ' +
      'thesis — only the size and the bracket.',
    excludeTools: ['place_trade_order', 'cancel_trade_order', 'config_set', 'write_file'],
    thinking: 'high',
    defaultTimeoutMs: 120_000,
  },
] as const;

/**
 * Register every UpUp finance subagent on `pi`. Returns the dispose
 * handles so the host can tear them down on `session_shutdown`.
 *
 * Implementation: imports `pi-subagents` lazily and calls its public
 * `registerAgent` API. If `pi-subagents` is not installed (e.g. user
 * ran `upup plugin disable npm:pi-subagents`), the import throws and we
 * surface the failure through `sink?.onError` rather than crashing.
 */
export async function registerUpUpFinanceSubagents(
  pi: ExtensionAPI,
  options: UpUpFinanceSubagentOptions = {},
): Promise<readonly { name: string; dispose: () => void }[]> {
  const agents = options.agents ?? UPUP_FINANCE_SUBAGENT_DEFAULTS;
  const sink = options.sink ?? {};
  const registrations: { name: string; dispose: () => void }[] = [];

  let registerAgent: RegisterAgentFn;
  try {
    // Indirect the import path through a computed value so TS does not
    // statically analyse the transitive `.ts` imports inside pi-subagents
    // (they would fail `TS5097` because `allowImportingTsExtensions` is off).
    // At runtime Bun resolves the path through pi-subagents' package.json
    // `exports` map (`./agents` -> `./src/api/agents.ts`).
    const specifier = ['pi-subagents', 'agents'].join('/');
    const mod = (await import(specifier)) as { registerAgent: RegisterAgentFn };
    registerAgent = mod.registerAgent;
  } catch (error) {
    sink.onError?.('<loader>', error);
    return registrations;
  }

  for (const spec of agents) {
    try {
      const definition: RuntimeAgentDefinition = {
        description: spec.description,
        systemPrompt: spec.systemPrompt,
        ...(spec.tools ? { tools: spec.tools } : {}),
        ...(spec.excludeTools ? { excludeTools: spec.excludeTools } : {}),
        ...(spec.thinking !== undefined ? { thinking: spec.thinking } : {}),
        ...(spec.defaultTimeoutMs !== undefined ? { defaultTimeoutMs: spec.defaultTimeoutMs } : {}),
        ...(spec.defaultAsync !== undefined ? { defaultAsync: spec.defaultAsync } : {}),
      };
      const handle = registerAgent({ pi, name: spec.name, definition });
      registrations.push({ name: spec.name, dispose: handle.dispose });
    } catch (error) {
      sink.onError?.(spec.name, error);
    }
  }

  return registrations;
}
