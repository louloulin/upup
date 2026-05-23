---
name: alert-management
description: Alert management system for tracking stock price changes, news, and portfolio events. Triggers on 设置警报, 价格提醒, alert management, 警报管理, price alert.
triggers:
  - alert management
  - 设置警报
  - 价格提醒
  - alert system
  - 警报管理
  - price alert
  - stock alert
---

# Alert Management (警报管理)

Comprehensive alert system for monitoring stocks, prices, and portfolio changes.

## Alert Types

| Type | Description | Use Case |
|------|-------------|----------|
| **price** | Price reaches target | Buy at $100, sell at $150 |
| **pct_change** | Percent change threshold | Alert on 5%+ move |
| **volume** | Unusual volume | Detect unusual activity |
| **news** | News sentiment change | Track breaking news |
| **portfolio** | Portfolio value change | Monitor P&L |

## Creating Alerts

### Price Alert
```
alert_system({
  action: "create",
  code: "600519.SH",
  alert_type: "price",
  threshold: 1800,
  condition: "above"
})
```

### Percent Change Alert
```
alert_system({
  action: "create",
  code: "300750.SZ",
  alert_type: "pct_change",
  threshold: 5,
  condition: "change"
})
```

### Volume Alert
```
alert_system({
  action: "create",
  code: "002594.SZ",
  alert_type: "volume",
  threshold: 50000000,
  condition: "above"
})
```

## Managing Alerts

### List Active Alerts
```
alert_system({
  action: "list"
})
```

### Check Specific Alert
```
alert_system({
  action: "check",
  alert_id: "ALT123456789"
})
```

### Delete Alert
```
alert_system({
  action: "delete",
  alert_id: "ALT123456789"
})
```

## Alert History

View triggered alerts:
```
alert_system({
  action: "history"
})
```

## Common Alert Strategies

### Breakout Trading
- Set price alert slightly above resistance
- Set volume alert for unusual activity
- Quick notification on breakout

### Earnings Play
- Set alert before earnings date
- Set percent change alert for 10%+ move
- Track post-earnings volatility

### Momentum Trading
- Set alerts at key price levels
- Track 5% intraday moves
- Monitor volume surges

## Data Export

Export data for analysis:
```
data_export({
  format: "csv",
  data_type: "price",
  code: "600519.SH",
  start_date: "20240101",
  end_date: "20240523",
  limit: 100
})
```

### Export Formats
- **csv**: For Excel/spreadsheet analysis
- **json**: For programmatic processing
- **markdown**: For reports and documentation
- **excel**: For direct Excel import

## Alert Best Practices

1. **Set Realistic Targets**: Don't set alerts too tight
2. **Review Regularly**: Clean up old alerts
3. **Use Multiple Conditions**: Combine price and volume
4. **Set Expirations**: Remove stale alerts
5. **Group Related Alerts**: By strategy or stock
