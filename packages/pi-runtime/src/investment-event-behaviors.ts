/**
 * Pure behaviors behind the UpUp Pi event surface.
 *
 * Everything here is a total function over plain data: no Pi types, no I/O, no
 * clock. The Pi wiring lives in `event-surface-extension.ts`, which means the
 * investment-specific logic (attribution headers, `@watchlist` expansion,
 * unsourced-number detection, provider health classification, resource
 * discovery) is unit-testable without a running agent session.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Provider attribution
// ---------------------------------------------------------------------------

/** Header prefix for every UpUp-injected provider header. */
export const UPUP_HEADER_PREFIX = 'x-upup-';

export interface ProviderAttributionInput {
  readonly sessionId?: string;
  readonly planId?: string;
  readonly phase?: string;
  readonly market?: string;
  readonly ticker?: string;
  /** Client identity, e.g. `upup/2026.9.17`. */
  readonly client?: string;
}

/**
 * Build the attribution headers UpUp injects before the provider HTTP call.
 *
 * Values are sanitized to header-safe ASCII (no CR/LF, 200 char cap) because
 * they come from session names, tickers and plan ids that a user can influence.
 * A `null` value deletes the header in Pi's contract, so absent fields are
 * simply omitted.
 */
export function buildUpUpProviderHeaders(input: ProviderAttributionInput): Record<string, string | null> {
  const headers: Record<string, string | null> = {};
  const put = (suffix: string, value: string | undefined): void => {
    const cleaned = sanitizeHeaderValue(value);
    if (cleaned) headers[`${UPUP_HEADER_PREFIX}${suffix}`] = cleaned;
  };
  put('client', input.client ?? 'upup');
  put('session', input.sessionId);
  put('plan', input.planId);
  put('phase', input.phase);
  put('market', input.market);
  put('ticker', input.ticker);
  return headers;
}

/** Strip CR/LF and control characters, collapse whitespace, cap the length. */
export function sanitizeHeaderValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
}

// ---------------------------------------------------------------------------
// Input expansion
// ---------------------------------------------------------------------------

export interface InputExpansionOptions {
  /** Tickers the user is tracking, in watchlist order. */
  readonly watchlist?: readonly string[];
  /** Market label used when expanding a bare `$TICKER` shorthand. */
  readonly market?: string;
  /** Maximum number of watchlist tickers inlined into one prompt. */
  readonly maxTickers?: number;
}

export interface InputExpansionResult {
  /** Rewritten prompt. */
  readonly text: string;
  /** Human-readable list of what was expanded, for the audit trail. */
  readonly expansions: readonly string[];
}

const WATCHLIST_TOKEN = /@watchlist\b/i;
/**
 * `$AAPL` / `$BRK.B` (US) and `$600519.SH` / `$00700.HK` (CN/HK).
 *
 * A-share symbols start with digits, so the pattern cannot be "letter-led
 * only"; it also cannot be "any token after `$`", because a question like
 * "预算 $100 怎么办" must not be rewritten. Requiring either a short letter
 * symbol or an explicit exchange suffix keeps the rewrite unambiguous.
 *
 * Built fresh per call: a shared `/g` literal carries `lastIndex` state across
 * calls, which silently makes the second prompt behave differently.
 */
function tickerTokenPattern(): RegExp {
  return /\$(?:[A-Za-z]{1,5}(?:\.[A-Za-z])?|[0-9]{4,6}\.(?:SH|SZ|BJ|HK))\b/g;
}

/**
 * Expand UpUp shorthands in a user prompt before the agent loop sees it.
 *
 * - `@watchlist` → the user's watchlist tickers, inlined as a list.
 * - `$AAPL` / `$600519.SH` → `AAPL (美股)` style, so the model does not have to
 *   guess which market the bare symbol belongs to.
 *
 * Returns `null` when nothing matched, which is Pi's cue to use the original
 * text untouched. Slash commands (`/invest …`) are never rewritten: Pi
 * dispatches them by prefix and rewriting would break command routing.
 */
