---
name: a-share-analysis
description: Comprehensive analysis workflow for A-share (Chinese) and HK stocks. Triggers on A股分析, 分析股票, 港股分析, Chinese stock research, A-share deep dive.
description.zh-CN: 面向 A 股和港股的深度研究工作流。触发关键词: A股分析, 分析股票, 港股分析, Chinese stock research, A-share deep dive.
triggers:
  - analyze A-share
  - analyze Chinese stock
  - A股分析
  - 分析比亚迪
  - 港股分析
  - deep research Chinese
  - 深度研究
---

# A-Share & HK Stock Analysis (增强版)

This skill provides institutional-grade analysis of Chinese A-shares and HK stocks, combining technical, fundamental, and sentiment analysis.

## Step 1: Stock Identification

Use the `get_astock_price` tool to resolve stock name/code:

```
Call: get_astock_price({ code: "比亚迪" })
Or:   get_astock_price({ code: "002594.SZ" })
```

**Stock Code Reference (常用代码):**
| Name | Code | Exchange |
|------|------|----------|
| 比亚迪 | 002594.SZ | SZ |
| 贵州茅台 | 600519.SH | SH |
| 宁德时代 | 300750.SZ | SZ |
| 中国平安 | 601318.SH | SH |
| 招商银行 | 600036.SH | SH |
| 美的集团 | 000333.SZ | SZ |
| 五粮液 | 000858.SZ | SZ |
| 海康威视 | 002415.SZ | SZ |
| 中芯国际 | 688981.SH | SH |
| 腾讯控股 | 00700.HK | HK |
| 阿里巴巴 | 09988.HK | HK |

## Step 2: Parallel Data Collection

Call these tools in PARALLEL (use Promise.all):

### 2.1 Price & Market Data
```
get_astock_price({
  code: "[STOCK_CODE]",
  period: "daily",
  start_date: "[N_DAYS_AGO]"
})
```
- Use N=30 for short-term, N=250 for long-term analysis

### 2.2 Financial Statements
```
get_astock_financials({
  code: "[STOCK_CODE]",
  period: "2024"
})
```
- Extract: 营收, 净利润, ROE, 毛利率, 负债率

### 2.3 News & Announcements
```
get_astock_news({
  code: "[STOCK_CODE]",
  limit: 20
})
```
- Focus on: 业绩公告, 重大合同, 政策影响

## Step 3: Technical Analysis

Call if user asks about technical indicators:
```
get_technical_data({
  code: "[STOCK_CODE]",
  indicators: ["MA", "MACD", "KDJ", "BOLL"]
})
```

## Step 4: Market Context

### 4.1 Northbound Flow (北向资金)
```
get_market_structure({
  type: "hsgt"
})
```
- Track: 北向资金净流入, 外资持股比例

### 4.2 Sector Performance
```
get_sector_data({
  code: "[STOCK_CODE]"
})
```
- Extract: 行业涨跌幅, 行业地位

## Step 5: Multi-Factor Analysis

Combine data to produce:

### Valuation Metrics
| Metric | Formula | 合理范围 |
|--------|---------|----------|
| PE (市盈率) | Price / EPS | 行业平均±50% |
| PB (市净率) | Price / Book | <3 为价值股 |
| ROE | 净利润/净资产 | >15% 优质 |
| 营收增速 | YoY增长率 | >10% 成长 |
| 毛利率 | (营收-成本)/营收 | 稳定或上升 |

### Technical Signals
- 均线多头: MA5>MA10>MA20 上穿
- MACD: 金叉/死叉
- 成交量: 放量上涨/缩量下跌

### Sentiment Signals
- 新闻情绪: 正面/负面/中性
- 公告内容: 超预期/符合预期/不及预期
- 资金流向: 北向资金持续净买入

## Step 6: Investment Thesis

Structure the final analysis:

```
# [股票名称] ([代码]) 分析报告

## 1. 基本面概览
- 行业: [行业]
- 市值: [市值]
- PE/PB: [估值]
- ROE: [盈利能力]

## 2. 近期表现
- 近[N]日涨幅: [+X%]
- 成交量变化: [放量/缩量]
- 均线状态: [多头/空头/震荡]

## 3. 财务分析
- 营收增长: [+X% YoY]
- 净利润增长: [+X% YoY]
- 毛利率趋势: [上升/稳定/下降]
- 现金流: [健康/紧张]

## 4. 催化因素
- 正面: [公告/政策/业绩]
- 风险: [行业风险/竞争风险]

## 5. 技术信号
- 趋势: [上升/下降/震荡]
- 支撑位: [价格区间]
- 压力位: [价格区间]
- 止损位: [价格区间]

## 6. 综合评级
- 短期(1-3月): [强烈推荐/推荐/中性/回避]
- 中期(3-12月): [强烈推荐/推荐/中性/回避]
- 风险等级: [低/中/高]

## 7. 操作建议
- 买入区间: [价格区间]
- 目标价: [价格]
- 止损价: [价格]
```

## 注意事项

1. **TUSHARE_TOKEN**: Required for financial data. Get free at https://tushare.pro/register
2. **Data Freshness**: Real-time prices from Tencent/Sina; financials updated daily
3. **HK Stocks**: Use .HK suffix (e.g., 00700.HK)
4. **Chinese Names**: Auto-resolved; use codes for precision

## Example Query

User: "分析贵州茅台近期走势和投资价值"

Response should include:
1. Current price + recent 30-day performance
2. Financial highlights (茅台酒毛利率>90%, 营收增速)
3. 北向资金持股变化
4. Technical analysis (均线, MACD)
5. Investment recommendation with price targets
