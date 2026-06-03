---
name: investment-core
description: |
  投资分析核心技能。处理所有投资相关任务：股票分析、财务分析、估值、风险评估、组合管理、市场研究、交易信号。
  当用户询问以下内容时必须使用：股票分析、投资建议、估值分析、风险评估、财报解读、组合优化、市场情绪、技术分析、行业研究、DCF估值。
---

# Investment Core - 投资分析核心技能

## 核心能力矩阵

```
┌─────────────────────────────────────────────────────────────────┐
│                     投资分析核心能力                              │
├──────────────┬──────────────┬──────────────┬──────────────┬──────┤
│ 数据收集     │ 分析能力     │ 估值能力     │ 风险管理    │ 建议 │
│ Price/Fin    │ Technical/   │ DCF/PE/PB    │ VaR/回撤    │ 组合 │
│ Filings      │ Fundamental  │ 折价/溢价    │ 止损/分散   │ 执行 │
└──────────────┴──────────────┴──────────────┴──────────────┴──────┘
```

## 工作流程

```
用户查询 → 识别意图 → 数据收集 → 分析 → 估值 → 风评 → 输出建议
```

## 模块1: 数据收集

### 股价与市场数据

```python
# 获取股价数据
def get_price(symbol: str) -> dict:
    """获取实时股价和基本市场数据"""
    # 返回: {price, change, change_pct, volume, market_cap, pe, pb, dividend_yield}
    
# 获取批量股价
def get_prices(symbols: list[str]) -> list[dict]:
    """批量获取多只股票价格"""
```

### 财务数据

```python
# 财务指标快照
def get_financials(symbol: str) -> dict:
    """获取财务数据
    返回: {
        income_statement: {revenue, net_income, eps, margin},
        balance_sheet: {total_assets, debt, equity, roe, roa},
        cash_flow: {operating_cf, free_cf, capex},
        metrics: {pe, pb, ps, pc, ev/ebitda}
    }
    """
    
# 财务历史
def get_financial_history(symbol: str, years: int = 5) -> dict:
    """获取多年财务历史"""
```

### SEC/公告文件

```python
def read_filings(symbol: str, types: list[str] = ["10-K", "10-Q"]) -> dict:
    """读取SEC文件或A股公告
    types: ["10-K", "10-Q", "8-K", "annual_report"]
    返回: {risk_factors, mdna, financial_statements, insider_trades}
    """
```

## 模块2: 分析能力

### 基本面分析

```python
def analyze_fundamentals(symbol: str) -> dict:
    """基本面分析
    返回: {
        growth_analysis: {revenue_cagr, income_cagr, margin_trend},
        profitability: {roe, roa, roic, margin_analysis},
        financial_health: {debt_ratio, current_ratio, interest_coverage},
        cash_flow_quality: {ocf_ratio, fcf_quality, accrual}
    }
    """
```

### 技术分析

```python
def analyze_technical(symbol: str, period: str = "1y") -> dict:
    """技术分析
    period: "1m", "3m", "6m", "1y", "5y"
    返回: {
        trend: "uptrend|downtrend|sideways",
        macd: {value, signal, histogram, signal_type},
        rsi: {value, status: "overbought|neutral|oversold"},
        bollinger: {position, upper, middle, lower},
        moving_averages: {sma20, sma50, sma200, golden_cross, death_cross}
    }
    """
```

### 市场情绪分析

```python
def analyze_sentiment(market: str = "US" | "CN") -> dict:
    """市场情绪分析
    market: "US"(美股) | "CN"(A股)
    返回: {
        fear_greed_index: 0-100,
        market_status: "bullish|bearish|neutral",
        funding_flow: "inflow|outflow",
        sentiment_trend: "improving|worsening|stable"
    }
    """
```

### 财报陷阱检测

```python
def detect_financial_traps(symbol: str) -> dict:
    """财务陷阱检测
    返回: {
        red_flags: [{indicator, severity, description}],
        overall_risk: "low|medium|high",
        recommendations: [string]
    }
    """
```

## 模块3: 估值能力

### DCF估值

```python
def dcf_valuation(symbol: str, params: dict = None) -> dict:
    """DCF估值
    params: {
        revenue_growth_rate: 0.10,  # 初始营收增长率
        terminal_growth_rate: 0.025,  # 永续增长率
        discount_rate: 0.10,  # 折现率(WACC)
        profit_margin: 0.20,  # 永续期利润率
        years: 10  # 预测年数
    }
    返回: {
        intrinsic_value: float,
        value_per_share: float,
        current_price: float,
        margin_of_safety: float,
        sensitivity: {discount_rate: {values}, terminal_growth: {values}}
    }
    """
```

### 相对估值

```python
def relative_valuation(symbol: str, peers: list[str] = None) -> dict:
    """相对估值对比
    返回: {
        pe: {value, sector_avg, verdict},
        pb: {value, sector_avg, verdict},
        ps: {value, sector_avg, verdict},
        ev_ebitda: {value, sector_avg, verdict},
        dividend_yield: {value, sector_avg, verdict}
    }
    """
```

### 估值综合评估

```python
def valuation_summary(symbol: str) -> dict:
    """综合估值评估
    返回: {
        dcf_value: float,
        relative_value: {pe_ verdict, pb_verdict},
        historical_percentile: float,  # 当前估值在历史中的百分位
       综合结论: "undervalued|fair|overvalued"
    }
    """
```

