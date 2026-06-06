---
name: valuation-comparison
description: Valuation comparison across stocks and history. Triggers on 估值, 估值对比, 历史估值, 分位数, 便宜还是贵.
description.zh-CN: 股票与历史估值的对比。触发关键词: 估值, 估值对比, 历史估值, 分位数, 便宜还是贵.
triggers:
  - 估值
  - 估值对比
  - 历史估值
  - 分位数
  - 便宜还是贵
  - PE分位
  - PB分位
---

# Valuation Comparison Skill

## Overview

Compare current valuations against historical averages and peer companies.

## Valuation Metrics

| Metric | Description | Interpretation |
|--------|-------------|---------------|
| PE | 市盈率 | 越低越便宜 |
| PB | 市净率 | 越低越便宜 |
| PS | 市销率 | 越低越便宜 |
| PCF | 市现率 | 现金流角度 |

## Valuation Percentile

```markdown
# 估值对比分析

**股票**: [Name] ([Code])
**日期**: [YYYY-MM-DD]

---

## 1. 当前估值

| 指标 | 当前值 | 行业均值 | 历史分位 |
|------|--------|----------|----------|
| PE | [X] | [X] | [X%] |
| PB | [X] | [X] | [X%] |
| PS | [X] | [X] | [X%] |

---

## 2. 历史估值区间

| 分位 | PE范围 | PB范围 |
|------|--------|--------|
| 10% | [X-X] | [X-X] |
| 25% | [X-X] | [X-X] |
| 50% | [X-X] | [X-X] |
| 75% | [X-X] | [X-X] |
| 90% | [X-X] | [X-X] |

---

## 3. 同业对比

| 公司 | PE | PB | 市值 |
|------|-----|-----|------|
| [公司1] | [X] | [X] | [X亿] |
| [公司2] | [X] | [X] | [X亿] |
| [目标] | [X] | [X] | [X亿] |

---

## 4. 估值结论

### 当前状态
- [低估/合理/高估]

### 投资建议
1. [建议1]
2. [建议2]
```
