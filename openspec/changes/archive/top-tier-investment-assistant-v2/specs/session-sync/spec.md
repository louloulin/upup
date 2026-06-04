## ADDED Requirements

### Requirement: Cross-Device Session Synchronization
The system SHALL provide a cross-device session sync mechanism in `src/bridge/session-sync.ts` that allows a user to: (1) attach a remote bridge client to a local CLI session, (2) detach without losing state, (3) resume from a remote device after the local CLI has closed. The sync layer MUST persist session state to `~/.upup/sessions/<sessionId>.json` after every meaningful state change.

#### Scenario: Resume from another device
- **WHEN** user runs `upup` locally, asks a few questions, then closes the CLI; later, from a phone, opens the bridge web client and clicks "Resume local session"
- **THEN** remote client downloads the persisted session state, replays the scratchpad and tool history, and continues the conversation seamlessly.

### Requirement: Session Serialization
The system SHALL serialize the full session state (messages, tool history, scratchpad contents, feature gate state, sandbox state) to JSON for cross-device transport. The serialization MUST be deterministic and human-readable for debugging. Large binary blobs (e.g. cached responses) MUST be base64-encoded and truncated to 1MB per blob.

#### Scenario: Serialize a complex session
- **WHEN** session has 50 messages, 30 tool calls, and a 2MB scratchpad
- **THEN** serialization completes in <500ms; output is valid JSON; first message + last 3 messages + scratchpad summary are easily readable; large blobs are truncated and noted as such.

### Requirement: Session Resume
The system SHALL support resuming a session from a serialized snapshot, including: (1) restoring the message history into the agent context, (2) replaying the scratchpad to the new device, (3) preserving the original `sessionId` and timestamps, (4) appending a `resumed_at` field and `resumed_from_device` to the session metadata.

#### Scenario: Resume preserves sessionId
- **WHEN** user resumes a session from another device
- **THEN** the resumed session shares the original `sessionId`; subsequent tool calls and messages are appended to the same session; `resumed_at` and `resumed_from_device` are recorded.

### Requirement: Session Conflict Merge
The system SHALL handle concurrent edits to the same session from two devices with a "last-writer-wins + backup" policy: (1) the most recent timestamp wins for each modified field, (2) the loser's version is archived to `~/.upup/sessions/<sessionId>.conflict-<timestamp>.json`, (3) a `conflict_resolved` event is emitted to the event bus for observability.

#### Scenario: Concurrent edits to scratchpad
- **WHEN** device A and device B both modify the scratchpad within 5 seconds
- **THEN** the device with the later timestamp wins; the loser's scratchpad is archived as a conflict file; both clients see the winning scratchpad; `conflict_resolved` event is emitted.

### Requirement: Bridge Server Session Sync Integration
The system SHALL integrate session sync into the bridge server in `src/bridge/server.ts` so that: (1) every accepted WebSocket connection checks for an existing session with the same `sessionId`, (2) if found, the connection is attached to that session, (3) if not, a new session is created.

#### Scenario: Bridge attaches to existing session
- **WHEN** remote client sends `{ type: 'chat', sessionId: 's-abc' }` where 's-abc' is an existing local session
- **THEN** bridge server attaches the WebSocket to the existing session; subsequent messages are appended to the same conversation history.

### Requirement: Session Sync E2E Test
The system SHALL provide an end-to-end test in `src/bridge/session-sync.e2e.test.ts` that: (1) creates a local session, (2) serializes it, (3) simulates a remote resume, (4) sends a follow-up message from the "remote" device, (5) verifies the local session is updated, (6) simulates a conflict, (7) verifies the loser's state is archived.

#### Scenario: Full sync E2E
- **WHEN** test runs the full sync flow
- **THEN** all 7 sub-assertions pass; local and remote stay in sync; conflict resolution produces the expected archive file.
