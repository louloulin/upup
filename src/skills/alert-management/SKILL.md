---
name: alert-management
description: Manage fund price alerts - create, list, delete alerts. Triggers on 基金警报, alert management, 价格提醒, 警报设置.
description.zh-CN: 管理基金价格提醒 — 新建、列出、删除提醒。触发关键词: 基金警报, alert management, 价格提醒, 警报设置.
triggers:
  - 基金警报
  - alert management
  - 价格提醒
  - 警报设置
  - 我的警报
---

# Alert Management Skill

Manage fund price alerts to track market movements and investment conditions.

## Workflow

### Step 1: Understand Alert Intent

User wants to:
- Create alert → fund_alert_create
- List alerts → fund_alert_list
- Delete alert → fund_alert_delete
- Enable/disable alert → (planned)

### Step 2: Create Alert

When user says "设置警报" or "创建警报":

```
Call: fund_list({})  # Check if fund is followed
Call: fund_alert_create({
  fund_code: "[code]",
  alert_type: "price_above" | "price_below" | "change_up" | "change_down",
  value: [threshold]
})
```

**Alert Types:**
| Type | Description | Example |
|------|-------------|---------|
| price_above | 价格高于阈值 | 涨到3元提醒 |
| price_below | 价格低于阈值 | 跌到2元提醒 |
| change_up | 涨幅超过阈值 | 涨5%提醒 |
| change_down | 跌幅超过阈值 | 跌5%提醒 |

### Step 3: List Alerts

When user says "查看警报" or "我的警报":

```
Call: fund_alert_list({})
```

### Step 4: Delete Alert

When user says "删除警报":

```
Call: fund_alert_delete({ alert_id: "[id]" })
```

## Common Operations

| Operation | User Input | Tool |
|-----------|------------|------|
| Create price alert | "设置110022涨到3元提醒" | fund_alert_create |
| Create change alert | "110022跌5%提醒我" | fund_alert_create |
| List alerts | "查看我的基金警报" | fund_alert_list |
| Delete alert | "删除警报 abc123" | fund_alert_delete |

## Alert Response Templates

**Create Success:**
```
# ✅ 警报创建成功

- 基金: [name] ([code])
- 类型: [alert_type]
- 阈值: [value]
- ID: [alert_id]

警报将在条件满足时通知您。
```

**List (with alerts):**
```
# 🔔 基金警报列表

| 序号 | 基金 | 条件 | 状态 | 触发次数 |
|------|------|------|------|----------|
[table]

使用 "删除警报 [id]" 移除警报。
```

**List (empty):**
```
# 📭 警报列表为空

使用 "设置[基金]涨到[价格]提醒" 创建警报。
```

## Alert Best Practices

1. **Be Specific**: Set clear thresholds
   - ✅ "110022跌到2.5元提醒"
   - ⚠️ "110022降价提醒" (vague)
   
2. **Set Reasonable Triggers**: Avoid noise
   - ✅ "跌10%提醒" (meaningful)
   - ❌ "跌0.1%提醒" (too sensitive)
   
3. **Review Regularly**: Clean up old alerts
   - Check alerts monthly
   - Remove triggered/completed alerts

## Data Source

- **Alert Storage**: 本地存储 (.upup/data/followed-funds.json)

## Limitations

1. Alerts are local storage only (no push notifications)
2. No real-time monitoring (checked on demand)
3. Requires fund to be in watchlist first

## Example Queries

- "帮我设置110022涨到3.5元的警报"
- "我想在基金跌5%时收到提醒"
- "查看我设置的所有警报"
- "删除那个警报"
