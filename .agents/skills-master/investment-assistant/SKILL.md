---
name: investment-assistant
description: |
  投资助手核心能力。当用户询问股票分析、投资建议、组合分析、风险管理、市场研究、估值分析、交易信号时必须使用此技能。
  提供完整的投资研究工作流程：数据收集→分析→估值→风险评估→建议输出。
  确保在给任何投资建议前调用memory_search检查用户偏好和风险承受能力。
---

# Investment Assistant - 投资助手核心技能

## 核心原则

1. **先了解用户**: 每次投资建议前，先调用memory_search检查用户偏好
2. **数据驱动**: 决策基于真实财务数据，而非直觉
3. **风险第一**: 始终评估风险，清楚说明不确定性
4. **分散投资**: 避免集中持仓，强调配置重要性
5. **长期视角**: 优先考虑长期价值，而非短期波动

## 工作流程

```
用户询问 → 检查记忆 → 数据收集 → 分析 → 估值 → 风险评估 → 建议
```

## Step 1: 用户偏好检查

### 必须执行

```typescript
// 在做任何投资分析前
const preferences = await memory_search({
  query: "用户投资偏好风险承受能力目标持仓",
  limit: 5
})

// 检查关键信息
const hasRiskTolerance = preferences.some(p => p.includes('风险'))
const hasInvestmentGoal = preferences.some(p => p.includes('目标'))
const hasExistingPositions = preferences.some(p => p.includes('持仓'))
```

### 记忆提取规则

```typescript
const preferencePatterns = [
  { pattern: /风险.*承受/i, type: 'risk_tolerance' },
  { pattern: /投资.*目标/i, type: 'investment_goal' },
  { pattern: /收益.*期望/i, type: 'return_expectation' },
  { pattern: /持有.*股票/i, type: 'existing_positions' },
  { pattern: /偏好.*(保守|激进|平衡)/i, type: 'strategy_preference' }
]
```

## Step 2: 数据收集

### 股价和市场数据

```typescript
// 单只股票
const priceData = await get_market_data({
  query: "AAPL price snapshot"
})

// 批量查询
const multiPrice = await get_market_data({
  query: ["AAPL", "MSFT", "GOOGL", "AMZN"]
})

// 提取字段
const { price, market_cap, pe_ratio, dividend_yield } = priceData
```

### 财务数据

```typescript
// 完整财务分析
const financials = await get_financials({
  query: "AAPL 5-year income statement, balance sheet, cash flow"
})

// 财务指标
const metrics = await get_financials({
  query: "AAPL financial metrics snapshot"
})

// 提取关键指标
const {
  revenue_growth,    // 营收增长
  net_margin,        // 净利润率
  roe,              // 净资产收益率
  debt_to_equity,   // 资产负债率
  free_cash_flow    // 自由现金流
} = metrics
```

### SEC文件

```typescript
// 年报风险因素
const risks = await read_filings({
  query: "AAPL 10-K risk factors"
})

// 季报业绩
const quarter = await read_filings({
  query: "MSFT 10-Q latest quarterly results"
})
```

### 新闻和情绪

```typescript
const news = await get_market_data({
  query: "TSLA latest news",
  includeNews: true
})

// 内部交易
const insider = await get_market_data({
  query: "AAPL insider trades last 6 months"
})
```

## Step 3: 分析框架

### 3.1 成长性分析

```typescript
interface GrowthAnalysis {
  revenueCAGR: number      // 营收5年复合增长率
  earningsCAGR: number     // 盈利5年复合增长率
  fcfCAGR: number         // 自由现金流复合增长率
  analystGrowth: number    // 分析师预期增长
  vsSector: number         // vs行业平均
}

// 计算
function analyzeGrowth(historicalData: YearData[]): GrowthAnalysis {
  const revenueCAGR = calculateCAGR(historicalData.map(d => d.revenue))
  const earningsCAGR = calculateCAGR(historicalData.map(d => d.earnings))
  const fcfCAGR = calculateCAGR(historicalData.map(d => d.freeCashFlow))
  
  return {
    revenueCAGR,
    earningsCAGR,
    fcfCAGR,
    analystGrowth: getAnalystEstimate(),
    vsSector: revenueCAGR - sectorAverage
  }
}
```

