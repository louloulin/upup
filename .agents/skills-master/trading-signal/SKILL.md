---
name: trading-signal
description: |
  交易信号与技术分析。当用户询问技术指标、买卖信号、趋势分析、MACD、RSI、布林带、均线系统、支撑阻力位时必须使用此技能。
  包括：技术指标计算、趋势识别、买卖信号生成、形态识别。
---

# Trading Signal - 交易信号与技术分析

## 技术指标库

### 1. 均线系统 (Moving Averages)

```typescript
// SMA (简单移动平均)
function calculateSMA(prices: number[], period: number): number[] {
  const result: number[] = []
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
    result.push(sum / period)
  }
  return result
}

// EMA (指数移动平均)
function calculateEMA(prices: number[], period: number): number {
  const multiplier = 2 / (period + 1)
  let ema = average(prices.slice(0, period))
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }
  return ema
}

// 常用均线
const MA_CONFIG = {
  SMA_20: { type: 'sma', period: 20, label: '短期均线' },
  SMA_50: { type: 'sma', period: 50, label: '中期均线' },
  SMA_200: { type: 'sma', period: 200, label: '长期均线' },
  EMA_12: { type: 'ema', period: 12, label: '快速EMA' },
  EMA_26: { type: 'ema', period: 26, label: '慢速EMA' }
}
```

### 2. MACD指标

```typescript
interface MACDResult {
  macd: number        // MACD线
  signal: number      // 信号线
  histogram: number    // 柱状图
  crossover: 'bullish' | 'bearish' | 'none'
}

function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const emaFast = calculateEMA(prices, fastPeriod)
  const emaSlow = calculateEMA(prices, slowPeriod)
  
  const macdLine = emaFast - emaSlow
  
  // 计算信号线 (MACD的EMA)
  const macdValues: number[] = []
  for (let i = slowPeriod; i < prices.length; i++) {
    macdValues.push(calculateEMA(prices.slice(0, i + 1), slowPeriod))
  }
  const signalLine = calculateEMA(macdValues, signalPeriod)
  
  const histogram = macdLine - signalLine
  
  // 检测交叉
  let crossover: 'bullish' | 'bearish' | 'none' = 'none'
  if (histogram > 0 && macdLine > signalLine) {
    crossover = 'bullish'
  } else if (histogram < 0 && macdLine < signalLine) {
    crossover = 'bearish'
  }
  
  return { macd: macdLine, signal: signalLine, histogram, crossover }
}
```

### 3. RSI指标

```typescript
interface RSIResult {
  rsi: number
  signal: 'overbought' | 'oversold' | 'neutral'
}

function calculateRSI(
  prices: number[],
  period: number = 14
): RSIResult {
  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }
  
  const recentChanges = changes.slice(-period)
  const gains = recentChanges.filter(c => c > 0)
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c))
  
  const avgGain = average(gains)
  const avgLoss = average(losses)
  
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  const rsi = 100 - (100 / (1 + rs))
  
  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral'
  if (rsi > 70) signal = 'overbought'
  else if (rsi < 30) signal = 'oversold'
  
  return { rsi, signal }
}
```

### 4. 布林带 (Bollinger Bands)

```typescript
interface BollingerBands {
  upper: number
  middle: number  // SMA
  lower: number
  bandwidth: number
  percentB: number  // 价格在带中的位置
}

function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerBands {
  const sma = average(prices.slice(-period))
  const squaredDiffs = prices.slice(-period).map(p => Math.pow(p - sma, 2))
  const variance = average(squaredDiffs)
  const std = Math.sqrt(variance)
  
  const upper = sma + stdDev * std
  const lower = sma - stdDev * std
  
  const currentPrice = prices[prices.length - 1]
  const percentB = (currentPrice - lower) / (upper - lower)
  
  const bandwidth = (upper - lower) / sma
  
  return { upper, middle: sma, lower, bandwidth, percentB }
}
```

### 5. 支撑阻力位

