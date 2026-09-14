---
name: pi-quant
description: Quantitative alpha factor analysis. Use when computing factor values, normalizing, running IC analysis, factor returns, orthogonalization, factor scoring, or factor backtests. Triggers on "alpha 因子", "动量因子", "价值因子", "IC 分析", "因子正交化", "多因子打分", "因子回测", "quant factor", "factor IC", "factor backtest".
---

# Quantitative Factors Skill

## When to use

Use this skill whenever the user asks about:

- Factor library overview (`quant_factor_library`)
- Compute one or all alpha factors for a symbol (`quant_factor_compute`)
- Normalize factor values across a universe (`quant_factor_normalize`)
- Information Coefficient analysis (`quant_factor_ic`)
- Factor quintile returns (`quant_factor_returns`)
- Industry-neutralize a factor via OLS residuals (`quant_factor_orthogonalize`)
- Combine multiple factors into a single alpha score (`quant_factor_score`)
- Run a long / long-short backtest driven by factor signals (`quant_factor_backtest`)

## Factor library

20+ factors in 7 categories:

- **Momentum** (4): `mom_12_1`, `mom_6_1`, `mom_3m`, `mom_1m_skip` (reversal)
- **Value** (4): `value_pe`, `value_pb`, `value_ps`, `value_ev_ebitda`
- **Quality** (4): `quality_roe`, `quality_gross_margin`, `quality_debt_to_equity`, `quality_current_ratio`
- **Volatility** (3): `vol_20d`, `vol_60d`, `vol_idio`
- **Size** (1): `size_log_mcap`
- **Growth** (2): `growth_revenue`, `growth_earnings`
- **Liquidity** (2): `liquidity_amihud`, `liquidity_turnover`

## Normalization methods

- `zscore` — mean-center and scale to unit variance
- `rank` — convert to uniform [0, 1] via ordinal rank
- `winsorize-zscore` — clip to 2.5%/97.5% percentiles then z-score
- `minmax` — scale to [0, 1]

## IC analysis

The Information Coefficient measures the rank correlation between factor values and forward returns:

```
IC_t = spearman(factorValues_t, forwardReturns_t)
```

Output includes `icMean`, `icStd`, `icIR = icMean / icStd`, and the per-date series.

## Factor backtest

`quant_factor_backtest` runs a top-N / bottom-N portfolio with daily / weekly / monthly rebalance. Output includes:

- `longReturn`, `shortReturn`, `longShortReturn`
- `sharpe` (annualized)
- `maxDrawdown`
- `turnover` (number of symbol swaps)
- `equityPoints` (length of equity curve)

## Evidence contract

Every response carries an `evidence` envelope with `source: 'dry-run://pi-quant'` and `dataFreshness: 'offline'`. Quote these in the final answer.
