---
name: financial-analysis
description: |
  金融数据分析与获取。当需要获取股价、财务报表、股票筛选、SEC文件阅读、财报分析、公司比较时触发。
  支持美股、A股、基金数据，提供完整的数据获取和分析流程。
---

# Financial Analysis - 金融数据分析

## 核心概念

金融数据分析工具为投资决策提供数据支持，包括价格数据、财务数据、筛选工具等。

## 工具类型

### 价格数据工具

```typescript
// 获取股价和市场数据
interface MarketDataTool {
  query: string | string[]
  includeNews?: boolean
  includeInsider?: boolean
}

// 使用示例
get_market_data({
  query: "AAPL price snapshot"
})

// 批量查询
get_market_data({
  query: ["AAPL", "MSFT", "GOOGL"]
})
```

### 财务数据工具

```typescript
// 获取财务报表和指标
interface FinancialsTool {
  query: string
  period?: 'annual' | 'quarterly' | 'ttm'
  years?: number
}

// 使用示例
get_financials({
  query: "AAPL income statement last 5 years"
})

get_financials({
  query: "MSFT financial metrics comparison"
})
```

### 筛选工具

```typescript
// 股票筛选
interface ScreenerTool {
  criteria: {
    market_cap?: { min?: number; max?: number }
    pe_ratio?: { min?: number; max?: number }
    revenue_growth?: { min?: number }
    dividend_yield?: { min?: number }
    roe?: { min?: number }
  }
  sort_by?: string
  order?: 'asc' | 'desc'
  limit?: number
}

// 使用示例
stock_screener({
  criteria: {
    market_cap: { min: 10_000_000_000 },
    pe_ratio: { max: 25 },
    revenue_growth: { min: 0.10 }
  },
  sort_by: "market_cap",
  order: "desc",
  limit: 20
})
```

## 数据类型说明

### Key Metrics

| 指标 | 字段名 | 说明 |
|-----|--------|------|
| 市值 | `market_cap` | 股价×股本 |
| 企业价值 | `enterprise_value` | 市值+净债务 |
| 市盈率 | `pe_ratio` | 股价/EPS |
| 市销率 | `price_to_sales` | 股价/营收 |
| PEG比率 | `peg_ratio` | 市盈率/增长率 |
| ROE | `roe` | 净利润/股东权益 |
| ROA | `roa` | 净利润/总资产 |
| 营收增长 | `revenue_growth` | 营收同比变化 |
| 净利润率 | `net_margin` | 净利润/营收 |
| 资产负债率 | `debt_to_equity` | 总债务/总权益 |

### Financial Statements

**Income Statement (损益表)**
- `revenue`: 营收
- `cost_of_revenue`: 成本
- `gross_profit`: 毛利润
- `operating_expenses`: 运营费用
- `operating_income`: 运营利润
- `net_income`: 净利润
- `eps`: 每股收益

**Balance Sheet (资产负债表)**
- `total_assets`: 总资产
- `total_liabilities`: 总负债
- `total_equity`: 总权益
- `cash_and_equivalents`: 现金
- `total_debt`: 总债务

**Cash Flow Statement (现金流量表)**
- `operating_cash_flow`: 运营现金流
- `capital_expenditure`: 资本支出
- `free_cash_flow`: 自由现金流
- `dividends_paid`: 支付股息

## 使用模式

### 1. 单公司分析

```typescript
// 完整分析
async function analyzeCompany(ticker: string) {
  const [price, financials, news] = await Promise.all([
    get_market_data({ query: `${ticker} price` }),
    get_financials({ query: `${ticker} 5-year financials` }),
    get_market_data({ query: `${ticker} latest news`, includeNews: true })
  ])
  
  return {
    price: price.price,
    marketCap: financials.market_cap,
    valuation: {
      pe: financials.pe_ratio,
      ps: financials.price_to_sales,
      pb: financials.price_to_book
    },
    growth: {
      revenue: financials.revenue_growth,
      earnings: financials.earnings_growth
    }
  }
}
```

### 2. 比较分析

```typescript
// 多公司比较
get_financials({
  query: "AAPL, MSFT, GOOGL valuation metrics comparison"
})

get_financials({
  query: "Tech sector revenue growth comparison"
})
```

### 3. 筛选分析

```typescript
// 价值股筛选
stock_screener({
  criteria: {
    pe_ratio: { max: 15 },
    roe: { min: 0.15 },
    dividend_yield: { min: 0.02 }
  }
})

// 成长股筛选
stock_screener({
  criteria: {
    revenue_growth: { min: 0.20 },
    pe_ratio: { max: 40 },
    market_cap: { min: 1_000_000_000_000 }
  }
})
```

## A股数据

### 获取价格

```typescript
get_astock_price({
  symbol: "600519"  // 贵州茅台
})

// 批量
get_astock_price({
  symbols: ["600519", "000001"]
})
```

### 财务数据

```typescript
get_astock_financials({
  symbol: "600519",
  report_type: "annual"
})
```

### 筛选

```typescript
screen_astocks({
  criteria: {
    pe: { max: 20 },
    roe: { min: 0.15 },
    sector: "科技"
  }
})
```

## SEC文件阅读

### 10-K 年报

```typescript
read_filings({
  query: "AAPL 10-K risk factors"
})

read_filings({
  query: "MSFT 10-K management discussion"
})
```

### 10-Q 季报

```typescript
read_filings({
  query: "GOOGL 10-Q latest quarterly results"
})
```

### 8-K 重大事件

```typescript
read_filings({
  query: "TSLA 8-K latest announcement"
})
```

## 输出格式

### 标准响应格式

```typescript
interface FinancialDataResponse {
  success: boolean
  data: {
    ticker: string
    metrics: Record<string, number | string>
    statements?: FinancialStatements
    news?: NewsItem[]
  }
  metadata: {
    source: string
    timestamp: string
    cached: boolean
  }
}
```

## 最佳实践

### 查询优化

1. **批量查询**: 一批次获取多公司数据
2. **精确时间**: 指定年份/季度
3. **明确指标**: 使用标准字段名

### 示例查询

```typescript
// 完整财务分析
get_financials({
  query: "AAPL 5-year income statement, balance sheet, cash flow"
})

// 估值比较
get_financials({
  query: "AAPL, MSFT, GOOGL valuation metrics comparison"
})

// 成长性分析
get_financials({
  query: "TSLA revenue growth, earnings growth, margins last 5 years"
})
```

## 触发场景

- "获取XX股价"
- "XX财务分析"
- "比较XX和XX"
- "筛选符合条件的股票"
- "阅读XX的10-K"
- "XX最新财报"
