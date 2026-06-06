---
name: fund-comparison
description: Compare multiple mutual funds side by side. Triggers on 基金对比, fund comparison, 哪个更好, compare funds.
triggers:
  - 基金对比
  - fund comparison
  - 哪个更好
  - compare funds
  - 对比基金
---

# Fund Comparison Skill

Compare multiple mutual funds to help users make informed investment decisions.

## Workflow

### Step 1: Identify Funds to Compare

User wants to compare funds. Can be:
- Specific fund codes: "对比110022和161725"
- Search and compare: "对比易方达和招商基金"
- Auto-suggest: "找出最相似的基金"

### Step 2: Get Fund Data

Call fund_performance for each fund:
```
Call: fund_performance({ fund_code: "110022" })
Call: fund_performance({ fund_code: "161725" })
```

### Step 3: Generate Comparison

Use fund_compare tool:
```
Call: fund_compare({ fund_codes: ["110022", "161725"] })
```

### Step 4: Present Results

Format comparison in clear table with analysis.

## Comparison Dimensions

| Dimension | Description | Key Metrics |
|-----------|-------------|-------------|
| Performance | Historical returns | 1M/3M/6M/1Y/3Y |
| Risk | Volatility | Max drawdown |
| Scale | Fund size | Assets under management |
| Manager | Experience | Tenure, other funds |
| Type | Investment style | 股票型/混合型/债券型 |

## Comparison Template

```markdown
# 基金对比报告

## 基本信息对比
| 基金 | 代码 | 类型 | 规模 | 经理 |
|------|------|------|------|------|

## 业绩对比
| 指标 | 基金A | 基金B | 差异 |
|------|-------|-------|------|

## 风险对比
| 指标 | 基金A | 基金B |
|------|-------|-------|

## 分析结论
- [分析结论]
```

## Common Comparisons

| User Input | Action | Tools |
|------------|--------|-------|
| "对比110022和161725" | Compare 2 funds | fund_performance x2 |
| "对比易方达消费和招商白酒" | Search + compare | fund_search → fund_compare |
| "哪个更好" | Auto-suggest top | fund_top + fund_compare |
| "分析这两只的区别" | Deep comparison | fund_detail + fund_holdings |

## Example Queries

- "对比110022和161725的业绩"
- "易方达消费和招商中证白酒哪个好"
- "帮我对比这三只基金"
- "基金A vs 基金B"

## Data Sources

- **Performance**: 天天基金 (fund.eastmoney.com)
- **Holdings**: 季报披露 (fundf10.eastmoney.com)

## Notes

1. Past performance does not guarantee future returns
2. Consider investment horizon and risk tolerance
3. Diversification is important
4. Fees and expenses affect net returns