```typescript
interface SupportResistance {
  resistance: number[]
  support: number[]
  pivot: number
}

function findSupportResistance(
  prices: number[],
  lookback: number = 50
): SupportResistance {
  const recent = prices.slice(-lookback)
  
  // 找局部极值
  const highs: number[] = []
  const lows: number[] = []
  
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i] > recent[i-1] && recent[i] > recent[i-2] && 
        recent[i] > recent[i+1] && recent[i] > recent[i+2]) {
      highs.push(recent[i])
    }
    if (recent[i] < recent[i-1] && recent[i] < recent[i-2] && 
        recent[i] < recent[i+1] && recent[i] < recent[i+2]) {
      lows.push(recent[i])
    }
  }
  
  // 聚类相似的支撑阻力位
  const tolerance = 0.02  // 2%容差
  const resistance = clusterLevels(highs, tolerance)
  const support = clusterLevels(lows, tolerance)
  
  // 计算枢轴点
  const pivot = (recent[recent.length-1] + recent[0]) / 2
  
  return { resistance, support, pivot }
}
```

## 趋势分析

### 趋势识别

```typescript
type Trend = 'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down'

function identifyTrend(
  prices: number[],
  ma20: number[],
  ma50: number[],
  ma200: number[]
): Trend {
  const current = prices[prices.length - 1]
  const ma20Current = ma20[ma20.length - 1]
  const ma50Current = ma50[ma50.length - 1]
  const ma200Current = ma200[ma200.length - 1]
  
  // 多头排列
  if (ma20Current > ma50Current && ma50Current > ma200Current) {
    return current > ma20Current ? 'strong_up' : 'up'
  }
  
  // 空头排列
  if (ma20Current < ma50Current && ma50Current < ma200Current) {
    return current < ma20Current ? 'strong_down' : 'down'
  }
  
  return 'sideways'
}
```

### 趋势强度

```typescript
interface TrendStrength {
  adx: number          // 平均趋向指数
  strength: 'very_strong' | 'strong' | 'moderate' | 'weak'
}

function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): TrendStrength {
  const plusDM: number[] = []
  const minusDM: number[] = []
  
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i-1]
    const lowDiff = lows[i-1] - lows[i]
    
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)
  }
  
  // 计算ADX
  const adx = calculateSmoothedADX(plusDM, minusDM, period)
  
  let strength: 'very_strong' | 'strong' | 'moderate' | 'weak'
  if (adx > 50) strength = 'very_strong'
  else if (adx > 25) strength = 'strong'
  else if (adx > 15) strength = 'moderate'
  else strength = 'weak'
  
  return { adx, strength }
}
```

## 买卖信号生成

### 综合信号

```typescript
interface TradingSignal {
  overall: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
  score: number        // -100 to +100
  confidence: number   // 0 to 1
  signals: {
    trend: SignalComponent
    momentum: SignalComponent
    volatility: SignalComponent
    volume: SignalComponent
  }
}

interface SignalComponent {
  value: string
  weight: number
  reason: string
}

function generateTradingSignal(
  prices: number[],
  technicalData: TechnicalData
): TradingSignal {
  let score = 0
  const signals: TradingSignal['signals'] = {
    trend: { value: 'neutral', weight: 0.3, reason: '' },
    momentum: { value: 'neutral', weight: 0.25, reason: '' },
    volatility: { value: 'neutral', weight: 0.2, reason: '' },
    volume: { value: 'neutral', weight: 0.25, reason: '' }
  }
  
  // 1. 趋势信号
  const trendScore = calculateTrendSignal(technicalData)
  signals.trend = trendScore
  score += trendScore.value * trendScore.weight
  
  // 2. 动量信号
  const momentumScore = calculateMomentumSignal(technicalData)
  signals.momentum = momentumScore
  score += momentumScore.value * momentumScore.weight
  
  // 3. 波动率信号
  const volatilityScore = calculateVolatilitySignal(technicalData)
  signals.volatility = volatilityScore
  score += volatilityScore.value * volatilityScore.weight
  
  // 4. 成交量信号
  const volumeScore = calculateVolumeSignal(technicalData)
  signals.volume = volumeScore
  score += volumeScore.value * volumeScore.weight
  
  // 确定总体信号
  let overall: TradingSignal['overall']
  if (score > 60) overall = 'strong_buy'
  else if (score > 20) overall = 'buy'
  else if (score < -60) overall = 'strong_sell'
  else if (score < -20) overall = 'sell'
  else overall = 'hold'
  
  return {
    overall,
    score,
    confidence: calculateConfidence(signals),
    signals
  }
}
```

