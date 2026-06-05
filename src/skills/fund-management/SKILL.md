---
name: fund-management
description: Manage your fund watchlist - follow, unfollow, list followed funds. Triggers on 基金关注, 基金管理, fund management, my funds, watchlist management.
description.zh-CN: 管理基金关注列表 — 关注、取消关注、列出已关注基金。触发关键词: 基金关注, 基金管理, fund management, my funds, watchlist management.
triggers:
  - 基金关注
  - 基金管理
  - fund management
  - my funds
  - 关注列表
  - fund watchlist
  - 查看我的基金
---

# Fund Management Skill

Manage your followed funds watchlist with follow/unfollow operations.

## Workflow

### Step 1: Understand User Intent

User wants to:
- Follow a fund → Use `fund_follow`
- Unfollow a fund → Use `fund_unfollow`
- List followed funds → Use `fund_list`
- Get followed fund details → Use `fund_detail`

### Step 2: Follow a Fund

When user says "关注基金" or "follow fund":

```
Call: fund_search({ keyword: "[基金名称或代码]" })
Call: fund_follow({ fund_code: "[基金代码]" })
```

### Step 3: Unfollow a Fund

When user says "取消关注" or "unfollow fund":

```
Call: fund_unfollow({ fund_code: "[基金代码]" })
```

### Step 4: List Followed Funds

When user says "查看关注" or "list funds":

```
Call: fund_list({ limit: 50 })
```

### Step 5: Get Fund Details

For any followed fund:

```
Call: fund_detail({ fund_code: "[基金代码]" })
Call: fund_performance({ fund_code: "[基金代码]" })
```

## Common Operations

| Operation | User Input | Tool |
|-----------|------------|------|
| Follow | "关注110022" | fund_follow |
| Follow by search | "搜索并关注易方达" | fund_search → fund_follow |
| Unfollow | "取消关注110022" | fund_unfollow |
| List all | "查看我的关注列表" | fund_list |
| Details | "查看110022详情" | fund_detail |

## Response Templates

**Follow Success:**
```
# ✅ 基金关注成功

- 基金代码: [code]
- 基金名称: [name]
- 关注时间: [time]

您可以使用以下命令:
- 查看我的关注列表
- 查看基金详情 [code]
```

**Follow Already Exists:**
```
⚠️ 基金 [code] 已在关注列表中
```

**Unfollow Success:**
```
# ✅ 取消关注成功

基金 [code] 已从关注列表中移除。
```

**List (Empty):**
```
# 📭 关注列表为空

使用以下命令关注基金:
- 关注 110022
- 搜索并关注易方达消费
```

**List (With funds):**
```
# 📊 我的关注基金 ([count] 只)

| 序号 | 代码 | 名称 | 估算净值 | 估算涨跌 |
|------|------|------|----------|----------|
[table rows]

> 最后更新: [time]
```

## Data Source

- **Follow/Unfollow**: 本地存储 (.upup/data/followed-funds.json)
- **Fund Info**: 天天基金 (fund.eastmoney.com)

## Notes

1. Followed funds are stored locally and persist across sessions
2. Fund estimates (实时估算净值) update periodically during market hours
3. Use fund_analysis skill for comprehensive fund research

## Example Queries

- "关注易方达消费行业基金"
- "查看我的关注列表"
- "取消关注招商中证白酒"
- "分析我关注的基金"
