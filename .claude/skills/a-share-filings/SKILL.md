---
name: a-share-filings
description: |
  A股公告与监管文件。当用户询问以下内容时必须使用此技能：
  公告、临时公告、定期报告、年报、季报、监事会公告、
  交易所问询函、监管文件。
  支持 Tushare Pro + AKShare。
context: inherit
user-invocable: true
argument-hint: "股票代码或名称（例如，贵州茅台、600519）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/dexter-cache/*)
---

# A-Share Filings Skill

A 股公告与监管文件查询。

## 数据源

### AKShare

```bash
python3 -c "
import akshare as ak
import json

# A股公告
df = ak.stock_zh_a_disclosure_report_em()
print(df.head(10).to_json(orient='records', force_ascii=False))
"
```

## 1. 公告查询

### 1.1 最新公告

```bash
python3 -c "
import akshare as ak
import json
# A股公告
df = ak.stock_zh_a_disclosure_report_em()
print(df[['股票代码', '股票名称', '公告标题', '公告类型', '公告日期']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 1.2 个股公告

```bash
python3 -c "
import akshare as ak
import json
# 个股公告历史
df = ak.stock_notice_report_em(symbol='600519')
print(df[['公告日期', '公告标题', '公告类型']].tail(20).to_json(orient='records', force_ascii=False))
"
```

## 2. 定期报告

### 2.1 年报季报

```bash
python3 -c "
import akshare as ak
import json
# 财报披露时间
df = ak.stock_report_disclosure_em(symbol='600519')
print(df.tail(8).to_json(orient='records', force_ascii=False))
"
```

### 2.2 财报预约

```bash
python3 -c "
import akshare as ak
import json
# 财报预约
df = ak.stock_report预约_em()
print(df[['股票代码', '股票名称', '预约财报', '预约日期']].head(20).to_json(orient='records', force_ascii=False))
"
```

## 3. 监管文件

### 3.1 问询函

```bash
python3 -c "
import akshare as ak
import json
# 问询函
df = ak.stock_enquiry_em()
print(df[['公司', '问询类型', '日期']].head(20).to_json(orient='records', force_ascii=False))
"
```

### 3.2 监管关注

```bash
python3 -c "
import akshare as ak
import json
# 监管关注函
df = ak.stock_supervise_em()
print(df.head(20).to_json(orient='records', force_ascii=False))
"
```

## 4. 公告类型

| 类型 | 代码 | 说明 |
|------|------|------|
| 临时公告 | 001 | 重要事项公告 |
| 定期报告 | 002 | 年报、半年报、季报 |
| 董事会公告 | 003 | 决议公告 |
| 监事会公告 | 004 | 监事会决议 |
| 股东大会 | 005 | 会议通知/决议 |
| 增发配股 | 006 | 融资相关 |
| 风险警示 | 007 | *ST、ST公告 |

## 输出格式

```markdown
## A股公告: {公司名称}

### 最新公告
| 日期 | 标题 | 类型 |
|------|------|------|
| {date} | {title} | {type} |

### 定期报告
| 报告期 | 发布日期 | 状态 |
|--------|----------|------|
| {period} | {date} | {status} |

### 监管文件
| 日期 | 类型 | 内容 |
|------|------|------|
| {date} | {type} | {content} |

### 数据来源
- 上交所/深交所
- 数据更新时间: {TIME}
```

## 注意事项

- 公告通常在交易日收盘后发布
- 定期报告需在规定期限内披露
- 重大事项需停牌披露
- 问询函回复需在规定时间内完成

Last Updated: 2026-05-07
