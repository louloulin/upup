---
name: a-share-market-structure
description: |
  A股市场结构与资金流向。当用户询问以下内容时必须使用此技能：
  龙虎榜、涨停、跌停、北向资金、南向资金、主力资金、
  融资融券、大宗交易、股东人数变化、机构持仓。
  支持 Tushare Pro + AKShare。
context: inherit
user-invocable: true
argument-hint: "查询内容（例如，龙虎榜、北向资金）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# A-Share Market Structure Skill

A 股市场结构与资金流向数据查询。

## 数据源

### AKShare

```bash
python3 -c "
import akshare as ak
import json

# 龙虎榜
df = ak.stock_rank_lhb_detail_em()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 龙虎榜

### 1.1 今日龙虎榜

```bash
python3 -c "
import akshare as ak
import json
# 今日龙虎榜详情
df = ak.stock_rank_lhb_detail_em()
print(df[['股票代码', '股票名称', '龙虎榜净买额', '龙虎榜买入额', '龙虎榜卖出额']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 个股龙虎榜

```bash
python3 -c "
import akshare as ak
import json
# 个股龙虎榜历史
df = ak.stock_lhb_detail_em(symbol='000001')
print(df[['日期', '股票代码', '股票名称', '买入营业部', '卖出营业部']].tail(10).to_json(orient='records', force_ascii=False))
"
```

## 2. 北向资金

### 2.1 北向资金流向

```bash
python3 -c "
import akshare as ak
import json
# 北向资金流向
df = ak.stock_hsgt_north_net_flow_in_em()
print(df.tail(10).to_json(orient='records', force_ascii=False))
"
```

### 2.2 北向资金持仓

```bash
python3 -c "
import akshare as ak
import json
# 北向资金持股
df = ak.stock_hsgt_hold_stock_a_em()
print(df[['股票代码', '股票名称', '北向持股数', '持股市值']].head(20).to_json(orient='records', force_ascii=False))
"
```

## 3. 涨停板

### 3.1 涨停板数据

```bash
python3 -c "
import akshare as ak
import json
# 涨停板
df = ak.stock_zt_pool_em()
print(df[['股票代码', '股票名称', '涨停统计', '连板数', '流通市值']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 3.2 跌停板

```bash
python3 -c "
import akshare as ak
import json
# 跌停板
df = ak.stock_zt_pool_dt_em()
print(df[['股票代码', '股票名称', '跌停统计']].head(20).to_json(orient='records', force_ascii=False))
"
```

## 4. 融资融券

### 4.1 融资融券余额

```bash
python3 -c "
import akshare as ak
import json
# 融资融券
df = ak.stock_margin_detail_szse(symbol='融资融券')
print(df.tail(10).to_json(orient='records', force_ascii=False))
"
```

## 输出格式

```markdown
## A股市场结构: {查询内容}

### 龙虎榜
| 股票 | 代码 | 净买额 | 买入额 | 卖出额 |
|------|------|--------|--------|--------|
| {name} | {code} | {net} | {buy} | {sell} |

### 北向资金
- 当日净流入: ¥{net_flow}
- 近5日累计: ¥{flow_5d}
- 持股总量: {holdings}

### 涨停板
- 涨停数量: {zt_count}
- 连板最多: {name} ({count}板)

### 数据来源
- Tushare Pro / AKShare
- 数据更新时间: {TIME}
```

## 注意事项

- 龙虎榜通常在收盘后1-2小时更新
- 北向资金数据有2天延迟
- 涨停板数据仅供参考
- 融资融券数据每交易日更新

Last Updated: 2026-05-07
