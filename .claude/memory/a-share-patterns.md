# A-Share Data Query Patterns

Quick reference for A-share data queries.

## Stock Price

### Query Patterns
- "贵州茅台现在多少钱"
- "宁德时代股价"
- "比亚迪今天涨了多少"
- "中芯国际的实时行情"

### Data Sources
- Tushare Pro: `daily` API
- AKShare: `stock_zh_a_spot_em()`

## Financial Data

### Query Patterns
- "贵州茅台的财务数据"
- "宁德时代的营收"
- "比亚迪净利润"

### Data Sources
- Tushare Pro: ` fina_indicator`, `income`, `balance_sheet`
- AKShare: `stock_financial_analysis_indicator()`

## Announcements (公告)

### Query Patterns
- "宁德时代最新公告"
- "贵州茅台有什么新公告"
- "帮我查一下比亚迪的公告"

### Data Sources
- Tushare Pro: `disclosure_date`, `notice`
- AKShare: `stock_zh_a_analyze_report_em()`

## Market Structure (龙虎榜/北向资金)

### Query Patterns
- "今天龙虎榜有什么"
- "北向资金流入情况"
- "哪些股票涨停了"
- "主力资金动向"

### Data Sources
- Tushare Pro: `top_list`, `hsgt_top10`
- AKShare: `stock_rank_lhb_detail_em()`

## Screening (筛选)

### Query Patterns
- "筛选ROE高于15%的A股"
- "帮我找一些低估值的股票"
- "市盈率低于10的股票"
- "哪些股票分红率最高"

### Screening Criteria
- ROE (净资产收益率)
- PE (市盈率)
- PB (市净率)
- Dividend Yield (分红率)
- Market Cap (市值)
- Sector (行业)

### Data Sources
- Tushare Pro: `basic`, `daily`
- AKShare: `stock_a_indicator()

## Sector Data (行业数据)

### Query Patterns
- "新能源汽车行业分析"
- "半导体行业前景"
- "申万行业对比"

### Data Sources
- Tushare Pro: `ths_index`, `concept_detail`
- AKShare: `stock_board_industry_name_em()`

## Technical Data (技术指标)

### Query Patterns
- "宁德时代的MACD"
- "比亚迪的K线"
- "技术分析"

### Data Sources
- Tushare Pro: `pro_bar`
- AKShare: `stock_zh_a_hist()`

## Macro Data

### Query Patterns
- "中国GDP增速"
- "CPI数据"
- "PMI指数"
- "利率水平"

### Data Sources
- Tushare Pro: `cn_gdp`, `cn_cpi`, `cn_ppi`
- AKShare: `macro_china_gdp()`, `macro_china_cpi()`

## Chinese Keywords Reference

| English | Chinese |
|---------|---------|
| Stock Price | 股价、行情 |
| Financials | 财务、营收、利润 |
| Announcement | 公告、披露 |
| Dragon-Tiger List | 龙虎榜 |
| Northbound Flow | 北向资金 |
| Screening | 筛选、选股 |
| Technical | 技术、指标 |
| Sector | 行业、板块 |
| Market Cap | 市值 |
| ROE | 净资产收益率 |
| PE | 市盈率 |
| PB | 市净率 |

Last Updated: 2026-05-07
