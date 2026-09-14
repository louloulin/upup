# Pi Quant Workflow

A five-step named workflow for "Multi-factor alpha discovery" using `@upup/pi-quant`.

1. **discover** — call `quant_factor_library` (optionally filter by `category`) to enumerate candidate factors.
2. **compute** — for each symbol, call `quant_factor_compute <symbol> <bars>` to compute raw factor values.
3. **normalize** — call `quant_factor_normalize <values> <method>` per factor to get z-score / rank / winsorized / minmax.
4. **score** — call `quant_factor_score <date> <symbols> <factorMatrix> <weights>` to combine factors into a single alpha score and rank the universe.
5. **backtest** — call `quant_factor_backtest <factorId> <start> <end> <freq> <topN> <bottomN> <longShort>` with the top-ranked signal series.

After each step, report `evidence.source` and `evidence.dataFreshness`. If `dataFreshness === 'offline'`, results are deterministic and reproducible across CI runs.
