# Investment Skills Master Collection
# 投资分析Skills最佳合集

## 概述

本合集从UpUp项目代码中蒸馏出核心投资能力，形成独立可用的Skills集合。每个Skill都包含详细的代码模板和真实验证用例。

## 核心Skills

| Skill | 行数 | Evals | 核心能力 |
|-------|------|-------|----------|
| `investment-core` | 387 | 5 | 综合投资分析、数据收集、估值、风控 |
| `valuation-expert` | 331 | 5 | DCF、PE/PB估值、安全边际 |
| `risk-management` | 444 | 5 | VaR、回撤、止损、仓位管理 |
| `technical-analysis` | 427 | 5 | MACD/RSI、布林带、买卖信号 |
| `financial-analysis` | 449 | 5 | 财报分析、盈利质量、排雷 |
| `sector-analysis` | 354 | 5 | 波特五力、护城河、产业链 |

**总计**: 6 Skills | 30 Evals | 2392行代码

## 特点

- ✅ **独立运行**: 不依赖UpUp框架
- ✅ **代码模板**: 包含可直接使用的Python代码模板
- ✅ **真实验证**: 每个Skill都有Evals测试用例
- ✅ **中文支持**: 完整的中文投资术语和示例

## 使用方法

### 1. 复制到Skills目录

```bash
cp -r investment-skills-best/* ~/.agents/skills/
```

### 2. 在AI Agent中使用

```
分析苹果公司的投资价值
```

Agent会自动选择 `investment-core` Skill进行处理。

### 3. 运行Evals验证

```bash
# 查看测试用例
cat <skill>/evals.json

# 手动验证
# 输入测试用例到支持Skills的AI Agent中
```

## Skill详解

### investment-core (核心)

集成所有投资能力的主Skill，包括：
- 数据收集 (股价、财务、SEC文件)
- 基本面分析
- DCF和相对估值
- 风险评估
- 技术面分析
- 组合管理

### valuation-expert (估值)

专注估值的专业Skill：
- DCF完整计算流程
- PE/PB/PS/EV-EBITDA相对估值
- 安全边际计算
- 敏感性分析
- 多方法综合估值

### risk-management (风控)

风险管理的专业Skill：
- VaR计算 (历史模拟法、方差-协方差法)
- 最大回撤分析
- 止损策略 (固定、波动率、移动止损)
- 仓位管理 (Kelly公式、风险平价)
- 组合风险分解

### technical-analysis (技术)

技术分析的专业Skill：
- MACD/RSI/KD指标
- 布林带分析
- 均线系统 (SMA/EMA)
- K线形态识别
- 趋势线和支撑阻力

### financial-analysis (财务)

财务分析的专业Skill：
- 三大报表解读
- ROE/ROA/ROIC分解
- 盈利质量评估
- 现金流分析
- 财务陷阱检测

### sector-analysis (行业)

行业分析的专业Skill：
- 波特五力分析
- 护城河评估
- 产业链价值分布
- 行业周期判断
- 竞争格局分析

## 示例用例

### 示例1: 股票分析
```
用户: 分析贵州茅台的投资价值
Skill: investment-core
流程:
1. get_price("600519") → 股价¥1800
2. get_financials("600519") → 财务数据
3. analyze_fundamentals("600519") → 基本面
4. dcf_valuation("600519") → DCF估值
5. assess_risk("600519") → 风险评估
输出: 完整投资分析报告
```

### 示例2: 估值分析
```
用户: 用DCF模型估算特斯拉内在价值
Skill: valuation-expert
流程:
1. 收集财务数据
2. 设定参数 (WACC、永续增长率)
3. 预测未来现金流
4. 计算终值
5. 汇总股权价值
输出: DCF估值报告
```

### 示例3: 风险评估
```
用户: 计算我持有茅台的VaR
Skill: risk-management
流程:
1. 计算日收益率序列
2. 计算波动率
3. 设定置信度(95%)
4. 计算VaR金额
输出: 风险评估报告
```

## 更新日志

- 2026-05-31: 初始版本
  - 6个核心Skills
  - 30个Evals测试用例
  - 完整的代码模板
