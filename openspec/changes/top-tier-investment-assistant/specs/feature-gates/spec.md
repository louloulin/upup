## ADDED Requirements

### Requirement: Compile-Time Feature Gates
The system SHALL support compile-time feature gates via `process.env.BUN_CONFIG_FEATURE_*` env vars. When set to 0 or unset, the corresponding code is excluded from the bundle by Bun.build filter.

#### Scenario: Trading code excluded
- **WHEN** BUN_CONFIG_FEATURE_TRADING=0 at build time
- **THEN** bundle does not include tools/trading/* code, reducing size and attack surface

### Requirement: Startup Feature Gates
The system SHALL read `FEATURE_*` env vars at startup and inject a global featureGates object. Code paths can check `featureGates.isEnabled('kairos')` to gate behavior.

#### Scenario: Kairos disabled
- **WHEN** FEATURE_KAIROS=false at startup
- **THEN** kairos mode is not activated, cron tasks still run but kairos-specific features are skipped

### Requirement: Runtime Feature Gates with A/B
The system SHALL support runtime feature gates via `featureGates.set('kairos', { userId, ratio: 0.1 })` for A/B experiments and gradual rollouts. The system SHALL use deterministic hashing of userId to decide inclusion.

#### Scenario: 10% rollout
- **WHEN** user sets kairos ratio to 0.1
- **THEN** approximately 10% of users (by userId hash) see kairos mode, others see legacy

### Requirement: Feature Gates CLI Doctor
The system SHALL provide `upup feature-gates doctor` CLI command that lists all 50+ gates with their current state (enabled/disabled/A-B ratio) and any conflicts.

#### Scenario: Run doctor
- **WHEN** user runs `upup feature-gates doctor`
- **THEN** CLI displays a table of all gates with state, source (compile/startup/runtime), and any warnings
