## ADDED Requirements

### Requirement: Event Scanner
The system SHALL provide an event scanner that runs on a cron schedule (pre-market, intraday, post-market) and emits events to the event bus when significant market events occur (price anomalies, volume spikes, breaking news, large orders).

#### Scenario: Pre-market scan
- **WHEN** clock hits 09:00 on a trading day
- **THEN** scanner fetches overnight news, gaps, and pre-market volume, emitting events for any anomalies above configurable thresholds

### Requirement: Position Monitor
The system SHALL continuously monitor open positions for: real-time PnL, stop-loss triggers, take-profit triggers, and risk budget deviation. Emits events on the event bus when thresholds are crossed.

#### Scenario: Stop-loss triggered
- **WHEN** a held position's price drops to the stop-loss level
- **THEN** system emits a position.alert event with position details and recommended action

### Requirement: Proactive Opportunity Discovery
The system SHALL, when user is idle, scan the user's watchlist and broader market for opportunities: technical breakouts, valuation re-rating, sentiment shifts, capital flow anomalies. Emits events with structured opportunity descriptions.

#### Scenario: Daily opportunities digest
- **WHEN** user has been idle for >1 hour during trading session
- **THEN** proactive agent emits up to 10 "opportunity" events ranked by confidence

### Requirement: Backward Compatibility with Cron
The system SHALL continue to read and execute existing cron configurations in `~/.upup/cron/*.yaml` and `cron-heartbeat` config, automatically wrapping them in the new kairos runtime without requiring user changes.

#### Scenario: Legacy cron runs as kairos job
- **WHEN** user has existing `morning-brief.yaml` cron config
- **THEN** kairos runtime reads it, wraps it in a kairos job, and continues to execute at the configured schedule
