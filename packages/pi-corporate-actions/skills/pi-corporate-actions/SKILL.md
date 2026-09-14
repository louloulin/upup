---
name: pi-corporate-actions
description: Corporate actions analysis for A-share / HK / US equities. Use when computing dividends, splits, rights issues, ex-rights prices, or backtest-adjusted price series. Triggers on "分红", "拆股", "送股", "配股", "除权除息", "复权", "总收益", "dividend yield", "split adjustment".
---

# Corporate Actions Skill

## When to use

Use this skill whenever the user asks about:

- Historical dividends for a symbol (`corporate_actions_dividends`)
- Historical stock splits (`corporate_actions_splits`)
- Historical rights issues / 配股 (`corporate_actions_rights`)
- All corporate actions for a symbol (`corporate_actions_list_all`)
- Adjusted price series for backtests (`corporate_actions_adjust_prices`)
- Total return decomposition (price + dividend + split + rights) (`corporate_actions_total_return`)
- Trailing dividend yield (`corporate_actions_dividend_yield`)
- Theoretical ex-rights price for a rights issue (`corporate_actions_ex_price`)

## Evidence contract

Every response from a `corporate_actions_*` tool carries an `evidence` envelope with:

- `source`: `dry-run://pi-corporate-actions` (deterministic fixture for CI) or `live://{provider}` once a real data source is wired.
- `dataFreshness`: `offline` for dry-run, `live` or `cached` for production paths.

Always quote `evidence.source` and `evidence.dataFreshness` in the final answer so the user knows whether the data was deterministic or live.

## Adjustment methods

- **back-adjust**: latest bars are scaled by the cumulative split factor. Useful for charting because the most recent price equals the latest close.
- **forward-adjust**: earliest bars are divided by the cumulative split factor. Useful for backtests that compare against an earlier base price.

`corporate_actions_adjust_prices` returns per-bar `{ date, unadjustedClose, adjustedClose, adjustmentFactor }`.

## Total return formula

```
totalReturn = priceReturn + dividendReturn + splitContribution + rightsContribution
```

Where:

- `priceReturn = (endPrice - startPrice) / startPrice`
- `dividendReturn = sum(dividendsInRange) / startPrice`
- `splitContribution = Σ (ratioTo / ratioFrom - 1)` for forward splits in range
- `rightsContribution = Σ ratio * (pricePerShare / endPrice - 1)` for rights issues in range

## Workflow

1. Call `corporate_actions_list_all <symbol>` to gather raw events.
2. For backtest adjustments, call `corporate_actions_adjust_prices <symbol> back-adjust <bars>`.
3. For total-return analysis, call `corporate_actions_total_return <symbol> <startDate> <endDate> <startPrice> <endPrice>`.
4. Always include `evidence.source` / `evidence.dataFreshness` in the user-facing answer.
