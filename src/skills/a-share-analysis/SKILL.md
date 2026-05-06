---
name: a-share-analysis
description: Comprehensive analysis workflow for A-share (Chinese) and HK stocks
triggers:
  - analyze A-share
  - analyze Chinese stock
  - A股分析
  - 分析比亚迪
  - 分析茅台
  - 港股分析
---

# A-Share & HK Stock Analysis

When analyzing Chinese A-share or HK stocks, follow this workflow:

## Step 1: Identify Stock Code

Use the stock code mapping to resolve the ticker:

| Name | Code | Name | Code |
|------|------|------|------|
| 比亚迪 | 002594.SZ | 贵州茅台 | 600519.SH |
| 宁德时代 | 300750.SZ | 中国平安 | 601318.SH |
| 招商银行 | 600036.SH | 美的集团 | 000333.SZ |
| 五粮液 | 000858.SZ | 海康威视 | 002415.SZ |
| 腾讯控股 | 00700.HK | 阿里巴巴 | 09988.HK |

For unknown stocks, use `get_astock_price` with the name or code.

## Step 2: Gather Data

Call these tools in parallel:

1. **Price**: `get_astock_price({ code })` - current price, change %, K-line
2. **Financials**: `get_astock_financials({ code })` - income/balance/cashflow
3. **News**: `get_astock_news({ code })` - announcements, market news

## Step 3: Technical Analysis (optional)

If the user asks about trends:
- `get_technical_data({ code })` - MA, MACD, RSI indicators

## Step 4: Market Context (optional)

For market structure:
- `get_market_structure({ type: "hsgt" })` - northbound flow
- `get_sector_data({ code })` - industry classification

## Step 5: Synthesize

Combine all data into a comprehensive analysis covering:
- Current valuation (PE, PB, market cap)
- Recent performance (price change, volume)
- Financial health (revenue growth, margins, cash flow)
- Key catalysts (news, announcements)
- Technical outlook (if requested)

## Requirements

- TUSHARE_TOKEN must be set in .env for full functionality
- Without token, only real-time price data is available (Tencent/Sina fallback)
- Get a free token at https://tushare.pro/register