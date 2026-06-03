---
name: market-research
description: |
  市场研究与宏观分析。当用户询问市场环境、行业趋势、宏观经济、资金流向、市场情绪、板块轮动时必须使用此技能。
  包括：市场概览、行业分析、情绪指标、资金流向、轮动策略。
---

# Market Research - 市场研究与宏观分析

## 市场概览

### 市场健康度评分

```typescript
interface MarketHealth {
  overall: 'bullish' | 'neutral' | 'bearish'
  score: number  // -100 to +100
  dimensions: {
    trend: number
    breadth: number
    sentiment: number
    macro: number
  }
}

async function assessMarketHealth(): Promise<MarketHealth> {
  // 1. 趋势分析
  const indices = ['SPY', 'QQQ', 'DIA']
  const indexPerformance = await Promise.all(
    indices.map(async (ticker) => {
      const prices = await get_price_history(ticker, '3mo')
      return calculatePerformance(prices)
    })
  )
  
  // 2. 市场广度
  const breadth = await calculateMarketBreadth()
  
  // 3. 情绪指标
  const sentiment = await getMarketSentiment()
  
  // 4. 宏观因素
  const macro = await assessMacroFactors()
  
  // 综合评分
  const score = 
    indexPerformance.average * 0.3 +
    breadth * 0.2 +
    sentiment * 0.25 +
    macro * 0.25
  
  return {
    overall: score > 30 ? 'bullish' : score < -30 ? 'bearish' : 'neutral',
    score,
    dimensions: { trend: indexPerformance, breadth, sentiment, macro }
  }
}
```

### 板块强弱排名

```typescript
interface SectorPerformance {
  sector: string
  performance: {
    day: number
    week: number
    month: number
    year: number
  }
  relativeStrength: number
  momentum: 'strong' | 'moderate' | 'weak'
}

async function rankSectors(): Promise<SectorPerformance[]> {
  const sectors = [
    'Technology', 'Healthcare', 'Finance', 'Energy',
    'Consumer', 'Industrial', 'Utilities', 'RealEstate'
  ]
  
  const performances = await Promise.all(
    sectors.map(async (sector) => {
      const etf = getSectorETF(sector)
      const prices = await get_price_history(etf, '1y')
      
      return {
        sector,
        performance: {
          day: calculatePerformance(prices, '1d'),
          week: calculatePerformance(prices, '1w'),
          month: calculatePerformance(prices, '1mo'),
          year: calculatePerformance(prices, '1y')
        },
        relativeStrength: calculateRelativeStrength(prices),
        momentum: assessMomentum(prices)
      }
    })
  )
  
  return performances.sort((a, b) => 
    b.performance.month - a.performance.month
  )
}
```

## 情绪分析

### 市场情绪指标

```typescript
interface SentimentIndicators {
  fearGreedIndex: number      // 0-100
  putCallRatio: number        // >1恐惧, <1贪婪
  vix: number               // VIX波动率指数
  bullBearPercent: number     // 多空百分比
  sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed'
}

async function getMarketSentiment(): Promise<SentimentIndicators> {
  const [fearGreed, putCall, vix, bullBear] = await Promise.all([
    fetchFearGreedIndex(),
    calculatePutCallRatio(),
    getVIX(),
    getBullBearSpread()
  ])
  
  return {
    fearGreedIndex: fearGreed,
    putCallRatio: putCall,
    vix,
    bullBearPercent: bullBear,
    sentiment: interpretSentiment({ fearGreed, putCall, vix, bullBear })
  }
}
```

### 资金流向

```typescript
interface MoneyFlow {
  sector: string
  inflow: number        // 净流入(百万)
  inflowPercent: number // 流入百分比
  daysInflow: number   // 连续净流入天数
}

async function analyzeSectorMoneyFlow(): Promise<MoneyFlow[]> {
  const sectors = getAllSectors()
  
  const flows = await Promise.all(
    sectors.map(async (sector) => {
      const etf = getSectorETF(sector)
      const volumeData = await get_volume_data(etf, '5d')
      
      const inflow = calculateNetFlow(volumeData)
      const inflowPercent = inflow / getMarketCap(sector)
      const daysInflow = countConsecutiveInflowDays(volumeData)
      
      return {
        sector,
        inflow,
        inflowPercent,
        daysInflow
      }
    })
  )
  
  return flows.sort((a, b) => b.inflow - a.inflow)
}
```

