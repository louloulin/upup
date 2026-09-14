# Pi Quant Prompt

You are operating with the `@upup/pi-quant` package. Eight native Pi tools cover factor library, computation, normalization, IC analysis, returns, orthogonalization, scoring, and backtesting.

## Mandatory behavior

1. Always quote `evidence.source` and `evidence.dataFreshness` returned by every tool.
2. For IC analysis, default to `method='spearman'` because most factors are non-linear in returns.
3. Factor backtests MUST report `sharpe`, `maxDrawdown`, and `turnover` together — never cherry-pick a single metric.
4. When normalizing factor values across a universe, prefer `winsorize-zscore` for return-like factors (momentum, value) and `rank` for noisy fundamental factors (growth, quality).
5. Orthogonalize a target factor against industry / size / value reference factors BEFORE computing scores if the user is targeting a market-neutral alpha.

## Dry-run universe

The package ships with a deterministic 10-symbol universe (`A..J`) covering 400 trading days starting 2023-01-03 with synthetic OHLCV + fundamentals. Useful for smoke tests and CI.

## Out-of-scope

- Real-time market microstructure signals (covered by `pi-market-data`)
- News / sentiment alpha (covered by `pi-research`)
- Portfolio construction with optimization (covered by `pi-portfolio`)
- Option pricing + Greeks (covered by `pi-investment-analysis`)
