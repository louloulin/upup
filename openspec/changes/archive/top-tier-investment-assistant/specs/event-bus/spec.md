## ADDED Requirements

### Requirement: Pub/Sub Event Bus
The system SHALL provide a publish-subscribe event bus at `core/event-bus.ts` with methods: on(topic, handler), once(topic, handler), off(topic, handler), emit(topic, payload). Topics support wildcard matching (`market.*` matches `market.tick`, `market.bar`).

#### Scenario: Subscribe to market events
- **WHEN** module subscribes to 'market.*'
- **THEN** it receives all market.tick, market.bar, market.alert events

### Requirement: Event Replay
The system SHALL retain the last 1000 events in a circular buffer, allowing new subscribers to optionally replay history via `subscribe(topic, handler, { replay: true })`.

#### Scenario: Replay history
- **WHEN** module subscribes with replay: true
- **THEN** it first receives the last 1000 events matching the topic, then live events

### Requirement: Event Bus Decoupling
The system SHALL route all data-source events (realtime, news, filings, scans) through the event bus, decoupling producers from consumers. Consumers include analysis agents, alert systems, UI components, and external bridges.

#### Scenario: One producer, many consumers
- **WHEN** realtime feed emits market.tick
- **THEN** event bus broadcasts to all subscribers (analysis, alert, UI, bridge) without producer knowing about them
