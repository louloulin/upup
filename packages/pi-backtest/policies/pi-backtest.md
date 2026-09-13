# Pi Backtest Policy

- Backtest tools are deterministic and read-only.
- Historical results cannot place, modify, or cancel orders.
- Insufficient forward data and invalid entry prices fail closed or return explicit non-completed status.
- Production batch evaluation uses strict forward-bar data quality by default: ordered unique trading days, OHLC consistency, and explicit as-of bounds; permissive mode must be requested explicitly.
- Costs are explicit and auditable: commission, minimum commission, sell stamp duty, and slippage are reported separately from gross and net returns.
- Same-bar stop-loss and take-profit hits must be marked ambiguous.
- Never present backtest performance as a prediction or guaranteed return.
