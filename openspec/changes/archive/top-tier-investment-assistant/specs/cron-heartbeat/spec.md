## MODIFIED Requirements

### Requirement: Unified Kairos Runtime
The system SHALL provide a unified kairos runtime that replaces the separate cron and heartbeat systems. Legacy cron YAML configs and heartbeat configs SHALL be auto-detected and wrapped as kairos jobs without user changes.

#### Scenario: Legacy cron still works
- **WHEN** user has `~/.upup/cron/morning-brief.yaml` from before the migration
- **THEN** kairos runtime reads the file and schedules the job at the configured time, behaving identically to old cron

## ADDED Requirements

### Requirement: Kairos Sub-systems
The system SHALL provide three kairos sub-systems: scanner (event scanning), position-monitor (position monitoring), proactive (opportunity discovery). Each sub-system is a kairos job type with its own config and behavior.

#### Scenario: Enable all three sub-systems
- **WHEN** user configures kairos with all three sub-systems enabled
- **THEN** kairos runtime schedules and runs all three, emitting events to the event bus
