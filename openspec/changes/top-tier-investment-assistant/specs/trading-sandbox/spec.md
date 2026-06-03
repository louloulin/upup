## ADDED Requirements

### Requirement: Trading Sandbox Adapter
The system SHALL provide a sandbox BrokerAdapter that simulates order placement, cancellation, position tracking, and balance updates without hitting any real exchange.

#### Scenario: Place market order
- **WHEN** user places a market BUY order for 100 shares of 600519 at current price
- **THEN** sandbox fills at current price plus configured slippage and updates virtual balance and position

#### Scenario: Cancel pending order
- **WHEN** user cancels a pending limit order
- **THEN** sandbox marks order as cancelled and returns no fill

#### Scenario: Slippage and commission
- **WHEN** sandbox executes a trade
- **THEN** it deducts configured commission (per-share or percentage) and applies slippage (basis points) before recording fill

### Requirement: Sandbox Persistence
The system SHALL persist sandbox state (positions, balance, orders, history) to a local JSON file so that user can resume across CLI restarts.

#### Scenario: State survives restart
- **WHEN** user restarts CLI
- **THEN** sandbox reads saved state and continues with prior positions, balance, and pending orders
