---
name: sector-analysis
description: |
  行业与板块深度分析。当用户询问行业分析、板块轮动、行业比较、赛道选择、产业链分析时必须使用此技能。
  包括：行业框架、竞争格局、产业链分析、行业估值比较。
---

# Sector Analysis - 行业与板块深度分析

## 行业分析框架

### 波特五力模型

```typescript
interface PortersFiveForces {
  competitiveRivalry: { score: number; factors: string[] }
  supplierPower: { score: number; factors: string[] }
  buyerPower: { score: number; factors: string[] }
  threatOfNewEntrants: { score: number; factors: string[] }
  threatOfSubstitutes: { score: number; factors: string[] }
  overallAttractiveness: 'high' | 'medium' | 'low'
}

async function analyzePortersFiveForces(
  industry: string
): Promise<PortersFiveForces> {
  const competitors = await getCompetitors(industry)
  const suppliers = await getSuppliers(industry)
  const buyers = await getBuyers(industry)
  
  return {
    competitiveRivalry: {
      score: competitors.length > 10 ? 8 : competitors.length > 5 ? 5 : 3,
      factors: [
        `行业玩家数量: ${competitors.length}`,
        `市场集中度: ${calculateHHI(competitors)}`,
        `行业增长率: ${getIndustryGrowth(industry)}%`
      ]
    },
    supplierPower: {
      score: suppliers.length < 5 && suppliers.concentration > 0.8 ? 8 : 4,
      factors: [
        `供应商数量: ${suppliers.length}`,
        `供应商集中度: ${suppliers.concentration}`,
        `替代供应商难度: ${suppliers.substitutability}`
      ]
    },
    buyerPower: {
      score: buyers.length < 5 && buyers.concentration > 0.8 ? 8 : 4,
      factors: [
        `买方数量: ${buyers.length}`,
        `买方集中度: ${buyers.concentration}`,
        `转换成本: ${buyers.switchingCost}`
      ]
    },
    threatOfNewEntrants: {
      score: getEntryBarriers(industry) > 7 ? 3 : 7,
      factors: [
        `进入壁垒: ${getEntryBarriers(industry)}/10`,
        `资本需求: ${getCapitalRequirement(industry)}`,
        `品牌护城河: ${getBrandMoat(industry)}`
      ]
    },
    threatOfSubstitutes: {
      score: getSubstituteAvailability(industry) > 5 ? 7 : 3,
      factors: [
        `替代品可用性: ${getSubstituteAvailability(industry)}`,
        `替代品性价比: ${getSubstituteValue(industry)}`,
        `用户转换意愿: ${getSwitchingWillingness(industry)}`
      ]
    }
  }
}
```

### 行业生命周期定位

```typescript
interface IndustryLifeCycle {
  stage: 'introduction' | 'growth' | 'shakeout' | 'mature' | 'decline'
  confidence: number
  indicators: {
    growthRate: number
    consolidation: boolean
    profitMarginTrend: 'expanding' | 'stable' | 'contracting'
    newEntrants: number
  }
}

function identifyLifeCycleStage(
  metrics: IndustryMetrics
): IndustryLifeCycle {
  const { growthRate, consolidation, profitMarginTrend, newEntrants } = metrics
  
  if (growthRate > 15 && !consolidation && newEntrants > 10) {
    return {
      stage: 'introduction',
      confidence: 0.7,
      indicators: { growthRate, consolidation, profitMarginTrend, newEntrants }
    }
  }
  
  if (growthRate > 10 && newEntrants > 5) {
    return {
      stage: 'growth',
      confidence: 0.85,
      indicators: { growthRate, consolidation, profitMarginTrend, newEntrants }
    }
  }
  
  if (consolidation && newEntrants < 3) {
    return {
      stage: 'shakeout',
      confidence: 0.8,
      indicators: { growthRate, consolidation, profitMarginTrend, newEntrants }
    }
  }
  
  if (growthRate < 5 && profitMarginTrend === 'stable') {
    return {
      stage: 'mature',
      confidence: 0.9,
      indicators: { growthRate, consolidation, profitMarginTrend, newEntrants }
    }
  }
  
  return {
    stage: 'decline',
    confidence: 0.75,
    indicators: { growthRate, consolidation, profitMarginTrend, newEntrants }
  }
}
```

## 竞争格局分析

### 竞争地位矩阵

