---
name: risk-assessment
description: |
  投资风险评估与管理。当用户询问风险分析、风险评估、下行风险、最大回撤、VaR计算、风险控制时必须使用此技能。
  包括：多维度风险识别、量化方法、风险评级、风险缓解策略。
---

# Risk Assessment - 投资风险评估

## 风险评估框架

### 多维度风险分类

```typescript
enum RiskCategory {
  MARKET = "市场风险",
  CREDIT = "信用风险",
  LIQUIDITY = "流动性风险",
  OPERATIONAL = "运营风险",
  BUSINESS = "业务风险",
  FINANCIAL = "财务风险",
  LEGAL = "法律风险",
  MACRO = "宏观风险"
}

interface RiskAssessment {
  category: RiskCategory
  level: RiskLevel
  probability: number    // 发生概率 0-1
  impact: number        // 影响程度 0-100%
  exposure: number      // 风险敞口
  trend: 'increasing' | 'stable' | 'decreasing'
  mitigation: string[]
}
```

## 量化风险方法

### 1. 波动率风险

```typescript
// 历史波动率
function calculateHistoricalVolatility(
  returns: number[],
  annualize: boolean = true
): number {
  const mean = average(returns)
  const variance = average(returns.map(r => Math.pow(r - mean, 2)))
  const vol = Math.sqrt(variance)
  
  return annualize ? vol * Math.sqrt(252) : vol
}

// EWMA波动率 (λ = 0.94)
function calculateEWMAVolatility(
  returns: number[],
  lambda: number = 0.94
): number {
  let variance = returns[0] * returns[0]
  
  for (let i = 1; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i] * returns[i]
  }
  
  return Math.sqrt(variance * 252)
}

// GARCH(1,1)波动率
function calculateGARCHVolatility(
  returns: number[],
  omega: number,
  alpha: number,
  beta: number
): number {
  let variance = returns[0] * returns[0]
  
  for (let i = 1; i < returns.length; i++) {
    variance = omega + alpha * returns[i-1] * returns[i-1] + beta * variance
  }
  
  return Math.sqrt(variance * 252)
}
```

### 2. VaR (Value at Risk)

```typescript
interface VaRResult {
  value: number        // VaR值
  confidence: number    // 置信水平
  horizon: number       // 持有期(天)
  method: 'historical' | 'parametric' | 'monteCarlo'
}

// 历史模拟法
function calculateHistoricalVaR(
  returns: number[],
  portfolioValue: number,
  confidence: number = 0.95,
  horizon: number = 1
): VaRResult {
  const sortedReturns = [...returns].sort((a, b) => a - b)
  const index = Math.floor((1 - confidence) * sortedReturns.length)
  
  const varReturn = sortedReturns[index]
  const varValue = portfolioValue * varReturn * Math.sqrt(horizon)
  
  return {
    value: Math.abs(varValue),
    confidence,
    horizon,
    method: 'historical'
  }
}

// 参数法 (方差-协方差)
function calculateParametricVaR(
  meanReturn: number,
  volatility: number,
  portfolioValue: number,
  confidence: number = 0.95,
  horizon: number = 1
): VaRResult {
  const zScore = getZScore(confidence)
  const varReturn = meanReturn * horizon - zScore * volatility * Math.sqrt(horizon)
  const varValue = portfolioValue * varReturn
  
  return {
    value: Math.abs(varValue),
    confidence,
    horizon,
    method: 'parametric'
  }
}

// Monte Carlo模拟
function calculateMonteCarloVaR(
  returns: number[],
  portfolioValue: number,
  confidence: number = 0.95,
  simulations: number = 10000
): VaRResult {
  const mean = average(returns)
  const std = standardDeviation(returns)
  
  const simulatedReturns = Array.from({ length: simulations }, () => 
    normalRandom(mean, std)
  )
  
  const sortedSimulated = simulatedReturns.sort((a, b) => a - b)
  const index = Math.floor((1 - confidence) * simulations)
  
  return {
    value: Math.abs(portfolioValue * sortedSimulated[index]),
    confidence,
    horizon: 1,
    method: 'monteCarlo'
  }
}
```

### 3. 最大回撤