### 3.2 盈利能力分析

```typescript
interface ProfitabilityAnalysis {
  grossMargin: number      // 毛利率
  operatingMargin: number  // 运营利润率
  netMargin: number       // 净利润率
  roe: number            // 净资产收益率
  roa: number           // 总资产收益率
  roic: number          // 投资资本回报率
}

// 评估标准
const profitabilityBenchmarks = {
  excellent: { roe: 20, roic: 15, netMargin: 15 },
  good: { roe: 15, roic: 10, netMargin: 10 },
  average: { roe: 10, roic: 5, netMargin: 5 }
}
```

### 3.3 财务健康分析

```typescript
interface FinancialHealth {
  currentRatio: number      // 流动比率
  quickRatio: number       // 速动比率
  debtToEquity: number    // 债务权益比
  interestCoverage: number // 利息覆盖倍数
  AltmanZ: number         // Altman Z分数
}

function assessFinancialHealth(balanceSheet: BalanceSheet): FinancialHealth {
  return {
    currentRatio: balanceSheet.currentAssets / balanceSheet.currentLiabilities,
    quickRatio: (balanceSheet.currentAssets - balanceSheet.inventory) / balanceSheet.currentLiabilities,
    debtToEquity: balanceSheet.totalDebt / balanceSheet.totalEquity,
    interestCoverage: balanceSheet.operatingIncome / balanceSheet.interestExpense,
    AltmanZ: calculateAltmanZ(balanceSheet)
  }
}
```

## Step 4: 估值分析

### 4.1 DCF估值

```typescript
interface DCFInput {
  currentFCF: number           // 当前自由现金流
  fcfGrowthRate: number      // FCF增长率
  wacc: number               // 加权平均资本成本
  terminalGrowth: number     // 终值增长率
  sharesOutstanding: number  // 总股本
  netDebt: number           // 净债务
}

function calculateDCF(input: DCFInput): DCFResult {
  // 1. 预测5年FCF
  const projectedFCF = projectFCF(input.currentFCF, input.fcfGrowthRate, 5)
  
  // 2. 计算终值
  const terminalFCF = projectedFCF[4] * (1 + input.terminalGrowth)
  const terminalValue = terminalFCF / (input.wacc - input.terminalGrowth)
  
  // 3. 折现
  const pvFCF = projectedFCF.map((fcf, year) => 
    fcf / Math.pow(1 + input.wacc, year + 1)
  )
  const pvTerminal = terminalValue / Math.pow(1 + input.wacc, 5)
  
  // 4. 企业价值
  const enterpriseValue = sum(pvFCF) + pvTerminal
  
  // 5. 股权价值
  const equityValue = enterpriseValue - input.netDebt
  
  // 6. 每股价值
  const fairValue = equityValue / input.sharesOutstanding
  
  return {
    fairValue,
    upside: (fairValue / currentPrice - 1) * 100,
    enterpriseValue,
    pvTerminal: pvTerminal / enterpriseValue  // 终值占比
  }
}
```

### 4.2 相对估值

```typescript
interface RelativeValuation {
  pe: number       // 市盈率
  pb: number       // 市净率
  ps: number       // 市销率
  evEbitda: number // EV/EBITDA
}

function compareToSector(metrics: RelativeValuation, sector: SectorAverages) {
  return {
    peRatio: metrics.pe / sector.pe,       // <1被低估
    pbRatio: metrics.pb / sector.pb,
    psRatio: metrics.ps / sector.ps,
    evEbitdaRatio: metrics.evEbitda / sector.evEbitda
  }
}
```

### 4.3 估值综合评分

