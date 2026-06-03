---
name: upup-dcf
description: UpUp DCF折现现金流估值技能。用于计算股票的内在价值、公允价值、估值分析。当用户询问股票的公平价值、内在价值、DCF估值、价格目标、被低估/被高估分析时触发。
---

# UpUp DCF Valuation - 折现现金流估值 Skill

## 概述

DCF（Discounted Cash Flow）估值是估算股票内在价值的经典方法。本技能提供完整的DCF分析工作流程。

## 触发场景

- "分析XX的估值"
- "XX值多少钱"
- "DCF分析"
- "公平价值"
- "内在价值"
- "被低估/被高估"
- "价格目标"
- "值不值得买"

## 工作流程

### 检查清单

```
DCF Analysis Progress:
- [ ] Step 1: 收集财务数据
- [ ] Step 2: 计算FCF增长率
- [ ] Step 3: 估算折现率(WACC)
- [ ] Step 4: 预测未来现金流
- [ ] Step 5: 计算现值和每股价值
- [ ] Step 6: 敏感性分析
- [ ] Step 7: 验证结果
- [ ] Step 8: 输出结果
```

## Step 1: 收集财务数据

### 1.1 现金流历史

调用 `get_financials`:

```
query: "[TICKER] annual cash flow statements for the last 5 years"
```

提取: `free_cash_flow`, `net_cash_flow_from_operations`, `capital_expenditure`

备用: 如果`free_cash_flow`缺失，计算: `net_cash_flow_from_operations - capital_expenditure`

### 1.2 财务指标

```
query: "[TICKER] financial metrics snapshot"
```

提取: `market_cap`, `enterprise_value`, `free_cash_flow_growth`, `revenue_growth`, `return_on_invested_capital`, `debt_to_equity`, `free_cash_flow_per_share`

### 1.3 资产负债表

```
query: "[TICKER] latest balance sheet"
```

提取: `total_debt`, `cash_and_equivalents`, `current_investments`, `outstanding_shares`

### 1.4 分析师估计

```
query: "[TICKER] analyst estimates"
```

提取: `earnings_per_share` (未来各年估计)

### 1.5 当前价格

调用 `get_market_data`:

```
query: "[TICKER] price snapshot"
```

提取: `price`

### 1.6 公司事实

```
query: "[TICKER] company facts"
```

提取: `sector`, `industry`, `market_cap`

## Step 2: 计算FCF增长率

从现金流历史计算5年FCF CAGR。

**交叉验证**:
- `free_cash_flow_growth` (YoY)
- `revenue_growth`
- 分析师EPS增长率

**增长率选择**:
- 稳定FCF历史 → 使用CAGR，减10-20%
- 波动FCF → 更多权重给分析师估计
- **上限15%** (持续更高增长罕见)

## Step 3: 估算折现率(WACC)

### 默认假设

- 无风险利率: 4%
- 股权风险溢价: 5-6%
- 债务成本: 5-6%税前 (~4%税后，30%税率)

### WACC计算

```
WACC = (E/V) × Ke + (D/V) × Kd × (1 - T)

E = 股权市值
D = 债务
V = E + D
Ke = 无风险利率 + β × ERP
Kd = 债务成本
T = 税率
```

### 合理性检查

WACC应该比`return_on_invested_capital`低2-4%，对于创造价值的公司。

### 行业WACC参考

| 行业 | 基础WACC |
|------|----------|
| 科技 | 8-10% |
| 金融 | 7-9% |
| 消费 | 7-9% |
| 医疗 | 8-10% |
| 能源 | 7-9% |

## Step 4: 预测未来现金流

### Year 1-5

应用增长率，每年衰减5% (乘数 0.95, 0.90, 0.85, 0.80)。这反映了竞争动态。

```
Year 1: FCF × (1 + g)
Year 2: FCF × (1 + g × 0.95)
Year 3: FCF × (1 + g × 0.90)
...
```

### 终值

使用Gordon Growth Model:

```
TV = FCF_n × (1 + g_t) / (WACC - g_t)
g_t = 2.5% (GDP代理)
```

## Step 5: 计算现值

1. 折现所有FCF → 得到企业价值
2. 减去净债务 → 得到股权价值
3. 除以`outstanding_shares` → 每股价值

```
PV(FCF) = Σ [FCF_t / (1 + WACC)^t]
EV = Σ PV(FCF) + PV(TV)
Equity Value = EV - Net Debt
Fair Value = Equity Value / Shares Outstanding
```

## Step 6: 敏感性分析

创建3×3矩阵: WACC (±1%) vs 终值增长率 (2.0%, 2.5%, 3.0%)

| WACC \ g_t | 2.0% | 2.5% | 3.0% |
|-----------|------|------|------|
| WACC - 1% | XX | XX | XX |
| WACC | XX | **基准** | XX |
| WACC + 1% | XX | XX | XX |

## Step 7: 验证结果

### 1. EV比较

计算得到的EV应该在报告`enterprise_value`的30%以内。
- 如果偏差>30%，重新审视WACC或增长率假设

### 2. 终值比例

终值应该是总EV的50-80%（成熟公司）
- 如果>90%，增长率可能太高
- 如果<40%，近期预测可能过于激进

### 3. 每股交叉验证

比较 `free_cash_flow_per_share × 15-25` 作为粗略合理性检查

## Step 8: 输出格式

提供结构化摘要:

### 1. 估值摘要

```
估值摘要:
- 当前价格: $XX
- 公允价值: $XX
- 上涨/下跌: +XX% / -XX%
- 评级: [被低估/合理/被高估]
```

### 2. 关键输入表

| 参数 | 值 | 来源 |
|------|-----|------|
| 当前FCF | $X.XB | 现金流表 |
| FCF增长率 | XX% | 5年CAGR |
| WACC | XX% | 计算 |
| 终值增长率 | 2.5% | 假设 |
| 总股本 | X.XB | 资产负债表 |

### 3. 预测FCF表

| 年份 | FCF | 折现因子 | 现值 |
|------|-----|----------|------|
| 1 | $X | 0.XXX | $X |
| 2 | $X | 0.XXX | $X |
| ... | ... | ... | ... |
| 终值 | $X | 0.XXX | $X |

### 4. 敏感性矩阵

[3×3矩阵]

### 5. 注意事项

- DCF局限性
- 公司特定风险
- 数据限制
- 敏感性说明

## 工具使用

- `get_financials`: 财务报表和指标
- `get_market_data`: 当前价格
- `memory_search`: 检查用户偏好和约束
- `memory_update`: 存储分析结果

## 限制条件

### 数据限制

- 分析师估计可能不准
- 历史FCF不代表未来
- 非现金项目调整

### 模型假设

- 增长率假设
- WACC估算
- 终值敏感性

### 适用性

- 适合稳定现金流公司
- 不适合早期/亏损公司
- 不适合强周期公司
