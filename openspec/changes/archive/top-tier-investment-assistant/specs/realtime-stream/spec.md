## ADDED Requirements

### Requirement: RealtimeFeed Abstraction
The system SHALL define a RealtimeFeed interface with methods: subscribe(symbols, options), unsubscribe(symbols), on(event, handler), close(). Multiple sources (Eastmoney, Tonghuashun level-2, AKShare realtime) implement this interface.

#### Scenario: Use any feed
- **WHEN** user wants real-time quotes for 600519
- **THEN** they use `feed.subscribe(['600519'])` against any configured RealtimeFeed implementation

### Requirement: Multi-Symbol Subscription
The system SHALL support subscribing to multiple symbols in a single call, with per-symbol throttling to avoid exceeding source rate limits.

#### Scenario: Subscribe to 100 symbols
- **WHEN** user subscribes to 100 symbols
- **THEN** feed throttles to source's rate limit (e.g., 10 symbols/sec) and emits events as quotes arrive

### Requirement: Throttle and Aggregation
The system SHALL support client-side throttling and aggregation (e.g., "max 1 update per second per symbol", "5-second OHLC bar aggregation").

#### Scenario: Throttle to 1Hz
- **WHEN** user sets throttle: 1000 (1 second)
- **THEN** feed emits at most 1 quote per symbol per second, even if source provides 10Hz
