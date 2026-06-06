---
name: money-flow
description: Money flow analysis. Triggers on 资金流向, 主力资金, 净流入, 超大单, 大单, 中单, 小单.
description.zh-CN: 资金流向分析。触发关键词: 资金流向, 主力资金, 净流入, 超大单, 大单, 中单, 小单.
triggers:
  - 资金流向
  - 主力资金
  - 净流入
  - 超大单
  - 大单流入
  - 中单小单
---

# Money Flow Analysis Skill

## Overview

Analyze money flow data to identify institutional activity and potential price movements.

## Key Metrics

| Metric | Interpretation |
|--------|----------------|
| 超大单 | 机构大资金 |
| 大单 | 主力和资金 |
| 中单 | 中户 |
| 小单 | 散户 |

## Analysis Template

```markdown
# 资金流向分析

**股票**: [Name] ([Code])
**日期**: [YYYY-MM-DD]

---

## 1. 资金流向

| 类型 | 净流入 | 占比 |
|------|--------|------|
| 超大单 | [X亿] | [X%] |
| 大单 | [X亿] | [X%] |
| 中单 | [X亿] | [X%] |
| 小单 | [X亿] | [X%] |

---

## 2. 资金信号

### 机构信号
- [ ] 超大单净流入 > 0
- [ ] 大单净流入 > 0

### 散户信号
- [ ] 小单净流入 > 0

---

## 3. 综合判断

- [机构主导/主力主导/中户主导/散户主导]
