# engine-http-bridge Specification

## Purpose
TBD - created by archiving change upup-as-core-engine-for-investment-workbench. Update Purpose after archive.
## Requirements
### Requirement: BRIDGE-001 — HTTP route parity
The bridge SHALL implement the HTTP routes declared in `app/src/shared/kun-endpoints.ts` (KUN_*_PATH constants) by delegating to `@upup/agent-core`. New `ENGINE_*_PATH` constants MUST also be exported as aliases. Thread/Turn/Item/Event/Approval/Skill/Tool/Memory/Attachment endpoints MUST return JSON bodies that pass the existing Zod schemas (`isKunHealthResponseBody` and equivalents) without modification.

#### Scenario: Health check
- **WHEN** renderer calls `GET /health`
- **THEN** the bridge returns `{ status: 'ok', engine: 'upup', version: '0.2.0' }`
- **AND** `isKunHealthResponseBody` validates it as a health response

#### Scenario: Thread create
- **WHEN** renderer calls `POST /v1/threads`
- **THEN** the bridge creates a new UpUp thread, returns its id and metadata
- **AND** the response shape matches the Kun `Thread` schema

### Requirement: BRIDGE-002 — SSE event translation
The bridge SHALL translate `@upup/agent-core` `AgentEvent` stream into Kun-compatible SSE events with the same event names (`thread.message.delta`, `thread.tool.start`, `thread.tool.end`, `thread.thinking`, `thread.done`, `thread.approval`, `thread.error`). The translate layer MUST run inside the main process and feed `runtime-sse-ipc.ts` without changing its public surface.

#### Scenario: Tool call round-trip
- **WHEN** the agent invokes `tool_start("get_stock_price", { symbol: "600519" })`
- **THEN** the SSE stream emits `thread.tool.start` with the same id and args
- **AND** `tool_end` payload contains a normalised result object
- **AND** the renderer receives both events in order

#### Scenario: Approval flow
- **WHEN** the agent needs approval for a tool call
- **THEN** the bridge emits `thread.approval` with tool name, args, and an approval id
- **AND** `POST /v1/threads/{id}/approvals/{approvalId}` resolves the pending call

### Requirement: BRIDGE-003 — Reclaim port and graceful shutdown
The bridge MUST expose `reclaimPort(port)` to recover from a stale in-process listener, and MUST deregister all routes + close the SSE bus on `stopAndWait()`. The main process MUST await `stopAndWait()` before quitting to avoid orphaned streams.

#### Scenario: Reclaim stale port
- **WHEN** the previous bridge exited without releasing port 5300
- **THEN** `reclaimPort(5300)` closes the stale socket and returns `{ ok: true }`

#### Scenario: App quit
- **WHEN** user quits the Electron app
- **THEN** `upupRuntimeAdapter.stopAndWait()` is awaited
- **AND** no further SSE events are emitted

