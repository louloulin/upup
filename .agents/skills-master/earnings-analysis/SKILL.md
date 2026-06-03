---
name: earnings-analysis
description: |
  财报分析与盈利预测。当用户询问财报分析、盈利预测、EPS预期、财报电话会议、业绩超预期时必须使用此技能。
  包括：财报解读、盈利预测、财报预期管理、业绩陷阱识别。
---

# Earnings Analysis - 财报分析与盈利预测

## 财报分析框架

### 核心指标解读

```typescript
interface EarningsMetrics {
  // 收入
  revenue: number
  revenueGrowth: number
  revenueBeatRate: number
  
  // 利润
  grossMargin: number
  operatingMargin: number
  netMargin: number
  
  // EPS
  eps: number
  epsBeatRate: number
  adjustedEps: number
  
  // 现金流
  operatingCashFlow: number
  freeCashFlow: number
  fcfConversion: number
}

async function analyzeEarnings(ticker: string): Promise<EarningsMetrics> {
  const income = await get_income_statement(ticker, 'annual')
  const cashFlow = await get_cashflow(ticker, 'annual')
  
  return {
    revenue: income.revenue,
    revenueGrowth: calculateGrowth(income.revenue),
    revenueBeatRate: await getBeatRate(ticker, 'revenue'),
    grossMargin: income.grossProfit / income.revenue,
    operatingMargin: income.operatingIncome / income.revenue,
    netMargin: income.netIncome / income.revenue,
    eps: income.eps,
    epsBeatRate: await getBeatRate(ticker, 'eps'),
    adjustedEps: income.adjustedEps,
    operatingCashFlow: cashFlow.operatingCashFlow,
    freeCashFlow: cashFlow.freeCashFlow,
    fcfConversion: cashFlow.freeCashFlow / income.netIncome
  }
}
```

### 盈利质量评估

```typescript
interface EarningsQuality {
  score: number      // 0-100
  issues: string[]
  redFlags: string[]
  assessment: 'high' | 'medium' | 'low'
}

function assessEarningsQuality(
  earnings: EarningsMetrics,
  balance: BalanceSheet
): EarningsQuality {
  const issues: string[] = []
  const redFlags: string[] = []
  
  // 1. 现金流匹配
  if (earnings.fcfConversion < 0.8) {
    issues.push('净利润现金含量低')
    if (earnings.fcfConversion < 0.5) {
      redFlags.push('FCF Conversion严重不足，可能存在会计问题')
    }
  }
  
  // 2. 应收账款
  const receivableDays = balance.receivables / earnings.revenue * 365
  if (receivableDays > 90) {
    issues.push(`应收账款天数偏高: ${receivableDays.toFixed(0)}天`)
  }
  
  // 3. 存货
  const inventoryDays = balance.inventory / earnings.revenue * 365
  if (inventoryDays > 120) {
    issues.push(`存货天数偏高: ${inventoryDays.toFixed(0)}天`)
  }
  
  // 4. 盈利持续性
  const accrualRatio = calculateAccrualRatio(earnings, balance)
  if (accrualRatio > 0.1) {
    redFlags.push('应计项目比率偏高，盈利质量可疑')
  }
  
  return {
    score: 100 - issues.length * 10 - redFlags.length * 20,
    issues,
    redFlags,
    assessment: redFlags.length > 0 ? 'low' : issues.length > 0 ? 'medium' : 'high'
  }
}
```

## 盈利预测

### 分析师预期追踪

```typescript
interface AnalystExpectations {
  ticker: string
  currentEstimate: number
  previousEstimate: number
  revisions: number       // 正数=上调
  consensus: number       // 分析师共识
  highEstimate: number
  lowEstimate: number
  numberOfAnalysts: number
}

async function trackAnalystExpectations(
  ticker: string,
  period: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'annual'
): Promise<AnalystExpectations> {
  const estimates = await getAnalystEstimates(ticker, period)
  
  const revisions = estimates.current - estimates.previous
  
  return {
    ticker,
    currentEstimate: estimates.current,
    previousEstimate: estimates.previous,
    revisions,
    consensus: estimates.consensus,
    highEstimate: estimates.high,
    lowEstimate: estimates.low,
    numberOfAnalysts: estimates.analysts.length
  }
}
```

### 盈利预测模型

```typescript
interface EarningsForecast {
  ticker: string
  period: string
  forecast: {
    revenue: { low: number, mid: number, high: number }
    eps: { low: number, mid: number, high: number }
    probability: number
  }
  factors: {
    positive: string[]
    negative: string[]
  }
}

async function forecastEarnings(
  ticker: string
): Promise<EarningsForecast> {
  // 1. 历史分析
  const history = await getEarningsHistory(ticker, 8) // 8个季度
  
  // 2. 趋势外推
  const trend = calculateEarningsTrend(history)
  
  // 3. 分析师预期
  const analystExpectations = await trackAnalystExpectations(ticker, 'next')
  
  // 4. 宏观调整
  const macroAdjustment = await getMacroAdjustment(ticker)
  
  // 5. 特殊因素
  const specialFactors = await identifySpecialFactors(ticker)
  
  // 综合预测
  const forecast = {
    revenue: {
      low: trend.revenueLow * analystExpectations.consensus * 0.95,
      mid: trend.revenueMid * analystExpectations.consensus,
      high: trend.revenueHigh * analystExpectations.consensus * 1.05
    },
    eps: {
      low: trend.epsLow * analystExpectations.consensus * 0.95,
      mid: trend.epsMid * analystExpectations.consensus,
      high: trend.epsHigh * analystExpectations.consensus * 1.05
    }
  }
  
  return {
    ticker,
    period: 'next_quarter',
    forecast,
    factors: categorizeFactors(specialFactors)
  }
}
```

