# Pi Quant Policy

## Read access

All eight `quant_factor_*` tools are `read` permission (no side effects, no order placement).

## Data freshness

- `offline` (dry-run) is acceptable in CI, paper trading, and local development without network.
- `live` requires at least one of `TUSHARE_TOKEN`, `AKSHARE_ENABLED`, or the configured provider.
- `cached` is treated identically to `live` for downstream alpha construction.

## Cross-package invariants

- `quant_factor_compute` output MUST flow through `quant_factor_normalize` before `quant_factor_score` (raw factor values are not comparable across symbols).
- `quant_factor_ic` MUST run on a minimum of 30 periods to be statistically meaningful — return a warning if `dates.length < 30`.
- `quant_factor_backtest` MUST NOT be used to bypass `pi-backtest`'s transaction-cost model — backtests via `pi-quant` are factor-decay diagnostics, not production sizing.

## Forbidden

- Calling `quant_factor_backtest` for production-grade strategy sizing (use `pi-backtest` for that).
- Reporting a single factor's IR without the underlying IC series.
- Using `orthogonalize` against a target with fewer than 5 observations (insufficient for OLS stability).
