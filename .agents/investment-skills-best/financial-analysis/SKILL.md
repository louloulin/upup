---
name: financial-analysis
description: |
  财务报表分析专家技能。专注于解读三大报表、计算关键财务指标、评估盈利质量、识别财务陷阱。
  当用户询问财务分析、财报、营收、利润、资产负债、现金流、ROE、ROA时必须使用。
---

# Financial Analysis - 财务报表分析专家

## 财务分析框架

```
┌─────────────────────────────────────────────────────────────────┐
│                      财务分析体系                                 │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│  损益表        │  资产负债表     │  现金流量表     │  综合   │
│  Income Stmt   │  Balance Sheet  │  Cash Flow      │  评分   │
│  营收/利润     │  资产/负债     │  经营/投资/融资 │  排雷   │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## 三大报表解读

### 损益表 (Income Statement)

```python
def analyze_income_statement(symbol: str, years: int = 5) -> dict:
    """损益表分析
    
    返回:
    {
        'revenue': {
            'total': float,
            'yoy_growth': float,
            'cagr_5y': float,
            'segments': {name: {amount, growth, margin}},
            'geographic': {region: {amount, growth}}
        },
        'profitability': {
            'gross_profit': float,
            'gross_margin': float,
            'operating_profit': float,
            'operating_margin': float,
            'net_income': float,
            'net_margin': float,
            'ebitda': float,
            'ebitda_margin': float
        },
        'per_share': {
            'eps_basic': float,
            'eps_diluted': float,
            'eps_growth': float
        },
        'margins_trend': [float]  # 近年净利率趋势
    }
    """
```

### 资产负债表 (Balance Sheet)

```python
def analyze_balance_sheet(symbol: str) -> dict:
    """资产负债表分析
    
    返回:
    {
        'assets': {
            'total': float,
            'current': float,
            'non_current': float,
            'composition': {type: percentage}
        },
        'liabilities': {
            'total': float,
            'current': float,
            'non_current': float,
            'composition': {type: percentage}
        },
        'equity': {
            'total': float,
            'retained_earnings': float,
            'book_value_per_share': float
        },
        'ratios': {
            'debt_to_equity': float,
            'debt_to_assets': float,
            'current_ratio': float,
            'quick_ratio': float,
            'cash_ratio': float
        },
        'leverage': {
            'levered_beta': float,
            'interest_coverage': float,
            'debt_service_coverage': float
        }
    }
    """
```

### 现金流量表 (Cash Flow Statement)

```python
def analyze_cash_flow(symbol: str, years: int = 5) -> dict:
    """现金流量表分析
    
    返回:
    {
        'operating_cash_flow': {
            'amount': float,
            'ocf_to_net_income': float,  # 盈利质量指标
            'ocf_to_revenue': float,
            'trend': [float]
        },
        'investing_cash_flow': {
            'amount': float,
            'capex': float,
            'capex_to_revenue': float,
            'fcf': float  # 自由现金流
        },
        'financing_cash_flow': {
            'amount': float,
            'dividends_paid': float,
            'share_repurchase': float,
            'debt_issuance': float,
            'debt_repayment': float
        },
        'fcf_quality': {
            'fcf': float,
            'fcf_to_net_income': float,
            'fcf_margin': float,
            'quality_assessment': "high|medium|low"
        }
    }
    """
```

## 关键财务指标

### 盈利能力指标

```python
def profitability_metrics(symbol: str) -> dict:
    """盈利能力指标
    
    返回:
    {
        'roe': {
            'value': float,
            'trend': [float],
            'decomposition': {
                'net_margin': float,
                'asset_turnover': float,
                'financial_leverage': float
            },
            'peer_comparison': float
        },
        'roa': {
            'value': float,
            'trend': [float]
        },
        'roic': {
            'value': float,        # 投入资本回报率,最重要
            'wacc_comparison': float,  # ROIC > WACC = 创造价值
            'trend': [float]
        },
        'margins': {
            'gross_margin': float,
            'operating_margin': float,
            'net_margin': float,
            'ebitda_margin': float
        }
    }
    """
```

### 成长性指标

```python
def growth_metrics(symbol: str) -> dict:
    """成长性指标
    
    返回:
    {
        'revenue_growth': {
            'yoy': float,
            'qoq': float,
            'cagr_3y': float,
            'cagr_5y': float,
            'accelerating': bool
        },
        'earnings_growth': {
            'yoy': float,
            'cagr_3y': float,
            'cagr_5y': float,
            'beat_rate': float  # EPS超预期率
        },
        'forward_indicators': {
            'backlog': float,      # 未完成订单
            'pipeline': float,     # 业务管线
            'guidance': str        # 管理层指引
        }
    }
    """
```

### 财务健康指标

```python
def financial_health(symbol: str) -> dict:
    """财务健康度评估
    
    返回:
    {
        'liquidity': {
            'current_ratio': float,    # >1.5 良好
            'quick_ratio': float,      # >1.0 良好
            'cash_ratio': float
        },
        'leverage': {
            'debt_to_equity': float,   # <1.0 稳健
            'debt_to_ebitda': float,   # <3.0 良好
            'interest_coverage': float  # >5.0 良好
        },
        'efficiency': {
            'asset_turnover': float,
            'inventory_turnover': float,
            'receivable_turnover': float,
            'days_sales_outstanding': float
        },
        'cash_conversion': {
            'ocf_to_net_income': float,
            'fcf_to_net_income': float,
            'dividend_payout_ratio': float
        }
    }
    """
