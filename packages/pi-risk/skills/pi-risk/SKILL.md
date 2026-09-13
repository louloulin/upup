---
name: pi-risk
description: Compute deterministic, read-only portfolio risk metrics from a validated return or price series.
---

# Pi Risk

- Separate observed market data from risk assumptions (confidence, method, risk-free rate, periods per year, target return).
- Always report observations, assumptions, rating bands, and evidence metadata.
- Use VaR as a descriptive loss threshold, never as a trading trigger.
- Use Sharpe and Sortino as risk-adjusted return descriptors, not as automatic order signals.
- Use Maximum Drawdown as a historical worst-case marker; do not extrapolate future drawdowns from it.
- Never present a risk metric as a prediction of future loss or a guarantee of safety.
- Preserve evidence IDs from the market-data Package when chaining market data into risk calculations.
