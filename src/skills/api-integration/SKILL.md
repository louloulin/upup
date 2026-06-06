---
name: api-integration
description: Complete API integration guide for all investment tools. Triggers on API documentation, tool integration, 数据集成, API使用指南.
description.zh-CN: 所有投资工具的完整 API 集成指南。触发关键词: API documentation, tool integration, 数据集成, API使用指南.
triggers:
  - api integration
  - API documentation
  - 数据集成
  - API使用指南
  - tool guide
  - complete guide
---

# Complete API Integration Guide

## Overview

UpUp provides 10+ investment tools for comprehensive financial analysis.

## Tool Categories

### 1. Data Collection Tools

| Tool | Purpose |
|------|---------|
| `get_astock_price` | Historical price data |
| `get_astock_financials` | Financial statements |
| `get_astock_news` | News & announcements |
| `get_technical_data` | Technical indicators |
| `get_market_structure` | Market structure (北向资金) |
| `get_sector_data` | Sector performance |

### 2. Analysis Tools

| Tool | Purpose |
|------|---------|
| `get_sentiment` | News/market sentiment analysis |
| `financial_forecast` | Revenue/profit forecasting |
| `multi_agent_research` | Parallel multi-perspective research |
| `performance_analytics` | Returns, risk, Sharpe ratio |

### 3. Portfolio Tools

| Tool | Purpose |
|------|---------|
| `portfolio_optimize` | Portfolio optimization |
| `portfolio_tracker` | Position tracking |
| `portfolio_rebalance` | Rebalancing recommendations |

### 4. Risk Tools

| Tool | Purpose |
|------|---------|
| `risk_management` | Risk assessment (VaR, Beta) |
| `stop_loss` | Stop-loss recommendations |

### 5. Monitoring Tools

| Tool | Purpose |
|------|---------|
| `market_monitor` | Real-time market status |
| `alert_system` | Price/volume alerts |
| `data_export` | Export to CSV/JSON/Markdown |

## Integration Patterns

### Pattern 1: Stock Research Pipeline

```
1. get_astock_price → Price data
2. get_astock_financials → Financial data
3. get_sentiment → Sentiment analysis
4. multi_agent_research → Complete analysis
5. portfolio_optimize → Position sizing
```

### Pattern 2: Portfolio Analysis

```
1. portfolio_tracker → List positions
2. performance_analytics → Performance metrics
3. risk_management → Risk assessment
4. portfolio_optimize → Optimization
5. alert_system → Set alerts
```

### Pattern 3: Market Monitoring

```
1. market_monitor → Market status
2. alert_system → Create alerts
3. data_export → Export data
4. get_sentiment → Monitor sentiment
```

## Code Examples

### Example 1: Comprehensive Stock Research

```typescript
// 1. Get price data
const price = await get_astock_price({
  code: "600519.SH",
  period: "daily",
  start_date: "20240101"
});

// 2. Get financials
const financials = await get_astock_financials({
  code: "600519.SH",
  period: "2024"
});

// 3. Get sentiment
const sentiment = await get_sentiment({
  code: "600519.SH",
  period: "1m"
});

// 4. Multi-agent research
const research = await multi_agent_research({
  code: "600519.SH",
  agents: ["technical", "fundamental", "sentiment", "risk"]
});

// 5. Performance analytics
const perf = await performance_analytics({
  action: "returns",
  code: "600519.SH",
  period_days: 252
});
```

### Example 2: Portfolio Setup

```typescript
// 1. Add positions
await portfolio_tracker({
  action: "add",
  code: "600519.SH",
  quantity: 100,
  entry_price: 1500
});

// 2. Check performance
const perf = await portfolio_tracker({
  action: "performance"
});

// 3. Optimize portfolio
const optimized = await portfolio_optimize({
  strategy: "max_sharpe",
  assets: [
    { code: "600519.SH", weight: 0.3 },
    { code: "300750.SZ", weight: 0.4 },
    { code: "002594.SZ", weight: 0.3 }
  ]
});

// 4. Set alerts
await alert_system({
  action: "create",
  code: "600519.SH",
  alert_type: "price",
  threshold: 1800,
  condition: "above"
});
```

### Example 3: Risk Assessment

```typescript
// 1. Risk assessment
const risk = await risk_management({
  action: "assess",
  code: "300750.SZ"
});

// 2. Position sizing
const sizing = await risk_management({
  action: "position_size",
  code: "300750.SZ",
  risk_tolerance: 0.02
});

// 3. Stop-loss
const stopLoss = await risk_management({
  action: "stop_loss",
  code: "300750.SZ",
  entry_price: 200
});

// 4. VaR calculation
const var = await risk_management({
  action: "var",
  code: "300750.SZ"
});
```

### Example 4: Market Monitoring

```typescript
// 1. Market status
const status = await market_monitor({
  action: "status"
});

// 2. Sector performance
const sectors = await market_monitor({
  action: "sectors"
});

// 3. Set watch alerts
const alerts = await alert_system({
  action: "create",
  code: "002594.SZ",
  alert_type: "pct_change",
  threshold: 5,
  condition: "change"
});

// 4. Export data
const csv = await data_export({
  format: "csv",
  data_type: "price",
  code: "002594.SZ"
});
```

## Data Flow Diagram

```
┌─────────────┐
│  User Query │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────┐
│  Tool Selection (AI Agent)   │
└──────────────┬───────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│ Data Tools  │ │Analysis Tools│
│ - price     │ │ - sentiment │
│ - financial │ │ - forecast  │
│ - news      │ │ - research  │
└─────────────┘ └─────────────┘
       │               │
       └───────┬───────┘
               ▼
┌──────────────────────────────┐
│  Portfolio/Risk Tools        │
│ - optimize - tracker        │
│ - risk - alerts             │
└──────────────┬───────────────┘
               │
               ▼
        ┌─────────────┐
        │   Output    │
        │ Report/Alert│
        └─────────────┘
```

## Error Handling

### Common Errors

| Error | Solution |
|-------|----------|
| TUSHARE_TOKEN not set | Set `TUSHARE_TOKEN` in `.env` |
| Rate limit exceeded | Wait 1 minute, retry |
| Invalid stock code | Use Tushare format: `600519.SH` |
| Insufficient data | Use longer period |

### Retry Pattern

```typescript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

## Performance Tips

1. **Batch requests**: Use `Promise.all` for parallel calls
2. **Cache data**: Reuse recent API responses
3. **Limit data**: Use `limit` parameter
4. **Use periods**: Narrow date ranges when possible

## Testing

Run unit tests:
```bash
bun test
```

Run verification:
```bash
bun run scripts/oscript-full-verification.ts
```