## 模块4: 风险管理

### 风险评估

```python
def assess_risk(symbol: str, portfolio: list[dict] = None) -> dict:
    """风险评估
    portfolio: [{symbol, weight, shares}]
    返回: {
        var_95: float,  # 95% VaR
        max_drawdown: float,
        beta: float,
        volatility: float,
        risk_level: "low|medium|high",
        risk_factors: [string]
    }
    """
```

### 止损策略

```python
def calculate_stop_loss(entry_price: float, volatility: float, 
                       risk_tolerance: float = 0.15) -> dict:
    """计算止损点
    risk_tolerance: 最大可承受亏损(默认15%)
    返回: {
        stop_loss_price: float,
        stop_loss_percent: float,
        trailing_stop: float,
        recommended_position_size: float
    }
    """
```

### 组合分析

```python
def analyze_portfolio(positions: list[dict]) -> dict:
    """组合分析
    positions: [{symbol, shares, cost_basis}]
    返回: {
        total_value: float,
        total_gain_loss: float,
        allocation: {sector: {weight, value}},
        risk_metrics: {volatility, sharpe_ratio, max_drawdown},
        recommendations: [string]  # 再平衡建议
    }
    """
```

### 组合优化

```python
def optimize_portfolio(target_return: float = None, 
                     risk_tolerance: str = "moderate") -> dict:
    """组合优化(基于MPT)
    risk_tolerance: "conservative"|"moderate"|"aggressive"
    返回: {
        optimal_weights: {symbol: weight},
        expected_return: float,
        expected_volatility: float,
        sharpe_ratio: float,
        efficient_frontier_points: [dict]
    }
    """
```

## 模块5: 行业分析

### 波特五力

```python
def porter_five_forces(sector: str) -> dict:
    """波特五力分析
    返回: {
        competitive_rivalry: "high|medium|low",
        supplier_power: "high|medium|low", 
        buyer_power: "high|medium|low",
        threat_substitute: "high|medium|low",
        threat_new_entry: "high|medium|low",
        overall_attractiveness: "high|medium|low"
    }
    """
```

### 护城河分析

```python
def analyze_moat(symbol: str) -> dict:
    """护城河分析
    返回: {
        moat_types: ["brand", "network_effect", "switching_cost", 
                     "cost_advantage", "regulatory", "technology"],
        moat_strength: "wide|moderate|narrow|none",
        sustainability: "high|medium|low",
        competitors_analysis: string
    }
    """
```

## 输出报告模板

### 投资分析报告

```markdown
# [公司名称] ([股票代码]) 投资分析报告
生成日期: [日期]

## 1. 执行摘要
[2-3句话总结投资结论]

## 2. 基本面分析
### 2.1 财务健康
- 营收: [数值] (YoY: [%])
- 净利润: [数值] (YoY: [%])
- 毛利率/净利率: [%]/[%]
- ROE/ROA: [%]/[%]
### 2.2 增长潜力
- 营收CAGR(5年): [%]
- 主要增长驱动因素: [列表]

## 3. 估值分析
### 3.1 DCF估值
- 内在价值: [金额]
- 当前价格: [金额]
- 安全边际: [%]
### 3.2 相对估值
- PE/PB: [值] (行业中位数: [值])
- 结论: [折价/溢价]

## 4. 风险评估
### 4.1 主要风险
- [风险1]: [描述]
- [风险2]: [描述]
### 4.2 风险指标
- Beta: [值]
- VaR(95%): [%]
- 最大回撤(历史): [%]

## 5. 技术面
- 趋势: [上升/下降/横盘]
- MACD信号: [金叉/死叉/中性]
- RSI: [值] ([超买/超卖/中性])

## 6. 综合建议
### 评级: [强烈买入/买入/持有/减持/卖出]
### 目标价: [金额] ([折合当前价的%])
### 建议理由:
1. [理由1]
2. [理由2]
3. [理由3]
### 风险提示:
[说明主要风险和不确定性]
```

## 示例使用

### 示例1: 完整股票分析

```
用户: 分析苹果公司(AAPL)的投资价值
执行流程:
1. get_price("AAPL") → 股价$178
2. get_financials("AAPL") → 财务数据
3. analyze_fundamentals("AAPL") → 基本面
4. dcf_valuation("AAPL") → DCF估值
5. assess_risk("AAPL") → 风险评估
6. analyze_technical("AAPL") → 技术面
生成完整投资报告
```

### 示例2: 组合风险评估

```
用户: 评估我的投资组合风险
输入: [{AAPL: 40%, MSFT: 30%, GOOGL: 30%}]
执行:
1. analyze_portfolio(positions) → 组合分析
2. 识别行业集中度 → 科技股占比100%
3. 评估风险指标 → 高Beta
4. 生成再平衡建议
```

### 示例3: 买入时机判断

```
用户: 现在是买入腾讯的好时机吗?
执行:
1. analyze_sentiment("CN") → 市场情绪
2. analyze_technical("0700.HK") → 技术面
3. dcf_valuation("0700.HK") → 估值
4. assess_risk("0700.HK") → 风险
综合判断给出买入/持有/卖出建议
```

## 关键原则

1. **数据驱动**: 所有结论基于真实数据
2. **风险第一**: 清楚说明风险和不确定性
3. **多元化**: 避免集中持仓建议
4. **长期视角**: 优先考虑长期价值
5. **持续更新**: 估值需要定期更新