```typescript
interface DrawdownAnalysis {
  maxDrawdown: number      // 最大回撤
  maxDrawdownDuration: number  // 最大回撤持续时间
  recoveryTime: number     // 恢复时间
  currentDrawdown: number   // 当前回撤
}

function calculateDrawdowns(prices: number[]): DrawdownAnalysis {
  let peak = prices[0]
  let maxDrawdown = 0
  let maxDrawdownStart = 0
  let maxDrawdownEnd = 0
  let currentDrawdown = 0
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i]
    }
    
    const drawdown = (prices[i] - peak) / peak
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown
      maxDrawdownEnd = i
      maxDrawdownStart = prices.indexOf(peak)
    }
  }
  
  currentDrawdown = (prices[prices.length - 1] - peak) / peak
  
  return {
    maxDrawdown: maxDrawdown * 100,
    maxDrawdownDuration: maxDrawdownEnd - maxDrawdownStart,
    recoveryTime: calculateRecoveryTime(prices, maxDrawdownEnd),
    currentDrawdown: currentDrawdown * 100
  }
}
```

### 4. Beta和风险

```typescript
interface BetaAnalysis {
  beta: number
  alpha: number
  rSquared: number
  downsideBeta: number
  upBeta: number
}

// 计算Beta
function calculateBeta(
  stockReturns: number[],
  marketReturns: number[]
): BetaAnalysis {
  const covariance = calculateCovariance(stockReturns, marketReturns)
  const marketVariance = variance(marketReturns)
  
  const beta = covariance / marketVariance
  const alpha = average(stockReturns) - beta * average(marketReturns)
  const rSquared = Math.pow(correlation(stockReturns, marketReturns), 2)
  
  // 下行Beta (只考虑市场下跌时)
  const downsideReturns = stockReturns.filter((r, i) => marketReturns[i] < 0)
  const downsideBeta = downsideReturns.length > 0 
    ? calculateBeta(downsideReturns, marketReturns.filter(r => r < 0))
    : beta
  
  return { beta, alpha, rSquared, downsideBeta, upBeta: beta }
}
```

## 风险评级

### 评分体系

```typescript
interface RiskRating {
  score: number      // 0-100
  level: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
  color: string
}

function calculateRiskRating(
  metrics: RiskMetrics
): RiskRating {
  let score = 0
  
  // 波动率评分 (30%)
  if (metrics.volatility < 10) score += 30
  else if (metrics.volatility < 20) score += 20
  else if (metrics.volatility < 30) score += 10
  else score += 0
  
  // Beta评分 (25%)
  if (metrics.beta < 0.8) score += 25
  else if (metrics.beta < 1.2) score += 15
  else if (metrics.beta < 1.5) score += 10
  else score += 0
  
  // 最大回撤评分 (25%)
  if (metrics.maxDrawdown < 10) score += 25
  else if (metrics.maxDrawdown < 20) score += 15
  else if (metrics.maxDrawdown < 30) score += 10
  else score += 0
  
  // VaR评分 (20%)
  if (metrics.var < 5) score += 20
  else if (metrics.var < 10) score += 15
  else if (metrics.var < 15) score += 10
  else score += 0
  
  return {
    score,
    level: scoreToLevel(score),
    color: scoreToColor(score)
  }
}
```

## 风险缓解策略

### 仓位管理

```typescript
interface PositionSizing {
  recommendedSize: number   // 建议仓位%
  stopLoss: number         // 止损位
  riskPerTrade: number      // 单笔风险
}

// Kelly公式
function kellyCriterion(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  const b = avgWin / avgLoss
  const q = 1 - winRate
  const kelly = (b * winRate - q) / b
  return Math.max(0, kelly)  // 建议Kelly的一半更保守
}

// 基于波动率的仓位
function positionByVolatility(
  portfolioValue: number,
  targetRisk: number,
  stockVolatility: number,
  marketVolatility: number
): number {
  const positionVaR = targetRisk * portfolioValue
  const volatilityContribution = stockVolatility * Math.sqrt(10/252)
  
  return positionVaR / volatilityContribution / portfolioValue
}
```

### 止损策略

