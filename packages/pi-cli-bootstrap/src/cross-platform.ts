/**
 * Cross-platform RPC / JSON-stream helpers.
 *
 * Implements v2 plan §1.4 + §4.1 + §4.2. Pi already provides everything we
 * need — `RpcClient` (a fully featured RPC client with 35+ methods), the
 * `JsonAgentSessionEvent` wire format, the `--mode rpc` / `--mode json`
 * host transports via `runRpcMode` / `runPrintMode`. We do NOT write our
 * own protocol. The only UpUp-specific value-add is the slash-command
 * grammar that the `/invest` workflow and the `/sop run` command parse:
 * `formatInvestCommand` / `formatSopCommand` turn the typed request shape
 * into the exact text the `/invest` / `/sop run` slash commands expect.
 *
 * Three things deliberately *not* here:
 *   - `UpUpRpcClient` / `UpUpRpcServer`: Pi's `RpcClient` already has every
 *     method a cross-platform host needs (`prompt`, `steer`, `setModel`,
 *     `compact`, `fork`, `getTree`, `exportHtml`, ...). Wrapping it would
 *     duplicate `@upup/sdk`'s `UpUpSessionHandle` and force every host to
 *     learn a third client shape.
 *   - `runRpcServer` / `runJsonStream`: zero-value passthroughs to
 *     `runPiNativeCli({mode, piArgs})`. `src/index.tsx`'s entry layer calls
 *     `runPiNativeCli` directly — there is nothing for these helpers to do.
 *   - Demo / example: Pi ships `packages/sdk/src/examples/rpc-client.ts` and
 *     TradingAgents / Claude Code have their own SDK clients; the same
 *     examples exist in their upstream docs.
 *
 * Re-exported Pi surfaces (so cross-platform consumers don't need a
 * second dependency on `@earendil-works/pi-coding-agent`):
 *   - `RpcClient` / `RpcClientOptions` / `RpcCommand` / `RpcResponse` /
 *     `RpcSessionState` / `RpcEventListener`
 *   - `JsonAgentSessionEvent` (the wire event union)
 *   - `runRpcMode` / `runPrintMode` (host-side mode launchers)
 */
import {
  RpcClient,
  type RpcClientOptions,
  type RpcCommand,
  type RpcResponse,
  type RpcSessionState,
  type RpcEventListener,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type ModelInfo,
  type JsonAgentSessionEvent,
  type PrintModeOptions,
  runRpcMode,
  runPrintMode,
} from '@earendil-works/pi-coding-agent';

export {
  RpcClient,
  runRpcMode,
  runPrintMode,
  type RpcClientOptions,
  type RpcCommand,
  type RpcResponse,
  type RpcSessionState,
  type RpcEventListener,
  type RpcExtensionUIRequest,
  type RpcExtensionUIResponse,
  type ModelInfo,
  type JsonAgentSessionEvent,
  type PrintModeOptions,
};

/**
 * Invest-workflow request shape (mirrors `/invest --sop <id> [--market <id>] <TICKER>`).
 */
export interface UpUpInvestRequest {
  readonly ticker: string;
  readonly sop?: string;
  readonly market?: 'cn' | 'hk' | 'us' | 'any';
}

/**
 * Sop runner request shape (mirrors `/sop run <id> <args...>`).
 */
export interface UpUpSopRequest {
  readonly sop: string;
  readonly args?: readonly string[];
}

/**
 * Build the slash-command text that the runtime expects.
 *
 * `/invest --sop <id> [--market <m>] <TICKER>` — the grammar the
 * `packages/pi-investment-workflow/src/invest.ts` command parses. Spaces
 * in any value are unsupported; tickers like `600519.SH` / `00700.HK`
 * round-trip cleanly.
 *
 * Used by every cross-platform client (Pi's `RpcClient`,
 * `@upup/sdk`'s `UpUpSessionHandle`, external TradingAgents / Claude Code
 * integrations) to format a typed request into the slash command text the
 * `/invest` workflow command consumes.
 */
export function formatInvestCommand(req: UpUpInvestRequest): string {
  const parts = ['/invest'];
  if (req.sop) parts.push('--sop', req.sop);
  if (req.market && req.market !== 'any') parts.push('--market', req.market);
  parts.push(req.ticker);
  return parts.join(' ');
}

/**
 * Build the slash-command text for a non-invest SOP run.
 *
 * `/sop run <id> <args...>` — the grammar `packages/pi-investment-workflow`
 * parses. Used by `morning-brief`, `portfolio-review`, and any user-installed
 * SOP discovered at `~/.upup/sops/*.yaml` / `<cwd>/.upup/sops/*.yaml`.
 */
export function formatSopCommand(req: UpUpSopRequest): string {
  const parts = ['/sop', 'run', req.sop, ...(req.args ?? [])];
  return parts.join(' ');
}
