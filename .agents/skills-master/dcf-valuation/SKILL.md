---
name: dcf-valuation
description: |
  折现现金流(DCF)估值分析。当需要计算股票内在价值、DCF估值、公允价值分析、价格目标、被低估/被高估判断时触发。
  必须与财务数据工具配合使用，包含完整工作流程：数据收集、FCF计算、WACC估计、现金流预测、敏感性分析。
---

# DCF Valuation - 折现现金流估值

## 概述

DCF（Discounted Cash Flow）估值是估算股票内在价值的经典方法，通过预测未来现金流并折现到当前。

## 工作流程检查清单

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

```typescript
// 查询
get_financials({
  query: "[TICKER] annual cash flow statements for the last 5 years"
})

// 提取
const freeCashFlow = data.free_cash_flow 
  ?? (data.net_cash_flow_from_operations - data.capital_expenditure)
```

### 1.2 财务指标

```typescript
get_financials({
  query: "[TICKER] financial metrics snapshot"
})

// 提取
const metrics = {
  marketCap: data.market_cap,
  enterpriseValue: data.enterprise_value,
  fcfGrowth: data.free_cash_flow_growth,
  revenueGrowth: data.revenue_growth,
  roic: data.return_on_invested_capital,
  debtToEquity: data.debt_to_equity,
  sharesOutstanding: data.outstanding_shares
}
```

### 1.3 当前价格

```typescript
get_market_data({
  query: "[TICKER] price snapshot"
})

const currentPrice = data.price
```

## Step 2: 计算FCF增长率

### 计算方法

```typescript
// 5年FCF CAGR
function calculateCAGR(values: number[]): number {
  const startValue = values[0]
  const endValue = values[values.length - 1]
  const years = values.length - 1
  
  return Math.pow(endValue / startValue, 1 / years) - 1
}

const fcfGrowthRate = calculateCAGR(historicalFCF)
```

### 增长率选择

| 情况 | 处理方式 |
|-----|---------|
| 稳定FCF历史 | 使用CAGR，减10-20% haircut |
| 波动FCF | 更多权重给分析师估计 |
| 高增长公司 | **上限15%** |

### 交叉验证

```typescript
const growthRate = average([
  fcfCAGR * 0.85,                    // 历史CAGR with haircut
  data.free_cash_flow_growth,        // YoY增长率
  analystEPSGrowth * 0.8             // 分析师估计
])
```

## Step 3: 估算折现率(WACC)

### 公式

```
WACC = (E/V) × Ke + (D/V) × Kd × (1 - T)

E = 股权市值
D = 债务
V = E + D
Ke = 无风险利率 + β × ERP
Kd = 债务成本
T = 税率
```

### 默认假设

```typescript
const assumptions = {
  riskFreeRate: 0.04,          // 4%
  equityRiskPremium: 0.055,    // 5.5%
  taxRate: 0.30,               // 30%
  costOfDebt: 0.05             // 5%
}

// 计算WACC
function calculateWACC(
  marketCap: number,
  totalDebt: number,
  beta: number,
  assumptions: Assumptions
): number {
  const e = marketCap
  const d = totalDebt
  const v = e + d
  
  const ke = assumptions.riskFreeRate + beta * assumptions.equityRiskPremium
  const kd = assumptions.costOfDebt * (1 - assumptions.taxRate)
  
  return (e / v) * ke + (d / v) * kd
}
```

### 行业WACC参考

| 行业 | 基础WACC |
|-----|---------|
| 科技 | 8-10% |
| 金融 | 7-9% |
| 消费 | 7-9% |
| 医疗 | 8-10% |
| 能源 | 7-9% |

### 合理性检查

WACC应该比`return_on_invested_capital`低2-4%。

## Step 4: 预测未来现金流

### Year 1-5

```typescript
function projectFCF(
  baseFCF: number,
  growthRate: number,
  years: number = 5
): number[] {
  const projections: number[] = []
  let currentFCF = baseFCF
  
  for (let year = 1; year <= years; year++) {
    // 每年衰减5%
    const decayFactor = 1 - (year - 1) * 0.05
    const adjustedGrowth = growthRate * decayFactor
    
    currentFCF = currentFCF * (1 + adjustedGrowth)
    projections.push(currentFCF)
  }
  
  return projections
}
```

### 终值 (Terminal Value)

```typescript
const terminalGrowthRate = 0.025  // 2.5% (GDP代理)

function calculateTerminalValue(
  finalFCF: number,
  wacc: number,
  terminalGrowth: number
): number {
  return finalFCF * (1 + terminalGrowth) / (wacc - terminalGrowth)
}
```

## Step 5: 计算现值

```typescript
function calculateDCFValue(
  projectedFCF: number[],
  terminalValue: number,
  wacc: number,
  sharesOutstanding: number,
  netDebt: number
): DCFResult {
  // 折现FCF
  const pvFCF = projectedFCF.map((fcf, year) => {
    const discountFactor = Math.pow(1 + wacc, year)
    return fcf / discountFactor
  })
  
  // 折现终值
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 5)
  
  // 企业价值
  const enterpriseValue = sum(pvFCF) + pvTerminal
  
  // 股权价值
  const equityValue = enterpriseValue - netDebt
  
  // 每股价值
  const fairValuePerShare = equityValue / sharesOutstanding
  
  return {
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    upside: (fairValuePerShare / currentPrice - 1) * 100
  }
}
```

## Step 6: 敏感性分析

### 3×3矩阵

```typescript
function createSensitivityMatrix(
  baseFCF: number,
  waccRange: [number, number, number],
  terminalGrowthRange: [number, number, number]
): SensitivityMatrix {
  const results: number[][] = []
  
  for (const wacc of waccRange) {
    const row: number[] = []
    for (const terminalGrowth of terminalGrowthRange) {
      const result = calculateDCFValue(
        projectFCF(baseFCF, growthRate),
        calculateTerminalValue(finalFCF, wacc, terminalGrowth),
        wacc,
        sharesOutstanding,
        netDebt
      )
      row.push(result.fairValuePerShare)
    }
    results.push(row)
  }
  
  return {
    wacc: waccRange,
    terminalGrowth: terminalGrowthRange,
    values: results
  }
}

// 示例
const matrix = createSensitivityMatrix(
  baseFCF,
  [wacc - 0.01, wacc, wacc + 0.01],
  [0.02, 0.025, 0.03]
)
```

## Step 7: 验证结果

### 1. EV比较

计算EV应在报告`enterprise_value`的30%以内。

### 2. 终值比例

终值应为总EV的50-80%（成熟公司）。

### 3. 每股交叉验证

`free_cash_flow_per_share × 15-25` 作为粗略检查。

## Step 8: 输出格式

```typescript
interface DCFReport {
  summary: {
    ticker: string
    currentPrice: number
    fairValue: number
    upside: number
    rating: 'undervalued' | 'fair' | 'overvalued'
  }
  assumptions: {
    fcfGrowthRate: number
    wacc: number
    terminalGrowth: number
    sharesOutstanding: number
  }
  projections: {
    year: number
    fcf: number
    discountFactor: number
    presentValue: number
  }[]
  sensitivity: SensitivityMatrix
  validation: {
    evMatch: boolean
    terminalValueRatio: number
  }
  caveats: string[]
}
```

## 触发场景

- "XX值多少钱"
- "DCF分析"
- "公平价值"
- "内在价值"
- "被低估/被高估"
- "价格目标"
