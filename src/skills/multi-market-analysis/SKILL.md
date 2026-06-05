---
name: multi-market-analysis
description: Multi-market analysis skill supporting A-shares (China), HK stocks, and US stocks. Triggers on 多市场分析, cross-market, global analysis, 全球市场, comparative analysis.
description.zh-CN: 跨市场分析(A 股 / 港股 / 美股)。触发关键词: 多市场分析, cross-market, global analysis, 全球市场, comparative analysis.
triggers:
  - multi-market analysis
  - 多市场分析
  - cross-market
  - global analysis
  - 全球市场
  - comparative analysis
  - compare A-share and US
  - A股美股对比
---

# Multi-Market Analysis (多市场分析)

Comprehensive analysis across A-shares (China), HK stocks, and US stocks with unified methodology.

## Supported Markets

| Market | Format | Examples |
|--------|--------|----------|
| **A-shares** | Tushare format | 002594.SZ, 600519.SH, 688981.SH |
| **HK Stocks** | .HK suffix | 00700.HK, 09988.HK |
| **US Stocks** | Symbol format | AAPL, TSLA, MSFT |

## Step 1: Data Collection

### 1.1 A-shares Data
```
get_astock_price({
  code: "[STOCK_CODE]",
  period: "daily",
  start_date: "[30_DAYS_AGO]"
})

get_astock_financials({
  code: "[STOCK_CODE]",
  period: "2024"
})
```

### 1.2 US Stock Data
```
get_stock_price({
  symbol: "[US_SYMBOL]"
})

get_financials({
  symbol: "[US_SYMBOL]",
  period: "annual"
})
```

### 1.3 HK Stock Data
```
get_astock_price({
  code: "[HK_CODE]"  // e.g., 00700.HK
})
```

## Step 2: Unified Metrics Calculation

### Valuation Comparison
```
| Metric | A-share | HK | US |
|---------|---------|-----|-----|
| P/E Ratio | ✓ | ✓ | ✓ |
| P/B Ratio | ✓ | ✓ | ✓ |
| EV/EBITDA | ✓ | ✓ | ✓ |
| Dividend Yield | ✓ | ✓ | ✓ |
```

### Growth Comparison
```
| Metric | A-share | HK | US |
|---------|---------|-----|-----|
| Revenue Growth | ✓ | ✓ | ✓ |
| Profit Growth | ✓ | ✓ | ✓ |
| 3-Year CAGR | ✓ | ✓ | ✓ |
```

## Step 3: Sector Mapping

### Equivalent Sectors Across Markets
```
A-shares          | HK              | US
------------------|-----------------|------------------
银行 (Banking)    | 金融            | Financials
科技 (Tech)       | 科技            | Technology
消费 (Consumer)   | 消费            | Consumer Discretionary
工业 (Industrial) | 工业            | Industrials
医药 (Healthcare) | 医疗            | Healthcare
能源 (Energy)     | 能源            | Energy
```

## Step 4: Comparative Analysis

### Valuation Score (0-100)
- Score each stock on valuation metrics
- Normalize across markets
- Create comparable scores

### Growth Score (0-100)
- Score on revenue/profit growth
- Consider growth sustainability
- Factor in margins

### Quality Score (0-100)
- ROE, ROA, ROIC
- Debt levels
- Cash flow quality

## Step 5: Cross-Market Insights

### Currency Adjustment
- A-shares in CNY
- HK stocks in HKD
- US stocks in USD
- Use approximate rates: CNY/USD ≈ 7.2, HKD/USD ≈ 7.8

### Time Zone Consideration
- A-shares: 9:30-15:00 CST
- HK: 9:30-16:00 HKT
- US: 9:30-16:00 EST

## Step 6: Output Structure

```
# Multi-Market Analysis Report

## Comparison Summary
| Stock | Market | Price | P/E | P/B | Rev Growth | Profit Growth |
|-------|--------|-------|-----|-----|------------|---------------|
| 贵州茅台 | A-share | XXX | XX | XX | XX% | XX% |
| 腾讯控股 | HK | XXX | XX | XX | XX% | XX% |
| Apple | US | XXX | XX | XX | XX% | XX% |

## Sector Comparison
[Map equivalent sectors and compare performance]

## Investment Themes
[Identify themes that span multiple markets]

## Risk Factors
[Cross-market risks to consider]
```

## Key Stock References

### Technology
| A-share | HK | US |
|---------|-----|-----|
| 宁德时代 (300750) | 腾讯 (00700) | Apple (AAPL) |
| 中芯国际 (688981) | 阿里 (09988) | NVIDIA (NVDA) |
| 海康威视 (002415) | 美团 (03690) | Google (GOOGL) |

### Consumer
| A-share | HK | US |
|---------|-----|-----|
| 贵州茅台 (600519) | 百胜 (09987) | Starbucks (SBUX) |
| 美的集团 (000333) | 农夫山泉 (09633) | Tesla (TSLA) |
| 五粮液 (000858) | 安踏 (02020) | Nike (NKE) |

### Financial
| A-share | HK | US |
|---------|-----|-----|
| 招商银行 (600036) | 友邦 (01299) | JPMorgan (JPM) |
| 中国平安 (601318) | 港交所 (00388) | Goldman (GS) |
| 工商银行 (601398) | 中银香港 (02388) | Bank of America (BAC) |

## Analysis Tips

1. **Use consistent time periods** for fair comparison
2. **Adjust for currency** when comparing absolute values
3. **Consider market-specific factors** (regulations, liquidity)
4. **Use normalized metrics** (per-share, ratios) for comparison
5. **Cross-reference themes** across markets for insights
