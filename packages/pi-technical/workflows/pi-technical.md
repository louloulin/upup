# pi-technical Workflow

Standard workflow for technical analysis tasks in UpUp.

## Stages

1. **Symbol Resolution**
   - Accept user input (e.g. "比亚迪", "002594.SZ", "BYD")
   - Normalize to standard symbol + market code via `pi-market-data`
   - If ambiguous, ask the user for clarification

2. **Data Acquisition**
   - Default: pull last 60 daily bars via `get_market_data`
   - If credentials missing: use `dry-run://pi-market-data/history` (fixture)
   - Confirm range and count

3. **Indicator Computation**
   - Call `compute_indicators` with the bars array
   - User can ask for subsets: `[macd, boll]` etc.
   - Capture `auditId` for citation

4. **Pattern Recognition** (optional)
   - If user asks for patterns, run `recognizePatterns` from `@upup/pi-technical`
   - Return up to 5 strongest patterns with bias + strength + confidence

5. **Trend Summary**
   - Call `summarizeTrend` from `@upup/pi-technical`
   - Return direction (uptrend / downtrend / sideways) + strength (0–1)

6. **Reporting**
   - Markdown table of indicator snapshots
   - Bullet list of recognized patterns
   - Trend verdict with confidence level

## Multi-timeframe Alignment

When user requests multi-timeframe (D / W / M):
- Pull bars for each period
- Compute indicators on each
- Compare `latest MACD histogram` across periods; require >=2/3 agree for high-confidence trend
