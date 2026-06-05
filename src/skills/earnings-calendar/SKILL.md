---
name: earnings-calendar
description: Earnings calendar and report schedule. Triggers on 财报, earnings calendar, 业绩, 财报发布, 业绩预告.
description.zh-CN: 财报日历与发布日程。触发关键词: 财报, earnings calendar, 业绩, 财报发布, 业绩预告.
triggers:
  - 财报
  - earnings calendar
  - 业绩
  - 财报发布
  - 业绩预告
  - 年报
  - 季报
---

# Earnings Calendar Skill

## Overview

Track earnings reports, dividend dates, and corporate events.

## Event Types

| Type | Frequency | Impact |
|------|-----------|--------|
| 年报 | 每年 | High |
| 季报 | 每季度 | Medium |
| 业绩预告 | 随时 | High |
| 分红 | 不定期 | Medium |
| 股东大会 | 不定期 | Low |

## Calendar Template

```markdown
# Earnings Calendar

**Period**: [Month/Quarter]
**Date**: [YYYY-MM-DD]

---

## 1. Upcoming Events

| Date | Stock | Event | Type | Impact |
|------|-------|-------|------|--------|
| [Date] | [Name] | [Event] | [年报/季报/分红] | [High/Med/Low] |

---

## 2. This Week

| Stock | Release Date | Expected Time |
|-------|--------------|---------------|
| [Stock1] | [Date] | [Morning/Afternoon] |
| [Stock2] | [Date] | [Morning/Afternoon] |

---

## 3. Earnings Watch List

### High Impact
| Stock | Reason | Action |
|-------|--------|--------|
| [Stock] | [Reason] | [Monitor/Trade] |
```
