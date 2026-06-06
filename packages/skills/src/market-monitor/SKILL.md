---
name: market-monitor
description: Real-time market monitoring and alerts. Triggers on 监控, monitor, 市场监控, market watch, 价格警报, price alert, 涨跌监控.
triggers:
  - 监控
  - monitor
  - 市场监控
  - market watch
  - 价格警报
  - price alert
  - 涨跌监控
---

# Market Monitor Skill

## Overview

Monitor stocks in real-time, track price movements, generate alerts, and provide market context.

## Alert Types

| Alert Type | Trigger | Priority |
|------------|---------|----------|
| Price Target | ±X% from target | High |
| Breakout | Support/Resistance breach | High |
| Volume Spike | > 2x average volume | Medium |
| Technical Signal | MA cross, etc. | Medium |
| News Alert | Major news event | High |
| Sentiment Change | Significant shift | Low |

## Monitor Configuration

```yaml
monitor:
  stocks:
    - code: "600519.SH"
      name: "贵州茅台"
      alerts:
        - type: "price_target"
          upper: 2000
          lower: 1500
        - type: "percent_change"
          daily: 5  # 5% daily change
        - type: "volume_spike"
          multiplier: 2.0
        
    - code: "002594.SZ"
      name: "比亚迪"
      alerts:
        - type: "price_target"
          upper: 400
          lower: 250

  indices:
    - "000001.SH"  # 上证指数
    - "399001.SZ"  # 深证成指
    - "SPY"        # 标普500

  schedule:
    check_interval: 5m  # 检查间隔
    market_hours_only: true
```

## Monitor Report Template

```markdown
# Market Monitor Report

**Time**: [YYYY-MM-DD HH:mm:ss]
**Market**: [A股/港股/美股]
**Status**: [开盘/盘中/收盘]

---

## 1. Watchlist Summary

| Symbol | Price | Change | Change % | Volume | Alert |
|--------|-------|---------|----------|--------|-------|
| [Stock] | [XXX] | [+/-XX] | [+/-X.X%] | [XXM] | [✓/⚠] |

---

## 2. Price Alerts

| Symbol | Current | Target | Status |
|--------|---------|--------|---------|
| [Stock] | [XXX] | > [XXX] | ✅ Near target |
| [Stock] | [XXX] | < [XXX] | ⚠️ Below support |

---

## 3. Technical Alerts

| Symbol | Signal | Price | Alert |
|--------|--------|-------|-------|
| [Stock] | MA Golden Cross | [XXX] | 🔔 Bullish |
| [Stock] | Resistance Break | [XXX] | 🔔 Breakout |
| [Stock] | Volume Spike | 3x avg | 🔔 Unusual |

---

## 4. News Alerts

| Time | Symbol | Headline | Impact |
|------|--------|----------|--------|
| [HH:mm] | [Stock] | [Headline] | [High/Med/Low] |

---

## 5. Index Overview

| Index | Value | Change | Change % |
|-------|-------|---------|----------|
| 上证 | [XXX] | [+/-XX] | [+/-X.X%] |
| 深证 | [XXX] | [+/-XX] | [+/-X.X%] |
| 创业板 | [XXX] | [+/-XX] | [+/-X.X%] |

---

## 6. Sector Performance

| Sector | Change | Leaders | Laggards |
|--------|--------|---------|----------|
| [Sector] | [+X.X%] | [Stock] | [Stock] |

---

## 7. Market Sentiment

| Indicator | Value | Signal |
|-----------|-------|--------|
| Fear & Greed | [XX] | [Fear/Neutral/Greed] |
| VIX | [XX] | [Low/Med/High] |
| Turnover | [XX]B | [Active/Normal/Low] |

---

## 8. Action Items

1. [ ] [Stock] approaching target - consider action
2. [ ] [Stock] volume spike - investigate
3. [ ] [News] may impact [Stock]
```

## Alert Workflow

```
1. SETUP: Define stocks and alert criteria
         ↓
2. MONITOR: Periodic price/data checks
         ↓
3. DETECT: Identify alert conditions
         ↓
4. NOTIFY: Send alerts via configured channels
         ↓
5. LOG: Record all alerts for review
         ↓
6. REVIEW: Analyze alert accuracy
```

## Usage Examples

```
User: "监控茅台和比亚迪，设定5%涨跌警报"
→ Set up watchlist with percent alerts

User: "茅台价格超过2000时提醒我"
→ Set price target alert

User: "显示我的自选股行情"
→ Display watchlist summary

User: "最近的警报有哪些"
→ Show recent alerts
```
