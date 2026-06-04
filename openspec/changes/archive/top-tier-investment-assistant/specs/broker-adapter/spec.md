## ADDED Requirements

### Requirement: Unified BrokerAdapter Interface
The system SHALL define a BrokerAdapter TypeScript interface that all broker implementations (sandbox, IBKR, Xueqiu, Tonghuashun, Tiger) MUST implement. Interface covers: placeOrder, cancelOrder, getPositions, getBalance, getOrderStatus, listPendingOrders.

#### Scenario: New broker integration
- **WHEN** developer wants to add a new broker
- **THEN** they implement the BrokerAdapter interface and register it in tools/trading/registry.ts

### Requirement: Adapter Registry
The system SHALL maintain a registry of available BrokerAdapter implementations, keyed by broker name, selectable via user config (UPUP_BROKER env var or .upup/settings.json).

#### Scenario: User selects broker
- **WHEN** user sets UPUP_BROKER=ibkr and configures IBKR credentials
- **THEN** all trading tools dispatch to the IBKR Adapter

### Requirement: Order Type Coverage
The system SHALL support order types: market, limit, stop, stop-limit across all BrokerAdapter implementations.

#### Scenario: Place stop-loss
- **WHEN** user places a stop-loss order
- **THEN** the order is accepted and triggered when price crosses the stop threshold
