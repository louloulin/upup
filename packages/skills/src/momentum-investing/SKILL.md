---
name: momentum-investing
description: Momentum investing strategy analysis. Triggers on 动量, momentum, 趋势, 追涨, 趋势投资.
triggers:
  - 动量
  - momentum
  - 趋势
  - 追涨
  - 趋势投资
---

# Momentum Investing Analysis Skill

## Overview

Analyze momentum indicators and trend following strategies.

## Momentum Indicators

| Indicator | Formula | Signal |
|-----------|----------|--------|
| ROC | (Price - Price_n) / Price_n | >0 = Bullish |
| RSI | 100 - (100/(1+RS)) | >70 overbought, <30 oversold |
| ADX | Trend strength | >25 = Strong trend |

## Analysis Template

```markdown
# Momentum Investing Analysis

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]

---

## 1. Momentum Score

| Indicator | Value | Signal |
|-----------|-------|--------|
| ROC 5日 | [+X.X%] | [Bull/Bear] |
| ROC 20日 | [+X.X%] | [Bull/Bear] |
| RSI 14 | [XX] | [OB/OS/Neutral] |
| ADX | [XX] | [Strong/Weak] |

**Momentum Score**: [X/4] bullish signals

---

## 2. Price Momentum

### Returns
| Period | Return | vs Market |
|--------|--------|-----------|
| 1 Week | [+X.X%] | [+/-X.X%] |
| 1 Month | [+X.X%] | [+/-X.X%] |
| 3 Month | [+X.X%] | [+/-X.X%] |
| YTD | [+X.X%] | [+/-X.X%] |

---

## 3. Trend Quality

| Metric | Value | Interpretation |
|--------|-------|---------------|
| ADX | [XX] | [Strong/Moderate/Weak] |
| Trend | [Up/Down/Sideways] | [Duration] |

---

## 4. Entry Signals

| Signal | Type | Confidence |
|--------|------|------------|
| [Signal] | [Entry/Exit] | [High/Med/Low] |

### Risk Management
- Entry: [XXX]
- Stop: [XXX]
- Target: [XXX]
- Risk: [X.X%]
```