export function expandInvestmentInput(text: string, options: InputExpansionOptions = {}): InputExpansionResult | null {
  if (!text || text.startsWith('/')) return null;

  const expansions: string[] = [];
  let next = text;

  if (WATCHLIST_TOKEN.test(next)) {
    const tickers = (options.watchlist ?? []).filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
    if (tickers.length === 0) {
      expansions.push('@watchlist → (自选列表为空)');
      next = next.replace(WATCHLIST_TOKEN, '(自选列表为空，请先添加标的)');
    } else {
      const cap = options.maxTickers ?? 25;
      const shown = tickers.slice(0, cap).map((entry) => entry.trim());
      const suffix = tickers.length > shown.length ? ` 等 ${tickers.length} 个标的` : '';
      expansions.push(`@watchlist → ${shown.join(', ')}${suffix}`);
      next = next.replace(WATCHLIST_TOKEN, `自选标的: ${shown.join(', ')}${suffix}`);
    }
  }

  const seen: string[] = [];
  next = next.replace(tickerTokenPattern(), (match) => {
    const symbol = match.slice(1);
    const market = options.market ?? guessMarketLabel(symbol);
    if (!market) return match;
    seen.push(symbol);
    return `${symbol} (${market})`;
  });
  if (seen.length > 0) expansions.push(`$${seen.join(' $')} → 已补全市场标签`);

  if (expansions.length === 0 || next === text) return null;
  return { text: next, expansions };
}

/** Best-effort market label for a bare symbol, matching UpUp's ticker conventions. */
export function guessMarketLabel(symbol: string): string | undefined {
  if (/^\d{6}\.(SH|SZ|BJ)$/i.test(symbol)) return 'A股';
  if (/^\d{4,5}\.HK$/i.test(symbol)) return '港股';
  if (/^\d{6}$/.test(symbol)) return 'A股(待确认交易所)';
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol)) return '美股';
  return undefined;
}

// ---------------------------------------------------------------------------
// Unsourced-number audit (投资助手的核心红线：不得编造数字)
// ---------------------------------------------------------------------------

export interface UnsourcedNumberFinding {
  /** 0-based line index inside the audited text. */
  readonly line: number;
  /** The offending fragment (trimmed, capped). */
  readonly fragment: string;
}

/**
 * Markers that justify a number. Kept deliberately broad: this is a
 * *low-precision, high-recall* audit that produces a warning in the trail, not
 * a gate that blocks the answer.
 */
const SOURCE_MARKERS: readonly RegExp[] = [
  /来源|数据源|出处/,
  /\[(?:source|来源|src)\s*[:：]/i,
  /https?:\/\//i,
  /(?:19|20)\d{2}\s*(?:年)?\s*(?:年报|中报|季报|财年)/,
  /\b(?:FY|Q[1-4])\s?\d{2,4}\b/,
  /\b10-[KQ]\b|\b20-F\b|\b6-K\b/,
  /\bSEC\b|\bEDGAR\b|巨潮|交易所|公告/,
  /\bas of\b|\b截至\b/,
  /n\/a|N\/A|\(暂无\)/,
];

/** A number that looks like a financial claim: currency, 2+ decimals, or percent. */
const FINANCIAL_NUMBER = /(?:[$¥€]|\bUSD\b|\bCNY\b|\bRMB\b|\bHKD\b)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\.\d{2,}|\d[\d,]*(?:\.\d+)?\s*%/;

/**
 * Find lines in an assistant answer that assert financial numbers without any
 * source marker. Used by the `message_end` handler so the audit trail can show
 * *which* answers would need sourcing before they reach a user — the same rule
 * the SOPs encode as “缺数据必须写 (n/a)，禁止编造估值”.
 */
export function findUnsourcedNumbers(text: string): readonly UnsourcedNumberFinding[] {
  if (!text) return [];
  const findings: UnsourcedNumberFinding[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!FINANCIAL_NUMBER.test(line)) continue;
    if (SOURCE_MARKERS.some((marker) => marker.test(line))) continue;
    const fragment = line.trim();
    findings.push({ line: index, fragment: fragment.length > 160 ? `${fragment.slice(0, 160)}…` : fragment });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Tool / provider health
// ---------------------------------------------------------------------------

export type ToolHealthStatus = 'ok' | 'slow' | 'error';

export interface ToolExecutionSummary {
  readonly tool: string;
  readonly ok: boolean;
  readonly status: ToolHealthStatus;
  readonly durationMs: number;
}

/** Classify one tool execution. Threshold is deliberately generous: network finance APIs are slow. */
export function summarizeToolExecution(input: {
  readonly toolName: string;
  readonly isError?: boolean;
  readonly durationMs: number;
  readonly slowMs?: number;
}): ToolExecutionSummary {
  const durationMs = Number.isFinite(input.durationMs) && input.durationMs >= 0 ? Math.round(input.durationMs) : 0;
  if (input.isError) return { tool: input.toolName, ok: false, status: 'error', durationMs };
  const slowMs = input.slowMs ?? 15_000;
  return { tool: input.toolName, ok: true, status: durationMs >= slowMs ? 'slow' : 'ok', durationMs };
}

export type ProviderHealthLevel = 'ok' | 'throttled' | 'auth' | 'server_error' | 'client_error';

export interface ProviderHealthSummary {
  readonly status: number;
  readonly level: ProviderHealthLevel;
  readonly retryAfterMs?: number;
  /** True when the response indicates the account/quota is the problem, not the request. */
  readonly quotaExhausted: boolean;
}

/**
 * Classify a provider HTTP response. Written against the failure modes UpUp
 * actually hits in production: exhausted token plans (429 + Chinese quota
 * message), missing keys (401), and provider 5xx.
 */
export function classifyProviderHealth(input: {
  readonly status: number;
  readonly headers?: Record<string, string>;
}): ProviderHealthSummary {
  const status = input.status;
  const retryAfterMs = parseRetryAfter(input.headers);
  const level: ProviderHealthLevel =
    status === 429 ? 'throttled'
      : status === 401 || status === 403 ? 'auth'
        : status >= 500 ? 'server_error'
          : status >= 400 ? 'client_error'
            : 'ok';
  const remaining = readHeader(input.headers, ['x-ratelimit-remaining-requests', 'x-ratelimit-remaining']);
  return {
    status,
    level,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    quotaExhausted: status === 429 && (remaining === '0' || remaining === undefined),
  };
}

function readHeader(headers: Record<string, string> | undefined, names: readonly string[]): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (names.includes(key.toLowerCase())) return value;
  }
  return undefined;
}

