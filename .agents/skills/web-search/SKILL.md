---
name: web-search
description: |
  Web Search. 当用户需要搜索金融信息时使用此技能：
  搜索新闻、搜索公告、搜索分析师观点、搜索行业报告、
  搜索宏观经济数据、搜索公司信息。
  支持 Exa, Perplexity, Tavily 等搜索API。
context: inherit
user-invocable: true
argument-hint: "搜索关键词（例如，茅台 2024 业绩 分析师）"
model: haiku
allowed-tools:
  - Bash(curl*)
  - Bash(python3*)
  - Read
  - Write(/tmp/upup-cache/*)
---

# Web Search Skill

金融信息搜索。支持多种搜索API。

## 数据源

### Exa Search

```bash
# Exa API 搜索
curl -s -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXASEARCH_API_KEY" \
  -d '{"query":"中国GDP 2024", "numResults":5}' | jq .
```

### Tavily Search

```bash
# Tavily API 搜索
curl -s -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d '{"api_key":"'$TAVILY_API_KEY'", "query":"贵州茅台 最新消息", "max_results":5}'
```

## 1. 搜索类型

### 1.1 金融新闻搜索

```bash
python3 -c "
import os
# Exa 金融新闻
import requests
response = requests.post(
    'https://api.exa.ai/search',
    headers={'Authorization': f'Bearer {os.getenv(\"EXASEARCH_API_KEY\")}'},
    json={
        'query': '中国科技股 最新 分析师观点',
        'numResults': 10,
        'type': 'news'
    }
)
print(response.json())
"
```

### 1.2 行业研究搜索

```bash
python3 -c "
import os
import requests
# 搜索行业报告
response = requests.post(
    'https://api.exa.ai/search',
    headers={'Authorization': f'Bearer {os.getenv(\"EXASEARCH_API_KEY\")}'},
    json={
        'query': '新能源汽车 行业分析 2024 研报',
        'numResults': 10,
        'type': 'article'
    }
)
print(response.json())
"
```

## 2. 搜索策略

### 2.1 A股中文搜索

```bash
# 使用 Tavily 搜索A股信息
curl -s -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "'$TAVILY_API_KEY'",
    "query": "宁德时代 业绩预告 2024",
    "max_results": 10,
    "searchDepth": "advanced"
  }'
```

### 2.2 美股英文搜索

```bash
# Exa 搜索美股信息
curl -s -X POST "https://api.exa.ai/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EXASEARCH_API_KEY" \
  -d '{
    "query": "Tesla earnings report Q4 2024 analysis",
    "numResults": 10,
    "type": "auto"
  }'
```

## 3. 搜索关键词优化

### 3.1 A股搜索关键词

| 场景 | 关键词示例 |
|------|-----------|
| 业绩公告 | "{公司} {年份} {业绩/营收/利润}" |
| 行业分析 | "{行业} {2024} {分析/前景/趋势}" |
| 公告 | "{公司} {公告/公告解读}" |
| 研报 | "{公司/行业} {研报/深度报告}" |

### 3.2 美股搜索关键词

| 场景 | 关键词示例 |
|------|-----------|
| 财报 | "{公司} {Q4 2024} {earnings report}" |
| 新闻 | "{公司} {latest news} {stock}" |
| 分析 | "{公司} {analysis} {investment}" |
| SEC文件 | "{公司} {SEC filing} {10-K}" |

## 输出格式

```markdown
## 搜索结果: {关键词}

### 相关新闻
1. {title}
   - 来源: {source}
   - 日期: {date}
   - 摘要: {snippet}

2. ...

### 相关研报
1. {title}
   - 来源: {source}
   - 日期: {date}
   - 摘要: {snippet}

### 数据来源
- {search_engine}
- 搜索时间: {TIME}
```

## 注意事项

- Exa API 需要 `EXASEARCH_API_KEY`
- Tavily API 需要 `TAVILY_API_KEY`
- Perplexity API 需要 `PERPLEXITY_API_KEY`
- 搜索结果可能有时效性

Last Updated: 2026-05-07