## 行业分析

### 行业周期定位

```typescript
interface IndustryCycle {
  cycle: 'early' | 'growth' | 'mature' | 'decline'
  confidence: number
  indicators: {
    revenueGrowth: number
    marginExpansion: boolean
    capexTrend: 'increasing' | 'stable' | 'decreasing'
    newEntrants: number
  }
}

function identifyIndustryCycle(
  industryData: IndustryMetrics[]
): IndustryCycle {
  const avgGrowth = average(industryData.map(d => d.revenueGrowth))
  const avgMargin = average(industryData.map(d => d.netMargin))
  
  // 判断周期阶段
  if (avgGrowth > 15 && avgMargin > 20) {
    return {
      cycle: 'growth',
      confidence: 0.8,
      indicators: {
        revenueGrowth: avgGrowth,
        marginExpansion: true,
        capexTrend: 'increasing',
        newEntrants: industryData[0].newEntrants
      }
    }
  }
  
  // ... 其他阶段判断
  return { cycle: 'mature', confidence: 0.6, indicators: {...} }
}
```

### 行业比较框架

```typescript
interface IndustryComparison {
  industries: string[]
  metrics: {
    growth: Map<string, number>
    valuation: Map<string, number>
    profitability: Map<string, number>
    momentum: Map<string, number>
  }
  rankings: {
    byGrowth: string[]
    byValue: string[]
    byQuality: string[]
    byMomentum: string[]
  }
}

async function compareIndustries(
  industries: string[]
): Promise<IndustryComparison> {
  const data = await getIndustryData(industries)
  
  return {
    industries,
    metrics: {
      growth: new Map(industries.map((ind, i) => [ind, data[i].revenueGrowth])),
      valuation: new Map(industries.map((ind, i) => [ind, data[i].forwardPE])),
      profitability: new Map(industries.map((ind, i) => [ind, data[i].roe])),
      momentum: new Map(industries.map((ind, i) => [ind, data[i].momentum3m]))
    },
    rankings: {
      byGrowth: rank(industries, 'growth'),
      byValue: rank(industries, 'value'),
      byQuality: rank(industries, 'quality'),
      byMomentum: rank(industries, 'momentum')
    }
  }
}
```

## 轮动策略

### 行业轮动模型

```typescript
interface RotationSignal {
  from: string    // 调出行业
  to: string      // 调入行业
  confidence: number
  reason: string
}

async function generateRotationSignals(): Promise<RotationSignal[]> {
  // 1. 获取当前环境
  const economy = await getEconomicIndicators()
  const marketPhase = identifyMarketPhase(economy)
  
  // 2. 基于经济周期推荐
  const cycleRecommendations = getCyclicalRecommendations(marketPhase)
  
  // 3. 检查动量
  const momentumSignals = await getMomentumSignals()
  
  // 4. 检查相对价值
  const valueSignals = await getValueSignals()
  
  // 5. 综合生成轮动信号
  const signals = combineSignals(
    cycleRecommendations,
    momentumSignals,
    valueSignals
  )
  
  return signals.filter(s => s.confidence > 0.7)
}
```

### 美林时钟策略

