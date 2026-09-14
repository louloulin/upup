# Pi Corporate Actions Workflow

A five-step named workflow for "Total return analysis" using `@upup/pi-corporate-actions`.

1. **discovery** — call `corporate_actions_list_all <symbol>` to enumerate every event in the analysis window.
2. **events** — partition the list into dividends, splits, rights via the natural TypeScript types in `aggregateActions`.
3. **adjust** — call `corporate_actions_adjust_prices <symbol> back-adjust <bars>` if backtest alignment is required.
4. **compute** — call `corporate_actions_total_return <symbol> <start> <end> <startPrice> <endPrice>` and break down the result into `priceReturn + dividendReturn + splitContribution + rightsContribution`.
5. **deliver** — report the breakdown plus `evidence.source` and `evidence.dataFreshness`.

If `dataFreshness === 'offline'`, the workflow is deterministic and reproducible; if `live`, include the provider name in the report.
