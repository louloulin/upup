/**
 * UpUp MCP server — public entry point.
 *
 * TradingAgents / Claude Code / Codex and any MCP-compatible client can
 * register UpUp's finance / market-data / research tools by pointing at
 * `upup-mcp serve` (or `@upup/mcp-server/cli`). Every tool under the
 * `upup_finance__` namespace wraps an existing UpUp finance function —
 * no business logic is re-implemented here.
 *
 * Re-exports:
 *   - `UpUpMcpServer`, `createUpUpMcpServer` — programmatic server builder
 *   - `UPUP_MCP_TOOLS`, `UPUP_MCP_TOOL_NAMES` — tool catalog for testing
 *   - `UpUpMcpToolSpec` — per-tool type (used by tests and `report:pi7`)
 */

export {
  UpUpMcpServer,
  createUpUpMcpServer,
  createPiNativeMcpServer,
  UPUP_MCP_TOOLS,
  UPUP_MCP_TOOL_NAMES,
  findUpUpMcpTool,
  type UpUpMcpServerOptions,
  type UpUpMcpToolSpec,
} from './server';

export {
  collectPiToolCatalog,
  collectDeclaredSideEffectTools,
  toMcpToolSpec,
  isCapturedPiTool,
  UPUP_MCP_TOOL_PREFIX,
  UPUP_MCP_BRIDGED_PI_PACKAGES,
  UPUP_MCP_EXCLUDED_EXTRA_TOOLS,
  type PiToolCatalog,
  type PiToolCatalogReport,
  type PiToolBridgeOptions,
  type CapturedPiTool,
  type BridgedToolExclusion,
} from './pi-tool-bridge';
