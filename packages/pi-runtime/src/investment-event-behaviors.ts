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
const TICKER_TOKEN = /\$([A-Z][A-Z0-9.\-]{0,9})\b/g;

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

  if (TICKER_TOKEN.test(next)) {
    const seen: string[] = [];
    next = next.replace(TICKER_TOKEN, (_match, symbol: string) => {
      seen.push(symbol);
      const market = options.market ? `${options.market}` : guessMarketLabel(symbol);
      return market ? `${symbol} (${market})` : symbol;
    });
    if (seen.length > 0) expansions.push(`$${seen.join(' $')} → 已补全市场标签`);
  }

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
export function resolveSessionDisplayName(input: SessionNameInput): string {
  const base = input.cwd.split(/[/\\]/).filter(Boolean).pop() ?? 'upup';
  const subject = input.ticker?.trim();
  if (subject) {
    const market = input.market?.trim();
    return market ? `${subject} · ${market}` : subject;
  }
  const plan = input.planId?.trim();
  if (plan) return `${base} · ${plan}`;
  return base;
}