/** Parse `Retry-After` (seconds or HTTP-date) and `x-ratelimit-reset-*` into ms. */
export function parseRetryAfter(headers: Record<string, string> | undefined): number | undefined {
  const raw = readHeader(headers, ['retry-after', 'x-ratelimit-reset-requests', 'x-ratelimit-reset']);
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider output budget
// ---------------------------------------------------------------------------

/**
 * Budget below which an outgoing provider request cannot hold an answer.
 *
 * Pi clamps `maxTokens` to fit the model's declared context window minus a
 * safety margin (`clampMaxTokensToContext`), with `MIN_MAX_TOKENS = 1` as the
 * floor. On a long session the clamp can therefore collapse the output budget
 * to a single token. The gateway then answers with a floor of its own
 * (observed: 128 tokens) plus `finish_reason: "length"`, which is rendered to
 * the user as "Response was truncated before completion." and — because the
 * answer never gets room to finish — repeats on every turn.
 *
 * 1024 matches Pi's own `MIN_ANSWER_TOKENS`: the smallest budget that can hold
 * an answer. It is deliberately used only as the *trigger threshold* and as a
 * last-resort fallback — it is **not** a sufficient budget for a real research
 * answer. Measured against the live `ax` gateway on a 260k-token prompt, 1024
 * and 2048 and 3072 all still ended in `finish_reason: "length"`; only ~4096+
 * reached `finish_reason: "stop"`. Callers should therefore pass the model's
 * declared `maxTokens` as the restore target (see
 * `resolveOutputBudgetTarget`) and use this constant only to decide *whether*
 * a budget is degenerate.
 */
export const MIN_PROVIDER_OUTPUT_TOKENS = 1024;

/**
 * Resolve the output budget to restore when Pi's context clamp produced a
 * degenerate value. When the hook has access to the session's current
 * model, that model's declared `maxTokens` is the truthful intended
 * budget — it is exactly the value Pi passes into `clampMaxTokensToContext`
 * before the clamp runs. Restoring to it undoes the damage of a clamp that
 * fell below `MIN_PROVIDER_OUTPUT_TOKENS` on a context whose `contextWindow`
 * the provider catalog under-reports.
 *
 * Falls back to `MIN_PROVIDER_OUTPUT_TOKENS` when the model is unknown.
 * The result is always at least `MIN_PROVIDER_OUTPUT_TOKENS`: a budget
 * below Pi's own `MIN_ANSWER_TOKENS` cannot hold an answer regardless of
 * provider or model.
 */
export function resolveOutputBudgetTarget(modelMaxTokens: number | undefined): number {
  const declared = typeof modelMaxTokens === 'number' && Number.isFinite(modelMaxTokens) && modelMaxTokens > 0
    ? Math.floor(modelMaxTokens)
    : MIN_PROVIDER_OUTPUT_TOKENS;
  return Math.max(MIN_PROVIDER_OUTPUT_TOKENS, declared);
}

/**
 * Request fields carrying the output budget, in Pi's own write order.
 *
 * - `max_tokens`            — `openai-completions` / `anthropic-messages`
 * - `max_completion_tokens` — newer OpenAI routes
 * - `max_output_tokens`     — OpenAI / Azure Responses
 * - `maxOutputTokens`       — Google Vertex / Generative AI
 *                             (`params.config.generationConfig.maxOutputTokens`)
 * - `maxTokens`             — Amazon Bedrock Converse
 *                             (`params.inferenceConfig.maxTokens`)
 * - `max_tokens_to_sample`  — Cohere / older Bedrock spellings
 *
 * The provider API decides which one is used, so all known spellings are
 * inspected including through nested objects up to `MAX_BUDGET_PATH_DEPTH`
 * levels. This keeps the fix provider-agnostic: the same hook that repairs an
 * OpenAI Completions `max_tokens: 1` also repairs the equivalent clamp on
 * Vertex, Generative AI, and Bedrock without a per-provider branch.
 */
const OUTPUT_BUDGET_FIELDS: ReadonlySet<string> = new Set([
  'max_tokens',
  'max_completion_tokens',
  'max_output_tokens',
  'maxOutputTokens',
  'max_tokens_to_sample',
  'maxTokens',
]);

/**
 * Maximum nesting depth we are willing to walk looking for an output budget.
 * Three covers Google Vertex's `params.config.generationConfig.maxOutputTokens`
 * (the deepest known Pi provider layout) with one level of headroom for any
 * future provider that adds an extra wrapper.
 */
const MAX_BUDGET_PATH_DEPTH = 3;

export interface OutputBudgetFinding {
  /** Path from the payload root to the budget field, e.g. `['config', 'generationConfig', 'maxOutputTokens']`. */
  readonly path: readonly string[];
  /** Leaf field name (last element of `path`); empty when `path` is empty. */
  readonly field: string;
  readonly value: number;
}

/** Locate the output budget on an outgoing provider payload, if it carries one. */
export function findOutputBudget(payload: unknown): OutputBudgetFinding | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  return findOutputBudgetAt(payload as Record<string, unknown>, [], 0);
}