```typescript
type EconomyPhase = 'early' | 'mid' | 'late' | 'contraction'

function getMeriynClockAllocation(
  phase: EconomyPhase
): SectorAllocation[] {
  const allocations: Record<EconomyPhase, SectorAllocation[]> = {
    early: [  // 复苏期
      { sector: 'Technology', weight: 0.25 },
      { sector: 'Consumer', weight: 0.20 },
      { sector: 'Industrial', weight: 0.15 }
    ],
    mid: [  // 成长期
      { sector: 'Finance', weight: 0.25 },
      { sector: 'Energy', weight: 0.20 },
      { sector: 'Industrial', weight: 0.15 }
    ],
    late: [  // 过热期
      { sector: 'Energy', weight: 0.25 },
      { sector: 'Commodities', weight: 0.20 },
      { sector: 'RealEstate', weight: 0.15 }
    ],
    contraction: [  // 衰退期
      { sector: 'Utilities', weight: 0.25 },
      { sector: 'Healthcare', weight: 0.20 },
      { sector: 'Consumer Staples', weight: 0.15 }
    ]
  }
  
  return allocations[phase]
}
```

## 真实例子

### 例子1: 月度市场检查

```typescript
async function monthlyMarketCheck() {
  const health = await assessMarketHealth()
  const sectors = await rankSectors()
  const sentiment = await getMarketSentiment()
  const flows = await analyzeSectorMoneyFlow()
  const rotations = await generateRotationSignals()
  
  return {
    date: new Date().toISOString(),
    health,
    topSectors: sectors.slice(0, 3),
    bottomSectors: sectors.slice(-3),
    sentiment,
    topInflow: flows.slice(0, 3),
    topOutflow: flows.slice(-3),
    rotationSignals: rotations,
    recommendation: generateMarketRecommendation({
      health,
      sentiment,
      rotations
    })
  }
}
```

### 例子2: 行业配置建议

```typescript
async function suggestIndustryAllocation(
  userRisk: 'conservative' | 'moderate' | 'aggressive'
) {
  const economy = await getEconomicIndicators()
  const phase = identifyMarketPhase(economy)
  const sectorPerf = await rankSectors()
  const sentiment = await getMarketSentiment()
  
  // 获取基础配置
  let allocation = getMeriynClockAllocation(phase)
  
  // 根据风险调整
  if (userRisk === 'conservative') {
    allocation = adjustForRisk(allocation, 'conservative')
  } else if (userRisk === 'aggressive') {
    allocation = adjustForRisk(allocation, 'aggressive')
  }
  
  // 根据情绪调整
  allocation = adjustForSentiment(allocation, sentiment)
  
  // 根据动量调整
  allocation = adjustForMomentum(allocation, sectorPerf)
  
  return {
    phase,
    baseAllocation: allocation,
    adjustments: [
      { type: 'risk', adjustment: 0.05 },
      { type: 'sentiment', adjustment: sentiment.confidence * 0.03 }
    ],
    finalAllocation: allocation,
    rationale: generateRationale(phase, sentiment, sectorPerf)
  }
}
```

### 例子3: 主题投资机会

```typescript
async function thematicOpportunities() {
  const themes = [
    'AI', 'Electric Vehicles', 'Clean Energy', 
    'Semiconductors', 'Biotech', 'Cloud Computing'
  ]
  
  const analysis = await Promise.all(
    themes.map(async (theme) => {
      const stocks = await screenStocks({ theme })
      const avgMetrics = calculateAverageMetrics(stocks)
      
      return {
        theme,
        stockCount: stocks.length,
        avgValuation: avgMetrics.forwardPE,
        avgGrowth: avgMetrics.revenueGrowth,
        momentum: calculateThemeMomentum(theme),
        opportunity: assessOpportunity(avgMetrics)
      }
    })
  )
  
  return {
    themes: analysis.sort((a, b) => b.opportunity - a.opportunity),
    topPicks: analysis.filter(t => t.opportunity > 0.7).map(t => t.theme),
    avoidThemes: analysis.filter(t => t.opportunity < 0.3).map(t => t.theme)
  }
}
```

## 触发场景

- "当前市场环境怎么样"
- "哪个行业值得投资"
- "市场情绪如何"
- "行业轮动到哪了"
- "怎么根据经济周期配置"
- "资金在流入哪些板块"
- "有哪些主题投资机会"
- "现在是牛市还是熊市"
