# Pi Corporate Actions Policy

## Read access

- All eight `corporate_actions_*` tools are `read` permission (no side effects, no order placement).

## Data freshness

- `offline` (dry-run) is acceptable in CI, in paper trading, and during local development without network.
- `live` requires at least one of `TUSHARE_TOKEN`, `AKSHARE_ENABLED`, or the configured provider to be present.
- `cached` is treated identically to `live` for downstream analysis, with `cacheHit=true` recorded for observability.

## Cross-package invariants

- A tool result must NOT be used as the source of truth for portfolio rebalancing; portfolio writes must go through `pi-portfolio`.
- `corporate_actions_adjust_prices` output MUST be used as the input to any backtest that runs through `pi-backtest` for total-return parity.
- `corporate_actions_total_return` MUST be reported as a *breakdown* (price / dividend / split / rights), not a single number, so that the user can audit the inputs.

## Forbidden

- Calling `corporate_actions_*` tools concurrently for the same symbol with conflicting `startDate`/`endDate` windows (single-flight per symbol per session).
- Inferring dividend tax from the actions alone; tax must be derived by `pi-finance-sdk` `calculate_capital_gains_tax` or `calculate_trades_tax`.
