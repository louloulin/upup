---
name: risk-management
description: |
  风险管理专家技能。专注于风险识别、评估和控制：VaR计算、最大回撤、止损策略、风险分散、行业配置。
  当用户询问风险、止损、回撤、VaR、风险控制、仓位管理时必须使用。
---

# Risk Management - 风险管理专家

## 风险管理框架

```
┌─────────────────────────────────────────────────────────────────┐
│                      风险管理流程                                │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│  风险识别       │  风险评估       │  风险控制       │  监控   │
│  Risk ID        │  Risk Measure   │  Risk Control   │ Monitor │
│  定性分析       │  VaR/回撤/β     │  止损/分散/对冲 │  动态   │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## 风险识别

### 风险类型

```python
RISK_TYPES = {
    "market_risk": {
        "description": "市场整体下跌风险",
        "indicators": ["beta", "correlation", "market_index"],
        "mitigation": ["分散化", "对冲", "仓位控制"]
    },
    "company_risk": {
        "description": "个股特定风险",
        "indicators": ["earnings_volatility", "debt_level", "management"],
        "mitigation": ["仓位上限", "止损", "基本面监控"]
    },
    "liquidity_risk": {
        "description": "流动性风险",
        "indicators": ["daily_volume", "bid_ask_spread", "market_cap"],
        "mitigation": ["避免小市值", "分批建仓", "现金流规划"]
    },
    "credit_risk": {
        "description": "信用风险(债券/理财)",
        "indicators": ["credit_rating", "debt_to_equity", "interest_coverage"],
        "mitigation": ["评级筛选", "分散发债人", "监控预警"]
    },
    "policy_risk": {
        "description": "政策/监管风险",
        "indicators": ["regulatory_environment", "industry_policy", "geopolitics"],
        "mitigation": ["行业配置", "地区分散", "政策跟踪"]
    },
    "currency_risk": {
        "description": "汇率风险",
        "indicators": ["FX_exposure", "hedge_ratio"],
        "mitigation": ["外汇对冲", "自然对冲", "币种分散"]
    }
}
```

### 风险清单检查

```python
def risk_checklist(symbol: str) -> list[dict]:
    """生成风险清单
    
    返回: [{
        risk_type: string,
        severity: "high|medium|low",
        indicators: {key: value},
        warnings: [string]
    }]
    """
```

## 风险量化指标

### VaR (Value at Risk)

```python
def calculate_var(returns: list[float], confidence: float = 0.95, 
                 horizon: int = 1) -> dict:
    """计算VaR
    
    params:
    - returns: 历史收益率序列
    - confidence: 置信度(默认95%)
    - horizon: 持有期(天)
    
    方法1: 历史模拟法
    sorted_returns = sorted(returns)
    var_index = int((1 - confidence) * len(returns))
    var = abs(sorted_returns[var_index])
    
    方法2: 方差-协方差法(假设正态分布)
    mean = np.mean(returns)
    std = np.std(returns)
    z_score = norm.ppf(1 - confidence)
    var = abs(mean + z_score * std)
    
    返回:
    {
        'var_absolute': float,      # 绝对损失金额
        'var_percent': float,        # 损失百分比
        'confidence_level': float,
        'worst_case_1_day': float,
        'worst_case_10_day': float   # 放大sqrt(10)
    }
    """
```

### 最大回撤 (Maximum Drawdown)

```python
def calculate_max_drawdown(prices: list[float]) -> dict:
    """计算最大回撤
    
    返回:
    {
        'max_drawdown': float,        # 最大回撤幅度
        'max_drawdown_pct': float,   # 百分比
        'drawdown_duration': int,   # 回撤持续天数
        'peak_date': str,
        'trough_date': str,
        'recovery_date': str | None,
        'recovery_time': int | None  # 恢复所需天数
    }
    """
    
# 示例计算
def analyze_drawdown_risk(symbol: str, period: str = "5y") -> dict:
    """分析历史回撤风险"""
    prices = get_price_history(symbol, period)
    mdd = calculate_max_drawdown(prices)
    
    # 分析回撤原因
    drawdown_events = identify_drawdown_events(mdd)
    
    return {
        'max_drawdown': mdd,
        'average_drawdown': calculate_average_drawdown(prices),
        'drawdown_frequency': calculate_frequency(prices),
        'recovery_stats': {
            'avg_recovery_days': avg_recovery_time,
            'worst_recovery_days': worst_recovery_time
        },
        'current_drawdown': calculate_current_drawdown(prices)
    }
