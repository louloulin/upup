---
name: value-investing
description: Value investing analysis. Triggers on 价值投资, value investing, 低估值, undervalued, 估值修复, value stocks, 格雷厄姆.
description.zh-CN: 价值投资分析。触发关键词: 价值投资, value investing, 低估值, undervalued, 估值修复, value stocks, 格雷厄姆.
triggers:
  - 价值投资
  - value investing
  - 低估值
  - undervalued
  - 估值修复
  - value stocks
  - 格雷厄姆
---

# Value Investing Analysis Skill

## Overview

Analyze stocks using value investing principles: intrinsic value, margin of safety, and long-term perspective.

## Value Investing Metrics

| Metric | Value Investing Threshold |
|--------|------------------------|
| P/E | < 15 |
| P/B | < 1.5 |
| P/S | < 1 |
| EV/EBITDA | < 10 |
| Dividend Yield | > 2% |
| Debt/Equity | < 50% |
| ROE | > 15% |

## Value Analysis Template

```markdown
# Value Investing Analysis Report

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]

---

## 1. Value Score

| Metric | Value | Threshold | Score |
|--------|-------|-----------|-------|
| P/E | [XX]x | < 15 | [✓/✗] |
| P/B | [XX]x | < 1.5 | [✓/✗] |
| P/S | [XX]x | < 1 | [✓/✗] |
| EV/EBITDA | [XX]x | < 10 | [✓/✗] |
| Div Yield | [X.X%] | > 2% | [✓/✗] |
| Debt/Eq | [X.X] | < 0.5 | [✓/✗] |
| ROE | [XX%] | > 15% | [✓/✗] |

**Value Score**: [X/7] factors pass

---

## 2. Intrinsic Value Estimates

### DCF Model
| Input | Value |
|-------|-------|
| FCF | [XXX]M |
| Growth Rate | [X.X%] |
| WACC | [X.X%] |
| Terminal Growth | [X.X%] |
| **Intrinsic Value** | [XXX] |

### Relative Valuation
| Method | Value | vs Current |
|--------|-------|------------|
| Graham Formula | [XXX] | [+XX%] |
| PEG Ratio | [XX]x | [< 1.5] |
| Net Net | [XXX] | [+XX%] |

---

## 3. Margin of Safety

| Metric | Value |
|--------|-------|
| Current Price | [XXX] |
| Intrinsic Value | [XXX] |
| **Margin of Safety** | [XX%] |

**Interpretation**:
- > 30%: [Excellent]
- 20-30%: [Good]
- 10-20%: [Fair]
- < 10%: [Limited]

---

## 4. Quality Check

### Financial Strength
| Metric | Value | Status |
|--------|-------|--------|
| Current Ratio | [X.XX] | [✓/✗] |
| Quick Ratio | [X.XX] | [✓/✗] |
| Interest Coverage | [XX]x | [✓/✗] |

### Profitability
| Metric | Value | Status |
|--------|-------|--------|
| ROE | [XX%] | [✓/✗] |
| ROIC | [XX%] | [✓/✗] |
| Net Margin | [XX%] | [✓/✗] |

---

## 5. Value Traps Check

### Warning Signs
- [ ] Declining ROE
- [ ] Increasing debt
- [ ] Shrinking market share
- [ ] Industry decline
- [ ] Management issues

### Green Flags
- [ ] Buybacks
- [ ] Dividend increases
- [ ] Expanding margins
- [ ] Market share gains

---

## 6. Investment Recommendation

### Value Assessment
- **Intrinsic Value**: [XXX]
- **Margin of Safety**: [XX%]
- **Value Score**: [X/7]

### Recommendation
| Horizon | Recommendation | Rationale |
|---------|----------------|-----------|
| Short | [BUY/HOLD] | [Reason] |
| Medium | [BUY/HOLD] | [Reason] |
| Long | [BUY/HOLD] | [Reason] |
```
