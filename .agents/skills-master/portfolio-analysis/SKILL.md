---
name: portfolio-analysis
description: |
  投资组合分析与管理。当用户询问组合分析、资产配置、持仓优化、分散化投资、组合风险收益分析时必须使用此技能。
  包括：组合构建、再平衡、风险收益评估、相关性分析、最优化。
---

# Portfolio Analysis - 投资组合分析

## 核心概念

投资组合分析帮助用户构建最优资产配置，实现风险收益平衡。

## 组合构建框架

### 资产配置模型

```typescript
interface AssetAllocation {
  stocks: {
    us: number      // 美股比例
    international: number  // 国际股票
    emerging: number      // 新兴市场
  }
  bonds: {
    government: number    // 国债
    corporate: number     // 企业债
    highYield: number     // 高收益债
  }
  alternatives: {
    realEstate: number     // 房地产
    commodities: number    // 大宗商品
    cash: number          // 现金
  }
}

// 年龄/风险配置规则
function getTargetAllocation(riskProfile: RiskProfile, age: number): AssetAllocation {
  const stockRatio = calculateStockRatio(riskProfile, age)
  
  return {
    stocks: {
      us: stockRatio * 0.6,
      international: stockRatio * 0.25,
      emerging: stockRatio * 0.15
    },
    bonds: {
      government: (1 - stockRatio) * 0.5,
      corporate: (1 - stockRatio) * 0.3,
      highYield: (1 - stockRatio) * 0.2
    },
    alternatives: {
      realEstate: 0.05,
      commodities: 0.05,
      cash: 0.05
    }
  }
}
```

### 股票组合构建

```typescript
interface StockSelection {
  ticker: string
  weight: number     // 配置比例
  entryPrice: number
  currentPrice: number
  sector: string
}

function buildStockPortfolio(
  stocks: StockData[],
  constraints: PortfolioConstraints
): StockSelection[] {
  // 1. 筛选满足条件的股票
  const eligible = stocks.filter(s => 
    s.roe >= constraints.minRoe &&
    s.marketCap >= constraints.minMarketCap &&
    s.dividendYield >= constraints.minDividend
  )
  
  // 2. 计算评分
  const scored = eligible.map(s => ({
    ...s,
    score: calculateScore(s, constraints)
  }))
  
  // 3. 最优化分配
  return optimizeWeights(scored, constraints)
}
```

## 组合分析指标

### 收益指标

```typescript
interface PortfolioReturns {
  totalReturn: number      // 总收益率
  annualizedReturn: number  // 年化收益率
  quarterlyReturns: number[] // 季度收益
  maxDrawdown: number      // 最大回撤
}

// 计算
function calculateReturns(portfolio: Portfolio): PortfolioReturns {
  const prices = getHistoricalPrices(portfolio)
  
  const totalReturn = (prices.current - prices.initial) / prices.initial
  
  const years = (prices.endDate - prices.startDate) / 365
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / years) - 1
  
  const drawdowns = calculateDrawdowns(portfolio)
  const maxDrawdown = Math.min(...drawdowns)
  
  return { totalReturn, annualizedReturn, maxDrawdown }
}
```

### 风险指标

```typescript
interface PortfolioRisk {
  volatility: number        // 年化波动率
  beta: number              // 组合Beta
  sharpeRatio: number       // 夏普比率
  sortinoRatio: number     // 索提诺比率
  valueAtRisk: number       // VaR (95%)
  maxDrawdown: number       // 最大回撤
}

// 计算波动率
function calculateVolatility(returns: number[]): number {
  const avgReturn = average(returns)
  const variance = average(returns.map(r => Math.pow(r - avgReturn, 2)))
  return Math.sqrt(variance * 252)  // 年化
}

// 计算夏普比率
function calculateSharpeRatio(
  portfolioReturn: number,
  riskFreeRate: number,
  volatility: number
): number {
  return (portfolioReturn - riskFreeRate) / volatility
}
```

### 分散化分析

```typescript
interface DiversificationMetrics {
  herfindahlIndex: number   // Herfindahl指数
  effectiveN: number       // 有效数量
  correlationMatrix: number[][]
  concentrationRisk: string[]
}

// 计算有效股票数量
function calculateEffectiveN(weights: number[]): number {
  const hhi = sum(weights.map(w => w * w))
  return 1 / hhi
}

// 相关性分析
function calculateCorrelation(
  returns1: number[],
  returns2: number[]
): number {
  const avg1 = average(returns1)
  const avg2 = average(returns2)
  
  const covariance = average(
    returns1.map((r1, i) => (r1 - avg1) * (returns2[i] - avg2))
  )
  
  const std1 = standardDeviation(returns1)
  const std2 = standardDeviation(returns2)
  
  return covariance / (std1 * std2)
}
```

## 组合优化

### 现代投资组合理论(MPT)