```

### Beta和波动率

```python
def calculate_beta_risk(symbol: str, market: str = "^GSPC") -> dict:
    """计算Beta和风险指标
    
    返回:
    {
        'beta': float,              # 相对于市场的Beta
        'alpha': float,             # 年化Alpha
        'volatility': float,        # 历史波动率(年化)
        'idiosyncratic_vol': float, # 特异性波动率
        'r_squared': float,         # R²
        'correlation': float,        # 与市场相关性
        'levered_beta': float,      # 含财务杠杆Beta
        'unlevered_beta': float     # 去杠杆Beta(更好用于估值)
    }
    """
```

### 风险指标汇总

```python
def risk_metrics_summary(symbol: str) -> dict:
    """综合风险指标"""
    
    return {
        'var_95_1day': calculate_var(returns, 0.95, 1),
        'var_99_1day': calculate_var(returns, 0.99, 1),
        'max_drawdown': calculate_max_drawdown(prices),
        'beta': calculate_beta(symbol),
        'volatility': {
            'daily': daily_vol,
            'annualized': annual_vol
        },
        'downside_volatility': calculate_downside_vol(returns),
        'sortino_ratio': (return - risk_free) / downside_vol,
        'risk_score': calculate_composite_risk_score(...)
    }
```

## 止损策略

### 固定止损

```python
def fixed_stop_loss(entry_price: float, risk_percent: float = 0.10) -> dict:
    """固定比例止损
    
    risk_percent: 最大亏损比例(默认10%)
    
    返回:
    {
        'stop_price': entry_price * (1 - risk_percent),
        'risk_percent': risk_percent,
        'max_loss_per_share': entry_price * risk_percent,
        'risk_reward_ratio': calculate_rrr()
    }
    """
```

### 波动率止损

```python
def volatility_stop_loss(entry_price: float, volatility: float,
                        atr_multiplier: float = 2.0) -> dict:
    """基于波动率的动态止损
    
    原理: 使用ATR(平均真实波幅)计算止损位
    优势: 自动适应市场波动性
    
    返回:
    {
        'stop_price': entry_price - atr * atr_multiplier,
        'atr': atr,
        'atr_multiplier': atr_multiplier,
        'adaptive': True
    }
    """
```

### 移动止损

```python
def trailing_stop(highest_price: float, current_price: float,
                 trailing_percent: float = 0.15) -> dict:
    """移动止损(跟踪止盈)
    
    策略: 随着价格上涨提高止损位,锁定利润
    
    返回:
    {
        'trailing_stop_price': highest_price * (1 - trailing_percent),
        'profit_locked_pct': (highest_price - entry) / entry,
        'distance_from_stop': (current - stop) / current,
        'should_trigger': current <= stop
    }
    """
```

### 综合止损策略

```python
def comprehensive_stop_strategy(position: dict, 
                               strategy: str = "adaptive") -> dict:
    """综合止损策略
    
    position: {
        entry_price: float,
        current_price: float,
        shares: int,
        volatility: float,
        holding_period: int
    }
    
    strategy: "conservative"|"moderate"|"aggressive"
    
    返回:
    {
        'primary_stop': float,
        'secondary_stop': float,    # 预警线
        'trailing_stop': float,
        'time_based_stop': datetime | None,  # 时间止损
        'position_size': max_recommended,
        'risk_per_trade': calculate_risk()
    }
    """
```

## 仓位管理

### Kelly公式

```python
def kelly_criterion(win_rate: float, avg_win: float, avg_loss: float) -> dict:
    """Kelly公式计算最优仓位
    
    Kelly % = W - (1-W)/R
    其中:
    - W = 胜率
    - R = 盈亏比
    
    实际使用时建议用半Kelly或1/4 Kelly降低波动
    """
    kelly_pct = win_rate - (1 - win_rate) / (avg_win / avg_loss)
    
    return {
        'kelly_full': kelly_pct,
        'kelly_half': kelly_pct / 2,
        'kelly_quarter': kelly_pct / 4,
        'recommended': kelly_pct / 4  # 建议使用1/4 Kelly
    }
