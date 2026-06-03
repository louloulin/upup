---
name: valuation-expert
description: |
  股票估值专家技能。专注于估值分析：DCF、PE、PB、PS、EV/EBITDA等估值方法，估值对比、安全边际计算。
  当用户询问估值、目标价、内在价值、折价、溢价时必须使用。
---

# Valuation Expert - 股票估值专家

## 估值方法体系

```
┌─────────────────────────────────────────────────────────────────┐
│                        估值方法                                   │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│  绝对估值       │  相对估值        │  特殊估值       │  综合   │
│  DCF/DDM        │  PE/PB/PS       │  股息折现       │  估值   │
│  剩余收益       │  EV/EBITDA      │  清算价值       │  调整   │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## DCF估值详解

### 核心公式

```
内在价值 = Σ (FCFt / (1+WACC)^t) + TV / (1+WACC)^n

其中:
- FCFt = 第t年的自由现金流
- WACC = 加权平均资本成本
- TV = 终值 (Terminal Value)
- n = 预测期年数
```

### 参数设定指南

```python
def set_dcf_params(sector: str, size: str = "mid") -> dict:
    """根据行业和公司规模设定DCF参数
    
    sector: "tech"|"finance"|"consumer"|"industrial"|"energy"
    size: "large"|"mid"|"small"
    
    返回参数模板:
    {
        discount_rate: float,      # WACC (一般为8%-12%)
        terminal_growth: float,    # 永续增长率 (一般为2%-3%)
        profit_margin: float,     # 永续期净利率
        years: int                # 预测年数 (通常5-10年)
    }
    """
```

### 行业参数参考

| 行业 | WACC范围 | 永续增长率 | 利润率 | 预测年 |
|------|----------|-----------|--------|--------|
| 科技 | 8-10% | 2.5-4% | 15-25% | 7-10年 |
| 金融 | 9-11% | 2-3% | 15-30% | 5-7年 |
| 消费 | 8-10% | 2-3% | 8-15% | 5-7年 |
| 工业 | 9-12% | 1.5-2.5% | 5-12% | 5-7年 |
| 能源 | 10-12% | 1-2% | 5-10% | 5-7年 |

### DCF计算流程

```python
def dcf_calculate(symbol: str, custom_params: dict = None) -> dict:
    """DCF完整计算"""
    
    # Step 1: 收集数据
    financials = get_financials(symbol)
    current_shares = get_shares_outstanding(symbol)
    current_price = get_price(symbol)
    
    # Step 2: 预测未来现金流
    # 方法A: 基于营收增长预测
    # 方法B: 基于历史利润率外推
    # 方法C: 情景分析(乐观/基准/悲观)
    
    projections = []
    for year in range(1, params['years'] + 1):
        # 营收预测: Revenue_t = Revenue_0 * (1+g)^t
        revenue = base_revenue * ((1 + growth_rate) ** year)
        fcf = revenue * fcf_margin  # 通常为营收的8-15%
        projections.append({
            year: year,
            revenue: revenue,
            fcf: fcf,
            present_value: fcf / ((1 + params['discount_rate']) ** year)
        })
    
    # Step 3: 计算终值
    # 方法A: Gordon Growth Model
    terminal_fcf = projections[-1]['fcf'] * (1 + params['terminal_growth'])
    terminal_value = terminal_fcf / (params['discount_rate'] - params['terminal_growth'])
    
    # 方法B: EV/EBITDA Multiples
    terminal_ebitda = projections[-1]['ebitda']
    terminal_value = terminal_ebitda * sector_multiples
    
    terminal_pv = terminal_value / ((1 + params['discount_rate']) ** params['years'])
    
    # Step 4: 汇总计算
    total_pv = sum(p['present_value'] for p in projections)
    enterprise_value = total_pv + terminal_pv
    
    # Step 5: 股权价值
    equity_value = enterprise_value - net_debt + minority_interest
    value_per_share = equity_value / current_shares
    
    return {
        'intrinsic_value': value_per_share,
        'current_price': current_price,
        'upside_potential': (value_per_share - current_price) / current_price,
        'margin_of_safety': 1 - (current_price / value_per_share)
    }
```

## 相对估值

### PE估值

```python
def pe_valuation(symbol: str, peers: list[str] = None) -> dict:
    """PE相对估值
    
    适用场景: 成熟行业、盈利稳定
    不适用: 亏损公司、周期股初期
    
    返回:
    {
        'trailing_pe': float,      # TTM PE
        'forward_pe': float,      # 前瞻PE
        'sector_avg_pe': float,
        'relative_pe': float,     # 相对行业PE
        'historical_pe_percentile': float,  # 历史百分位
        'verdict': "undervalued|fair|overvalued"
    }
    """
```

### PB估值

```python
def pb_valuation(symbol: str, sector: str) -> dict:
    """PB相对估值
    
    适用场景: 金融业、资产重公司
    不适用: 轻资产公司、服务业
    """