```typescript
function valuationScore(dcfUpside: number, relativeRatios: Record<string, number>): number {
  let score = 0
  
  // DCF上涨空间
  if (dcfUpside > 30) score += 30
  else if (dcfUpside > 15) score += 20
  else if (dcfUpside > 0) score += 10
  
  // 相对估值
  const avgRatio = average(Object.values(relativeRatios))
  if (avgRatio < 0.8) score += 30
  else if (avgRatio < 1.0) score += 20
  else if (avgRatio < 1.2) score += 10
  
  return Math.min(score, 100)
}
```

## Step 5: 风险评估

### 5.1 风险分类

```typescript
enum RiskLevel {
  LOW = "低风险",
  MEDIUM = "中等风险",
  HIGH = "高风险",
  VERY_HIGH = "极高风险"
}

interface RiskAssessment {
  level: RiskLevel
  score: number  // 0-100
  factors: {
    business: string[]      // 业务风险
    financial: string[]     // 财务风险
    market: string[]        // 市场风险
    operational: string[]   // 运营风险
  }
}
```

### 5.2 风险量化

```typescript
function assessRisks(company: CompanyData): RiskAssessment {
  const risks: string[] = []
  let riskScore = 0
  
  // 财务风险
  if (company.debtToEquity > 3) {
    risks.push("高负债水平")
    riskScore += 20
  }
  if (company.currentRatio < 1) {
    risks.push("流动比率不足")
    riskScore += 15
  }
  
  // 业务风险
  if (company.revenueConcentration > 0.5) {
    risks.push("收入过度依赖单一业务")
    riskScore += 15
  }
  if (company.marketShareDecline) {
    risks.push("市场份额下降")
    riskScore += 10
  }
  
  // 市场风险
  if (company.beta > 1.5) {
    risks.push("高波动性")
    riskScore += 10
  }
  
  return {
    level: mapScoreToLevel(riskScore),
    score: riskScore,
    factors: categorizeRisks(risks)
  }
}
```

## Step 6: 建议生成

### 6.1 组合建议格式

```typescript
interface InvestmentRecommendation {
  // 基本信息
  ticker: string
  companyName: string
  currentPrice: number
  
  // 估值结论
  valuation: {
    fairValue: number
    currentPrice: number
    upside: number
    rating: '强烈推荐' | '推荐' | '中性' | '减持'
  }
  
  // 风险评估
  risk: {
    level: RiskLevel
    factors: string[]
  }
  
  // 关键指标
  metrics: {
    pe: number
    roe: number
    growth: number
    dividend: number
  }
  
  // 投资理由
  reasons: string[]
  
  // 风险提示
  warnings: string[]
  
  // 配置建议
  position?: {
    min: number   // 最小配置%
    max: number  // 最大配置%
  }
}
```

### 6.2 报告模板

```markdown
# [股票代码] 投资分析报告

## 📊 估值摘要
| 指标 | 数值 |
|------|------|
| 当前股价 | $XXX |
| 合理价值 | $XXX |
| 上涨空间 | +XX% |
| 评级 | ⭐⭐⭐⭐⭐ |

## 📈 核心指标
- PE: XX倍 (行业平均: XX倍)
- ROE: XX% (行业平均: XX%)
- 增长率: XX% (行业平均: XX%)

## ✅ 投资理由
1. ...
2. ...
3. ...

## ⚠️ 风险提示
1. ...
2. ...

## 💡 配置建议
- 最少配置: X%
- 最大配置: X%
- 当前建议: X%

---
⚠️ 免责声明: 本报告仅供参考，不构成投资建议。投资有风险，入市需谨慎。
```

## 真实例子

### 例子1: 完整股票分析流程

