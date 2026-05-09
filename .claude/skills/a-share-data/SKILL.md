---
name: a-share-data
description: |
  A股实时行情与历史数据。当用户询问A股时必须使用此技能：
  股价、股票价格、A股代码、涨跌幅、成交量、市盈率、市值、
  上证、深证、创业板、科创板、北交所。
  支持 Tushare Pro + AKShare。
context: inherit
user-invocable: true
argument-hint: "股票代码或名称（例如，贵州茅台、600519）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# A-Share Stock Data Skill

A 股实时行情与历史数据查询。

## 数据源

### AKShare

```bash
python3 -c "
import akshare as ak
import json

# A股实时行情
df = ak.stock_zh_a_spot_em()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 实时行情

### 1.1 A股实时行情

```bash
python3 -c "
import akshare as ak
import json
# A股实时行情（成交额排序前20）
df = ak.stock_zh_a_spot_em()
df_filtered = df[df['成交额'] > 100000000]
print(df_filtered[['代码', '名称', '最新价', '涨跌幅', '成交额']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 实时行情（单股）

```bash
python3 -c "
import akshare as ak
import json
# 个股实时行情
df = ak.stock_zh_a_spot_em(symbol='600519')
print(df.to_json(orient='records', force_ascii=False))
"
```

## 2. 历史数据

### 2.1 日线历史

```bash
python3 -c "
import akshare as ak
import json
# 个股日线历史
df = ak.stock_zh_a_hist(symbol='600519', period='daily', start_date='20240101', end_date='20241231')
print(df.tail(30).to_json(orient='records', force_ascii=False))
"
```

### 2.2 分钟数据

```bash
python3 -c "
import akshare as ak
import json
# 5分钟数据
df = ak.stock_zh_a_min_em(symbol='600519', period='5')
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

## 3. 基本面数据

### 3.1 财务指标

```bash
python3 -c "
import akshare as ak
import json
# 财务指标
df = ak.stock_financial_analysis_indicator_em(symbol='600519')
print(df[['日期', '市盈率', '市净率', 'ROE', '毛利率']].tail(4).to_json(orient='records', force_ascii=False))
"
```

## 4. 常用A股代码

| 名称 | 代码 | 板块 |
|------|------|------|
| 贵州茅台 | 600519 | 上证主板 |
| 宁德时代 | 300750 | 创业板 |
| 比亚迪 | 002594 | 中小板 |
| 中芯国际 | 688981 | 科创板 |
| 中国平安 | 601318 | 上证主板 |

## 输出格式

```markdown
## A股数据: {股票名称/代码}

### 实时行情
- 代码: {code}
- 名称: {name}
- 最新价: ¥{price}
- 涨跌幅: {change}%
- 成交量: {volume}手
- 成交额: ¥{amount}

### 历史走势
| 日期 | 开盘 | 收盘 | 涨跌幅 |
|------|------|------|--------|
| {date} | {open} | {close} | {change}% |

### 估值指标
- 市盈率 (PE): {pe}
- 市净率 (PB): {pb}
- 总市值: ¥{market_cap}

### 数据来源
- Tushare Pro / AKShare
- 数据更新时间: {TIME}
```

## 注意事项

- A股交易时间: 9:30-11:30, 13:00-15:00
- 实时行情延迟约15秒
- T+1 交割制度
- 涨跌停板限制

Last Updated: 2026-05-07
