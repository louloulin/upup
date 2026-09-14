---
name: pi-technical
description: Compute technical indicators (MACD / KDJ / BOLL / ATR / RSI / OBV / CCI), detect trend direction, recognize candlestick patterns, and emit auditable evidence-backed technical snapshots for any symbol bar series.
---

# Pi Technical Analysis Skill

This skill is the authoritative entry point for **technical analysis** inside the UpUp Pi runtime. It uses Pi-native tools from the `@upup/pi-technical` package and never invents indicators or quotes.

## When to invoke

Invoke this skill when the user asks about:
- "技术指标 / MACD / KDJ / 布林带 / BOLL / ATR / RSI / OBV / CCI"
- "技术面 / 趋势 / 金叉 / 死叉 / 支撑 / 阻力 / 锤子线 / 早晨之星"
- "给我看一下 600519 / 比亚迪 / 腾讯 的技术形态"
- Multi-timeframe alignment (daily / weekly / monthly)

## Tools used (Pi-native)

- `compute_indicators` — full indicator suite
- `compute_macd`, `compute_kdj`, `compute_boll`, `compute_atr`, `compute_rsi`, `compute_obv`, `compute_cci` — single-indicator shortcuts

All tools return auditable evidence: `auditId`, `source = 'pi-technical://...'`, structured payloads.

## Workflow

1. Resolve the symbol's bar series via `pi-market-data` (`get_market_data`) or `dry-run://pi-market-data/history` when no credentials.
2. Call `compute_indicators` with the bars array (or per-indicator calls).
3. Interpret results in plain language; cite the `auditId` for any quantitative claim.
4. If user asks for pattern recognition, use the `patterns` module from `@upup/pi-technical` (doji, hammer, shooting-star, engulfing, morning-star, etc.).

## Constraints

- **No fabrication**: never compute or quote indicators outside the tools above.
- **PI policies**: respect `pi-technical.md` policy for interpretation guidelines.
- **Evidence**: every claim must include `auditId` + source URL.
- **No real-time advice**: tools compute from historical bars only; no forward-looking statements.

## Failure modes

- Empty bar series → call `get_market_data` first; if upstream is unavailable, return error.
- Aborted request → return `aborted` and stop processing.
- Suspicious bars (zero range, negative volume) → reject and ask for clean data.