## 财报电话会议分析

### 关键信号提取

```typescript
interface EarningsCallSignals {
  positive: string[]
  negative: string[]
  guidance: {
    revenue: { direction: 'up' | 'down' | 'maintain' | 'withdrawn'
    confidence: number }
    eps: { direction: 'up' | 'down' | 'maintain' | 'withdrawn'
    confidence: number }
  }
  keyThemes: string[]
  tone: 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative'
}

async function analyzeEarningsCall(ticker: string): Promise<EarningsCallSignals> {
  const transcript = await getEarningsTranscript(ticker)
  
  // 1. 提取关键短语
  const positiveSignals = extractPositiveSignals(transcript)
  const negativeSignals = extractNegativeSignals(transcript)
  
  // 2. 分析指引
  const guidance = extractGuidance(transcript)
  
  // 3. 识别主题
  const themes = identifyKeyThemes(transcript)
  
  // 4. 语气分析
  const sentiment = analyzeSentiment(transcript)
  
  return {
    positive: positiveSignals,
    negative: negativeSignals,
    guidance,
    keyThemes: themes,
    tone: sentiment
  }
}
```

### 财报预期差分析

```typescript
interface EarningsSurprise {
  actual: number
  consensus: number
  beat: number        // 超出共识%
  whisperNumber: number  // 市场预期
  beatWhisper: number
  historicalBeatRate: number
  signal: 'strong_beat' | 'beat' | 'in_line' | 'miss' | 'strong_miss'
}

async function analyzeEarningsSurprise(
  ticker: string,
  actualEps: number
): Promise<EarningsSurprise> {
  const consensus = await getConsensusEstimate(ticker, 'eps')
  const whisper = await getWhisperNumber(ticker)
  const beatRate = await getHistoricalBeatRate(ticker)
  
  const beat = (actualEps - consensus) / consensus
  const beatWhisper = (actualEps - whisper) / whisper
  
  let signal: EarningsSurprise['signal'] = 'in_line'
  if (beat > 0.1) signal = 'strong_beat'
  else if (beat > 0.02) signal = 'beat'
  else if (beat < -0.1) signal = 'strong_miss'
  else if (beat < -0.02) signal = 'miss'
  
  return {
    actual: actualEps,
    consensus,
    beat,
    whisperNumber: whisper,
    beatWhisper,
    historicalBeatRate: beatRate,
    signal
  }
}
```

## 真实例子

### 例子1: 财报前分析

```typescript
async function preEarningsAnalysis(ticker: string) {
  // 1. 历史表现
  const history = await getEarningsHistory(ticker, 8)
  const beatRate = calculateBeatRate(history)
  
  // 2. 当前预期
  const expectations = await trackAnalystExpectations(ticker, 'next')
  
  // 3. 估值影响
  const currentPrice = await getCurrentPrice(ticker)
  const valuationImpact = calculateValuationImpact(
    expectations.consensus,
    currentPrice
  )
  
  // 4. 风险评估
  const risk = assessEarningsRisk(ticker, expectations)
  
  return {
    ticker,
    earningsDate: await getEarningsDate(ticker),
    beatRate: beatRate,
    consensus: expectations,
    valuationImpact,
    risk,
    trade: generateEarningsTrade({
      beatRate,
      expectations,
      risk
    })
  }
}
```

### 例子2: 财报后分析

```typescript
async function postEarningsAnalysis(ticker: string) {
  // 1. 获取实际数据
  const actual = await getActualEarnings(ticker)
  const surprise = await analyzeEarningsSurprise(ticker, actual.eps)
  
  // 2. 分析电话会议
  const callSignals = await analyzeEarningsCall(ticker)
  
  // 3. 价格反应
  const priceReaction = await getPriceReaction(ticker)
  
  // 4. 调整预期
  const newConsensus = await updateExpectations(ticker, actual)
  
  // 5. 评级调整
  const ratingChange = await checkRatingChanges(ticker)
  
  return {
    ticker,
    surprise,
    callSignals,
    priceReaction,
    newConsensus,
    ratingChange,
    nextSteps: generateNextSteps(surprise, callSignals)
  }
}
```

### 例子3: 盈利陷阱识别

```typescript
async function earningsTrapDetection(ticker: string) {
  const earnings = await analyzeEarnings(ticker)
  const quality = await assessEarningsQuality(earnings)
  const trends = await analyzeEarningsTrend(ticker)
  
  const traps = []
  
  // 1. 一次性损益
  if (earnings.hasSpecialItems) {
    traps.push({
      type: 'one_time_gain',
      severity: 'high',
      impact: earnings.specialItems / earnings.netIncome
    })
  }
  
  // 2. 增长不可持续
  if (earnings.revenueGrowth > 50 && !earnings.hasDurableGrowth) {
    traps.push({
      type: 'unsustainable_growth',
      severity: 'medium',
      reason: '高增长缺乏持续性支撑'
    })
  }
  
  // 3. 利润率扩张陷阱
  if (earnings.marginExpansion > 5 && trends.grossMarginTrend === 'declining') {
    traps.push({
      type: 'margin_trap',
      severity: 'high',
      reason: '报表利润率扩张但趋势向下'
    })
  }
  
  return {
    ticker,
    isTrap: traps.length > 0,
    traps,
    quality,
    verdict: generateVerdict(traps, quality)
  }
}
```

## 触发场景

- "这家公司财报怎么样"
- "EPS超预期了吗"
- "盈利预测多少"
- "财报电话说了什么"
- "财报有哪些风险"
- "如何分析财报"
- "盈利质量如何"
- "值得投资吗"
