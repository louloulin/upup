# Pi Risk Policy

- calculate_var, calculate_sharpe, calculate_sortino, and calculate_max_drawdown are deterministic read-only calculations.
- Each calculation must expose its assumptions, observations, and evidence metadata.
- The package cannot place, modify, or cancel orders, and cannot move money.
- Empty input series and out-of-range confidence levels must fail closed.
- A zero-volatility series must be reported as 'zero-volatility' and not coerced into a finite Sharpe.
