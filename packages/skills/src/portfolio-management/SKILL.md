---
name: portfolio-management
description: Manage and analyze investment portfolios. Triggers on 组合, portfolio, 持仓分析, portfolio analysis, 投资组合, 资产管理.
triggers:
  - 组合
  - portfolio
  - 持仓分析
  - portfolio analysis
  - 投资组合
  - 资产管理
---

# Portfolio Management Skill

## Overview

Manage and analyze investment portfolios with risk/return analysis, diversification recommendations, and rebalancing suggestions.

## Portfolio Analysis Template

```markdown
# Portfolio Analysis Report

**Portfolio**: [Name/Description]
**Date**: [YYYY-MM-DD]
**Total Value**: [XXX,XXX]
**Cash**: [XXX,XXX]

---

## 1. Portfolio Summary

| Metric | Value |
|--------|-------|
| Total Value | [XXX,XXX] |
| Total Cost | [XXX,XXX] |
| Total Gain/Loss | [+/-XXX,XXX] |
| Return % | [+/-XX.X%] |
| Cash Balance | [XXX,XXX] |
| Cash % | [XX.X%] |

---

## 2. Holdings Breakdown

| Symbol | Shares | Price | Value | Weight | Cost | Gain/Loss | % |
|--------|--------|-------|-------|--------|------|-----------|---|
| [STOCK] | [XXX] | [XXX] | [XXX] | [XX%] | [XXX] | [+/-XXX] | [+/-XX%] |

---

## 3. Sector Allocation

| Sector | Value | Weight | Target | Difference |
|--------|-------|--------|--------|------------|
| [Sector] | [XXX] | [XX%] | [XX%] | [+/-XX%] |

---

## 4. Risk Metrics

| Metric | Value | Benchmark | Status |
|--------|-------|-----------|--------|
| Beta | [X.XX] | 1.00 | [Low/Med/High] |
| Volatility | [XX%] | [XX%] | [Below/Above] |
| Sharpe Ratio | [X.XX] | - | [Good/Fair/Poor] |
| Max Drawdown | [-XX%] | [-XX%] | [Better/Worse] |

---

## 5. Diversification Analysis

### Overweight
- [Sector/Stock] exceeds recommended weight

### Underweight  
- [Sector/Stock] below target allocation

### Concentrated Positions
- [Stock] > 10% of portfolio

---

## 6. Rebalancing Recommendations

| Action | Stock | Current | Target | Shares |
|--------|-------|---------|--------|--------|
| Buy | [XXX] | [XX%] | [XX%] | [+X] |
| Sell | [XXX] | [XX%] | [XX%] | [-X] |

---

## 7. Performance Attribution

| Stock | Contribution | Weight | Return |
|-------|--------------|--------|--------|
| [Stock 1] | [+X.X%] | [XX%] | [+XX%] |
| [Stock 2] | [-X.X%] | [XX%] | [-XX%] |
| Cash | [+X.X%] | [XX%] | - |

---

## 8. Action Items

1. [ ] Rebalance [Sector] allocation
2. [ ] Consider adding [Stock] exposure
3. [ ] Review [High-risk] position
4. [ ] Add diversification to [Sector]
```
