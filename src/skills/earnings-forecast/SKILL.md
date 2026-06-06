---
name: earnings-forecast
description: Earnings forecast and financial projections. Triggers on 盈利预测, earnings forecast, 财报预测, financial projection, 业绩预测.
description.zh-CN: 盈利预测与财务预测。触发关键词: 盈利预测, earnings forecast, 财报预测, financial projection, 业绩预测.
triggers:
  - 盈利预测
  - earnings forecast
  - 财报预测
  - financial projection
  - 业绩预测
  - EPS预测
---

# Earnings Forecast Skill

## Overview

Forecast company earnings using historical data, analyst estimates, and financial models.

## Forecast Models

| Model | Accuracy | Use Case |
|-------|----------|----------|
| Historical CAGR | Medium | Stable companies |
| Analyst Consensus | High | Following market |
| DCF-based | High | Intrinsic value |
| Relative Growth | Medium | Peer comparison |

## Forecast Template

```markdown
# Earnings Forecast Report

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]
**Forecast Period**: [Year] - [Year]

---

## 1. Historical Performance

### Revenue History
| Year | Revenue | YoY Growth |
|------|---------|------------|
| [Year-3] | [XXX]B | - |
| [Year-2] | [XXX]B | [+XX%] |
| [Year-1] | [XXX]B | [+XX%] |
| [TTM] | [XXX]B | [+XX%] |

### Profitability
| Year | Gross Margin | Operating Margin | Net Margin |
|------|--------------|------------------|-----------|
| [Year-2] | [XX%] | [XX%] | [XX%] |
| [Year-1] | [XX%] | [XX%] | [XX%] |
| [TTM] | [XX%] | [XX%] | [XX%] |

---

## 2. Consensus Estimates

### Analyst Consensus
| Metric | [Year] | [Year+1] | [Year+2] |
|--------|---------|-----------|-----------|
| Revenue | [XXX]B | [XXX]B | [XXX]B |
| EPS | [XX] | [XX] | [XX] |
| PE Ratio | [XX]x | [XX]x | [XX]x |

### Estimate Distribution
| Rating | Count | % |
|--------|-------|---|
| Strong Buy | [X] | [XX%] |
| Buy | [X] | [XX%] |
| Hold | [X] | [XX%] |
| Sell | [X] | [XX%] |
| Strong Sell | [X] | [XX%] |

---

## 3. Revenue Forecast

### Base Case
| Year | Revenue | Growth | Assumption |
|------|---------|--------|------------|
| [Year] | [XXX]B | [+XX%] | [Assumption] |
| [Year+1] | [XXX]B | [+XX%] | [Assumption] |
| [Year+2] | [XXX]B | [+XX%] | [Assumption] |

### Scenario Analysis
| Scenario | Growth Rate | Revenue [Year] | Probability |
|----------|-------------|----------------|-------------|
| Bull | [XX%] | [XXX]B | [XX%] |
| Base | [XX%] | [XXX]B | [XX%] |
| Bear | [XX%] | [XXX]B | [XX%] |

---

## 4. Margin Forecast

### Margin Trend
| Year | Gross | Operating | Net |
|------|-------|-----------|-----|
| [Year-1] | [XX%] | [XX%] | [XX%] |
| [Year] | [XX%] | [XX%] | [XX%] |
| [Year+1] | [XX%] | [XX%] | [XX%] |
| [Year+2] | [XX%] | [XX%] | [XX%] |

### Key Assumptions
- [Assumption 1]
- [Assumption 2]

---

## 5. EPS Forecast

### EPS Estimates
| Year | Bull | Base | Bear | Consensus |
|------|-------|------|------|-----------|
| [Year] | [XX] | [XX] | [XX] | [XX] |
| [Year+1] | [XX] | [XX] | [XX] | [XX] |
| [Year+2] | [XX] | [XX] | [XX] | [XX] |

### Valuation at Base Case
| Metric | Value |
|--------|-------|
| Current Price | [XXX] |
| [Year] EPS | [XX] |
| Forward P/E | [XX]x |
| Target P/E | [XX]x |
| Target Price | [XXX] |

---

## 6. Key Drivers

### Positive Drivers
1. [Driver 1]
2. [Driver 2]

### Negative Drivers
1. [Risk 1]
2. [Risk 2]

---

## 7. Confidence Assessment

| Factor | Confidence | Notes |
|--------|------------|-------|
| Revenue Forecast | [XX%] | [Notes] |
| Margin Forecast | [XX%] | [Notes] |
| Overall | [XX%] | - |
```
