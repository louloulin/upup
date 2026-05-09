---
name: a-share-fund
description: |
  A股基金数据查询与分析。当用户提到以下内容时必须使用此技能：
  ETF、公募基金、私募基金、基金净值、基金涨跌、基金排名、
  基金持仓、基金经理、基金分红、基金申购赎回、
  货币基金、债券基金、股票基金、混合基金、
  基金代码、基金名称、基金净值估算、
  开放式基金、封闭式基金、LOF、ETF联接、
  基金业绩、基金规模、基金费率。
  支持 Tushare Pro fund 接口 + AKShare。
context: inherit
user-invocable: true
argument-hint: "基金名称或代码（例如，ETF 512880、指数基金）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# A-Share Fund Skill

A 股基金数据查询与分析。支持 ETF、公募基金、私募基金等数据。

## 数据源

### 主数据源: Tushare Pro

需要 `TUSHARE_TOKEN`，接口包括：
- `fund_basic`: 基金基本信息
- `fund_nav`: 基金净值
- `fund_manager`: 基金经理

```bash
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{"api_name":"fund_basic","token":"'$TUSHARE_TOKEN'","params":{"market":"O"},"fields":""}' | jq .
```

### 补充数据源: AKShare

```bash
python3 -c "
import akshare as ak
import json

# ETF 实时行情
df = ak.fund_etf_spot_em()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. ETF 数据

### 1.1 ETF 实时行情

```bash
python3 -c "
import akshare as ak
import json
df = ak.fund_etf_spot_em()
# 筛选成交额 > 1亿的ETF
df_filtered = df[df['成交额'] > 100000000]
print(df_filtered[['基金代码', '基金名称', '最新价', '涨跌幅', '成交额']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 ETF 历史净值

```bash
python3 -c "
import akshare as ak
import json
# 获取 ETF 历史净值
df = ak.fund_etf_hist_em(symbol='512880', period='daily', start_date='20240101', end_date='20241231')
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

### 1.3 ETF 持仓

```bash
python3 -c "
import akshare as ak
import json
# ETF 前十大持仓
df = ak.fund_etf_fund_info_em(symbol='512880')
print(json.dumps(df, ensure_ascii=False, indent=2))
"
```

## 2. 公募基金数据

### 2.1 公募基金列表

```bash
python3 -c "
import akshare as ak
import json
# 获取公募基金列表
df = ak.fund_public_fund_spot_em()
print(df[['基金代码', '基金简称', '单位净值', '累计净值', '日增长率', '成立日期']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 2.2 基金净值估算

```bash
python3 -c "
import akshare as ak
import json
# 基金实时估值
df = ak.fund_estimate(sheet='嘉实沪深300ETF联接A')
print(json.dumps(df, ensure_ascii=False, indent=2))
"
```

### 2.3 基金历史净值

```bash
python3 -c "
import akshare as ak
import json
# 基金历史净值
df = ak.fund_individual_basic_info_xq(symbol='000001')
print(df[['日期', '单位净值', '累计净值', '日增长率']].tail(20).to_json(orient='records', force_ascii=False))
"
```

## 3. 基金筛选

### 3.1 按业绩筛选

```bash
python3 -c "
import akshare as ak
import json
# 近一年涨幅前20
df = ak.fund_rank_em()
print(df[df['近1年'] > 20].sort_values('近1年', ascending=False).head(20).to_json(orient='records', force_ascii=False))
"
```

### 3.2 按规模筛选

```bash
python3 -c "
import akshare as ak
import json
# 大规模基金（规模 > 100亿）
df = ak.fund_scale_em()
df_large = df[df['基金规模'] > 100]
print(df_large[['基金代码', '基金名称', '基金规模', '成立日期']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 3.3 按类型筛选

```bash
python3 -c "
import akshare as ak
import json
# 股票型基金
df = ak.fund_fof_hold(sheet='基金重仓股')
print(df.head(20).to_json(orient='records', force_ascii=False))
"
```

## 4. 基金经理数据

### 4.1 基金经理列表

```bash
python3 -c "
import akshare as ak
import json
# 基金经理列表
df = ak.fund_manager()
print(df[['基金经理代码', '基金经理名称', '任职基金数', '从业年限']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 4.2 基金经理业绩

```bash
python3 -c "
import akshare as ak
import json
# 基金经理管理的基金
df = ak.fund_manager_hist(sheet='张坤')
print(json.dumps(df, ensure_ascii=False, indent=2))
"
```

## 5. 基金对比分析

### 5.1 多基金对比

```bash
python3 -c "
import akshare as ak
import json
# 对比多只基金业绩
codes = ['000001', '110011', '163402']
for code in codes:
    df = ak.fund_individual_basic_info_xq(symbol=code)
    print(f'{code}: 最新净值={df.iloc[0][\"单位净值\"]}, 累计净值={df.iloc[0][\"累计净值\"]}')
"
```

### 5.2 业绩归因

```bash
python3 -c "
import akshare as ak
import json
# 基金持仓分析
df = ak.fund_fund_info(symbol='000001')
print(json.dumps(df, ensure_ascii=False, indent=2))
"
```

## 6. 常用 ETF 代码参考

| 名称 | 代码 | 类型 |
|------|------|------|
| 沪深300 ETF | 510300 | 宽基指数 |
| 中证500 ETF | 510500 | 宽基指数 |
| 创业板 ETF | 159915 | 行业指数 |
| 上证50 ETF | 510050 | 宽基指数 |
| 证券 ETF | 512880 | 行业指数 |
| 军工 ETF | 512660 | 行业指数 |
| 芯片 ETF | 512760 | 行业指数 |
| 新能源车 ETF | 515700 | 主题指数 |
| 纳指 ETF | 513100 | QDII |
| 标普500 ETF | 513500 | QDII |

## 输出格式

```markdown
## A股基金数据: {基金名称/代码}

### 基本信息
- 基金代码: {代码}
- 基金名称: {名称}
- 基金类型: {类型}
- 成立日期: {日期}

### 净值数据
| 日期 | 单位净值 | 累计净值 | 日增长率 |
|------|---------|---------|---------|
| {date} | {nav} | {cum_nav} | {return}% |

### 业绩表现
- 近1月: {1m}%
- 近3月: {3m}%
- 近1年: {1y}%
- 成立以来: {since_inception}%

### 规模与费率
- 基金规模: {规模}
- 管理费率: {fee}%
- 托管费率: {trust_fee}%

### 投资建议
- {分析和建议}

### 数据来源
- Tushare Pro / AKShare
- 数据更新时间: {TIME}
```

## 注意事项

- ETF 实时行情每 15 秒更新
- 基金净值估算仅供参考，以实际净值为准
- 公募基金 T+1 确认申购赎回
- QDII 基金可能有汇率风险
- 关注基金规模和流动性

Last Updated: 2026-05-07
