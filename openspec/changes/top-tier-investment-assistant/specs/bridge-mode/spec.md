## ADDED Requirements

### Requirement: WebSocket Bridge Server
The system SHALL provide a local WebSocket server (default off, started with `upup --bridge` flag) that exposes a subset of CLI capabilities to remote clients (web, mobile). The server MUST use token-based authentication.

#### Scenario: Start bridge
- **WHEN** user runs `upup --bridge --bridge-token=<secret>`
- **THEN** local WebSocket server starts on configurable port, accepts connections with valid token, rejects others

### Requirement: Bridge Protocol
The system SHALL implement a Bridge message protocol covering: send message, approve permission, view output, sync state, push notification. All messages MUST be JSON with versioning.

#### Scenario: Remote approval
- **WHEN** local CLI needs permission approval
- **THEN** CLI sends permission.request over bridge; remote client receives, user approves; CLI receives permission.response and proceeds

### Requirement: Bridge Default Off
The system SHALL NOT start bridge server by default. Bridge requires explicit opt-in via CLI flag or settings.

#### Scenario: Default no bridge
- **WHEN** user runs `upup` without --bridge
- **THEN** no WebSocket server is started, no port is exposed

### Requirement: Bridge Audit Log
The system SHALL log all bridge operations (auth, commands, approvals) to a tamper-evident audit log for security review.

#### Scenario: Audit trail
- **WHEN** remote client sends a command via bridge
- **THEN** bridge logs: timestamp, client_id, command, response status to audit log
