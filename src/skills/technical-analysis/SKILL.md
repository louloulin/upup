---
name: technical-analysis
description: Technical analysis for stocks. Triggers on 技术分析, technical analysis, K线, 均线, MACD, RSI, 技术指标.
description.zh-CN: 股票技术分析。触发关键词: 技术分析, technical analysis, K线, 均线, MACD, RSI, 技术指标.
triggers:
  - 技术分析
  - technical analysis
  - K线
  - 均线
  - MACD
  - RSI
  - 技术指标
  - 趋势分析
---

# Technical Analysis Skill

## Overview

Perform technical analysis using various indicators and chart patterns.

## Technical Indicators

| Indicator | Type | Purpose |
|-----------|------|---------|
| MA | Trend | Identify trend direction |
| MACD | Momentum | Signal line crossovers |
| RSI | Momentum | Overbought/oversold |
| Bollinger | Volatility | Price envelopes |
| KDJ | Momentum | Stochastic variant |
| Volume | Activity | Confirm price moves |

## Technical Analysis Template

```markdown
# Technical Analysis Report

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]
**Timeframe**: [Daily/Weekly/Monthly]

---

## 1. Price Summary

| Metric | Value |
|--------|-------|
| Current Price | [XXX] |
| Change | [+/-XX] |
| Change % | [+/-X.X%] |
| Volume | [XX]M |
| Avg Volume | [XX]M |

---

## 2. Moving Averages

| MA | Value | Position | Signal |
|----|-------|----------|--------|
| MA5 | [XXX] | [Above/Below] Price | [Bullish/Bearish] |
| MA10 | [XXX] | [Above/Below] Price | [Bullish/Bearish] |
| MA20 | [XXX] | [Above/Below] Price | [Bullish/Bearish] |
| MA60 | [XXX] | [Above/Below] Price | [Bullish/Bearish] |
| MA200 | [XXX] | [Above/Below] Price | [Bullish/Bearish] |

### Golden Cross / Death Cross
- [ ] MA5 crossed above MA20 (Golden Cross)
- [ ] MA20 crossed above MA200
- [ ] Death Cross occurred

---

## 3. Momentum Indicators

### MACD
| Metric | Value |
|--------|-------|
| MACD Line | [XX] |
| Signal Line | [XX] |
| Histogram | [XX] |
| Signal | [Bullish/Bearish] |

### RSI (14)
| Value | Status |
|-------|--------|
| [XX] | [Overbought/Neutral/Oversold] |

### KDJ
| Metric | Value |
|--------|-------|
| K | [XX] |
| D | [XX] |
| J | [XX] |
| Signal | [Golden/Death Cross] |

---

## 4. Bollinger Bands

| Band | Value |
|------|-------|
| Upper | [XXX] |
| Middle | [XXX] |
| Lower | [XXX] |
| Position | [Above/At/Below] Band |

---

## 5. Support & Resistance

### Support Levels
| Level | Price | Strength |
|-------|-------|----------|
| S1 | [XXX] | [Strong/Medium/Weak] |
| S2 | [XXX] | [Strong/Medium/Weak] |
| S3 | [XXX] | [Strong/Medium/Weak] |

### Resistance Levels
| Level | Price | Strength |
|-------|-------|----------|
| R1 | [XXX] | [Strong/Medium/Weak] |
| R2 | [XXX] | [Strong/Medium/Weak] |
| R3 | [XXX] | [Strong/Medium/Weak] |

---

## 6. Volume Analysis

| Metric | Value | Interpretation |
|--------|-------|---------------|
| Volume | [XX]M | [Above/Below] Avg |
| Vol/MA Ratio | [X.X]x | [Active/Normal/Low] |
| Price/Vol Divergence | [Yes/No] | [Bullish/Bearish] |

---

## 7. Chart Patterns

### Identified Patterns
- [ ] Double Bottom
- [ ] Double Top
- [ ] Head & Shoulders
- [ ] Triangle (Ascending/Descending/Symmetrical)
- [ ] Flag
- [ ] Wedge

---

## 8. Technical Summary

| Signal | Score | Interpretation |
|--------|-------|---------------|
| Trend | [Bull/Neutral/Bear] | MA alignment |
| Momentum | [Strong/Neutral/Weak] | MACD + RSI |
| Volatility | [High/Medium/Low] | Bollinger width |
| Volume | [Confirming/Weakening] | Vol/Price |
| Overall | [Bullish/Bearish] | Combined score |

---

## 9. Trading Signals

| Signal | Type | Confidence |
|--------|------|------------|
| [Signal 1] | [Entry/Exit] | [High/Med/Low] |
| [Signal 2] | [Entry/Exit] | [High/Med/Low] |

### Entry Points
- Entry: [XXX]
- Stop Loss: [XXX]
- Target 1: [XXX]
- Target 2: [XXX]

### Risk/Reward
- Risk: [XX%]
- Reward: [XX%]
- Ratio: [X:X]
```
