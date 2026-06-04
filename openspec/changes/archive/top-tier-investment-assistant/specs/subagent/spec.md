## MODIFIED Requirements

### Requirement: Subagent Tool Whitelist
The system SHALL allow subagents to inherit a parent's tool whitelist by default, with optional override. Previously, subagents had access to all parent tools; now an explicit allowlist is supported for fine-grained isolation.

#### Scenario: Restricted subagent
- **WHEN** parent spawns subagent with `tools: ['getFinancials', 'screenStocks']` only
- **THEN** subagent can only call those 2 tools, all others denied

## ADDED Requirements

### Requirement: Coordinator Composes Subagents
The system SHALL let Coordinator mode compose subagents with the four-phase protocol (Research / Synthesis / Implementation / Verification). Coordinators themselves use a strict 3-tool whitelist (Agent, SendMessage, TaskStop) — the only new restriction beyond existing subagent capability.

#### Scenario: Coordinator spawns Research workers
- **WHEN** Coordinator enters Research phase
- **THEN** it spawns 1+ subagents (Workers) to investigate in parallel, each with its own tool whitelist