```typescript
interface CompetitivePosition {
  company: string
  marketShare: number
  shareTrend: 'gaining' | 'stable' | 'losing'
  relativeSize: 'leader' | 'challenger' | 'follower' | 'niche'
  strengths: string[]
  weaknesses: string[]
}

async function analyzeCompetitiveLandscape(
  industry: string
): Promise<CompetitivePosition[]> {
  const companies = await getIndustryCompanies(industry)
  
  const totalMarketCap = companies.reduce((sum, c) => sum + c.marketCap, 0)
  const leader = companies.reduce((a, b) => 
    a.marketShare > b.marketShare ? a : b
  )
  
  return companies.map(company => {
    const relativeMarketShare = company.marketShare / leader.marketShare
    
    return {
      company: company.ticker,
      marketShare: company.marketShare,
      shareTrend: company.shareTrend,
      relativeSize: relativeMarketShare > 0.8 ? 'leader' :
                   relativeMarketShare > 0.3 ? 'challenger' :
                   relativeMarketShare > 0.1 ? 'follower' : 'niche',
      strengths: identifyStrengths(company),
      weaknesses: identifyWeaknesses(company)
    }
  })
}
```

### 护城河分析

```typescript
interface MoatAnalysis {
  company: string
  moats: {
    type: 'network_effect' | 'switching_cost' | 'cost_advantage' | 
          'intangible' | 'efficient_scale'
    strength: 'wide' | 'narrow' | 'none'
    evidence: string[]
  }[]
  overallStrength: 'wide' | 'narrow' | 'none'
}

function analyzeMoat(company: CompanyData): MoatAnalysis {
  const moats = []
  
  // 1. 网络效应
  if (company.networkEffectScore > 7) {
    moats.push({
      type: 'network_effect',
      strength: company.networkEffectScore > 8 ? 'wide' : 'narrow',
      evidence: [
        `用户增长: ${company.userGrowth}%`,
        `网络价值: ${company.networkValue}`
      ]
    })
  }
  
  // 2. 转换成本
  if (company.switchingCostScore > 7) {
    moats.push({
      type: 'switching_cost',
      strength: company.switchingCostScore > 8 ? 'wide' : 'narrow',
      evidence: [
        `客户留存率: ${company.retentionRate}%`,
        `平均客户生命周期: ${company.customerLTV}`
      ]
    })
  }
  
  // 3. 成本优势
  if (company.costAdvantageScore > 7) {
    moats.push({
      type: 'cost_advantage',
      strength: company.costAdvantageScore > 8 ? 'wide' : 'narrow',
      evidence: [
        `成本比率: ${company.costRatio}% vs 行业${company.industryAvgCost}%`,
        `规模效应: ${company.scaleAdvantage}`
      ]
    })
  }
  
  // 4. 无形资产
  if (company.brandStrength > 7 || company.patents > 100) {
    moats.push({
      type: 'intangible',
      strength: company.brandStrength > 8 ? 'wide' : 'narrow',
      evidence: [
        `品牌价值: ${company.brandValue}`,
        `专利数量: ${company.patents}`
      ]
    })
  }
  
  return {
    company: company.ticker,
    moats,
    overallStrength: moats.some(m => m.strength === 'wide') ? 'wide' :
                     moats.some(m => m.strength === 'narrow') ? 'narrow' : 'none'
  }
}
```

## 产业链分析

### 产业链定位

```typescript
interface ValueChainPosition {
  segment: 'upstream' | 'midstream' | 'downstream'
  valueShare: number    // 价值链利润分成
  competitiveAdvantage: string[]
  risks: string[]
}

function analyzeValueChain(industry: string): ValueChainPosition[] {
  // 根据行业特点分析各环节
  const positions: Record<string, ValueChainPosition> = {
    semiconductors: {
      upstream: {  // 设备/材料
        segment: 'upstream',
        valueShare: 30,
        competitiveAdvantage: ['技术壁垒高', '资本密集'],
        risks: ['周期性', '技术迭代']
      },
      midstream: {  // 设计
        segment: 'midstream',
        valueShare: 40,
        competitiveAdvantage: ['轻资产', 'IP驱动'],
        risks: ['竞争激烈', '人才依赖']
      },
      downstream: {  // 制造/封测
        segment: 'downstream',
        valueShare: 30,
        competitiveAdvantage: ['规模效应', '成本控制'],
        risks: ['重资产', '周期性强']
      }
    }
  }
  
  return positions[industry] || []
}
```

## 行业估值比较

### 行业估值中枢