```typescript
async function analyzeStock(ticker: string) {
  // 1. 检查用户偏好
  const prefs = await memory_search({
    query: "用户风险承受能力投资目标",
    limit: 3
  })
  
  // 2. 收集数据
  const [price, financials, news] = await Promise.all([
    get_market_data({ query: `${ticker} price snapshot` }),
    get_financials({ query: `${ticker} 5-year financials` }),
    get_market_data({ query: `${ticker} latest news`, includeNews: true })
  ])
  
  // 3. 分析
  const growth = analyzeGrowth(financials)
  const profitability = analyzeProfitability(financials)
  const health = assessFinancialHealth(financials)
  
  // 4. 估值
  const dcf = calculateDCF({
    currentFCF: financials.freeCashFlow,
    fcfGrowthRate: growth.fcfCAGR,
    wacc: 0.10,
    terminalGrowth: 0.025,
    sharesOutstanding: financials.sharesOutstanding,
    netDebt: financials.totalDebt - financials.cash
  })
  
  // 5. 风险评估
  const risk = assessRisks(financials)
  
  // 6. 生成建议
  return generateRecommendation({
    ticker,
    price,
    dcf,
    risk,
    growth,
    profitability
  })
}
```

### 例子2: 批量股票比较

```typescript
async function compareStocks(tickers: string[]) {
  // 批量获取数据
  const dataPromises = tickers.map(async (ticker) => {
    const [price, financials] = await Promise.all([
      get_market_data({ query: `${ticker} snapshot` }),
      get_financials({ query: `${ticker} metrics` })
    ])
    return {
      ticker,
      price: price.price,
      pe: financials.pe_ratio,
      roe: financials.roe,
      growth: financials.revenue_growth,
      dcfUpside: calculateQuickDCF(financials).upside
    }
  })
  
  const stocks = await Promise.all(dataPromises)
  
  // 生成比较表
  return {
    table: stocks.map(s => ({
      ticker: s.ticker,
      price: formatPrice(s.price),
      pe: formatRatio(s.pe),
      roe: formatPercent(s.roe),
      growth: formatPercent(s.growth),
      upside: formatPercent(s.dcfUpside),
      score: calculateOverallScore(s)
    })),
    rankings: {
      byValue: rank(stocks, 'dcfUpside', 'desc'),
      byGrowth: rank(stocks, 'growth', 'desc'),
      byQuality: rank(stocks, 'roe', 'desc')
    }
  }
}
```

### 例子3: 风险评估报告

```typescript
async function riskReport(ticker: string) {
  const financials = await get_financials({
    query: `${ticker} complete financial analysis`
  })
  
  const risk = assessRisks(financials)
  
  return {
    summary: `风险等级: ${risk.level}`,
    score: risk.score,
    breakdown: {
      financial: {
        score: calculateFinancialRiskScore(financials),
        details: risk.factors.financial
      },
      business: {
        score: calculateBusinessRiskScore(financials),
        details: risk.factors.business
      },
      market: {
        score: calculateMarketRiskScore(financials),
        details: risk.factors.market
      }
    },
    recommendations: generateRiskMitigation(risk)
  }
}
```

## 触发场景

### 必须使用此Skill

- "分析XX股票"
- "XX值得投资吗"
- "帮我看看这个股票"
- "XX的财务数据怎么样"
- "给我推荐一些股票"
- "怎么分析一只股票"
- "XX的风险大吗"
- "帮我做个投资组合分析"

### 自动检查

- 任何涉及投资建议的回复前
- 推荐买入/卖出/持有前
- 评估投资风险前

## 注意事项

### 禁止事项

- ❌ 不基于数据给出投资建议
- ❌ 忽略用户风险承受能力
- ❌ 承诺具体收益
- ❌ 忽略下行风险
- ❌ 推荐超过用户风险承受能力的投资

### 必要事项

- ✅ 清楚说明数据来源
- ✅ 列出投资理由和风险
- ✅ 说明估值假设和敏感性
- ✅ 提供止损建议
- ✅ 包含免责声明

---

## 更多真实例子

### 例子4: 技术分析与基本面结合