```

### 风险平价

```python
def risk_parity_allocation(positions: list[dict], 
                           target_risk: float = 0.10) -> dict:
    """风险平价仓位配置
    
    原理: 每个资产对组合风险的贡献相等
    优势: 不依赖预测,分散化好
    """
    
    # 计算每个资产的波动率
    volatilities = [calc_vol(p['returns']) for p in positions]
    
    # 风险平价权重 = target_risk / vol_i / n_assets
    risk_budget = target_risk / len(positions)
    weights = [risk_budget / vol for vol in volatilities]
    
    # 标准化
    weights = [w / sum(weights) for w in weights]
    
    return {
        'weights': {p['symbol']: w for p, w in zip(positions, weights)},
        'risk_contribution': [w * vol for w, vol in zip(weights, volatilities)],
        'expected_return': calculate_expected_return(weights, returns),
        'expected_volatility': calculate_portfolio_vol(weights, cov_matrix)
    }
```

## 组合风险分析

```python
def portfolio_risk_analysis(positions: list[dict]) -> dict:
    """组合风险分析"""
    
    # 1. 整体VaR
    portfolio_returns = calculate_portfolio_returns(positions)
    portfolio_var = calculate_var(portfolio_returns, 0.95)
    
    # 2. 边际风险贡献
    risk_contributions = calculate_risk_contribution(positions)
    
    # 3. 因子暴露
    factor_exposures = calculate_factor_exposure(positions)
    
    # 4. 集中度风险
    concentration = calculate_concentration_risk(positions)
    
    # 5. 相关性风险
    correlation_matrix = calculate_correlation_matrix(positions)
    high_correlation_pairs = identify_high_correlation(correlation_matrix)
    
    return {
        'portfolio_var': portfolio_var,
        'risk_contributions': risk_contributions,
        'factor_exposures': factor_exposures,
        'concentration': concentration,
        'correlation_risks': high_correlation_pairs,
        'risk_decomposition': decompose_risk(positions)
    }
```

## 风险报告模板

```markdown
# [股票/组合] 风险分析报告

## 1. 风险摘要
| 指标 | 数值 | 评级 |
|------|------|------|
| VaR(95%,1天) | ¥XX | 中 |
| 最大回撤 | XX% | 高 |
| Beta | X.XX | 高 |
| 波动率(年化) | XX% | 中 |

## 2. 风险分解
### 2.1 风险来源
- 系统性风险: XX%
- 非系统性风险: XX%

### 2.2 行业暴露
| 行业 | 权重 | Beta | 风险贡献 |
|------|------|------|----------|
| 科技 | 40% | 1.2 | 48% |

## 3. 止损建议
- 初始止损: ¥XXX (-XX%)
- 移动止损: 距高点XX%
- 预警线: ¥XXX (-XX%)

## 4. 风险缓解建议
1. [建议1]
2. [建议2]

## 5. 风险监控指标
| 指标 | 阈值 | 当前值 | 状态 |
|------|------|--------|------|
| 单日亏损 | -5% | -2.3% | 正常 |
| VaR占用 | 80% | 65% | 正常 |
```

## 示例计算

### 示例1: VaR计算

```
假设:
- 投资组合: ¥100万
- 历史日收益率: mean=0.1%, std=2%
- 置信度: 95%

VaR计算(方差-协方差法):
z_0.95 = 1.645
VaR_95 = -(-0.1% + 1.645 * 2%) = -3.19%
VaR金额 = ¥100万 * 3.19% = ¥31,900

结论: 95%置信度下,单日最大损失不超过¥31,900
```

### 示例2: 最大回撤分析

```
茅台历史回撤分析(2019-2024):
- 最大回撤: -39.8% (2021/02 - 2022/10)
- 平均回撤: -18.5%
- 恢复时间: 12个月

建议:
- 设定20%止损线
- 回撤15%时发出预警
- 配置其他资产降低相关性
```

## 关键原则

1. **风险第一**: 永远不要忽视风险
2. **止损纪律**: 严格执行止损,不幻想反弹
3. **分散化**: 避免过度集中
4. **动态监控**: 定期评估风险变化
5. **适度杠杆**: 杠杆放大风险也放大收益
