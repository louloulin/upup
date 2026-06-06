---
name: sentiment-analysis
description: Analyze market sentiment and news for stocks. Triggers on 舆情, 情绪, sentiment, 新闻分析, news analysis, 市场情绪.
description.zh-CN: 个股市场情绪与新闻分析。触发关键词: 舆情, 情绪, sentiment, 新闻分析, news analysis, 市场情绪.
triggers:
  - 舆情
  - 情绪
  - sentiment
  - 新闻分析
  - news analysis
  - 市场情绪
  - 消息面
---

# Stock Sentiment Analysis Skill

## Overview

Analyze market sentiment from multiple sources:
- News articles
- Company announcements
- Social media
- Analyst reports

## Sentiment Score Methodology

| Score | Label | Description |
|-------|-------|-------------|
| 80-100 | Very Positive | Strong bullish signals |
| 60-79 | Positive | Bullish bias |
| 40-59 | Neutral | Mixed signals |
| 20-39 | Negative | Bearish bias |
| 0-19 | Very Negative | Strong bearish signals |

## Weighted Sentiment Model

```
Final Score = News(40%) + Announcements(30%) + Social(20%) + Analyst(10%)
```

| Source | Weight | Description |
|--------|--------|-------------|
| News | 40% | Financial news headlines |
| Announcements | 30% | Company disclosures |
| Social | 20% | Market discussions |
| Analyst | 10% | Analyst ratings/changes |

## Analysis Template

```markdown
# Sentiment Analysis Report

**Stock**: [Name] ([Code])
**Date**: [YYYY-MM-DD]
**Overall Score**: [XX]/100 ([Label])

---

## 1. News Sentiment (Weight: 40%)

### Recent Headlines
| Date | Headline | Sentiment |
|------|----------|-----------|
| [Date] | [Headline 1] | [Positive/Negative/Neutral] |
| [Date] | [Headline 2] | [Positive/Negative/Neutral] |
| [Date] | [Headline 3] | [Positive/Negative/Neutral] |

**News Score**: [XX]/100

### Key Themes
- [Theme 1]
- [Theme 2]
- [Theme 3]

---

## 2. Announcement Sentouncements (Weight: 30%)

### Recent Fililings
| Date | Type | Content | Impact |
|------|------|---------|--------|
| [Date] | [Annual/Quarterly/Other] | [Summary] | [Positive/Negative/Neutral] |

**Announcements Score**: [XX]/100

---

## 3. Social Sentiment (Weight: 20%)

### Platforms
| Platform | Sentiment | Volume | Trend |
|----------|-----------|--------|-------|
| [Platform 1] | [XX]% positive | [Volume] | [Up/Down] |
| [Platform 2] | [XX]% positive | [Volume] | [Up/Down] |

**Social Score**: [XX]/100

---

## 4. Analyst Sentiment (Weight: 10%)

### Rating Summary
| Rating | Count |
|--------|-------|
| Strong Buy | [X] |
| Buy | [X] |
| Hold | [X] |
| Sell | [X] |
| Strong Sell | [X] |

### Price Targets
- Average Target: [XXX]
- High Target: [XXX]
- Low Target: [XXX]
- Current Price: [XXX]

**Analyst Score**: [XX]/100

---

## 5. Sentiment Breakdown

| Source | Score | Weight | Weighted |
|--------|-------|--------|----------|
| News | [XX] | 40% | [XX] |
| Announcements | [XX] | 30% | [XX] |
| Social | [XX] | 20% | [XX] |
| Analyst | [XX] | 10% | [XX] |
| **Final** | - | 100% | **[XX]** |

---

## 6. Sentiment Trend

| Period | Score | Change |
|--------|-------|--------|
| Today | [XX] | - |
| 1 Week Ago | [XX] | [+/-XX] |
| 1 Month Ago | [XX] | [+/-XX] |
| 3 Months Ago | [XX] | [+/-XX] |

**Trend**: [Improving/Stable/Declining]

---

## 7. Key Sentiment Drivers

### Positive Factors
1. [Factor 1]
2. [Factor 2]

### Negative Factors
1. [Factor 1]
2. [Factor 2]

---

## 8. Investment Implications

### Short-term (1-4 weeks)
- Sentiment is [Positive/Negative/Neutral]
- [Expected price action]

### Medium-term (1-3 months)
- [Outlook based on sentiment]

### Risk Factors
- [Any negative sentiment to watch]
```

## Workflow

1. **Collect News**: Fetch from financial news APIs
2. **Parse Announcements**: Extract from company filings
3. **Social Listening**: Gather social media signals
4. **Analyst Data**: Get ratings and price targets
5. **Score & Weight**: Calculate weighted sentiment
6. **Trend Analysis**: Compare with historical

## Sentiment Indicators

### Bullish Signals
- Upgrades, price target increases
- Positive earnings surprises
- New contracts, partnerships
- Insider buying
- Short squeeze indicators

### Bearish Signals
- Downgrades, price target cuts
- Earnings misses
- Legal/regulatory issues
- Insider selling
- High short interest

## Usage

```
User: "茅台最近的舆情怎么样"
→ Analyze sentiment for 600519.SH

User: "苹果公司新闻情绪分析"
→ Generate sentiment report for AAPL

User: "特斯拉市场情绪"
→ Analyze TSLA sentiment across sources
```