```typescript
async function comprehensiveAnalysis(ticker: string) {
  // 1. 基本面分析
  const fundamentals = await get_financials({
    query: `${ticker} 5-year complete financial analysis`
  })
  
  // 2. 估值分析
  const valuation = calculateValuation(fundamentals)
  
  // 3. 技术分析
  const technical = await get_technical_data({
    symbol: ticker,
    indicators: ['RSI', 'MACD', 'SMA_50', 'SMA_200', 'BB_20']
  })
  
  // 4. 综合判断
  const signal = generateSignal({
    fundamentals: {
      pe: valuation.pe,
      pb: valuation.pb,
      dcfUpside: valuation.dcfUpside
    },
    technical: {
      rsi: technical.rsi,
      macd: technical.macd,
      priceVsSMA50: technical.price / technical.sma50,
      priceVsSMA200: technical.price / technical.sma200,
      trend: technical.trend
    }
  })
  
  return {
    valuation,
    technical,
    signal,
    recommendation: generateRecommendation(signal)
  }
}
```

### 例子5: 财报季节分析

```typescript
async function earningsSeasonAnalysis(tickers: string[]) {
  const earningsDates = await get_earnings_calendar({
    tickers,
    from: today,
    to: addDays(today, 30)
  })
  
  const results = await Promise.all(
    earningsDates.map(async (earnings) => {
      // 提前分析
      const preAnalysis = await analyzeBeforeEarnings(earnings.ticker)
      
      // 预期vs实际比较框架
      const comparison = {
        expectedEPS: preAnalysis.analystEPS,
        whisperNumber: preAnalysis.whisper,
        historicalBeatRate: preAnalysis.beatRate,
        riskReward: calculateEarningsRiskReward(preAnalysis)
      }
      
      return {
        ticker: earnings.ticker,
        reportDate: earnings.date,
        ...comparison,
        recommendation: earningsPlay(preAnalysis)
      }
    })
  )
  
  return {
    upcomingEarnings: results,
    priority: results.filter(r => r.recommendation === 'high_priority')
  }
}
```

### 例子6: 竞争对手比较矩阵

```typescript
async function competitorComparison(targetTicker: string) {
  // 1. 获取目标公司
  const target = await get_financials({
    query: `${targetTicker} complete metrics`
  })
  
  // 2. 识别竞争对手
  const competitors = await identifyCompetitors(target.sector, target.industry)
  
  // 3. 批量获取竞争对手数据
  const competitorData = await get_financials({
    query: competitors.map(c => `${c} metrics`).join(', ')
  })
  
  // 4. 构建比较矩阵
  const metrics = ['pe', 'pb', 'ps', 'evEbitda', 'roe', 'revenueGrowth', 'margins']
  
  const comparison = buildComparisonMatrix(target, competitorData, metrics)
  
  // 5. 识别相对价值
  const relativeValue = identifyRelativeValue(comparison)
  
  return {
    target: targetTicker,
    competitors: competitors,
    matrix: comparison,
    relativeValue,
    strengths: identifyStrengths(target, comparison),
    weaknesses: identifyWeaknesses(target, comparison)
  }
}
```

### 例子7: 估值陷阱识别

```typescript
async function valuationTrapCheck(ticker: string) {
  const data = await get_financials({
    query: `${ticker} complete analysis`
  })
  
  const traps = []
  
  // 1. 低PE陷阱
  if (data.pe < 10) {
    if (data.revenueGrowth < 0) {
      traps.push({
        type: 'low_pe_trap',
        severity: 'high',
        reason: 'PE低但营收下降，可能是价值陷阱'
      })
    }
    if (data.debtToEquity > 2) {
      traps.push({
        type: 'low_pe_debt',
        severity: 'medium',
        reason: '高负债压低PE'
      })
    }
  }
  
  // 2. 高增长陷阱
  if (data.revenueGrowth > 50 && data.freeCashFlow < 0) {
    traps.push({
      type: 'growth_trap',
      severity: 'high',
      reason: '增长不产生现金，可能是烧钱模式'
    })
  }
  
  // 3. 利润率陷阱
  if (data.netMargin > 25 && data.revenueGrowth > 20) {
    if (data.competitors.some(c => c.margin > 15)) {
      traps.push({
        type: 'margin_trap',
        severity: 'medium',
        reason: '高利润率难以持续，竞争加剧风险'
      })
    }
  }
  
  return {
    ticker,
    hasTraps: traps.length > 0,
    traps,
    verdict: traps.length === 0 ? 'clean' : traps.some(t => t.severity === 'high') ? 'avoid' : 'caution'
  }
}
```

