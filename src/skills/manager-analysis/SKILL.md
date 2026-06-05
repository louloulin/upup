---
name: manager-analysis
description: Analyze fund manager performance and track record. Triggers on 基金经理分析, manager analysis, 基金经理, 经理业绩, 谁管理这只基金.
description.zh-CN: 基金经理业绩与履历分析。触发关键词: 基金经理分析, manager analysis, 基金经理, 经理业绩, 谁管理这只基金.
triggers:
  - 基金经理分析
  - manager analysis
  - 基金经理
  - 经理业绩
  - 谁管理这只基金
  - 经理是谁
---

# Manager Analysis Skill

Analyze fund managers to evaluate their track record, management style, and investment decisions.

## Workflow

### Step 1: Identify the Fund

User asks about a manager. Get fund code:
- "110022的基金经理是谁"
- "分析易方达消费的基金经理"

```
Call: fund_search({ keyword: "易方达消费" })
Call: fund_detail({ fund_code: "110022" })  # Contains manager info
```

### Step 2: Get Manager Info

```
Call: fund_manager({ fund_code: "110022" })
```

### Step 3: Get Related Funds

Managers often manage multiple funds. Get info for comparison:
```
Call: fund_performance({ fund_code: "[other fund code]" })
```

### Step 4: Analyze Track Record

**Evaluation Dimensions:**

| Dimension | Metrics | Good |
|-----------|---------|------|
| Tenure | Years managing | >3 years stable |
| Returns | 1Y/3Y/5Y | Consistent positive |
| Risk | Max drawdown | <20% |
| Style | Sector allocation | Not drifting |
| Awards | Morningstar/金牛奖 | Recognized |

### Step 5: Present Analysis

```markdown
# 基金经理分析报告

## 基金经理信息
- 姓名: [name]
- 任职公司: [company]
- 任职时间: [years]年
- 管理基金数: [count]只

## 业绩表现
| 基金 | 代码 | 近1年 | 近3年 | 评级 |
|------|------|-------|-------|------|
| [A] | xxx | +X% | +Y% | ⭐⭐⭐ |
| [B] | xxx | +X% | +Y% | ⭐⭐⭐ |

## 管理风格分析
- 行业偏好: [sectors]
- 持仓集中度: [high/medium/low]
- 换手率: [high/medium/low]

## 风险评估
- 波动率: [level]
- 最大回撤: [X%]
- 夏普比率: [X]

## 综合评价
[Detailed analysis]

## 投资建议
- 适合人群: [conservative/balanced/aggressive]
- 优势: [strengths]
- 风险提示: [cautions]
```

## Common Queries

| User Input | Action | Tools |
|------------|--------|-------|
| "110022基金经理是谁" | Get manager | fund_manager |
| "分析这个经理" | Full analysis | fund_manager + fund_performance |
| "这个经理业绩怎么样" | Performance | fund_performance |
| "经理管理哪些基金" | Related funds | fund_manager (funds list) |
| "比较两个经理" | Comparison | fund_manager x2 |

## Manager Red Flags

⚠️ **Warning Signs:**
- Frequent style drift (风格漂移)
- Recent large drawdowns
- High turnover (频繁换手)
- Multiple fund collapse
- Short tenure + high volatility

✅ **Positive Signs:**
- Stable tenure (>5 years)
- Consistent outperformance
- Low drawdown
- Award recognition
- Clear investment philosophy

## Example Queries

- "分析110022的基金经理萧楠"
- "张坤管理的基金有哪些"
- "比较易方达消费的经理和其他经理"
- "这个基金经理业绩怎么样"

## Data Sources

- **Manager Info**: 天天基金 (fund.eastmoney.com)
- **Fund Performance**: 天天基金
- **Awards**: 晨星/天天基金评级

## Tips

1. **Look Beyond Returns**: Good managers have consistent, not spectacular, returns
2. **Check Different Periods**: Short-term luck vs long-term skill
3. **Understand Style**: Growth vs Value vs Blend
4. **Consider Team**: Some managers work with analysts
5. **Check For Fund Size**: Large funds harder to manage
