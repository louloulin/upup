---
name: stock-comparison
description: Compare multiple stocks side by side. Triggers on 对比, 比较, compare stocks, stock comparison, 选哪个, which is better.
triggers:
  - 对比
  - 比较
  - compare stocks
  - stock comparison
  - 选哪个
  - which is better
  - 对比分析
---

# Stock Comparison Skill

## Overview

Compare multiple stocks across key metrics to help investment decisions.

## Comparison Template

```markdown
# Stock Comparison Report

**Compared Stocks**: [Stock 1], [Stock 2], [Stock 3]
**Date**: [YYYY-MM-DD]

---

## 1. Summary Comparison

| Metric | [Stock 1] | [Stock 2] | [Stock 3] | Winner |
|--------|------------|-----------|------------|--------|
| Price | [XXX] | [XXX] | [XXX] | [X] |
| P/E | [XX] | [XX] | [XX] | [X] |
| P/B | [XX] | [XX] | [XX] | [X] |
| Market Cap | [XX]B | [XX]B | [XX]B | [X] |
| ROE | [XX]% | [XX]% | [XX]% | [X] |
| Revenue Growth | [XX]% | [XX]% | [XX]% | [X] |
| Dividend Yield | [XX]% | [XX]% | [XX]% | [X] |
| Debt/Equity | [XX] | [XX] | [XX] | [X] |

---

## 2. Valuation Comparison

### P/E Ratio (Lower = Cheaper)
- [Stock 1]: [XX]x → [Above/Below] industry avg ([XX]x)
- [Stock 2]: [XX]x → [Above/Below] industry avg ([XX]x)
- [Stock 3]: [XX]x → [Above/Below] industry avg ([XX]x)

**Winner**: [Stock X] (lowest P/E relative to growth)

### PEG Ratio (Lower = Better Value)
- [Stock 1]: [XX]x
- [Stock 2]: [XX]x  
- [Stock 3]: [XX]x

**Winner**: [Stock X] (lowest PEG)

---

## 3. Growth Comparison

### Revenue Growth (5-Year CAGR)
- [Stock 1]: [XX]% 
- [Stock 2]: [XX]%
- [Stock 3]: [XX]%

**Winner**: [Stock X]

### Profitability
| Metric | [Stock 1] | [Stock 2] | [Stock 3] |
|--------|------------|-----------|------------|
| Gross Margin | [XX]% | [XX]% | [XX]% |
| Operating Margin | [XX]% | [XX]% | [XX]% |
| Net Margin | [XX]% | [XX]% | [XX]% |
| ROE | [XX]% | [XX]% | [XX]% |

**Winner**: [Stock X]

---

## 4. Financial Health

### Leverage
| Metric | [Stock 1] | [Stock 2] | [Stock 3] |
|--------|------------|-----------|------------|
| Debt/Equity | [XX] | [XX] | [XX] |
| Current Ratio | [XX] | [XX] | [XX] |
| Interest Coverage | [XX]x | [XX]x | [XX]x |

**Winner**: [Stock X] (lowest leverage)

---

## 5. Dividend Analysis

| Metric | [Stock 1] | [Stock 2] | [Stock 3] |
|--------|------------|-----------|------------|
| Dividend Yield | [XX]% | [XX]% | [XX]% |
| Payout Ratio | [XX]% | [XX]% | [XX]% |
| 5Y Div Growth | [XX]% | [XX]% | [XX]% |

**Winner**: [Stock X] (best yield + growth)

---

## 6. Technical Comparison

### Price Momentum
| Metric | [Stock 1] | [Stock 2] | [Stock 3] |
|--------|------------|-----------|------------|
| 1M Return | [XX]% | [XX]% | [XX]% |
| 3M Return | [XX]% | [XX]% | [XX]% |
| 6M Return | [XX]% | [XX]% | [XX]% |
| YTD Return | [XX]% | [XX]% | [XX]% |

### Trend Indicators
- [Stock 1]: [Above/Below] 200-MA → [Bullish/Bearish]
- [Stock 2]: [Above/Below] 200-MA → [Bullish/Bearish]
- [Stock 3]: [Above/Below] 200-MA → [Bullish/Bearish]

---

## 7. Overall Recommendation

### Score Summary
| Stock | Valuation | Growth | Profitability | Safety | Dividend | **Total** |
|-------|-----------|--------|---------------|--------|----------|-----------|
| [Stock 1] | [XX] | [XX] | [XX] | [XX] | [XX] | **[XX]** |
| [Stock 2] | [XX] | [XX] | [XX] | [XX] | [XX] | **[XX]** |
| [Stock 3] | [XX] | [XX] | [XX] | [XX] | [XX] | **[XX]** |

### Best For
- **Value Investor**: [Stock X] (lowest P/E, highest dividend)
- **Growth Investor**: [Stock X] (highest growth, best margins)
- **Income Investor**: [Stock X] (highest yield, stable dividends)
- **Conservative**: [Stock X] (lowest leverage, stable earnings)

### Final Recommendation
**Choose [Stock X]** based on [specific reason].
```

## Workflow

1. **Identify Stocks**: Parse stock codes from user input
2. **Parallel Fetch**: Get data for all stocks simultaneously
3. **Calculate Metrics**: Normalize and score
4. **Compare**: Side-by-side analysis
5. **Recommend**: Best stock for user profile

## Usage

```
User: "对比茅台和五粮液"
→ Compare 600519.SH vs 000858.SZ

User: "苹果vs谷歌vs微软,哪个值得买"
→ Compare AAPL vs GOOGL vs MSFT

User: "比亚迪和特斯拉选哪个"
→ Compare 002594.SZ vs TSLA
```
