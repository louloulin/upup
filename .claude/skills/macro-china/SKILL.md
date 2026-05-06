---
name: macro-china
description: |
  中国宏观经济数据查询与分析。当用户提到以下内容时必须使用此技能：
  GDP、国内生产总值、经济增长、
  CPI、消费者价格指数、通胀、通货膨胀、物价、
  PPI、生产者价格指数、工业品出厂价格、
  PMI、采购经理指数、制造业PMI、服务业PMI、
  M2、货币供应量、社融、社会融资规模、信贷、
  利率、LPR、MLF、Shibor、国债收益率、
  外汇储备、汇率、人民币汇率、美元兑人民币、
  财政收入、财政支出、税收、
  固定资产投资、房地产投资、基建投资、
  社会消费品零售、进出口、贸易顺差、贸易逆差、
  宏观经济、经济数据、中国经济、
  宏观分析、经济周期、景气度。
  主数据源: Tushare Pro (cn_gdp, cn_cpi, cn_ppi) + AKShare。
context: inherit
user-invocable: true
argument-hint: "宏观指标（例如，GDP、CPI、PMI）"
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/dexter-cache/*)
---

# Macro China Skill

中国宏观经济数据查询与分析。获取 GDP、CPI、PPI、PMI、M2、利率、汇率等核心宏观经济指标。

## 数据源

### 主数据源: Tushare Pro

Tushare Pro 提供结构化的中国宏观经济数据接口，需要 600+ 积分。

- 官方文档: https://tushare.pro/document/2
- Base URL: `https://api.tushare.pro`
- 请求方式: POST JSON

```bash
# 通用请求格式
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{
    "api_name": "{接口名}",
    "token": "'$TUSHARE_TOKEN'",
    "params": { ... },
    "fields": ""
  }' | jq .
```

### 补充数据源: AKShare

- 官方文档: https://akshare.akfamily.xyz/
- 通过 python3 调用，无需 API Key

## 1. GDP（国内生产总值）

### 1.1 GDP 数据

```bash
# Tushare: cn_gdp 接口
# 需要 600+ 积分
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{"api_name":"cn_gdp","token":"'$TUSHARE_TOKEN'","params":{},"fields":""}' | jq '.data | {fields: .fields, items: .items[-8:]}'
```

**返回字段**:
- `quarter`: 季度 (YYYYQM)
- `gdp`: GDP (亿元)
- `gdp_yoy`: 同比增速 (%)

### 1.2 GDP 补充 (AKShare)

```bash
python3 -c "
import akshare as ak
import json
# 季度 GDP 数据
df = ak.macro_china_gdp()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

## 2. CPI（消费者价格指数）

### 2.1 CPI 数据

```bash
# Tushare: cn_cpi 接口
# 需要 600+ 积分
# 返回全国/城镇/农村 CPI
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{"api_name":"cn_cpi","token":"'$TUSHARE_TOKEN'","params":{},"fields":""}' | jq '.data | {fields: .fields, items: .items[-12:]}'
```

**返回字段**:
- `month`: 月份 (YYYYMM)
- `nt_yoy`: 全国同比 (%)
- `n_yoy`: 全国食品同比
- `nn_yoy`: 全国非食品同比

### 2.2 CPI 补充 (AKShare)

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_cpi_yearly()
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

## 3. PPI（生产者价格指数）

### 3.1 PPI 数据

```bash
# Tushare: cn_ppi 接口
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{"api_name":"cn_ppi","token":"'$TUSHARE_TOKEN'","params":{},"fields":""}' | jq '.data | {fields: .fields, items: .items[-12:]}'
```

### 3.2 PPI 补充 (AKShare)

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_ppi_yearly()
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

## 4. PMI（采购经理指数）

### 4.1 制造业 PMI

```bash
python3 -c "
import akshare as ak
import json
# 制造业 PMI
df = ak.macro_china_pmi()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 4.2 PMI 分项数据

```bash
python3 -c "
import akshare as ak
import json
# 制造业 PMI 分项
df = ak.macro_china_pmi_yearly()
print(df.tail(20).to_json(orient='records', force_ascii=False))
"
```

**PMI 解读**:
- PMI > 50: 制造业扩张
- PMI < 50: 制造业收缩
- PMI = 50: 临界点

## 5. 货币与信贷

### 5.1 M2 货币供应量

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_money_supply()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 5.2 社会融资规模

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_shrzgm()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 5.3 LPR 利率

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_lpr()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 5.4 Shibor 利率

```bash
python3 -c "
import akshare as ak
import json
df = ak.rate_interbank(market='上海银行间同业拆放利率', symbol='Shibor', indicator='1周')
print(df.tail(10).to_json(orient='records', force_ascii=False))
"
```

### 5.5 国债收益率

```bash
python3 -c "
import akshare as ak
import json
# 中国国债收益率曲线
df = ak.bond_china_yield(start_date='20240101', end_date='20241231')
print(df.tail(10).to_json(orient='records', force_ascii=False))
"
```

## 6. 汇率与外汇

### 6.1 人民币汇率

```bash
# Tushare: 人民币汇率
curl -s -X POST "https://api.tushare.pro" \
  -H "Content-Type: application/json" \
  -d '{"api_name":"fx_daily","token":"'$TUSHARE_TOKEN'","params":{"currency":"USD/CNY","start_date":"20241201"},"fields":""}' | jq '.data | {fields: .fields, items: .items[:10]}'
```

### 6.2 外汇储备

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_foreign_exchange()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

## 7. 财政与贸易

### 7.1 财政收支

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_fiscal_revenue()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 7.2 进出口贸易

```bash
python3 -c "
import akshare as ak
import json
# 进出口数据
df = ak.macro_china_trade_balance()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

## 8. 投资与消费

### 8.1 固定资产投资

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_fixed_asset_investment()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 8.2 社会消费品零售

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_consumer_goods_retail()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

### 8.3 房地产数据

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_real_estate()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

## 9. 综合景气指数

### 9.1 宏观经济景气指数

```bash
python3 -c "
import akshare as ak
import json
df = ak.macro_china_composite_index()
print(df.tail(12).to_json(orient='records', force_ascii=False))
"
```

## 宏观分析框架

### 对股市的影响路径

| 宏观指标 | 影响方向 | 传导路径 |
|---------|---------|---------|
| GDP 增速 | 正相关 | 企业盈利→股价 |
| CPI | 中性偏负 | 通胀→货币政策收紧 |
| PPI | 正相关 | 工业品价格→企业利润 |
| PMI | 正相关 | 经济景气→市场信心 |
| M2 | 正相关 | 流动性→估值提升 |
| LPR 下调 | 正相关 | 融资成本降低→企业盈利 |
| 人民币贬值 | 混合 | 出口受益/资本外流 |

### 关键阈值

| 指标 | 关注阈值 | 含义 |
|------|---------|------|
| GDP 增速 | 5% | 政府目标增速 |
| CPI | 3% | 央行通胀目标 |
| PMI | 50 | 扩张/收缩分界线 |
| M2 增速 | 10% | 流动性宽松标准 |
| 社融增速 | 10% | 信用扩张标准 |

## 输出格式

```markdown
## 中国宏观经济数据: {主题}

### 概览
- 数据时段: {起止日期}
- 关键指标: {1-2 个核心数据}

### 详细数据
| 指标 | 最新值 | 上期值 | 同比变化 |
|------|--------|--------|---------|
| GDP 增速 | | | |
| CPI | | | |
| PMI | | | |

### 趋势分析
- {趋势描述}

### 对 A 股的影响
- 利好: {因素}
- 利空: {因素}
- 关注要点: {建议}

### 数据来源
- Tushare Pro / AKShare
- 数据更新时间: {TIME}
```

## 注意事项

- 宏观数据通常按月/季度发布，存在滞后性
- GDP 数据按季度发布，CPI/PPI 按月发布
- PMI 每月最后一天或次月 1 日发布
- M2/社融数据每月中旬发布
- 关注国家统计局 (stats.gov.cn) 发布时间表
- Tushare 宏观接口需要 600+ 积分
