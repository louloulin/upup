---
name: financial-data
description: |
  US Stock Financial Data Query. 当用户询问美股相关时必须使用此技能：
  股价、股票价格、市盈率、市值、财务报表、营收、利润、
  EPS、ROE、资产负债表、现金流量表、美股代码（如 AAPL, TSLA, MSFT）。
  支持 Tushare Pro US stock 接口 + AKShare。
context: inherit
user-invocable: true
argument-hint: "股票代码或公司名称（例如，AAPL、苹果）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/dexter-cache/*)
---

# US Financial Data Skill

美股财务数据查询。支持股价、财务报表、市盈率等数据。

## 数据源

### 主数据源: Tushare Pro

需要 `TUSHARE_TOKEN`，接口包括：
- `us_daily`: 美股日线行情
- `us_basic`: 美股基本信息
- `income`: 财务报表

### 补充数据源: AKShare

```bash
python3 -c "
import akshare as ak
import json

# 美股实时行情
df = ak.stock_us_spot_em()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 股价查询

### 1.1 美股实时行情

```bash
python3 -c "
import akshare as ak
import json
# 美股实时行情
df = ak.stock_us_spot_em()
print(df[['代码', '名称', '最新价', '涨跌幅', '成交量']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 个股历史数据

```bash
python3 -c "
import akshare as ak
import json
# 美股历史数据
df = ak.stock_us_hist(symbol='AAPL', period='daily', start_date='20240101', end_date='20241231')
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

## 2. 财务数据

### 2.1 财务指标

```bash
python3 -c "
import akshare as ak
import json
# 美股财务指标
df = ak.stock_us_financial_analysis_indicator(symbol='AAPL')
print(df[['日期', '市盈率TTM', '市净率', 'ROE', '毛利率']].tail(10).to_json(orient='records', force_ascii=False))
"
```

### 2.2 财务报表

```bash
python3 -c "
import akshare as ak
import json
# 资产负债表
df = ak.stock_us_balance_sheet(symbol='AAPL')
print(json.dumps(df, ensure_ascii=False, indent=2))
"
```

## 3. 常用美股代码参考

| 公司 | 代码 | 交易所 |
|------|------|--------|
| Apple | AAPL | NASDAQ |
| Microsoft | MSFT | NASDAQ |
| Google | GOOGL | NASDAQ |
| Amazon | AMZN | NASDAQ |
| Tesla | TSLA | NASDAQ |
| Meta | META | NASDAQ |
| NVIDIA | NVDA | NASDAQ |
| JPMorgan | JPM | NYSE |
| Visa | V | NYSE |

## 输出格式

```markdown
## US Stock Data: {股票代码}

### 基本信息
- 股票代码: {code}
- 公司名称: {name}
- 交易所: {exchange}
- 最新价: ${price}
- 涨跌幅: {change}%

### 估值指标
- 市盈率 (PE): {pe}
- 市净率 (PB): {pb}
- ROE: {roe}%
- 市值: ${market_cap}

### 财务数据
| 指标 | 数值 |
|------|------|
| 营收 | {revenue} |
| 净利润 | {net_income} |
| EPS | {eps} |

### 数据来源
- Tushare Pro / AKShare
- 数据更新时间: {TIME}
```

## 注意事项

- 美股实时行情延迟 15 分钟
- 财务数据 T+1 更新
- 财报季节通常在季度末
- 注意汇率风险（美元/人民币）

Last Updated: 2026-05-07
