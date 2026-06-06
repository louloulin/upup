---
name: cash-flow-analysis
description: Cash flow analysis for investment decisions. Triggers on 现金流, cash flow, 经营现金流, 投资现金流, 筹资现金流.
triggers:
  - 现金流
  - cash flow
  - 经营现金流
  - 投资现金流
  - 筹资现金流
  - 自由现金流
---

# Cash Flow Analysis Skill

## Overview

Analyze cash flow statements to assess a company's financial health and quality of earnings.

## Data Sources

| Source | Data | Update |
|--------|------|--------|
| Tushare | 现金流量表 | 季度/年度 |

## Key Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| 经营现金流净额 | 经营现金流入 - 流出 | > 0 |
| 自由现金流 | 经营现金流 - 资本支出 | > 0 |
| 经营现金流/净利润 | 盈利质量 | > 1 |

## Analysis Template

```markdown
# 现金流分析

**公司**: [Name] ([Code])
**期间**: [YYYY]

---

## 1. 经营现金流

| 指标 | 值 | 趋势 |
|------|-----|------|
| 经营现金流净额 | [X亿] | [↑/↓/→] |
| 同比增长率 | [+X%] | [正/负] |
| 经营现金流/净利润 | [X.X] | [正/负] |

---

## 2. 投资现金流

| 指标 | 值 | 含义 |
|------|-----|------|
| 投资现金流净额 | [X亿] | [扩张/收缩] |
| 资本支出 | [X亿] | [重/轻] |

---

## 3. 自由现金流

| 指标 | 值 | 评价 |
|------|-----|------|
| 自由现金流 | [X亿] | [正/负] |
| FCF/营收 | [X%] | [高/中/低] |

---

## 4. 综合评价

### 现金流质量
- [优秀/良好/一般/较差]

### 关键发现
1. [发现1]
2. [发现2]
```
