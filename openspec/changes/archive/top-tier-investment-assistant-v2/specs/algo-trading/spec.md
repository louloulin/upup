## ADDED Requirements

### Requirement: TWAP Algorithm
The system SHALL provide a Time-Weighted Average Price (TWAP) algorithm in `src/tools/trading/algos/twap.ts` that splits a parent order into N child orders executed at uniform time intervals over a user-specified duration. The algorithm MUST respect sandbox trading hours and reject child orders scheduled outside the configured session window.

#### Scenario: TWAP 30 minutes
- **WHEN** user submits `strategy_run_paper({ algo: 'twap', symbol: '600519', side: 'BUY', quantity: 10000, duration: '30m' })`
- **THEN** system splits parent order into ~30 child orders of ~333 shares each, scheduled every 60 seconds within the trading session; each child order is submitted to the sandbox adapter; final report returns child_order_count, average_fill_price, slippage_bps.

#### Scenario: TWAP crosses session boundary
- **WHEN** user submits TWAP order with `duration: '8h'` starting at 09:30
- **THEN** system pauses child order submission during the 11:30-13:00 lunch break and resumes after 13:00; total child count adjusted to match available trading minutes.

### Requirement: VWAP Algorithm
The system SHALL provide a Volume-Weighted Average Price (VWAP) algorithm in `src/tools/trading/algos/vwap.ts` that splits a parent order into N child orders weighted by historical intraday volume distribution (default: prior 20 trading days minute-bars from `src/realtime/aggregator.ts`).

#### Scenario: VWAP uses historical distribution
- **WHEN** user submits VWAP BUY 10000 shares of 600519
- **THEN** system fetches prior 20 trading days of 1-minute volume bars, computes the volume-weighted schedule (more shares near 09:35 and 14:55 volume peaks), and submits child orders accordingly.

### Requirement: POV Algorithm
The system SHALL provide a Percent-of-Volume (POV) algorithm in `src/tools/trading/algos/pov.ts` that participates in market volume at a user-specified rate (e.g. 10% of every minute's traded volume). The algorithm MUST read real-time volume from a subscribed RealtimeFeed (default: `eastmoney-feed`).

#### Scenario: POV 10% rate
- **WHEN** user submits POV BUY at 10% participation rate
- **THEN** every 60 seconds, system reads the last minute's traded volume, computes child order size as 10% of that volume (capped at remaining parent order quantity), and submits; continues until parent order is fully filled or user stops.

### Requirement: Implementation Shortfall
The system SHALL provide an Implementation Shortfall (IS) algorithm in `src/tools/trading/algos/is.ts` that minimizes arrival-price slippage by trading more aggressively when price moves away from the arrival price and less aggressively when price moves favorably.

#### Scenario: IS adapts to price moves
- **WHEN** user submits IS BUY 10000 with arrival price 100.00
- **THEN** system increases participation rate when price > 100.00 and decreases when price < 100.00, balancing market impact against opportunity cost.

### Requirement: Algo Runner
The system SHALL provide a generic algo runner in `src/tools/trading/algos/runner.ts` that orchestrates: (1) parent order validation, (2) algo selection dispatch, (3) child order scheduling, (4) sandbox adapter submission, (5) progress reporting via event bus `trading.algo.*` topics, (6) final PnL + slippage report.

#### Scenario: Runner dispatches to TWAP
- **WHEN** runner receives a parent order with `algo: 'twap'`
- **THEN** runner instantiates the TWAP algorithm, subscribes to trading session events, submits child orders on schedule, and emits `trading.algo.child_filled` events for each fill.

### Requirement: Sandbox Matching Comparison
The system SHALL provide an end-to-end test in `src/tools/trading/algos/sandbox-comparison.test.ts` that runs both an immediate market order and a TWAP 30-minute order for the same symbol/quantity in the sandbox, and asserts that TWAP achieves lower implementation shortfall (slippage_bps) than the market order under typical volatility.

#### Scenario: TWAP beats market order
- **WHEN** test runs both algos against mock historical tick data with 1% intraday volatility
- **THEN** TWAP slippage_bps < market order slippage_bps, demonstrating reduced market impact.

### Requirement: Algo Tools Registration
The system SHALL register three new tools in the unified tool registry: `strategy_backtest` (runs a strategy on historical data and returns metrics), `strategy_run_paper` (executes a strategy in sandbox paper trading), and `strategy_list` (lists available strategies / algos with their parameters and last 5 paper-trade results).
