---
name: portfolio-rebalancing
description: Portfolio rebalancing and optimization skill. Triggers on 组合再平衡, 仓位调整, rebalance portfolio, portfolio optimization, 投资组合优化.
triggers:
  - portfolio rebalancing
  - 组合再平衡
  - 仓位调整
  - rebalance portfolio
  - portfolio optimization
  - 投资组合优化
  - portfolio management
---

# Portfolio Rebalancing & Optimization (投资组合管理)

Comprehensive portfolio management including rebalancing, optimization, and risk management.

## Portfolio Management Workflow

### Step 1: Portfolio Assessment

Analyze current portfolio:
```
portfolio_optimize({
  strategy: "risk_parity",
  assets: [
    { code: "600519.SH", weight: 0.15 },
    { code: "300750.SZ", weight: 0.20 },
    { code: "002594.SZ", weight: 0.25 }
  ]
})
```

### Step 2: Risk Assessment

Evaluate portfolio risk:
```
risk_management({
  action: "assess",
  code: "600519.SH"
})

risk_management({
  action: "var",
  code: "portfolio"
})
```

### Step 3: Position Sizing

Calculate optimal position sizes:
```
risk_management({
  action: "position_size",
  code: "300750.SZ",
  risk_tolerance: 0.02,
  confidence_level: 0.95
})
```

### Step 4: Stop-Loss Planning

Set stop-loss levels:
```
risk_management({
  action: "stop_loss",
  code: "002594.SZ",
  entry_price: 250
})
```

## Rebalancing Strategies

### 1. Calendar Rebalancing
- Rebalance quarterly or annually
- Simple, low-cost approach
- May miss significant drift

### 2. Threshold Rebalancing
- Rebalance when allocation drifts > 5%
- More responsive to changes
- Lower transaction costs

### 3. Risk-Parity Rebalancing
- Equal risk contribution from each asset
- Accounts for volatility differences
- More sophisticated approach

## Common Portfolio Allocations

### Conservative (稳健型)
```
- 银行/电力: 30%
- 消费龙头: 25%
- 医药: 20%
- 科技: 15%
- 现金: 10%
```

### Moderate (平衡型)
```
- 银行/金融: 20%
- 消费: 20%
- 新能源: 20%
- 医药: 15%
- 科技: 15%
- 现金: 10%
```

### Aggressive (进取型)
```
- 科技: 30%
- 新能源: 25%
- 消费: 20%
- 医药: 15%
- 金融: 10%
```

## Diversification Principles

### Asset Diversification
- Spread across sectors
- Include different market caps
- Consider A/H share exposure

### Risk Diversification
- Monitor correlation
- Avoid concentration risk
- Consider low-correlation assets

### Geographic Diversification
- A-shares: Mainland China
- HK shares: China exposure with USD/HKD
- US shares: Global exposure

## Portfolio Monitoring

### Key Metrics
| Metric | Target | Alert |
|--------|--------|-------|
| 单股仓位 | < 15% | > 20% |
| 单行业仓位 | < 30% | > 40% |
| 组合波动率 | < 20% | > 30% |
| VaR (95%) | < 5% | > 8% |

### Alerts
- 仓位偏离 > 5%
- 单股下跌 > 15%
- 组合波动率上升 > 30%

## Rebalancing Process

```
1. 计算当前仓位偏离
   当前仓位 vs 目标仓位

2. 确定再平衡操作
   BUY/SELL 信号

3. 计算交易成本
   手续费 ≈ 0.1%

4. 执行再平衡
   分批执行，减少冲击成本

5. 更新记录
   记录交易和持仓变化
```

## Example Portfolio

### Target Allocation
| 股票 | 代码 | 目标仓位 | 当前仓位 | 偏离 | 操作 |
|------|------|----------|----------|------|------|
| 贵州茅台 | 600519.SH | 15% | 18% | +3% | SELL |
| 宁德时代 | 300750.SZ | 20% | 22% | +2% | SELL |
| 比亚迪 | 002594.SZ | 25% | 20% | -5% | BUY |
| 招商银行 | 600036.SH | 15% | 15% | 0% | HOLD |
| 长江电力 | 600900.SH | 10% | 10% | 0% | HOLD |
| 现金 | - | 15% | 15% | 0% | HOLD |

## Disclaimer

⚠️ **风险提示**:
- 投资有风险，决策需谨慎
- 过去表现不代表未来收益
- 请根据自身情况调整仓位
- 建议咨询专业投资顾问
