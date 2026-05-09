---
name: a-share-screening
description: |
  A股选股与筛选。当用户询问以下内容时必须使用此技能：
  选股、筛选、低估值、高ROE、高股息率、市盈率筛选、
  市净率筛选、财务指标筛选、条件选股。
  支持 Tushare Pro + AKShare。
context: inherit
user-invocable: true
argument-hint: "筛选条件（例如，ROE>15%、PE<20）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# A-Share Screening Skill

A 股选股与条件筛选。

## 数据源

### AKShare

```bash
python3 -c "
import akshare as ak
import json

# A股个股指标
df = ak.stock_a_indicator()
print(df[['代码', '名称', '市盈率', '市净率', 'ROE']].head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 基本筛选

### 1.1 按估值筛选

```bash
python3 -c "
import akshare as ak
import json
# 获取A股指标
df = ak.stock_a_indicator()
# 筛选 PE < 20
df_pe = df[df['市盈率'] < 20]
print(df_pe[['代码', '名称', '市盈率', '市净率', 'ROE']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 按ROE筛选

```bash
python3 -c "
import akshare as ak
import json
# 获取A股指标
df = ak.stock_a_indicator()
# 筛选 ROE > 15%
df_roe = df[df['ROE'] > 15]
print(df_roe[['代码', '名称', 'ROE', '净利润增长率', '毛利率']].sort_values('ROE', ascending=False).head(20).to_json(orient='records', force_ascii=False))
"
```

## 2. 高级筛选

### 2.1 多条件筛选

```bash
python3 -c "
import akshare as ak
import json
# 获取A股指标
df = ak.stock_a_indicator()
# 多条件: PE < 30 AND ROE > 10% AND 市值 > 100亿
df_filtered = df[
    (df['市盈率'] < 30) & 
    (df['ROE'] > 10) &
    (df['总市值'] > 10000000000)
]
print(df_filtered[['代码', '名称', '市盈率', 'ROE', '总市值']].sort_values('ROE', ascending=False).head(20).to_json(orient='records', force_ascii=False))
"
```

### 2.2 高股息筛选

```bash
python3 -c "
import akshare as ak
import json
# 高股息率股票
df = ak.stock_a_indicator()
df_div = df[df['股息率'] > 3]  # 股息率 > 3%
print(df_div[['代码', '名称', '股息率', '市盈率', 'ROE']].sort_values('股息率', ascending=False).head(20).to_json(orient='records', force_ascii=False))
"
```

## 3. 行业筛选

### 3.1 按行业筛选

```bash
python3 -c "
import akshare as ak
import json
# 行业板块列表
df = ak.stock_board_industry_name_em()
print(df[['板块名称', '涨跌幅', '总市值']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 3.2 行业内选股

```bash
python3 -c "
import akshare as ak
import json
# 半导体行业个股
df = ak.stock_board_cons_em(symbol='半导体')
print(df[['代码', '名称', '涨跌幅', '成交量']].head(20).to_json(orient='records', force_ascii=False))
"
```

## 4. 筛选指标说明

| 指标 | 说明 | 优质范围 |
|------|------|----------|
| PE (市盈率) | 股价/每股收益 | < 30 |
| PB (市净率) | 股价/每股净资产 | < 5 |
| ROE | 净资产收益率 | > 10% |
| 净利润增长率 | 同比增长率 | > 10% |
| 股息率 | 年度分红/股价 | > 3% |
| 毛利率 | 毛利/营收 | > 20% |

## 输出格式

```markdown
## A股筛选结果: {筛选条件}

### 筛选条件
- PE < {pe}
- ROE > {roe}%
- 市值 > {market_cap}

### 符合条件的股票
| 代码 | 名称 | PE | PB | ROE | 股息率 | 总市值 |
|------|------|----|----|-----|--------|--------|
| {code} | {name} | {pe} | {pb} | {roe}% | {div}% | {cap}亿 |

### 统计
- 符合条件: {count} 只
- 行业分布: {distribution}

### 数据来源
- Tushare Pro / AKShare
- 筛选时间: {TIME}
```

## 注意事项

- 筛选结果仅供参考，不构成投资建议
- 财务数据可能有延迟
- 考虑流动性风险（小市值股票）
- 注意财务造假风险

Last Updated: 2026-05-07
