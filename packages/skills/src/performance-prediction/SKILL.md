---
name: performance-prediction
description: Stock performance prediction based on patterns. Triggers on 走势预测, 目标价位, 上涨空间, 下跌空间, 压力位, 支撑位.
triggers:
  - 走势预测
  - 目标价位
  - 上涨空间
  - 下跌空间
  - 压力位
  - 支撑位
  - 目标价
---

# Performance Prediction Skill

## Overview

Predict potential price movements based on technical patterns and historical data.

## Key Levels

| Level | Description |
|-------|-------------|
| 压力位 | 上涨阻力 |
| 支撑位 | 下跌支撑 |
| 目标价 | 预期价位 |

## Analysis Template

```markdown
# 走势预测

**股票**: [Name] ([Code])
**当前价**: ¥[X]

---

## 1. 关键价位

| 类型 | 价格 | 距离 |
|------|------|------|
| 压力位1 | ¥[X] | [+X%] |
| 压力位2 | ¥[X] | [+X%] |
| 支撑位1 | ¥[X] | [-X%] |
| 支撑位2 | ¥[X] | [-X%] |

---

## 2. 上涨空间

| 场景 | 目标价 | 涨幅 |
|------|--------|------|
| 保守 | ¥[X] | [+X%] |
| 中性 | ¥[X] | [+X%] |
| 乐观 | ¥[X] | [+X%]

---

## 3. 风险提示

- [提示1]
- [提示2]
