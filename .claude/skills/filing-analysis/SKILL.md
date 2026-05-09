---
name: filing-analysis
description: |
  SEC Filing Analysis. 当用户询问美股公告、SEC文件、10-K、10-Q、8-K时必须使用此技能：
  年报、季报、财务报告、招股说明书、SEC文件分析、
  8-K重大事件、DEF 14A委托声明书。
  支持 SEC EDGAR API + AKShare。
context: inherit
user-invocable: true
argument-hint: "股票代码或公司名称（例如，AAPL、苹果）"
model: sonnet
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# SEC Filing Analysis Skill

美股 SEC 文件分析与查询。

## 数据源

### SEC EDGAR

```bash
# SEC EDGAR API - 获取公司文件列表
curl -s "https://data.sec.gov/submissions/CIK$(python3 -c "print(str(320193).zfill(10))").json" | jq '.filings.recent'
```

### AKShare

```bash
python3 -c "
import akshare as ak
import json

# 美股财报
df = ak.stock_us_financial_report()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 文件查询

### 1.1 公司最新文件

```bash
python3 -c "
import akshare as ak
import json
# 美股公告
df = ak.stock_us_disclosure_report_em(symbol='AAPL')
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

### 1.2 SEC EDGAR 直接查询

```bash
# 获取 Apple (CIK: 0000320193) 最新文件
curl -s "https://data.sec.gov/submissions/CIK0000320193.json" | jq '.filings.recent | .accessNumber[0:5], .form[0:5], .filingDate[0:5]'
```

## 2. 文件类型说明

| 表格 | 含义 | 频率 |
|------|------|------|
| 10-K | 年报 | 每年 |
| 10-Q | 季报 | 每季度 |
| 8-K | 重大事件 | 事件驱动 |
| DEF 14A | 委托声明 | 年度会议前 |
| S-1 | 招股说明书 | IPO前 |
| 13F | 机构持仓 | 每季度 |

## 3. 财务报告分析

### 3.1 财务指标对比

```bash
python3 -c "
import akshare as ak
import json
# 美股财务指标
df = ak.stock_us_financial_analysis_indicator(symbol='AAPL')
print(df[['日期', '市盈率TTM', '市净率', 'ROE', '毛利率']].tail(8).to_json(orient='records', force_ascii=False))
"
```

### 3.2 财报日历

```bash
python3 -c "
import akshare as ak
# 美股财报发布日程
df = ak.stock_us_disclosure_report_date()
print(df.head(20).to_json(orient='records', force_ascii=False))
"
```

## 4. 案例分析

### 4.1 Apple 10-K 分析

```bash
# 下载 Apple 最新 10-K
curl -s "https://data.sec.gov/submissions/CIK0000320193.json" | jq '.filings.recent' | head -50
```

## 输出格式

```markdown
## SEC Filing Analysis: {公司名称}

### 最新文件
| 日期 | 表格 | 描述 |
|------|------|------|
| {date} | {form} | {description} |

### 财报季报
| 季度 | 营收 | 净利润 | EPS |
|------|------|--------|-----|
| {q1} | {rev} | {ni} | {eps} |

### 重大事件 (8-K)
| 日期 | 事件类型 | 描述 |
|------|----------|------|
| {date} | {type} | {desc} |

### 数据来源
- SEC EDGAR
- 数据更新时间: {TIME}
```

## 注意事项

- SEC 文件通常在提交后1-2天可查
- 10-K 年报在财年结束后60天内提交
- 10-Q 季报在季度结束后40天内提交
- 8-K 需在重大事件后4天内提交

Last Updated: 2026-05-07
