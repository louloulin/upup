## ADDED Requirements

### Requirement: TWAP Algorithm
The system SHALL provide a Time-Weighted Average Price (TWAP) algorithm that splits a parent order into equal child orders executed at uniform time intervals over a user-specified duration.

#### Scenario: TWAP 30 minutes
- **WHEN** user submits TWAP BUY 10000 shares over 30 minutes
- **THEN** system splits into 30 child orders of ~333 shares each, executed every 60 seconds

### Requirement: VWAP Algorithm
The system SHALL provide a Volume-Weighted Average Price (VWAP) algorithm that splits a parent order proportional to historical intraday volume distribution.

#### Scenario: VWAP follows volume curve
- **WHEN** user submits VWAP BUY 10000 shares
- **THEN** child order sizes follow the historical intraday volume curve (e.g., higher near open and close)

### Requirement: Algorithm Runner
The system SHALL provide a generic algorithm runner that any BrokerAdapter can plug into, abstracting the actual order placement so algorithms are broker-agnostic.

#### Scenario: Algorithm works with sandbox
- **WHEN** user runs TWAP against sandbox broker
- **THEN** algorithm uses sandbox.placeOrder for each child order