```

## 财务排雷

### 财报陷阱识别

```python
def detect_financial_traps(symbol: str) -> dict:
    """财务陷阱检测
    
    红线指标:
    1. 应收账款异常增长
    2. 存货异常增长
    3. 关联交易频繁
    4. 现金流与利润不匹配
    5. 会计政策频繁变更
    6. 非经常性损益占比高
    7. 毛利率异常波动
    8. 商誉占总资产比例高
    
    返回:
    {
        'red_flags': [{
            indicator: string,
            severity: "high|medium|low",
            value: float,
            threshold: float,
            description: string
        }],
        'overall_risk': "low|medium|high",
        'warning_signals': [string],
        'recommendations': [string]
    }
    """
```

### 盈利质量分析

```python
def earnings_quality(symbol: str) -> dict:
    """盈利质量分析
    
    检查:
    1. OCF > Net Income (高质量)
    2. FCF > 0
    3. 应计项目稳定
    4. 非经常性损益占比 < 20%
    
    返回:
    {
        'quality_score': float,      # 0-100
        'ocf_to_ni_ratio': float,
        'fcf_quality': "high|medium|low",
        'accruals': {
            'value': float,
            'trend': [float],
            'concern': bool
        },
        'non_recurring_concern': bool,
        'overall_assessment': string
    }
    """
```

### 造假信号检测

```python
def fraud_signals(symbol: str) -> dict:
    """财务造假信号检测
    
    经典造假模式:
    1. 虚增收入: 应收账款激增、期末突击销售
    2. 虚减成本: 存货异常、毛利异常高
    3. 虚增资产: 商誉减值不足、固定资产低估
    4. 关联交易: 大股东占用资金
    
    返回:
    {
        'signals': [{
            type: string,
            severity: "high|medium|low",
            evidence: string,
            benchmark: string
        }],
        'fraud_probability': "low|medium|high",
        'red_alert': bool
    }
    """
```

## 综合财务分析

```python
def comprehensive_financial_analysis(symbol: str) -> dict:
    """综合财务分析"""
    
    return {
        'income_statement': analyze_income_statement(symbol),
        'balance_sheet': analyze_balance_sheet(symbol),
        'cash_flow': analyze_cash_flow(symbol),
        'profitability': profitability_metrics(symbol),
        'growth': growth_metrics(symbol),
        'health': financial_health(symbol),
        'traps': detect_financial_traps(symbol),
        'earnings_quality': earnings_quality(symbol),
        'scores': {
            'overall_score': float,       # 0-100
            'profitability_score': float,
            'growth_score': float,
            'health_score': float,
            'quality_score': float
        },
        'grade': "A|B|C|D"  # 综合评级
    }
```

## 财务分析报告模板

```markdown
# [公司] 财务分析报告

## 1. 财务摘要
| 指标 | 2024 | 2023 | YoY |
|------|------|------|-----|
| 营收 | ¥XX B | ¥XX B | +XX% |
| 净利润 | ¥XX B | ¥XX B | +XX% |
| 毛利率 | XX% | XX% | +/- |
| 净利率 | XX% | XX% | +/- |
| ROE | XX% | XX% | +/- |

## 2. 盈利质量
- OCF/净利润: XX%
- FCF: ¥XX B
- 盈利质量评级: [优/良/差]

## 3. 财务健康度
| 指标 | 数值 | 行业平均 | 评级 |
|------|------|----------|------|
| 资产负债率 | XX% | XX% | 优 |
| 流动比率 | X.XX | X.XX | 良 |

## 4. 风险信号
⚠️ [风险1]
⚠️ [风险2]

## 5. 综合评级
**财务评分**: XX/100 (评级: A/B/C/D)
**投资建议**: [基于财务质量的建议]
```

## 示例分析

### 示例1: 茅台财务分析

```
茅台(600519) 2024财报:

盈利能力:
- 毛利率: 92.8% (行业最高)
- 净利率: 52.4%
- ROE: 38.2%
- ROIC: 35.6%

成长性:
- 营收增长: 17.2% (稳定增长)
- 利润增长: 15.2%
- 五年CAGR: ~15%

财务健康:
- 资产负债率: 18.3% (很低)
- 现金/总资产: 72% (极其充裕)
- 无有息负债

盈利质量:
- OCF/净利润: 1.15 (>1,高质量)
- FCF: ¥63.5 B
- 盈利质量: 优秀

结论: AAA级财务,最强财务护城河
```

### 示例2: 比亚迪财务排雷

```
比亚迪(002594) 2024财报排雷:

⚠️ 应收账款警告:
- 应收款增长: +45% vs 营收增长: +20%
- 应收款/营收: 38% (同行为20%)
- 风险: 可能放宽信用政策冲量

⚠️ 存货警告:
- 存货增长: +52% vs 营收增长: +20%
- 存货周转天数: 95天 (去年同期75天)
- 风险: 可能有滞销风险

✅ 积极信号:
- FCF转正: ¥28.5 B
- 研发投入: ¥39.9 B (占比4.2%)
- 政府补贴: ¥6.5 B (占利润15%,需关注)

结论:
- 整体财务健康,但需关注应收和存货增长
- 盈利质量评分: 70/100 (中等)
```

## 关键原则

1. **多期验证**: 不要只看一期数据
2. **行业对比**: 财务数据要与行业对比才有意义
3. **质量优先**: 关注现金流而非仅看利润
4. **排雷意识**: 警惕异常信号
5. **综合判断**: 单个指标不能说明问题
