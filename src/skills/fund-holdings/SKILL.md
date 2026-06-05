---
name: fund-holdings
description: Analyze fund stock holdings and sector allocation. Triggers on 基金持仓, holdings analysis, 重仓股, 行业分布, 持仓分析.
description.zh-CN: 基金持仓和行业配置分析。触发关键词: 基金持仓, holdings analysis, 重仓股, 行业分布, 持仓分析.
triggers:
  - 基金持仓
  - holdings analysis
  - 重仓股
  - 行业分布
  - 持仓分析
  - 前十大持仓
---

# Fund Holdings Analysis Skill

Analyze a fund's stock holdings to understand its investment strategy, sector allocation, and stock-picking decisions.

## Workflow

### Step 1: Get Holdings Data

User asks about holdings:
- "110022持仓有哪些"
- "这只基金重仓哪些股票"

```
Call: fund_holdings({ fund_code: "110022" })
```

### Step 2: Analyze Holdings Structure

**Key Metrics:**
| Metric | Description | Good Range |
|--------|-------------|------------|
| Top 10 % | 前十占比 | 40-60% |
| Stock Count | 持股数量 | 30-100 |
| Sector | 行业集中度 | <30% single |

### Step 3: Get Sector Analysis

For deeper analysis:
```
Call: fund_detail({ fund_code: "110022" })
```

### Step 4: Cross-Reference

Check if multiple funds hold same stocks (institutional ownership):
```
Call: fund_holdings({ fund_code: "161725" })  # Compare
```

### Step 5: Present Analysis

```markdown
# 基金持仓分析报告

## 基本信息
- 基金: [name] ([code])
- 报告期: [date] (季报披露有3个月延迟)
- 前十占比: [X%]

## 重仓股票 (Top 10)
| 排名 | 股票 | 代码 | 占比 | 变化 |
|------|------|------|------|------|
| 1 | [name] | [code] | X% | 新进/增持/减持 |

## 行业分布
| 行业 | 占比 | 趋势 |
|------|------|------|
| 食品饮料 | 35% | ↑ |
| 医药 | 20% | ↓ |

## 持仓特征分析
- 集中度: [high/medium/low]
- 风格: [growth/value/balanced]
- 换手: [high/medium/low]

## 投资价值评估
- 选股能力: [优秀/良好/一般]
- 行业配置: [合理/偏配]
- 风险: [高/中/低]
```

## Holdings Interpretation

### Top 10 Concentration
| 占比 | 集中度 | 风险 |
|------|--------|------|
| >60% | 高 | 高 |
| 40-60% | 中 | 中 |
| <40% | 低 | 低 |

### Sector Allocation
- **集中**: 单行业>40% → 高风险高回报
- **分散**: 5+行业各<20% → 低风险稳定

### Change Indicators
| 符号 | 含义 |
|------|------|
| ↑ | 新进前十大 |
| ↑ | 增持 |
| ↓ | 减持 |
| - | 持平 |

## Common Queries

| User Input | Action | Tools |
|------------|--------|-------|
| "110022重仓哪些股票" | Get top holdings | fund_holdings |
| "持仓分析" | Full analysis | fund_holdings + fund_detail |
| "行业分布" | Sector analysis | fund_holdings (deduce) |
| "和161725对比持仓" | Compare holdings | fund_holdings x2 |

## Holdings Red Flags

⚠️ **Warning Signs:**
- Sudden sector concentration change
- High turnover in short period
- Holding illiquid small caps
- Concentrated position (>10% single stock)

✅ **Positive Signs:**
- Consistent sector allocation
- Diversified holdings
- Value stocks in portfolio
- Low correlation between holdings

## Example Queries

- "分析易方达消费的重仓股"
- "110022持仓了哪些白酒股"
- "对比招商白酒和易方达消费的持仓"
- "这只基金行业集中度怎么样"

## Data Sources

- **Holdings**: 季报披露 (fundf10.eastmoney.com)
- **Analysis**: 基于持仓数据推断

## Important Notes

1. **Data Delay**: 持仓数据来自季报，有3个月延迟
2. **Partial View**: 只有前10大持仓，非全部
3. **Size Changes**: 实际持仓可能已变化
4. **Sector Classification**: 行业分类可能有误差

## Portfolio Concentration Tips

- **High Concentration** (>60%): Aggressive, high beta
- **Medium Concentration** (40-60%): Balanced
- **Low Concentration** (<40%): Defensive, diversification
