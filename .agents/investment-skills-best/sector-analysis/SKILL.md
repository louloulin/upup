---
name: sector-analysis
description: |
  行业分析专家技能。专注于行业格局、竞争结构、护城河分析、产业链研究。
  当用户询问行业分析、竞争格局、护城河、波特五力、产业链、行业周期时必须使用。
---

# Sector Analysis - 行业分析专家

## 行业分析框架

```
┌─────────────────────────────────────────────────────────────────┐
│                      行业分析体系                                 │
├─────────────────┬─────────────────┬─────────────────┬──────────┤
│  行业格局       │  竞争分析       │  护城河         │  产业链  │
│  Market Struct │  Porter's 5     │  Moat Analysis  │  Chain   │
│  规模/增速     │  五力分析       │  品牌/网络效应 │  上中下游 │
└─────────────────┴─────────────────┴─────────────────┴──────────┘
```

## 波特五力分析

```python
def porter_five_forces(sector: str, subsector: str = None) -> dict:
    """波特五力分析
    
    五力:
    1. 现有竞争者竞争力
    2. 新进入者威胁
    3. 替代品威胁
    4. 供应商议价能力
    5. 购买者议价能力
    
    返回:
    {
        'rivalry': {
            'level': "high|medium|low",
            'factors': [string],
            'key_players': [string],
            'market_concentration': float
        },
        'new_entry': {
            'threat': "high|medium|low",
            'barriers': [string],
            'ease_of_entry': float
        },
        'substitutes': {
            'threat': "high|medium|low",
            'substitute_options': [string],
            'price_sensitivity': float
        },
        'supplier_power': {
            'level': "high|medium|low",
            'concentration': float,
            'switching_cost': float,
            'substitution_available': bool
        },
        'buyer_power': {
            'level': "high|medium|low",
            'concentration': float,
            'sensitivity': float,
            'backward_integration': bool
        },
        'overall_attractiveness': "high|medium|low",
        'summary': string
    }
    """
```

## 护城河分析

```python
def analyze_moat(symbol: str) -> dict:
    """护城河分析
    
    护城河类型:
    1. 无形资产: 品牌、专利、许可证
    2. 转换成本: 用户粘性
    3. 网络效应: 用户越多越有价值
    4. 成本优势: 规模、位置、流程
    
    返回:
    {
        'moat_types': {
            'brand': {
                'present': bool,
                'strength': "wide|moderate|narrow|none",
                'evidence': [string],
                'monetization': float
            },
            'switching_cost': {
                'present': bool,
                'strength': "high|medium|low",
                'cost_estimate': float,
                'examples': [string]
            },
            'network_effect': {
                'present': bool,
                'strength': "wide|moderate|narrow|none",
                'network_type': "direct|indirect|two-sided",
                'mve': float  # 网络价值估算
            },
            'cost_advantage': {
                'present': bool,
                'type': "scale|location|process|resource",
                'advantage_magnitude': float
            },
            'regulatory': {
                'present': bool,
                'type': "license|patent|franchise",
                'duration': str,
                'renewability': "high|medium|low"
            }
        },
        'overall_moat': {
            'strength': "wide|moderate|narrow|none",
            'sustainability': "high|medium|low",
            'years_maintainable': int,
            'investment_implication': string
        },
        'competitive_position': {
            'market_share': float,
            'trend': "gaining|stable|losing",
            'pricing_power': "strong|moderate|weak"
        }
    }
    """
```

## 产业链分析

```python
def analyze_industry_chain(sector: str) -> dict:
    """产业链分析
    
    返回:
    {
        'chain_structure': {
            'upstream': {
                'name': string,
                'key_players': [string],
                'concentration': float,
                'pricing_power': "high|medium|low",
                'margin': float
            },
            'midstream': {...},
            'downstream': {...}
        },
        'value_distribution': {
            'upstream_pct': float,
            'midstream_pct': float,
            'downstream_pct': float,
            'most_valuable_segment': string
        },
        'chain dynamics': {
            'bargaining_power_shift': "upstream|downstream|stable",
            'disruption_risks': [string],
            'integration_trends': [string]
        }
    }
    """
```

## 行业周期分析