```typescript
interface IndustryValuation {
  sector: string
  valuationMetrics: {
    pe: { median: number; range: [number, number] }
    pb: { median: number; range: [number, number] }
    ps: { median: number; range: [number, number] }
    evEbitda: { median: number; range: [number, number] }
  }
  premiumDiscount: {
    vsMarket: number    // 相对市场溢价/折价
    vsHistorical: number // 相对历史均值
  }
}

async function getIndustryValuation(
  industry: string
): Promise<IndustryValuation> {
  const companies = await getIndustryCompanies(industry)
  
  const valuations = companies.map(c => getValuationMetrics(c))
  
  return {
    sector: industry,
    valuationMetrics: {
      pe: calculateMetrics(valuations, 'pe'),
      pb: calculateMetrics(valuations, 'pb'),
      ps: calculateMetrics(valuations, 'ps'),
      evEbitda: calculateMetrics(valuations, 'evEbitda')
    },
    premiumDiscount: {
      vsMarket: calculateVsMarket(valuations),
      vsHistorical: calculateVsHistorical(industry)
    }
  }
}
```

## 真实例子

### 例子1: 行业选择框架

```typescript
async function selectBestSector(): Promise<SectorRecommendation> {
  const sectors = ['Technology', 'Healthcare', 'Finance', 'Consumer', 'Energy']
  
  const analysis = await Promise.all(
    sectors.map(async (sector) => {
      const porter = await analyzePortersFiveForces(sector)
      const lifeCycle = identifyLifeCycleStage(await getIndustryMetrics(sector))
      const valuation = await getIndustryValuation(sector)
      const competitive = await analyzeCompetitiveLandscape(sector)
      
      return {
        sector,
        porter,
        lifeCycle,
        valuation,
        competitive,
        score: calculateSectorScore({ porter, lifeCycle, valuation })
      }
    })
  )
  
  return {
    rankedSectors: analysis.sort((a, b) => b.score - a.score),
    topPick: analysis[0].sector,
    avoid: analysis.filter(s => s.score < 40).map(s => s.sector)
  }
}
```

### 例子2: 产业链投资机会

```typescript
async function findChainInvestmentOpportunities(
  industry: string
): Promise<ChainOpportunity[]> {
  const chain = analyzeValueChain(industry)
  const currentCycle = await getEconomicCycle()
  
  // 根据经济周期选择
  const recommendations = chain.map(position => {
    let weight: number
    let reason: string
    
    if (currentCycle === 'early' && position.segment === 'upstream') {
      weight = 'overweight'
      reason = '经济复苏早期，上游最先受益'
    } else if (currentCycle === 'mid' && position.segment === 'midstream') {
      weight = 'overweight'
      reason = '经济繁荣期，中游制造受益'
    } else if (currentCycle === 'late' && position.segment === 'downstream') {
      weight = 'overweight'
      reason = '经济过热期，下游消费受益'
    } else {
      weight = 'neutral'
      reason = '当前周期不适合该环节'
    }
    
    return { ...position, weight, reason }
  })
  
  return recommendations
}
```

### 例子3: 赛道深度分析

```typescript
async function analyzeInvestmentThesis(thesis: string): Promise<ThesisAnalysis> {
  const { industry, timeframe, style } = parseThesis(thesis)
  
  // 1. 行业基本面
  const porter = await analyzePortersFiveForces(industry)
  const lifeCycle = identifyLifeCycleStage(await getIndustryMetrics(industry))
  
  // 2. 竞争分析
  const competitors = await analyzeCompetitiveLandscape(industry)
  const leaders = competitors.filter(c => c.relativeSize === 'leader')
  
  // 3. 护城河检查
  const moats = await Promise.all(
    leaders.map(async (leader) => ({
      company: leader.company,
      moat: analyzeMoat(await getCompanyData(leader.company))
    }))
  )
  
  // 4. 估值评估
  const valuation = await getIndustryValuation(industry)
  const vsValue = style === 'value' ? 
    valuation.premiumDiscount.vsHistorical < -20 :
    valuation.premiumDiscount.vsHistorical > 20
  
  // 5. 生成结论
  return {
    thesis,
    industry,
    lifeCycle,
    porter,
    competitiveAnalysis: competitors,
    moatAnalysis: moats,
    valuation,
    recommendation: generateRecommendation({
      porter,
      lifeCycle,
      moats,
      valuation,
      style
    })
  }
}
```

## 触发场景

- "哪个行业值得投资"
- "这个赛道分析下"
- "行业竞争格局怎么样"
- "产业链哪个环节好"
- "XX行业护城河是什么"
- "行业估值贵不贵"
- "什么时候进这个行业"
- "行业轮动到哪了"
