---
name: research-report
description: Generate comprehensive investment research reports. Triggers on 研究报告, 生成报告, research report, investment report, 分析报告, 深度报告.
triggers:
  - 研究报告
  - 生成报告
  - investment report
  - 分析报告
  - 深度报告
  - comprehensive analysis
---

# Investment Research Report Generator

## Overview

This skill generates institutional-grade investment research reports combining:
- Technical Analysis
- Fundamental Analysis  
- News & Sentiment
- Risk Assessment

## Report Template

```markdown
# [Stock Name] ([Code]) Investment Research Report

**Report Date**: [YYYY-MM-DD]
**Analyst**: UpUp AI

---

## 1. Executive Summary

**Recommendation**: BUY / HOLD / SELL
**Confidence**: [XX]%
**Target Price**: [XXX]
**Current Price**: [XXX]
**Upside/Downside**: [+/-XX%]

**Key Points**:
- [Point 1]
- [Point 2]
- [Point 3]

---

## 2. Technical Analysis

### Price Trend
- Current Price: [XXX]
- 20-Day MA: [XXX]
- 50-Day MA: [XXX]
- 200-Day MA: [XXX]

### Technical Signals
| Indicator | Signal | Value |
|-----------|--------|-------|
| RSI(14) | [Overbought/Neutral/Oversold] | [XX] |
| MACD | [Bullish/Bearish] | [Diff: XX, Signal: XX] |
| Bollinger | [Upper/Middle/Lower] Band | [XXX/XXX/XXX] |

### Support/Resistance
- Support: [XXX], [XXX]
- Resistance: [XXX], [XXX]

---

## 3. Fundamental Analysis

### Valuation Metrics
| Metric | Value | Industry Avg | vs Average |
|---------|-------|--------------|-------------|
| P/E | [XX] | [XX] | [+/-XX%] |
| P/B | [XX] | [XX] | [+/-XX%] |
| P/S | [XX] | [XX] | [+/-XX%] |
| EV/EBITDA | [XX] | [XX] | [+/-XX%] |

### Financial Highlights
- Market Cap: [XXX]B
- Revenue (TTM): [XXX]B
- Net Income: [XXX]B
- ROE: [XX]%
- Debt/Equity: [XX]%

---

## 4. News & Sentiment

### Recent News
1. [Date] - [Headline]
2. [Date] - [Headline]
3. [Date] - [Headline]

### Sentiment Score
- Overall: [Positive/Neutral/Negative]
- Score: [XX/100]

---

## 5. Risk Assessment

### Key Risks
1. **Risk 1**: [Description]
2. **Risk 2**: [Description]

### Risk Level: [Low/Medium/High]

---

## 6. Investment Recommendation

| Time Horizon | Recommendation | Target Price | Stop Loss |
|--------------|-----------------|--------------|-----------|
| Short (1-3M) | [BUY/HOLD/SELL] | [XXX] | [XXX] |
| Medium (3-12M) | [BUY/HOLD/SELL] | [XXX] | [XXX] |

**Rationale**:
- [Reason 1]
- [Reason 2]
```

## Workflow

1. **Gather Data**: Call financial APIs in parallel
2. **Analyze**: Process technical + fundamental data
3. **Synthesize**: Combine insights
4. **Report**: Generate structured markdown

## Usage

```
User: "生成贵州茅台的研究报告"
→ Use this skill to generate comprehensive report

User: "帮我分析苹果公司的投资价值"
→ Use this skill for full analysis

User: "AAPL research report"
→ Use this skill for institutional-grade report
```
