---
name: fund-analysis
description: Comprehensive fund analysis workflow for Chinese mutual funds. Triggers on 基金分析, 基金研究, fund analysis, mutual fund research.
triggers:
  - 基金分析
  - 基金研究
  - fund analysis
  - fund research
  - 基金对比
  - fund comparison
  - 基金推荐
  - fund recommendation
---

# Fund Analysis Skill

Comprehensive analysis workflow for Chinese mutual funds (公募基金), combining performance analysis, holdings analysis, and investment recommendations.

## Supported Fund Types

| Type | Chinese | Description |
|------|---------|-------------|
| Stock | 股票型 | Equity funds (≥80% stocks) |
| Mixed | 混合型 | Mixed allocation funds |
| Bond | 债券型 | Bond funds |
| Index | 指数型 | Index tracking funds |
| Money Market | 货币型 | Money market funds |
| QDII | QDII | Overseas investment |

## Step 1: Fund Identification

Use `fund_search` to find fund by name or code:

```
Call: fund_search({ keyword: "易方达消费" })
Or:   fund_search({ keyword: "110022" })
```

**Popular Fund Reference:**
| Name | Code | Type |
|------|------|------|
| 易方达消费行业 | 110022 | 股票型 |
| 招商中证白酒 | 161725 | 指数型 |
| 兴全合润混合 | 163406 | 混合型 |
| 广发双擎升级 | 005911 | 混合型 |
| 中欧医疗健康 | 003095 | 混合型 |
| 诺安成长混合 | 320007 | 混合型 |
| 景顺长城新兴 | 260108 | 混合型 |

## Step 2: Get Fund Details

Use `fund_detail` to get complete fund information:

```
Call: fund_detail({ fund_code: "110022" })
```

This returns:
- Basic info (type, scale, manager, company)
- Net value (unit value, accumulated value)
- Estimated value (实时估算净值)
- Performance history (1M/3M/6M/1Y/3Y/5Y/YTD/All)

## Step 3: Holdings Analysis

Use `fund_holdings` to see top 10 stock holdings:

```
Call: fund_holdings({ fund_code: "110022" })
```

**Why Holdings Matter:**
- Reveals investment strategy
- Shows sector concentration
- Identifies stock-picking ability
- Helps assess risk

## Step 4: Performance Comparison

For multi-fund comparison, call `fund_performance` for each:

```
Call: fund_performance({ fund_code: "110022" })
Call: fund_performance({ fund_code: "161725" })
```

## Step 5: Analysis Report

Structure the final analysis:

```markdown
# [基金名称] ([代码]) 分析报告

## 1. 基本信息
- 类型: [基金类型]
- 规模: [基金规模]
- 经理: [基金经理]
- 公司: [管理公司]
- 成立: [成立日期]

## 2. 业绩表现
| 指标 | 收益率 |
|------|--------|
| 近1月 | [X%] |
| 近3月 | [X%] |
| 近6月 | [X%] |
| 近1年 | [X%] |
| 近3年 | [X%] |
| 今年来 | [X%] |

## 3. 持仓分析
- 重仓行业: [行业1]、[行业2]、[行业3]
- 前十大持仓占比: [X%]
- 集中度: [高/中/低]

## 4. 风险评估
- 波动率: [高/中/低]
- 最大回撤: [X%]
- 夏普比率: [X]

## 5. 投资建议
- 适合人群: [保守/稳健/积极]
- 推荐理由: [简述]
- 风险提示: [注意事项]
```

## Analysis Factors

### Performance Metrics
| Factor | Description | Good Range |
|--------|-------------|------------|
| 近1年收益 | 短期表现 | >20% 优秀 |
| 近3年收益 | 中期表现 | >50% 优秀 |
| 今年来 | 年内表现 | 跟随基准 |
| 夏普比率 | 风险调整收益 | >1.5 优秀 |

### Risk Metrics
| Factor | Description | Good Range |
|--------|-------------|------------|
| 波动率 | 收益稳定性 | <15% 低风险 |
| 最大回撤 | 历史最大亏损 | <20% 低风险 |
| 集中度 | 持仓集中程度 | <50% 较分散 |

### Manager Factors
- 任职时间 (>3年 稳定)
- 管理规模 (10-100亿 适中)
- 风格稳定性 (不漂移)
- 获奖情况 (金牛奖等)

## Common Queries

### Query Types

| User Input | Action | Tool |
|------------|--------|------|
| "分析易方达消费" | Full analysis | fund_detail + fund_holdings |
| "这只基金怎么样" | Quick overview | fund_performance |
| "对比110022和161725" | Side-by-side | fund_performance x2 |
| "推荐几只科技基金" | Recommendations | fund_search + analysis |
| "基金经理是谁" | Manager info | fund_detail |

### Response Templates

**Quick Analysis:**
```
# 基金速览: [名称] ([代码])

📊 业绩: [今年来收益]
📈 近1年: [近1年收益]
📉 风险: [低/中/高]
👤 经理: [经理名] ([任职年限])
🏢 公司: [公司名]
```

**Comparison Table:**
```
| 指标 | 基金A | 基金B |
|------|-------|-------|
| 今年来 | X% | X% |
| 近1年 | X% | X% |
| 近3年 | X% | X% |
| 风险 | 低 | 中 |
```

## Data Sources

- **净值数据**: 天天基金 (fund.eastmoney.com)
- **持仓数据**: 季报披露 (fundf10.eastmoney.com)
- **实时估算**: 天天基金实时估值

## Notes

1. **数据更新**: 净值通常T+1日更新,估算净值盘中实时更新
2. **持仓滞后**: 持仓数据来自季报,可能有3个月延迟
3. **业绩仅供参考**: 过去业绩不代表未来表现
4. **费用注意**: 关注申购费、赎回费、管理费

## Example Query

User: "分析易方达消费行业基金"

Response should include:
1. Basic info (type, scale, manager)
2. Performance table (1M through YTD)
3. Holdings analysis (top stocks, sectors)
4. Risk assessment
5. Investment recommendation