```python
def sector_cycle_analysis(sector: str) -> dict:
    """行业周期分析
    
    周期阶段:
    1. 导入期: 高增长,高风险
    2. 成长期: 快速增长,竞争加剧
    3. 成熟期: 稳定增长,行业整合
    4. 衰退期: 负增长,出清
    
    返回:
    {
        'current_phase': "introduction|growth|maturity|decline",
        'phase_indicators': {
            'growth_rate': float,
            'market_consolidation': float,
            'margins_trend': string
        },
        'cycle_position': {
            'years_in_phase': int,
            'phase_duration_typical': int,
            'time_remaining': int | None
        },
        'investor_implications': {
            'appropriate_strategy': string,
            'risk_level': "high|medium|low",
            'return_expectation': string
        }
    }
    """
```

## 行业比较分析

```python
def compare_sectors(sectors: list[str]) -> dict:
    """行业对比分析
    
    返回:
    {
        'comparison': {
            'growth': {sector: rate},
            'profitability': {sector: margin},
            'capital_intensity': {sector: ratio},
            'cyclicality': {sector: "high|medium|low"},
            'regulatory_risk': {sector: "high|medium|low"}
        },
        'rankings': {
            'by_growth': [sector],
            'by_profitability': [sector],
            'by_attractiveness': [sector]
        },
        'recommendations': {
            'for_growth_investor': [sector],
            'for_income_investor': [sector],
            'for_value_investor': [sector]
        }
    }
    """
```

## 行业分析报告模板

```markdown
# [行业/板块] 分析报告

## 1. 行业概况
- 市场规模: ¥XX B
- 年增速: XX%
- 生命周期: [导入/成长/成熟/衰退]
- 主要驱动因素: [列表]

## 2. 波特五力分析
| 力量 | 强度 | 关键因素 |
|------|------|----------|
| 现有竞争 | [高/中/低] | - |
| 新进入者 | [高/中/低] | - |
| 替代品 | [高/中/低] | - |
| 供应商 | [高/中/低] | - |
| 购买者 | [高/中/低] | - |

**行业吸引力**: [高/中/低]

## 3. 护城河分析
### 主要护城河类型
- [类型1]: [强/中/弱], 证据: [列表]
- [类型2]: [强/中/弱], 证据: [列表]

### 综合护城河评级
**护城河宽度**: [宽/中/窄/无]
**可持续年数**: XX年

## 4. 产业链分析
```
上游: [描述] → 中游: [描述] → 下游: [描述]
```
**最有价值环节**: [XXX], 占行业利润XX%

## 5. 投资建议
| 方面 | 评估 |
|------|------|
| 成长性 | [高/中/低] |
| 盈利质量 | [高/中/低] |
| 竞争格局 | [优/良/差] |
| 政策支持 | [强/中/弱] |

**综合评级**: [看好/中性/看淡]
**优质标的**: [列表]
```

## 示例分析

### 示例1: 白酒行业分析

```
白酒行业波特五力:

1. 现有竞争: 高
   - 高端: 茅台、五粮液寡头
   - 次高端: 竞争激烈
   - 中低端: 分散竞争

2. 新进入者: 低
   - 品牌壁垒高
   - 酿造工艺需要时间积累
   - 地理标志保护

3. 替代品: 低
   - 社交场景难以替代
   - 文化属性独特

4. 供应商: 中
   - 高粱等原料分散
   - 包装供应商较多

5. 购买者: 中
   - 高端: 弱(礼品/商务)
   - 大众: 较强

综合: 行业吸引力高

护城河:
- 品牌: 极强(茅台品牌溢价)
- 地理: 强(酱香型独特)
- 老酒储备: 强(年份酒)
→ 护城河评级: 宽,可持续20年+
```

### 示例2: 新能源汽车产业链

```
新能源汽车产业链价值分布:

上游(电池材料):
- 锂、钴、镍: 占比~15%
- 正极材料: 占比~10%
- 宁德时代、赣锋锂业

中游(电池):
- 动力电池: 占比~35%
- 宁德时代、比亚迪

下游(整车):
- 整车制造: 占比~25%
- 比亚迪、特斯拉

下游(充电/服务):
- 充电桩、运营: 占比~15%
- 特来电、星星充电

最有价值环节分析:
1. 电池(35%): 技术壁垒高,规模效应强
2. 碳酸锂(10%): 周期波动大,资源属性
3. 整车(25%): 品牌+软件决定差异

投资建议:
- 最优: 电池龙头(宁德时代)
- 次优: 锂资源(赣锋锂业)
- 关注: 整车差异化(比亚迪)
```

## 关键原则

1. **格局决定命运**: 好行业出好公司
2. **护城河是核心**: 没有护城河最终会死于竞争
3. **周期要判断**: 不同周期阶段策略不同
4. **产业链找价值**: 投资最值钱环节
5. **动态跟踪**: 行业格局会随时间变化