```typescript
interface StopLossStrategy {
  initialStop: number    // 初始止损
  trailingStop: number    // 追踪止损
  timeStop: number        // 时间止损(天)
}

function calculateStopLoss(
  entryPrice: number,
  volatility: number,
  riskPerTrade: number
): StopLossStrategy {
  // ATR-based止损
  const atrStop = entryPrice - 2 * volatility * entryPrice
  
  // 固定比例止损
  const percentageStop = entryPrice * (1 - riskPerTrade)
  
  // 支撑位止损
  const supportStop = findSupportLevel(entryPrice) * 0.98
  
  return {
    initialStop: Math.max(atrStop, supportStop, percentageStop),
    trailingStop: calculateTrailingStop(entryPrice, volatility),
    timeStop: 30  // 30个交易日
  }
}
```

## 真实例子

### 例子1: 完整风险报告

```typescript
async function generateRiskReport(stock: StockData): Promise<RiskReport> {
  const prices = await getHistoricalPrices(stock.ticker, '2y')
  const returns = calculateReturns(prices)
  const marketReturns = await getMarketReturns('2y')
  
  // 1. 波动率分析
  const volatility = calculateHistoricalVolatility(returns)
  const ewmaVol = calculateEWMAVolatility(returns)
  
  // 2. Beta分析
  const betaAnalysis = calculateBeta(returns, marketReturns)
  
  // 3. VaR计算
  const var95 = calculateHistoricalVaR(returns, stock.marketCap, 0.95)
  const var99 = calculateHistoricalVaR(returns, stock.marketCap, 0.99)
  
  // 4. 回撤分析
  const drawdown = calculateDrawdowns(prices)
  
  // 5. 评级
  const rating = calculateRiskRating({
    volatility,
    beta: betaAnalysis.beta,
    maxDrawdown: drawdown.maxDrawdown,
    var: var95.value / stock.marketCap * 100
  })
  
  return {
    summary: `风险等级: ${rating.level}`,
    metrics: { volatility, betaAnalysis, var95, var99, drawdown },
    rating,
    recommendations: generateRiskRecommendations(rating)
  }
}
```

### 例子2: 组合风险评估

```typescript
async function assessPortfolioRisk(holdings: Holding[]): Promise<PortfolioRiskReport> {
  // 1. 个股风险
  const individualRisks = holdings.map(h => ({
    ticker: h.ticker,
    volatility: calculateVolatility(h.returns),
    beta: calculateBeta(h.returns, marketReturns),
    var: calculateVaR(h.returns, h.value)
  }))
  
  // 2. 组合相关性
  const correlationMatrix = calculateCorrelationMatrix(
    holdings.map(h => h.returns)
  )
  
  // 3. 组合VaR
  const weights = holdings.map(h => h.weight)
  const portfolioVol = calculatePortfolioVolatility(
    weights,
    individualRisks.map(r => r.volatility),
    correlationMatrix
  )
  
  // 4. 分散化收益
  const diversificationRatio = calculateDiversificationRatio(
    holdings,
    correlationMatrix
  )
  
  return {
    individualRisks,
    correlationMatrix,
    portfolioVol,
    diversificationRatio,
    recommendations: generateDiversificationRecommendations(holdings)
  }
}
```

### 例子3: 风险止损设置

```typescript
function setTradeStops(
  entryPrice: number,
  volatility: number,
  capital: number,
  riskTolerance: number
): TradeStops {
  // 计算建议仓位
  const maxRiskAmount = capital * riskTolerance
  const positionSize = maxRiskAmount / (volatility * entryPrice)
  
  // 止损设置
  const hardStop = entryPrice * (1 - 2 * volatility)
  const softStop = entryPrice * (1 - 1 * volatility)
  
  // 追踪止损
  const trailingStop = calculateTrailingStop(entryPrice, volatility)
  
  return {
    entryPrice,
    positionSize: Math.min(positionSize, 0.1),  // 最大10%仓位
    maxRiskAmount,
    hardStop,
    softStop,
    trailingStop,
    takeProfit: entryPrice * (1 + 3 * volatility)
  }
}
```

## 触发场景

- "这只股票风险大吗"
- "帮我评估持仓风险"
- "最大回撤是多少"
- "VaR是什么"
- "如何设置止损"
- "组合风险高吗"
- "需要减仓吗"
- "风险评级是什么"
