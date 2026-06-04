## ADDED Requirements

### Requirement: Session State Sync
The system SHALL provide session state synchronization between local CLI and remote bridge clients, so that a session started on one device can be resumed on another without state loss.

#### Scenario: Resume on mobile
- **WHEN** user starts session on desktop, then opens mobile app
- **THEN** mobile app shows current session state, can send messages, view outputs

### Requirement: Checkpoint and Resume
The system SHALL checkpoint session state periodically (every N turns or T minutes) to enable resume after disconnect.

#### Scenario: Resume after disconnect
- **WHEN** user's network disconnects mid-session
- **THEN** on reconnect, system loads last checkpoint and resumes from where it left off