### 例子8: 资金流向分析

```typescript
async function moneyFlowAnalysis(ticker: string) {
  const [priceData, insider, institutional] = await Promise.all([
    get_market_data({ query: `${ticker} price history 3m` }),
    get_market_data({ query: `${ticker} insider transactions` }),
    get_institutional_holdings({ ticker })
  ])
  
  // 1. 机构持仓变化
  const institutionalChange = calculateHoldingsChange(institutional)
  
  // 2. 内部人交易信号
  const insiderSignal = analyzeInsiderTrading(insider)
  
  // 3. 价格与成交量背离
  const divergence = detectPriceVolumeDivergence(priceData)
  
  // 4. 综合信号
  const signal = {
    institutional: institutionalChange > 10 ? 'bullish' : institutionalChange < -10 ? 'bearish' : 'neutral',
    insider: insiderSignal,
    divergence: divergence
  }
  
  return {
    ticker,
    signal,
    strength: calculateSignalStrength(signal),
    recommendation: interpretSignal(signal)
  }
}
```

### 例子9: 周期股分析框架

```typescript
async function cyclicalAnalysis(ticker: string) {
  const data = await get_financials({
    query: `${ticker} complete cycle analysis`
  })
  
  // 1. 识别周期位置
  const cyclePosition = identifyCyclePosition(data)
  
  // 2. 计算周期调整指标
  const adjustedMetrics = {
    pe: data.pe / cyclePosition.peMultiple,
    pb: data.pb / cyclePosition.pbMultiple,
    roe: data.roe * cyclePosition.roeMultiple
  }
  
  // 3. 预期回报
  const expectedReturn = calculateCyclicalReturn({
    currentPosition: cyclePosition,
    cycleLength: estimateCycleLength(data),
    historicalPeakRoe: data.historicalPeakRoe,
    adjustedMetrics
  })
  
  return {
    ticker,
    cyclePosition,
    adjustedMetrics,
    expectedReturn,
    recommendation: cycleRecommendation(cyclePosition, expectedReturn)
  }
}
```

### 例子10: 危机Alpha机会识别

```typescript
async function crisisOpportunityScan() {
  // 1. 筛选超跌股票
  const crashed = await stock_screener({
    criteria: {
      priceChange3m: { max: -30 },
      marketCap: { min: 10_000_000_000 }
    }
  })
  
  // 2. 区分下跌原因
  const analyzed = await Promise.all(crashed.map(async (stock) => {
    const news = await get_market_data({
      query: `${stock.ticker} news 1m`
    })
    
    const reason = categorizeCrash(news, stock)
    
    return {
      ...stock,
      crashReason: reason
    }
  }))
  
  // 3. 识别真正的机会
  const opportunities = analyzed.filter(s => 
    s.crashReason === 'market_overreaction' || 
    s.crashReason === 'temporary_issue'
  )
  
  // 4. 深度分析机会
  const deepAnalysis = await Promise.all(
    opportunities.slice(0, 5).map(async (opp) => {
      const analysis = await analyzePotential(opp)
      return {
        ...opp,
        ...analysis,
        riskReward: calculateRiskReward(analysis)
      }
    })
  )
  
  return {
    summary: `发现${opportunities.length}个超跌机会`,
    opportunities: deepAnalysis.sort((a, b) => b.riskReward - a.riskReward)
  }
}
```
