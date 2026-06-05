# finance-tools

## Purpose
提供股票/财报/估值/筛选/backtest/watchlist 等金融工具集。所有金融数据查询 SHALL 走 `@upup/finance-tools`，不直接调用第三方 API。

## Requirements

### R-1 Tool families
系统 SHALL 提供以下工具族：prices、fundamentals、filings、insider、institutional、metrics、screener、watchlist、earnings、valuation、backtest、risk、portfolio、comparison、short-interest、news、sentiment、notebook、export。

### R-2 Data source
系统 SHALL 使用 `financial_datasets` API 作为主数据源；缺失时 SHALL 降级到 web search。

### R-3 Caching
系统 SHALL 对所有只读查询启用缓存，TTL 由工具类型决定（行情短、财报长）。

### R-4 A-stock support
系统 SHALL 至少对 a-share 提供：实时行情、涨停跌停、龙虎榜、北向资金、估值/财报。

## Scenarios

### S-1 Price query
- **GIVEN** 用户问 "AAPL 当前价"
- **WHEN** 工具被调用
- **THEN** SHALL 返回 latest price + change + volume + timestamp

### S-2 Backtest
- **GIVEN** 用户给一个策略（双均线）
- **WHEN** backtest 工具被调用
- **THEN** SHALL 返回年化、夏普、最大回撤、交易明细
