## ADDED Requirements

### Requirement: WebSocket Bridge Server
The system SHALL provide a local WebSocket server in `src/bridge/server.ts` (built on Bun's native `Bun.serve({ websocket })`) that exposes a controlled subset of CLI capabilities to remote clients (web, mobile). The server MUST use token-based authentication (JWT), support per-session encryption, and emit audit logs for every command.

#### Scenario: Start bridge with token
- **WHEN** user runs `upup --bridge --bridge-port 7333 --bridge-token <random-secret>`
- **THEN** local WebSocket server starts on `ws://127.0.0.1:7333/bridge`, accepts connections presenting the token in `Authorization: Bearer <secret>`, rejects others with 401, and logs every connection + message to `~/.upup/bridge-audit.log`.

#### Scenario: Reject invalid token
- **WHEN** remote client attempts to connect without token
- **THEN** server closes the WebSocket with code 4401 and logs the rejection.

### Requirement: Bridge Protocol
The system SHALL define a bridge protocol in `src/bridge/protocol.ts` with 4 message types: `chat` (user prompt to be processed by the agent), `approval` (permission approval response to a pending bridge prompt), `output` (server-to-client streamed agent output), and `status` (server-to-client session status updates). Each message MUST include `type`, `sessionId`, `timestamp`, and `payload` fields. Protocol version MUST be `bridge.v1`.

#### Scenario: chat message round-trip
- **WHEN** client sends `{ type: 'chat', sessionId: 'abc', payload: { prompt: '分析 600519' } }`
- **THEN** server processes the prompt via the agent, streams `output` messages back, and emits a final `status: { state: 'idle' }` when the agent is ready for the next prompt.

### Requirement: Bridge Auth and Rate Limiting
The system SHALL implement token-based auth in `src/bridge/auth.ts` with: (1) short-lived JWT (15-minute expiry, refreshed on use), (2) per-IP rate limit (default 60 messages/minute), (3) trusted device list (tokens bound to a device fingerprint for 30 days), and (4) audit log entries for auth events (login / refresh / revoke).

#### Scenario: Rate limit triggers
- **WHEN** a client sends 61 messages within 60 seconds
- **THEN** server replies with `{ type: 'error', payload: { code: 'RATE_LIMITED', retryAfter: 30 } }` and rejects subsequent messages for 30 seconds.

### Requirement: Bridge Session
The system SHALL provide a bridge session in `src/bridge/session.ts` that maintains a 1:1 mapping between a remote WebSocket connection and a local CLI session. The session MUST support: (1) attaching to an existing session, (2) starting a new session, (3) handing off a session between local CLI and remote client, and (4) graceful shutdown with state persistence.

#### Scenario: Remote client attaches to existing session
- **WHEN** user runs local CLI in one terminal, then opens bridge from another device, then clicks "Attach to local session"
- **THEN** bridge creates a new remote session, attaches to the same underlying agent session, and streams the local agent's output to the remote client.

### Requirement: Bridge CLI Client
The system SHALL provide a minimal CLI client in `src/bridge/client.ts` that connects to a running bridge server and proxies stdin/stdout to/from the remote agent. This enables a local-only feel from a remote machine.

#### Scenario: CLI client proxies prompt
- **WHEN** user runs `upup --bridge-attach ws://host:7333 --token <secret>` from a remote machine
- **THEN** client connects to the bridge, sends user prompts, and prints agent responses locally with full TUI rendering.

### Requirement: Bridge CLI Flag
The system SHALL add a `--bridge` CLI flag to `upup` that starts the WebSocket server alongside the regular CLI interface. By default the bridge is OFF (no port exposed). The flag MUST support `--bridge-port`, `--bridge-token` (auto-generated if omitted), and `--bridge-bind` (default 127.0.0.1, configurable to 0.0.0.0 with explicit opt-in).

#### Scenario: Bridge disabled by default
- **WHEN** user runs `upup` without `--bridge`
- **THEN** no WebSocket port is opened; the CLI behaves as before; netstat / lsof shows no port bound by upup.

### Requirement: Bridge E2E Test
The system SHALL provide an end-to-end test in `src/bridge/e2e.test.ts` that: (1) starts the bridge on a random port, (2) connects a CLI client over WebSocket, (3) sends a chat message, (4) verifies the agent processes it and streams output, (5) verifies the audit log was written, and (6) closes the connection cleanly.

#### Scenario: E2E chat flow
- **WHEN** test runs the full bridge flow
- **THEN** all 6 sub-assertions pass: port bound, client connected, prompt echoed, output streamed, audit line written, clean close.