```

### EV/EBITDA估值

```python
def ev_ebitda_valuation(symbol: str) -> dict:
    """EV/EBITDA估值
    
    优势: 消除资本结构影响，适合并购估值
    注意: 需要考虑折旧政策差异
    """
```

### PS估值

```python
def ps_valuation(symbol: str, sector: str) -> dict:
    """PS估值
    
    适用场景: 成长股、营收稳定但利润波动
    不适用: 营收质量差的公司
    """
```

## 估值综合框架

```python
def comprehensive_valuation(symbol: str) -> dict:
    """综合估值分析"""
    
    results = {
        'dcf': dcf_calculate(symbol),
        'pe': pe_valuation(symbol),
        'pb': pb_valuation(symbol),
        'ev_ebitda': ev_ebitda_valuation(symbol),
        'ps': ps_valuation(symbol)
    }
    
    # 加权综合估值
    weights = {
        'dcf': 0.30,
        'pe': 0.25,
        'pb': 0.15,
        'ev_ebitda': 0.20,
        'ps': 0.10
    }
    
    weighted_value = sum(
        results[method]['value'] * weights[method] 
        for method in weights
    )
    
    return {
        'methods': results,
        'weighted_value': weighted_value,
        'target_price': weighted_value,
        'current_price': get_price(symbol),
        'overall_verdict': "undervalued" if weighted_value > current_price else "overvalued",
        'confidence': calculate_confidence(results)
    }
```

## 安全边际

```python
def calculate_margin_of_safety(current_price: float, intrinsic_value: float,
                              confidence: str = "medium") -> dict:
    """计算安全边际
    
    confidence: "low"|"medium"|"high"
    
    安全边际标准:
    - 高信心: >20%
    - 中等信心: >30%
    - 低信心: >40%
    """
    margin = (intrinsic_value - current_price) / current_price
    
    return {
        'margin_percent': margin * 100,
        'is_sufficient': margin > thresholds[confidence],
        'recommendation': "买入" if margin > 0.3 else "观望" if margin > 0.15 else "谨慎"
    }
```

## 估值报告模板

```markdown
# [股票] 估值分析报告

## 1. 估值摘要
| 估值方法 | 估值结果 | 当前价格 | 溢价/折价 |
|----------|----------|----------|-----------|
| DCF | ¥XXX | ¥XXX | XX% |
| PE | ¥XXX | ¥XXX | XX% |
| ... | ... | ... | ... |
| **综合** | **¥XXX** | **¥XXX** | **XX%** |

## 2. DCF详细分析
### 2.1 参数设定
- 折现率(WACC): XX%
- 永续增长率: X.X%
- 预测年数: X年

### 2.2 现金流预测
| 年份 | 营收 | 增长率 | FCF | 折现值 |
|------|------|--------|-----|--------|
| 2025 | | | | |
| ... | | | | |

### 2.3 敏感性分析
| 折现率\永续增长 | 2.0% | 2.5% | 3.0% |
|----------------|------|------|------|
| 8% | | | |
| 10% | | | |
| 12% | | | |

## 3. 相对估值
### 3.1 同业对比
| 公司 | PE | PB | EV/EBITDA |
|------|----|----|----------|
| [标的] | | | |
| [可比1] | | | |
| [可比2] | | | |

### 3.2 历史估值百分位
- 当前PE处于历史XX%分位
- 当前PB处于历史XX%分位

## 4. 综合结论
- **目标价**: ¥XXX
- **当前价**: ¥XXX
- **上涨空间**: XX%
- **安全边际**: XX%
- **投资建议**: [强烈买入/买入/持有/观望]
```

## 示例计算

### 示例1: 茅台DCF估值

```
参数:
- 当前股价: ¥1800
- 预测营收增长: 15% -> 12% -> 10% -> 8% -> 5%
- 永续增长率: 2.5%
- 折现率: 9%
- 净利润率: 50%

计算:
Year 1: FCF = 850B * (1+0.15) * 0.50 = 489B
PV1 = 489B / 1.09 = 448B
...
Year 5: FCF = 850B * 1.15*1.12*1.10*1.08*1.05 * 0.50 = 628B
PV5 = 628B / 1.09^5 = 408B

TV = 628B * 1.025 / (0.09 - 0.025) = 9.8T
PV(TV) = 9.8T / 1.09^5 = 6.37T

内在价值 ≈ 6.8T / 12.56B = ¥5400

结论: 当前¥1800处于折价状态,安全边际66%
```

### 示例2: 成长股PE判断

```
特斯拉(TSLA):
- Forward PE: 80x (亏损 -> 盈利转折点)
- 行业中位数PE: 25x
- 结论: 溢价明显,但需看增长是否能匹配估值
```

## 关键原则

1. **多方法验证**: 不要依赖单一估值方法
2. **参数合理**: 避免过于乐观的假设
3. **安全边际**: 始终计算并说明安全边际
4. **定期更新**: 估值需要随着财报更新
5. **行业特性**: 不同行业适用不同估值方法
