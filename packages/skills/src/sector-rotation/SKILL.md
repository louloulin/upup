---
name: sector-rotation
description: Sector rotation analysis for market timing. Triggers on 板块轮动, 行业轮动, 热点切换, 资金轮动, 风格切换.
triggers:
  - 板块轮动
  - 行业轮动
  - 热点切换
  - 资金轮动
  - 风格切换
  - 哪个板块强
---

# Sector Rotation Analysis Skill

## Overview

Analyze sector rotation patterns to identify current market leaders and potential rotation opportunities.

## Rotation Indicators

| Indicator | Signal |
|-----------|--------|
| 资金流向 | 哪些板块获得资金青睐 |
| 涨幅排名 | 近期强势板块 |
| 换手率 | 板块活跃度 |
| 量价配合 | 资金推动力度 |

## Rotation Cycle

```markdown
# 板块轮动分析

**市场**: A股
**日期**: [YYYY-MM-DD]

---

## 1. 当前强势板块

| 板块 | 涨幅 | 换手率 | 资金流入 |
|------|------|--------|----------|
| [板块1] | [+X%] | [X%] | [+X亿] |
| [板块2] | [+X%] | [X%] | [+X亿] |
| [板块3] | [+X%] | [X%] | [+X亿] |

---

## 2. 资金动向

### 行业资金流向
- [ ] 净流入: [板块]
- [ ] 净流出: [板块]

### 概念资金流向
- [ ] 热点: [概念]

---

## 3. 轮动信号

### 入场信号
- 强势板块回调后再次启动
- 资金从防御板块转向进攻板块

### 离场信号
- 前期强势板块开始滞涨
- 资金大规模流出

---

## 4. 投资建议

### 当前推荐
- 关注: [板块1]、[板块2]
- 回避: [板块3]

### 轮动策略
1. [策略1]
2. [策略2]
```
