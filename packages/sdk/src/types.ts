/**
 * UpUp SDK public types.
 *
 * The SDK is a thin, black-box wrapper around `PiAgentSessionFactory`. Hosts
 * import `createUpUpSession` and get back an `UpUpSessionHandle` that exposes
 * only the cross-platform surface (prompt / steer / follow-up / event stream /
 * close / fork). They never see Pi internals, raw `AgentSession`, or
 * UpUp package boundaries.
 *
 * Why a black-box surface:
 *   TradingAgents, Claude Code, Codex and any IDE/agent-host plugin need a
 *   stable import surface that survives Pi minor upgrades. Anything that
 *   leaks Pi-specific types into the SDK becomes a breaking change every
 *   time Pi bumps. The handle exposes only data + method signatures that
 *   mirror Pi's stable `AgentSession` shape but typed at the UpUp contract
 *   level (no Rust types, no `Symbol.dispose`, no InternalAPI).
 *
 * Optional overrides:
 *   - `spec` lets the host ship its own `UpUpAgentSpec` (custom system
 *     prompt, custom tool allowlist). Default = `defaultResearcherSpec`.
 *   - `cwd` defaults to `process.cwd()` (matches Pi TUI behaviour).
 *   - `sessionKey` is opaque — Pi uses it to find / resume the session file.
 */

import type {
  UpUpAgentSpec,
  UpUpAgentSession,
  UpUpAgentEvent,
  UpUpFinanceSessionContext,
} from '@upup/pi-runtime';

export interface UpUpSessionOptions {
  /**
   * Either a fully-formed `UpUpAgentSpec` or the short-hand profile name
   * (`researcher` / `analyst` / `risk-manager` / `portfolio-manager` /
   * `backtest-engineer` / `monitor` / `reviewer`). Default = `researcher`.
   */
  readonly profile?: UpUpAgentProfile | UpUpAgentSpec;
  /** Override the agent spec entirely. Wins over `profile` when both set. */
  readonly spec?: UpUpAgentSpec;
  /** Pi session key (defaults to `upup-sdk-<random>`). */
  readonly sessionKey?: string;
  /** CWD for resource discovery (defaults to `process.cwd()`). */
  readonly cwd?: string;
  /** Stream of UpUp events (tool / message / thinking / done). */
  readonly onEvent?: (event: UpUpSessionEvent) => void | Promise<void>;
  /** Abort signal for the initial setup. */
  readonly signal?: AbortSignal;
  /** Optional finance context seed (tickers, watchlist, dossier IDs). */
  readonly financeContext?: Partial<UpUpFinanceSessionContext>;
}

export type { UpUpAgentSpec } from "@upup/pi-runtime";
export type UpUpAgentProfile =
  | 'researcher'
  | 'analyst'
  | 'risk-manager'
  | 'portfolio-manager'
  | 'backtest-engineer'
  | 'monitor'
  | 'reviewer';

/**
 * SDK-level message envelope. The actual payload is an `AgentMessage`-shaped
 * object (role + content); we type it as `unknown` so the SDK does not
 * depend on any Pi-internal type definition that could change between
 * minor versions.
 */
export interface UpUpSessionMessage {
  readonly role: string;
  readonly content: string;
}

export type UpUpSessionEvent =
  | { readonly type: 'ready'; readonly sessionId: string }
  | { readonly type: 'agent_event'; readonly event: UpUpAgentEvent }
  | { readonly type: 'message'; readonly message: UpUpSessionMessage }
  | { readonly type: 'tool_call'; readonly tool: string; readonly input: unknown }
  | { readonly type: 'tool_result'; readonly tool: string; readonly output: unknown; readonly isError: boolean }
  | { readonly type: 'thinking'; readonly text: string }
  | { readonly type: 'done'; readonly reason: 'finished' | 'aborted' | 'error'; readonly error?: unknown }
  | { readonly type: 'error'; readonly error: unknown };

export interface UpUpPromptOptions {
  /** Abort signal for this prompt only. */
  readonly signal?: AbortSignal;
}

export interface UpUpSessionHandle {
  /** Stable session id (Pi-derived). */
  readonly id: string;
  /** Resolved spec actually used by the session (custom or default). */
  readonly spec: UpUpAgentSpec;
  /** Send a prompt. Returns once the turn ends; events stream via `onEvent`. */
  prompt(input: string, options?: UpUpPromptOptions): Promise<void>;
  /** Steer the in-flight turn (does not wait for completion). */
  steer(input: string): Promise<void>;
  /** Queue a follow-up turn after the current one finishes. */
  followUp(input: string): Promise<void>;
  /** Abort the in-flight turn (no-op if nothing is running). */
  abort(): Promise<void>;
  /** Block until the session is idle (no in-flight turn). */
  waitForIdle(): Promise<void>;
  /** Trigger a compaction with optional instructions. */
  compact(instructions?: string): Promise<void>;
  /** Path to the session JSONL file (if persistence is enabled). */
  getSessionFile(): string | undefined;
  /** Snapshot of session header (id, timestamp, cwd). */
  getSessionHeader(): { readonly id: string; readonly timestamp: string; readonly cwd: string } | null;
  /** Tree of session entries (for `tree` command equivalents). */
  getSessionTree(): readonly unknown[];
  /** Export the session as JSONL (returns the file path). */
  exportToJsonl(outputPath?: string): string;
  /** Export the session as HTML (returns the file path). */
  exportToHtml(outputPath?: string): Promise<string>;
  /** Fork the session at a specific entry id; returns the new session id. */
  fork(entryId?: string): string | undefined;
  /** Append a custom entry (audit, dossier marker, watchlist change). */
  appendEntry<T = unknown>(customType: string, data?: T): void;
  /** Update the finance context (tickers, watchlist, dossier ids). */
  setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void;
  /** Snapshot of the finance context. */
  getFinanceContext(): UpUpFinanceSessionContext;
  /** Names of tools currently available to the session. */
  getAvailableToolNames(): readonly string[];
  /** Close the session and release the underlying Pi `AgentSession`. */
  close(): Promise<void>;
}

/**
 * Internal-only: the adapter from a real `UpUpAgentSession` to the public
 * SDK handle. Exported so the tests can mount fakes, but consumers should
 * always go through `createUpUpSession`.
 */
export interface UpUpSessionAdapter {
  toHandle(session: UpUpAgentSession, options: { readonly sessionKey?: string }): UpUpSessionHandle;
}