```typescript
interface PortfolioOptimization {
  expectedReturn: number
  volatility: number
  sharpeRatio: number
  weights: Map<string, number>
}

function optimizePortfolio(
  stocks: StockData[],
  targetReturn?: number
): PortfolioOptimization {
  // 构建协方差矩阵
  const returns = getHistoricalReturns(stocks)
  const covMatrix = calculateCovarianceMatrix(returns)
  
  // 最优化目标: 最大化夏普比率
  const objective = (weights: number[]) => {
    const portfolioReturn = dot(weights, expectedReturns(stocks))
    const portfolioVol = Math.sqrt(
      weights.map((w, i) => 
        weights.map((w2, j) => w * w2 * covMatrix[i][j])
      ).flat().reduce((a, b) => a + b)
    )
    return -portfolioReturn / portfolioVol  // 负的，因为我们要最大化
  }
  
  // 约束条件
  const constraints = [
    { type: 'eq', fun: (w: number[]) => sum(w) - 1 },  // 权重和为1
    { type: 'ineq', fun: (w: number[]) => w.map(x => x)}  // 权重 >= 0
  ]
  
  return runOptimizer(objective, constraints, stocks.length)
}
```

### 风险平价组合

```typescript
function riskParityPortfolio(stocks: StockData[]): Map<string, number> {
  const volatilities = stocks.map(s => calculateVolatility(s.returns))
  const inverseVol = volatilities.map(v => 1 / v)
  const totalInverse = sum(inverseVol)
  
  const weights = inverseVol.map(iv => iv / totalInverse)
  
  return new Map(stocks.map((s, i) => [s.ticker, weights[i]]))
}
```

## 再平衡

### 再平衡策略

```typescript
interface RebalanceConfig {
  threshold: number           // 再平衡阈值(%)
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  costRate: number            // 交易成本率
}

function shouldRebalance(
  currentAllocation: AssetAllocation,
  targetAllocation: AssetAllocation,
  config: RebalanceConfig
): boolean {
  const deviations = Object.keys(targetAllocation).map(key => {
    const current = currentAllocation[key]
    const target = targetAllocation[key]
    return Math.abs(current - target)
  })
  
  const maxDeviation = Math.max(...deviations)
  
  if (maxDeviation > config.threshold) {
    // 计算交易成本
    const tradingCost = estimateTradingCost(deviations, config.costRate)
    
    // 如果交易成本大于再平衡收益，不执行
    return tradingCost < maxDeviation
  }
  
  return false
}
```

## 真实例子

### 例子1: 组合诊断

```typescript
async function diagnosePortfolio(holdings: Holding[]) {
  // 1. 计算当前配置
  const currentAllocation = calculateAllocation(holdings)
  
  // 2. 计算收益风险
  const returns = calculateReturns(holdings)
  const risk = calculateRiskMetrics(holdings)
  
  // 3. 分散化评估
  const diversification = assessDiversification(holdings)
  
  // 4. 集中度风险
  const concentration = identifyConcentration(holdings)
  
  return {
    summary: {
      totalValue: sum(holdings.map(h => h.value)),
      totalReturn: returns.annualizedReturn,
      sharpeRatio: risk.sharpeRatio,
      maxDrawdown: risk.maxDrawdown
    },
    allocation: currentAllocation,
    riskMetrics: risk,
    diversification,
    concentration,
    suggestions: generateSuggestions(holdings)
  }
}
```

### 例子2: 新股配置建议

```typescript
async function suggestNewPosition(
  existingPortfolio: Holding[],
  newStock: StockData
) {
  // 1. 当前组合分析
  const currentRisk = calculateRiskMetrics(existingPortfolio)
  
  // 2. 新股对组合的影响
  const newAllocation = simulateAddition(existingPortfolio, newStock, 0.05)
  const newRisk = calculateRiskMetrics(newAllocation)
  
  // 3. 风险收益改善评估
  const improvement = {
    expectedReturnIncrease: newRisk.expectedReturn - currentRisk.expectedReturn,
    volatilityIncrease: newRisk.volatility - currentRisk.volatility,
    sharpeChange: newRisk.sharpeRatio - currentRisk.sharpeRatio,
    diversificationImprovement: assessDiversification(newAllocation)
  }
  
  return {
    recommended: improvement.sharpeChange > 0,
    weight: calculateOptimalWeight(existingPortfolio, newStock),
    impact: improvement
  }
}
```

### 例子3: 批量持仓分析

```typescript
async function analyzeMultipleHoldings(holdings: Holding[]) {
  const results = holdings.map(h => ({
    ticker: h.ticker,
    weight: h.weight,
    contribution: {
      return: h.weight * h.return,
      risk: calculateRiskContribution(h, holdings)
    },
    shouldReduce: h.weight > optimalWeight(h) * 1.2,
    shouldIncrease: h.weight < optimalWeight(h) * 0.8
  }))
  
  return {
    holdings: results,
    rebalance: {
      buy: results.filter(r => r.shouldIncrease).map(r => r.ticker),
      sell: results.filter(r => r.shouldReduce).map(r => r.ticker)
    }
  }
}
```

## 触发场景

- "分析我的投资组合"
- "我应该配置多少股票"
- "帮我看看持仓是否太集中"
- "需要再平衡吗"
- "如何提高组合夏普比率"
- "这只股票应该配多少"
- "组合风险大吗"
