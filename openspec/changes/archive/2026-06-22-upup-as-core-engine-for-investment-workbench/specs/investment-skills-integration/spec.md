## ADDED Requirements

### Requirement: SKILLS-INT-001 — Skill registry surfacing
The system SHALL list UpUp's 50 SKILL.md entries in `SkillLauncher`. Each entry MUST be grouped by Chinese category (估值/筛选/简报/复盘/风险/财报/研报/其他) and MUST show the SKILL name, description (first 80 Chinese chars), and a "启动" button. Clicking the button MUST dispatch a chat message that runs the SKILL via the existing thread.

#### Scenario: Skills load
- **WHEN** the workbench mounts
- **THEN** 50 entries are fetched from the bridge
- **AND** grouped by category
- **AND** sorted by category then alphabetical

#### Scenario: Launch DCF
- **WHEN** the user clicks "启动" on the DCF row and enters a symbol
- **THEN** a new thread is created
- **AND** the first message is `/dcf <symbol>`
- **AND** the user is switched to the chat tab

### Requirement: SKILLS-INT-002 — 5-stage /invest workflow tracker
`WorkflowTracker` SHALL track the 5 stages of `/invest`: dossier → strategy → earnings-preview → morning-brief → portfolio-review. For each active thread with `/invest` intent, the panel MUST show: stage name (中文), status (待办/进行中/完成), last-updated timestamp, and a "跳到此阶段" button.

#### Scenario: Stage progress
- **WHEN** the agent completes the dossier stage
- **THEN** the dossier row turns green and shows "完成"
- **AND** the next stage shows "进行中"

#### Scenario: Skip stage
- **WHEN** the user clicks "跳到此阶段"
- **THEN** the user is taken to the chat tab with a pre-filled prompt
- **AND** a confirmation modal appears first

### Requirement: SKILLS-INT-003 — Skill telemetry
The workbench MUST log every SKILL invocation to a local ring buffer (in-memory, max 200 entries) and display them in a collapsible "最近使用" list under the launcher. The list MUST show SKILL name, timestamp, and outcome (success/error).

#### Scenario: Invocation logged
- **WHEN** any SKILL button is clicked
- **THEN** a row appears in "最近使用" within 1s
- **AND** persists across workbench tab switches for the same session

#### Scenario: Buffer cap
- **WHEN** the buffer reaches 200 entries
- **THEN** the oldest entry is evicted
- **AND** no memory growth occurs