function findOutputBudgetAt(
  record: Record<string, unknown>,
  path: readonly string[],
  depth: number,
): OutputBudgetFinding | undefined {
  // Hit each level's named budget fields before descending so a top-level
  // `max_tokens` always wins over a nested `max_tokens` two levels down.
  for (const field of OUTPUT_BUDGET_FIELDS) {
    if (Object.hasOwn(record, field)) {
      const value = record[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return { path: [...path, field], field, value };
      }
    }
  }
  if (depth >= MAX_BUDGET_PATH_DEPTH) return undefined;
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const found = findOutputBudgetAt(value as Record<string, unknown>, [...path, key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

export interface OutputBudgetRepair {
  readonly field: string;
  readonly path: readonly string[];
  readonly before: number;
  readonly after: number;
}

export interface OutputBudgetRepairResult {
  /** The payload to send: the original object when no repair was needed. */
  readonly payload: unknown;
  /** Present only when the budget was raised. */
  readonly repair?: OutputBudgetRepair;
}

/**
 * Raise an output budget that fell below the usable floor.
 *
 * Returns the payload untouched when it carries no budget, when the budget is
 * already usable, or when the payload is not a plain object. The repair is
 * recorded rather than silent so it lands in the audit trail: a clamped budget
 * is a symptom of a context window the provider catalog is probably
 * under-reporting, and silently hiding it would hide the real defect.
 *
 * Detection walks the payload to `MAX_BUDGET_PATH_DEPTH` so the same hook
 * repairs OpenAI Completions, OpenAI Responses, Azure Responses, Anthropic
 * Messages, Mistral, Google Vertex, Google Generative AI, and Amazon Bedrock
 * Converse without a per-provider branch.
 *
 * @param payload  Outgoing provider payload (clamped by Pi already).
 * @param options.floor   Trigger threshold: budgets below this are repaired.
 *                        Defaults to `MIN_PROVIDER_OUTPUT_TOKENS` (Pi's own
 *                        `MIN_ANSWER_TOKENS`).
 * @param options.target  Value to raise to. Defaults to `floor`. Pass the
 *                        model's declared `maxTokens` (via
 *                        `resolveOutputBudgetTarget`) to restore the user's
 *                        configured output cap exactly the way Pi intended
 *                        before the clamp.
 */
export function repairDegenerateOutputBudget(
  payload: unknown,
  options: { floor?: number; target?: number } = {},
): OutputBudgetRepairResult {
  const floor = options.floor ?? MIN_PROVIDER_OUTPUT_TOKENS;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { payload };
  const found = findOutputBudget(payload);
  if (!found || found.value >= floor) return { payload };
  const target = Math.max(floor, Math.floor(options.target ?? floor));
  if (target === found.value) return { payload };
  return {
    payload: setNestedValue(payload, found.path, target),
    repair: { field: found.field, path: found.path, before: found.value, after: target },
  };
}

/** Immutable nested set: returns a fresh object graph with `value` written at `path`. */
function setNestedValue(
  source: unknown,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const base = source && typeof source === 'object' && !Array.isArray(source)
    ? { ...(source as Record<string, unknown>) }
    : {};
  const [head, ...rest] = path;
  if (head === undefined) return base;
  if (rest.length === 0) {
    base[head] = value;
    return base;
  }
  base[head] = setNestedValue(base[head], rest, value);
  return base;
}

// ---------------------------------------------------------------------------
// Compaction accounting
// ---------------------------------------------------------------------------

export interface CompactionSummary {
  readonly tokensBefore: number;
  readonly tokensAfter?: number;
  readonly savedTokens?: number;
  /** Fraction of the pre-compaction context that survived, 0..1. */
  readonly retainedRatio?: number;
}

/** Record how much context a compaction kept — the loss budget for long research runs. */
export function summarizeCompaction(input: { readonly tokensBefore?: number; readonly tokensAfter?: number }): CompactionSummary {
  const tokensBefore = Number.isFinite(input.tokensBefore) ? Math.max(0, Math.round(input.tokensBefore as number)) : 0;
  const tokensAfter = Number.isFinite(input.tokensAfter) ? Math.max(0, Math.round(input.tokensAfter as number)) : undefined;
  if (tokensAfter === undefined) return { tokensBefore };
  return {
    tokensBefore,
    tokensAfter,
    savedTokens: Math.max(0, tokensBefore - tokensAfter),
    retainedRatio: tokensBefore === 0 ? undefined : tokensAfter / tokensBefore,
  };
}

// ---------------------------------------------------------------------------
// Context / message accounting
// ---------------------------------------------------------------------------

export interface ContextAuditFields {
  readonly messages: number;
  readonly toolResults: number;
  readonly assistant: number;
  readonly user: number;
}

/** Count the shape of the outgoing context so context-budget regressions are visible. */
export function describeContext(messages: readonly unknown[]): ContextAuditFields {
  let toolResults = 0;
  let assistant = 0;
  let user = 0;
  for (const message of messages) {
    const role = (message as { role?: unknown } | undefined)?.role;
    if (role === 'toolResult' || role === 'tool_result') toolResults += 1;
    else if (role === 'assistant') assistant += 1;
    else if (role === 'user') user += 1;
  }
  return { messages: messages.length, toolResults, assistant, user };
}

// ---------------------------------------------------------------------------
// Resource discovery
// ---------------------------------------------------------------------------

export interface UpUpResourceDirsInput {
  readonly cwd: string;
  /** UpUp home root (`$UPUP_HOME` or `~/.upup`). */
  readonly upupHome: string;
  /** Injectable existence check (tests pass a set-based predicate). */
  readonly exists?: (path: string) => boolean;
  /** When false, only project-scope resources are returned. */
  readonly includeHome?: boolean;
}

export interface UpUpResourceDirs {
  readonly skillPaths: readonly string[];
  readonly promptPaths: readonly string[];
  readonly themePaths: readonly string[];
  /** Paths that were considered but do not exist (useful for `/doctor` output). */
  readonly missing: readonly string[];
}

/**
 * Resolve UpUp's own Pi resource directories.
 *
 * Pi's `DefaultResourceLoader` reads global resources from `<agentDir>/{skills,
 * prompts,themes}` and project resources from `<cwd>/.pi/*`. UpUp's product home
 * is `$UPUP_HOME` (`~/.upup`), which Pi does not look at, and the project scope
 * is `.upup/`, not `.pi/`. Declaring them here is what makes a user-authored
 * `SKILL.md` dropped into `~/.upup/skills` (or `<repo>/.upup/skills`) actually
 * reach the model instead of being silently ignored.
 */
export function discoverUpUpResourceDirs(input: UpUpResourceDirsInput): UpUpResourceDirs {
  const exists = input.exists ?? existsSync;
  const cwd = resolve(input.cwd);
  const home = resolve(input.upupHome);
  const candidates: { readonly path: string; readonly kind: 'skill' | 'prompt' | 'theme' }[] = [];
  const projectUpup = join(cwd, '.upup');

  candidates.push({ path: join(projectUpup, 'skills'), kind: 'skill' });
  candidates.push({ path: join(projectUpup, 'prompts'), kind: 'prompt' });
  candidates.push({ path: join(projectUpup, 'themes'), kind: 'theme' });
  if (input.includeHome !== false) {
    candidates.push({ path: join(home, 'skills'), kind: 'skill' });
    candidates.push({ path: join(home, 'prompts'), kind: 'prompt' });
    candidates.push({ path: join(home, 'themes'), kind: 'theme' });
  }

  const skillPaths: string[] = [];
  const promptPaths: string[] = [];
  const themePaths: string[] = [];
  const missing: string[] = [];
  for (const candidate of candidates) {
    const ok = safeExists(exists, candidate.path);
    if (!ok) {
      missing.push(candidate.path);
      continue;
    }
    if (candidate.kind === 'skill') skillPaths.push(candidate.path);
    else if (candidate.kind === 'prompt') promptPaths.push(candidate.path);
    else themePaths.push(candidate.path);
  }
  return { skillPaths, promptPaths, themePaths, missing };
}

function safeExists(exists: (path: string) => boolean, path: string): boolean {
  try {
    return exists(path);
  } catch {
    return false;
  }
}

/** Absolute path helper shared by the wiring layer (keeps `~` handling in one place). */
export function expandHomePath(value: string, home: string): string {
  if (isAbsolute(value)) return value;
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return resolve(value);
}

// ---------------------------------------------------------------------------
// Session naming
// ---------------------------------------------------------------------------

export interface SessionNameInput {
  readonly cwd: string;
  readonly ticker?: string;
  readonly planId?: string;
  readonly market?: string;
}

/**
 * Human-readable session name for Pi's session selector. Prefers the research
 * subject (ticker + plan) so a list of sessions reads like a research log
 * instead of a wall of timestamps.
 */
export function resolveSessionDisplayName(input: SessionNameInput): string | null {
  // The cwd-fallback (`upup` / repo basename) used to be returned here as
  // the last resort, but in practice it clobbered the user's `--name` flag
  // and our default session name (`upup-<timestamp>-<rand>`) every time the
  // event-surface extension's `session_start` hook fired, because that hook
  // is unconditional and re-runs on every model/thinking change. That left
  // the `/resume` picker full of rows that all read `upup`.
  //
  // We now return `null` when there is no research subject (ticker/planId)
  // so the caller can choose: skip the write entirely, or fall back to its
  // own default. Ticker/plan paths keep the human-readable subject form.
  const base = input.cwd.split(/[/\\]/).filter(Boolean).pop() ?? 'upup';
  const subject = input.ticker?.trim();
  if (subject) {
    const market = input.market?.trim();
    return market ? `${subject} · ${market}` : subject;
  }
  const plan = input.planId?.trim();
  if (plan) return `${base} · ${plan}`;
  return null;
}
