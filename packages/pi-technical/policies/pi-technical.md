# pi-technical Policy

This policy governs how `@upup/pi-technical` tools may be invoked and how their outputs may be interpreted.

## Allowed

- Read-only computation of indicators from a bar series supplied via `pi-market-data` tools.
- Pattern recognition on the same bar series.
- Trend summaries based on MA alignment, RSI, MACD histogram.

## Disallowed

- Forward-looking predictions ("this stock will rise tomorrow").
- Fabricated indicators, values, or pattern claims not produced by a tool call.
- Combining real-time quotes with technical indicators across mismatched timestamps.
- Using `pi-technical` tools to bypass sandbox / approval gates on `pi-finance-sdk` trade execution tools.

## Look-ahead bias

All indicators compute on `bars[i]` using values from `bars[0..i]`. Do not interpret a computed value as evidence of a future move; only past moves.

## Warmup periods

- RSI(14) needs 14 prior bars; first 14 values are null.
- MACD(12,26,9) needs 26 prior bars; first 26 values are null.
- BOLL(20) needs 20 prior bars.
- ATR(14) needs 14 prior bars.
Always surface this in your output so the user does not treat warmup values as signals.

## Confidence thresholds

- RSI > 70 → overbought (bearish reversal risk)
- RSI < 30 → oversold (bullish reversal risk)
- BOLL bandwidth > 5% → high volatility
- MACD histogram cross zero → momentum shift
- KDJ J > 100 → overbought; J < 0 → oversold

These are conventions, not guarantees. Always cite the `auditId` and surface the raw values.

## Failure handling

- Aborted signal → return `aborted` immediately, do not retry.
- Invalid period (< 1) → reject with explicit error.
- Empty bars → reject; require `pi-market-data` to supply a non-empty series.
