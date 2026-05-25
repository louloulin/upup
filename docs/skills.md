# Skills System

> Domain-specific capabilities for financial research

## Overview

Skills provide specialized capabilities for financial research, combining multiple tools and data sources:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Skills Architecture                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Skill Executor                            │    │
│  │  • Dynamic loading                                          │    │
│  │  • Capability composition                                    │    │
│  │  • State management                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │  medfish   │      │  technical  │      │  backtest  │     │
│  │             │      │             │      │             │     │
│  │ • 医疗器械  │      │ • RSI/MACD  │      │ • 策略回测  │     │
│  │ • 医药行业  │      │ • 布林带    │      │ • 夏普比率  │     │
│  │ • 体外诊断  │      │ • 均线     │      │ • 最大回撤  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   risk     │      │ sentiment   │      │ fundamental │     │
│  │             │      │             │      │             │     │
│  │ • 波动率   │      │ • 舆情分析  │      │ • 盈利能力  │     │
│  │ • 头寸    │      │ • 机构持仓  │      │ • 成长性    │     │
│  │ • 止损    │      │ • 分析师评级│      │ • ROE/ROA  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Built-in Skills

### 1. MedFish (医疗器械/医药)

Medical and pharmaceutical industry analysis.

**Capabilities:**
- 医疗器械分类
- 医药行业研究
- 体外诊断 (IVD) 分析
- CXO 行业分析
- A股医疗公司财报

**Data Sources:**
- Tushare Pro (财报数据)
- AKShare (实时行情)

**Usage:**
```
> 分析医疗器械行业
[Skill: medfish] 已加载
正在采集医疗行业数据...
```

### 2. Technical Analysis (技术分析)

Technical indicator calculation and chart analysis.

**Capabilities:**
- RSI (相对强弱指数)
- MACD (移动平均收敛发散)
- 布林带 (Bollinger Bands)
- 均线系统 (MA5, MA10, MA20, MA60)
- KDJ 指标
- 成交量分析

**Usage:**
```
> 计算贵州茅台的RSI指标
[Skill: technical-analysis] 已加载
RSI(14): 65.3 (偏强)
```

### 3. Backtesting (回测引擎)

Strategy backtesting and performance analysis.

**Capabilities:**
- 策略回测
- 夏普比率计算
- 最大回撤分析
- 收益统计
- 交易信号生成

**Usage:**
```
> 回测双均线策略
[Skill: backtesting] 已加载
开始回测...
年化收益: 15.3%
夏普比率: 1.82
最大回撤: -8.5%
```

### 4. Risk Management (风险管理)

Risk calculation and position management.

**Capabilities:**
- 波动率计算
- 头寸限制
- 止损策略
- 风险敞口
- 相关性分析

**Usage:**
```
> 计算投资组合风险
[Skill: risk-management] 已加载
组合波动率: 18.5%
风险价值(VaR): -5.2%
建议仓位: 15%
```

### 5. Sentiment Analysis (舆情分析)

News sentiment and public opinion analysis.

**Capabilities:**
- 新闻情感分析
- 机构持仓追踪
- 分析师评级
- 内部交易监控
- 社交媒体情绪

**Usage:**
```
> 分析比亚迪舆情
[Skill: sentiment-analysis] 已加载
情感得分: +0.72 (偏正面)
近期新闻: 15篇 | 正面: 8 | 负面: 2
```

### 6. Financial Data (金融数据)

Financial data acquisition and processing.

**Capabilities:**
- 股票价格
- 财务报表
- 资金流向
- 估值指标
- 宏观数据

**Data Sources:**
| Source | Coverage | Update |
|--------|----------|--------|
| Tushare Pro | A股全市场 | 日更 |
| AKShare | A股+港股 | 实时 |
| Financial Datasets API | 美股 | 实时 |

### 7. Fundamental Analysis (基本面分析)

Company fundamental analysis.

**Capabilities:**
- 盈利能力分析
- 成长性评估
- 财务健康诊断
- 运营效率
- 资产负债表分析

**Metrics:**
| Category | Indicators |
|----------|-----------|
| 盈利 | ROE, ROA, 毛利率, 净利率 |
| 成长 | 营收增速, 利润增速 |
| 财务 | 资产负债率, 流动比率 |
| 运营 | 存货周转, 应收账款周转 |

---

## Skill Composition

Skills can be combined for comprehensive analysis:

```
┌─────────────────────────────────────────────────────────────┐
│               Multi-Skill Analysis Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Input: "贵州茅台投资价值分析"                               │
│                                                              │
│  ┌─────────────┐                                            │
│  │ medfish    │ → 行业地位                                  │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ fundamental │ → 财务指标                                 │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ technical   │ → 技术位置                                 │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ risk       │ → 风险评估                                  │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ sentiment   │ → 舆情情感                                 │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 综合报告    │                                            │
│  └─────────────┘                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Skill API

### Skill Manifest

```typescript
// Skill metadata
interface SkillManifest {
  name: string;           // Skill name
  version: string;      // Version
  description: string;   // Description
  author: string;        // Author
  tags: string[];        // Categorization tags
  dependencies: string[]; // Required skills
  capabilities: Capability[];
}

interface Capability {
  name: string;         // Capability name
  description: string;   // Description
  parameters: Parameter[]; // Input parameters
  output: OutputSpec;     // Output specification
}
```

### Skill Executor

```typescript
// src/skills/skill-executor.ts
class SkillExecutor {
  async execute(skill: string, params: Record<string, unknown>) {
    // 1. Load skill module
    const module = await this.loadSkill(skill);

    // 2. Validate parameters
    this.validate(params, module.manifest.parameters);

    // 3. Execute capability
    const result = await module.execute(params);

    // 4. Format output
    return this.format(result, module.manifest.output);
  }
}
```

### Creating a Custom Skill

```typescript
// my-skill/index.ts
export const manifest = {
  name: 'my-analysis',
  version: '1.0.0',
  description: 'Custom analysis skill',
  tags: ['analysis', 'custom'],
  capabilities: [
    {
      name: 'analyze',
      description: 'Perform custom analysis',
      parameters: [
        { name: 'symbol', type: 'string', required: true },
        { name: 'period', type: 'number', default: 30 }
      ],
      output: { type: 'report' }
    }
  ]
};

export async function execute(params: Record<string, unknown>) {
  // Skill logic
  const symbol = params.symbol as string;
  const period = params.period as number;

  // Return result
  return {
    symbol,
    analysis: `Analysis for ${symbol} over ${period} days`
  };
}
```

---

## Skill Registry

### Registry Structure

```typescript
// src/skills/skill-registry.ts
class SkillRegistry {
  private skills: Map<string, SkillModule> = new Map();

  register(skill: SkillModule) {
    this.skills.set(skill.manifest.name, skill);
  }

  async load(name: string): Promise<SkillModule> {
    const skill = this.skills.get(name);
    if (!skill) throw new SkillNotFoundError(name);
    return skill;
  }

  list(): SkillManifest[] {
    return Array.from(this.skills.values())
      .map(s => s.manifest);
  }
}
```

### Auto-discovery

Skills are auto-discovered from:

```
src/skills/built-in/
├── medfish/
│   ├── manifest.ts
│   ├── index.ts
│   └── ...
├── technical/
├── backtest/
└── ...
```

---

## Related Documents

- [Architecture](architecture.md)
- [Tools](tools.md)
- [API Reference](api.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
