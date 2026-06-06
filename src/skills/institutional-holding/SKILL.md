---
name: institutional-holding
description: Institutional investor holding analysis. Triggers on 机构持仓, institutional, 主力动向, 基金持仓, 北向资金.
description.zh-CN: 机构持仓分析。触发关键词: 机构持仓, institutional, 主力动向, 基金持仓, 北向资金.
triggers:
  - 机构持仓
  - institutional
  - 主力动向
  - 基金持仓
  - 北向资金
  - 外资持股
---

# Institutional Holding Analysis Skill

## Overview

Analyze institutional investor holdings, fund positions, and northbound flow.

## Data Sources

| Source | Data | Update |
|--------|------|--------|
| Tushare | 基金持仓 | 季度 |
| Tushare | 北向资金 | 日 |
| Tushare | 股东户数 | 季度 |

## Analysis Template

```markdown
# Institutional Holding Analysis

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]

---

## 1. Institutional Summary

| Metric | Value | Change |
|--------|-------|--------|
| 机构持股比例 | [XX%] | [+/-XX%] |
| 基金数量 | [XX] | [+/-X] |
| 北向持股 | [XX%] | [+/-XX%] |
| 股东户数 | [XX]万 | [+/-XX%] |

---

## 2. Northbound Flow (北向资金)

### Recent Trend
| Date | 持股量 | 持股比例 | 净买入 |
|------|--------|---------|--------|
| Today | [XX]万 | [XX%] | [+/-XX] |
| 5日均值 | [XX]万 | [XX%] | [+/-XX] |
| 20日均值 | [XX]万 | [XX%] | [+/-XX] |

### Flow Signal
- [ ] 持续净买入
- [ ] 持续净卖出
- [ ] 波动观望
```

### Investment Implication
- [Very Bullish/Bullish/Neutral/Bearish/Very Bearish]
