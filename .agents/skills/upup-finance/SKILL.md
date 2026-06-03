---
name: upup-finance
description: UpUp金融数据工具集。用于获取股价、财务报表、SEC文件、股票筛选、A股数据、基金数据等金融信息。当用户查询股票价格、财务指标、公司分析、选股时触发。
---

# UpUp Finance - 金融数据 Skill

## 概述

UpUp提供全面的金融数据工具，支持美股、A股、基金、加密货币等。

## 工具概览

| Category | Tools |
|----------|-------|
| US Stocks | get_financials, get_market_data, read_filings, stock_screener |
| A-Stocks | get_astock_price, get_astock_financials, get_astock_news, screen_astocks |
| Funds | fund_analysis, fund_comparison, fund_holdings |
| Market | get_sector_data, get_technical_data, get_market_structure |

## 美股工具

### get_financials

获取财务报表、指标和分析师估计。

```typescript
// 单一公司
const result = await get_financials({
  query: "AAPL annual income statement"
});

// 批量查询
const result = await get_financials({
  query: "MSFT, GOOGL annual revenue and earnings for last 5 years"
});

// 财务指标
const result = await get_financials({
  query: "TSLA financial metrics snapshot"
});

// 分析师估计
const result = await get_financials({
  query: "AAPL analyst estimates for next 2 years"
});
```

**关键指标**:
- `revenue`, `net_income`, `eps`
- `market_cap`, `enterprise_value`
- `pe_ratio`, `price_to_sales`
- `debt_to_equity`, `current_ratio`
- `roe`, `roa`, `roi`
- `revenue_growth`, `earnings_growth`

### get_market_data

获取实时价格、新闻、内部交易。

```typescript
// 价格快照
const result = await get_market_data({
  query: "AAPL price snapshot"
});

// 批量价格
const result = await get_market_data({
  query: "AAPL, MSFT, GOOGL current prices"
});

// 公司新闻
const result = await get_market_data({
  query: "TSLA latest news"
});

// 内部交易
const result = await get_market_data({
  query: "AAPL insider trades last 6 months"
});
```

### read_filings

阅读SEC文件。

```typescript
// 10-K年报
const result = await read_filings({
  query: "AAPL 10-K annual report risk factors"
});

// 10-Q季报
const result = await read_filings({
  query: "MSFT 10-Q most recent quarterly results"
});

// 8-K重大事件
const result = await read_filings({
  query: "GOOGL 8-K latest earnings announcement"
});
```

### stock_screener

按财务条件筛选股票。

```typescript
const result = await stock_screener({
  criteria: {
    market_cap: { min: 10_000_000_000 },  // $10B+
    pe_ratio: { max: 25 },
    revenue_growth: { min: 0.10 },         // 10%+
    dividend_yield: { min: 0.02 }           // 2%+
  },
  sort_by: "market_cap",
  order: "desc",
  limit: 20
});
```

## A股工具

### get_astock_price

```typescript
const result = await get_astock_price({
  symbol: "000001",  // 平安银行
  // 或
  symbols: ["000001", "600000"]  // 批量
});
```

### get_astock_financials

```typescript
const result = await get_astock_financials({
  symbol: "600519",  // 贵州茅台
  report_type: "annual"  // annual | quarterly
});
```

### screen_astocks

```typescript
const result = await screen_astocks({
  criteria: {
    pe: { max: 20 },
    roe: { min: 0.15 },
    sector: "科技",
    market_cap: { min: 100_000_000_000 }
  }
});
```

### get_market_structure

获取市场结构数据（龙虎榜、融资融券等）。

```typescript
const result = await get_market_structure({
  data_type: "margin"  // margin | block_trade | top_holders
});
```

## 量化工具

### portfolio_optimization

```typescript
const result = await portfolio_optimization({
  stocks: ["AAPL", "MSFT", "GOOGL", "AMZN"],
  objective: "max_sharpe",  // max_sharpe | min_volatility | max_return
  constraints: {
    max_weight: 0.30,
    min_weight: 0.05
  }
});
```

### technical_indicators

```typescript
const result = await technical_indicators({
  symbol: "AAPL",
  indicators: ["RSI", "MACD", "SMA_50", "SMA_200"],
  period: 90
});
```

### options_pricing

```typescript
const result = await options_pricing({
  symbol: "AAPL",
  strike: 180,
  expiry: "2024-03-15",
  type: "call",  // call | put
  volatility: 0.25
});
```

## 数据来源

| Source | Data Type |
|--------|-----------|
| Financial Datasets API | 美股财务、文件、指标 |
| Tushare Pro | A股数据 |
| AKShare | 备用金融数据 |
| Exa/Tavily | 新闻搜索 |

## 最佳实践

### 查询优化

1. **批量查询**: 一次获取多公司数据
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

## 缓存

- 短期数据（价格）：实时获取
- 财务数据：24小时缓存
- 历史数据：长期缓存

## 错误处理

```typescript
try {
  const result = await get_financials({ query: "..." });
} catch (error) {
  if (error instanceof DataNotAvailableError) {
    // 数据不可用，使用备用数据源
  } else if (error instanceof RateLimitError) {
    // 速率限制，等待后重试
  }
}
```