### 背离检测

```typescript
interface Divergence {
  type: 'bullish' | 'bearish' | 'none'
  strength: 'strong' | 'moderate' | 'weak'
  reason: string
}

function detectDivergence(
  prices: number[],
  indicator: number[],
  lookback: number = 20
): Divergence {
  const pricePeaks = findPeaks(prices.slice(-lookback))
  const indicatorPeaks = findPeaks(indicator.slice(-lookback))
  
  // 检查看涨背离 (价格创新低，指标没有)
  const lastPriceLow = Math.min(...prices.slice(-lookback))
  const lastIndicatorLow = Math.min(...indicator.slice(-lookback))
  
  // 价格新低但指标没有新低
  const bullishDivergence = 
    prices[prices.length - 1] === lastPriceLow &&
    indicator[indicator.length - 1] > lastIndicatorLow
  
  // 价格新高但指标没有新高
  const bearishDivergence =
    prices[prices.length - 1] === Math.max(...prices.slice(-lookback)) &&
    indicator[indicator.length - 1] < Math.max(...indicator.slice(-lookback))
  
  if (bullishDivergence) {
    return { type: 'bullish', strength: 'strong', reason: '价格创新低，RSI未创新低' }
  }
  if (bearishDivergence) {
    return { type: 'bearish', strength: 'strong', reason: '价格创新高，RSI未创新高' }
  }
  
  return { type: 'none', strength: 'weak', reason: '无背离' }
}
```

## 真实例子

### 例子1: 完整技术分析

```typescript
async function technicalAnalysis(ticker: string) {
  const prices = await get_price_history(ticker, '6mo')
  
  // 计算所有指标
  const sma20 = calculateSMA(prices, 20)
  const sma50 = calculateSMA(prices, 50)
  const sma200 = calculateSMA(prices, 200)
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  const macd = calculateMACD(prices)
  const rsi = calculateRSI(prices)
  const bollinger = calculateBollingerBands(prices)
  const sr = findSupportResistance(prices)
  
  // 趋势判断
  const trend = identifyTrend(prices, sma20, sma50, sma200)
  
  // 生成信号
  const signal = generateTradingSignal(prices, {
    ma: { sma20, sma50, sma200 },
    macd,
    rsi,
    bollinger,
    trend
  })
  
  return {
    summary: {
      ticker,
      price: prices[prices.length - 1],
      trend,
      signal: signal.overall,
      score: signal.score
    },
    indicators: { sma20, sma50, sma200, macd, rsi, bollinger },
    levels: sr,
    signals: signal.signals,
    recommendation: generateRecommendation(signal)
  }
}
```

### 例子2: 入场止损设置

```typescript
async function entryStopLossAnalysis(ticker: string) {
  const technical = await technicalAnalysis(ticker)
  
  // 计算建议入场价
  const entryPrice = calculateEntryPrice(technical)
  
  // 计算止损位
  const atr = await calculateATR(ticker, 14)
  const atrValue = atr * technical.price
  
  const stopLoss = {
    tight: technical.price * 0.97,  // 3%止损
    standard: technical.price - atrValue * 2,  // 2倍ATR
    wide: technical.price * 0.93   // 7%止损
  }
  
  // 计算止盈位
  const takeProfit = {
    conservative: technical.fairValue * 0.95,
    target: technical.fairValue,
    aggressive: technical.fairValue * 1.1
  }
  
  // 风险收益比
  const riskReward = {
    conservative: (takeProfit.target - entryPrice) / (entryPrice - stopLoss.standard),
    target: (takeProfit.target - entryPrice) / (entryPrice - stopLoss.standard),
    aggressive: (takeProfit.aggressive - entryPrice) / (entryPrice - stopLoss.standard)
  }
  
  return {
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    recommendation: riskReward.target > 2 ? 'favorable' : ' unfavorable'
  }
}
```

## 触发场景

- "这只股票技术面怎么样"
- "有没有买卖信号"
- "MACD金叉了吗"
- "RSI是不是超买了"
- "均线多头排列了吗"
- "支撑位在哪"
- "能帮我分析下这只股票的趋势吗"
- "什么时候可以买入"
