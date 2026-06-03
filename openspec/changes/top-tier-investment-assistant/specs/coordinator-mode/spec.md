## ADDED Requirements

### Requirement: Coordinator Main/Worker Separation
The system SHALL provide a Coordinator mode where the main Claude's tool whitelist is restricted to Agent, SendMessage, and TaskStop. The main Claude MUST NOT directly execute file/system tools; it must delegate to Workers.

#### Scenario: Main dispatches to workers
- **WHEN** user asks for comprehensive stock analysis
- **THEN** Coordinator main Claude spawns 4 Workers (technical/fundamental/capital/sentiment), each runs in parallel, and main Claude synthesizes the results

### Requirement: Four-Phase Protocol
The system SHALL implement the Coordinator four-phase protocol: Research (workers investigate) → Synthesis (main synthesizes) → Implementation (workers implement changes) → Verification (workers verify).

#### Scenario: Investment analysis flow
- **WHEN** user requests investment analysis with implementation
- **THEN** system runs Research (4 parallel workers) → Synthesis (main) → Implementation (worker writes report file) → Verification (worker checks report)

### Requirement: Worker Templates
The system SHALL provide pre-built worker templates for investment analysis: technical-analysis-worker, fundamental-analysis-worker, capital-flow-worker, sentiment-analysis-worker. Each template defines the worker's allowed tools and initial prompt.

#### Scenario: Use template worker
- **WHEN** main Claude wants to spawn a technical analysis worker
- **THEN** it references the technical-analysis-worker template which configures allowed tools and prompt for the worker

### Requirement: Shared Task List
The system SHALL use a file-based shared task list (in `~/.upup/coordinator/tasks/`) so Coordinator and Workers can read/write shared state for coordination.

#### Scenario: Worker updates task list
- **WHEN** worker completes a subtask
- **THEN** worker writes task status to shared list, main Claude reads and updates its plan
