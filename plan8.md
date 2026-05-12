# UpUp Claude Code 投资助手架构计划 v8.0

> 版本: 8.0 | 更新日期: 2026-05-12
> 目标: 构建 Claude Code 风格的投资助手，核心+Skills+Plugins 架构

---

## 目录

1. [设计理念](#1-设计理念)
2. [UpUp 核心架构分析](#2-upup-核心架构分析)
3. [核心能力 vs 扩展能力](#3-核心能力-vs-扩展能力)
4. [Claude Code 投资助手架构](#4-claude-code-投资助手架构)
5. [核心能力设计](#5-核心能力设计)
6. [Skills 扩展体系](#6-skills-扩展体系)
7. [Plugins 扩展体系](#7-plugins-扩展体系)
8. [参考项目融合](#8-参考项目融合)
9. [实施路线图](#9-实施路线图)
10. [架构图](#10-架构图)

---

## 1. 设计理念

### 1.1 Claude Code 风格核心思想

```
Claude Code 设计哲学:
├── 核心框架保持简洁
├── 扩展功能通过 Skills/Plugins
├── 用户可自由定制
└── 渐进式复杂度
```

### 1.2 UpUp 投资助手定位

```
┌─────────────────────────────────────────────────────────────────┐
│           UpUp 投资助手 - Claude Code 风格定位                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  核心框架 (Core)                       │   │
│   │   • Agent Loop / Tool Executor / LLM 接口              │   │
│   │   • 消息管理 / 上下文压缩 / Session 持久化            │   │
│   │   • Skill 加载 / Plugin 加载 / MCP 连接               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  投资核心 (Investment Core)            │   │
│   │   • 基础数据获取 / 工具注册表                         │   │
│   │   • 知识库管理 / 配置加载                            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  Skills (用户扩展)                      │   │
│   │   • 股票分析 Skill / 策略回测 Skill / 报告 Skill     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  Plugins (系统扩展)                    │   │
│   │   • MCP 插件 / 数据源插件 / 交易插件                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. UpUp 核心架构分析

### 2.1 核心模块

```
src/
├── agent/                          # Agent 核心
│   ├── agent.ts                   # 主 Agent 类 (43KB)
│   ├── tool-executor.ts            # 工具执行器
│   ├── compact.ts                  # 上下文压缩
│   ├── loop-recovery.ts            # 循环检测恢复
│   ├── session-persistence.ts       # Session 持久化
│   ├── investment-config.ts         # 投资配置加载
│   ├── investment-knowledge.ts      # 投资知识库
│   └── investment-knowledge-tools.ts # 投资知识工具
│
├── tools/                          # 工具模块
│   ├── finance/                   # 美股/A股数据
│   ├── astock/                    # A股专用工具
│   ├── quant/                     # 量化工具
│   ├── valuation/                  # 估值工具
│   └── registry/                  # 工具注册表
│
├── model/                          # LLM 模型
│   └── llm.ts                     # 模型调用封装
│
├── memory/                         # 记忆系统
│   ├── flush.ts                   # 记忆刷新
│   ├── extraction.ts              # 知识提取
│   └── observation-buffer.ts       # 观察缓冲
│
└── utils/                         # 工具函数
    ├── config.ts                  # 配置管理
    ├── tokens.ts                 # Token 计算
    └── tool-result-*.ts          # 工具结果处理
```

### 2.2 扩展模块

```
packages/
├── agent-core/                    # Agent 核心包
├── sdk/                          # SDK 包
├── skills/                       # Skills 系统
│   ├── src/loader.ts            # Skill 加载器
│   ├── src/registry.ts          # Skill 注册表
│   └── src/scheduler.ts         # Skill 调度器
├── mcp/                          # MCP 集成
│   └── src/client.ts            # MCP 客户端
├── plugin-sdk/                   # Plugin SDK
│   └── src/loader.ts           # Plugin 加载器
└── memory/                       # 记忆系统包
```

---

## 3. 核心能力 vs 扩展能力

### 3.1 能力分层

```
┌─────────────────────────────────────────────────────────────────┐
│                      能力分层模型                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Level 5: 用户自定义                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  用户 SKILL.md / 用户 Plugin                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│  Level 4: 系统扩展 (Plugins)                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MCP Server / 数据源插件 / 交易插件 / 可视化插件        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│  Level 3: 投资扩展 (Skills)                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  股票分析 Skill / 策略回测 Skill / 报告生成 Skill       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│  Level 2: 投资核心                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  投资配置 / 知识库 / 基础数据获取 / 估值计算 / 风控      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│  Level 1: Agent 核心                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Agent Loop / Tool Executor / LLM / 上下文管理 / Session │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心能力清单

| 层级 | 能力 | 说明 | 位置 |
|------|------|------|------|
| **L1 Agent 核心** | Agent Loop | 主循环、迭代控制 | `src/agent/agent.ts` |
| L1 | Tool Executor | 工具并行/串行执行 | `src/agent/tool-executor.ts` |
| L1 | LLM 接口 | 多模型支持、fallback | `src/model/llm.ts` |
| L1 | 上下文压缩 | Microcompact/Compaction | `src/agent/compact.ts` |
| L1 | Session 持久化 | 跨会话记忆 | `src/agent/session-persistence.ts` |
| **L2 投资核心** | 投资配置 | GOALS/RULES/GOVERN | `src/agent/investment-config.ts` |
| L2 | 投资知识库 | 公司/行业/策略/风险 | `src/agent/investment-knowledge.ts` |
| L2 | 基础数据获取 | 行情/财务/新闻 | `src/tools/finance/` |
| L2 | 估值计算 | PE/PB/DCF | `src/tools/valuation/` |
| L2 | 风控管理 | 风险指标/头寸限制 | `src/tools/quant/risk-metrics.ts` |
| **L3 Skills** | 股票分析 | 综合分析报告 | `skills/stock-analysis.md` |
| L3 | 策略回测 | 策略模板/回测 | `skills/backtest.md` |
| L3 | 报告生成 | 定期报告/推送 | `skills/report.md` |
| **L4 Plugins** | MCP 集成 | 外部 MCP 服务 | `packages/mcp/` |
| L4 | 数据源插件 | lumostock 等 | `packages/plugins/` |
| L4 | 交易插件 | 模拟/实盘交易 | `packages/plugins/` |

### 3.3 核心原则

```
设计原则:
1. 核心保持稳定 - Agent Loop / LLM 接口 / 上下文管理 不轻易改动
2. 投资能力模块化 - 投资配置/知识库 可独立演进
3. Skills 即插即用 - 用户可自由添加/删除
4. Plugins 按需加载 - MCP 连接、交易插件 可选
5. 向后兼容 - 不破坏现有 Skills 和 Plugins
```

---

## 4. Claude Code 投资助手架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Claude Code 投资助手 - 完整架构                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      用户交互层 (CLI/API/TUI)                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Agent Core (L1)                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │
│  │  │ Agent   │  │  Tool   │  │   LLM   │  │Context  │         │   │
│  │  │ Loop    │──│Executor │──│ Manager │──│Manager  │         │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Investment Core (L2)                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │
│  │  │Invest   │  │Knowledge│  │ Data    │  │Risk    │         │   │
│  │  │Config   │──│Manager  │──│Fetcher  │──│Manager  │         │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                    ┌─────────────┼─────────────┐                   │
│                    ▼             ▼             ▼                       │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐    │
│  │   Skills (L3)     │ │   Plugins (L4)    │ │   MCP (L4)       │    │
│  │                   │ │                   │ │                   │    │
│  │  stock-analysis   │ │  lumostock-data   │ │  lumostock-mcp   │    │
│  │  backtest        │ │  trading-plugin   │ │  tradingagents-cn │    │
│  │  report          │ │  viz-plugin       │ │                   │    │
│  │  sentiment       │ │                   │ │                   │    │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 投资助手交互流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         用户请求处理流程                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  用户: "帮我分析一下贵州茅台的投资价值"                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. Agent 接收请求                                                │   │
│  │    └── 解析意图: 投资分析请求                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 2. Skill 匹配 (L3)                                               │   │
│  │    └── 匹配 stock-analysis Skill                                 │   │
│  │        Skill 指令: 执行综合股票分析流程                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 3. Tool 调用 (L2 核心)                                           │   │
│  │    ├── get_stock_price(600519) - 数据获取                       │   │
│  │    ├── get_financials(600519) - 财务数据                        │   │
│  │    ├── calculate_valuation(600519) - 估值计算                    │   │
│  │    └── analyze_risk(600519) - 风险分析                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 4. Plugin 扩展 (L4)                                              │   │
│  │    ├── lumostock MCP: 获取 K线数据                                │   │
│  │    └── sentiment MCP: 新闻情感分析                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 5. 结果整合 & 输出                                                │   │
│  │    └── 生成综合分析报告                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 核心能力设计

### 5.1 投资配置系统 (Investment Config)

```
src/agent/investment-config.ts

职责:
├── 加载 .upup/ 目录下的配置文档
├── 解析 GOALS.md (投资目标)
├── 解析 RULES.md (分析规则)
├── 解析 GOVERN.md (治理规则)
└── 注入到 Agent System Prompt

配置文档结构:
.upup/
├── GOALS.md       # 投资目标
│   # Investment Goals
│   ---
│   risk_tolerance: moderate
│   analysis_depth: comprehensive
│   time_horizon: long
│
├── RULES.md       # 分析规则
│   # Analysis Rules
│   ---
│   research:
│     - Always verify data sources
│     - Use multiple analysis methods
│
├── GOVERN.md      # 治理规则
│   # Governance
│   ---
│   max_position: 0.1
│   single_stock_limit: 0.2
```

### 5.2 投资知识库 (Investment Knowledge)

```
src/agent/investment-knowledge.ts

职责:
├── 管理公司信息 (ticker, fundamentals, moat, risks)
├── 管理行业信息 (trends, outlook, key metrics)
├── 管理策略信息 (parameters, performance)
├── 管理风险记录 (severity, probability, impact)
└── 提供知识查询接口

知识库存储:
.upup/knowledge/
├── companies/      # 公司数据
│   ├── AAPL.json
│   └── 600519.json
├── sectors/        # 行业数据
├── strategies/     # 策略数据
└── risks/          # 风险数据
```

### 5.3 数据获取层 (Data Fetcher)

```
src/tools/finance/

核心工具:
├── get-stock-price.ts      # 获取股价
├── get-market-data.ts     # 市场数据
├── get-financials.ts      # 财务报表
├── screen-stocks.ts       # 股票筛选
└── news.ts                # 新闻获取

src/tools/astock/

A股专用:
├── get-astock-price.ts    # A股行情
├── get-astock-financials.ts # A股财报
├── tushare-client.ts      # Tushare 接口
└── realtime-client.ts     # 东方财富实时
```

### 5.4 估值计算层 (Valuation)

```
src/tools/valuation/

├── valuation-tools.ts      # DCF/PE/PB 估值
├── target-price.ts        # 目标价计算
└── decision-dashboard.ts  # 决策看板

支持方法:
├── PE 市盈率
├── PB 市净率
├── PS 市销率
├── DCF 现金流折现
├── DDMs 股利折现
└── Comparables 可比公司法
```

### 5.5 风控管理 (Risk Management)

```
src/tools/quant/risk-metrics.ts

风险指标:
├── VaR (Value at Risk)
├── Sharpe Ratio
├── Max Drawdown
├── Beta
├── Sortino Ratio
└── Calmar Ratio

风控规则 (来自 GOVERN.md):
├── 单股最大仓位: 20%
├── 行业最大仓位: 30%
├── 日内最大亏损: 5%
└── 总仓位上限: 80%
```

---

## 6. Skills 扩展体系

### 6.1 Skills 架构

```
.skills/
├── SKILL.md           # Skill 定义文件 (YAML frontmatter)
│
investment/
├── stock-analysis/
│   ├── SKILL.md      # 股票综合分析
│   └── templates/    # 分析模板
├── backtest/
│   ├── SKILL.md      # 策略回测
│   └── strategies/   # 策略文件
├── report/
│   ├── SKILL.md      # 报告生成
│   └── templates/   # 报告模板
├── sentiment/
│   ├── SKILL.md      # 情感分析
│   └── lexicon/      # 情感词典
└── portfolio/
    ├── SKILL.md      # 组合管理
    └── rebalancing/  # 再平衡规则
```

### 6.2 Skill 定义格式

```yaml
# SKILL.md 格式
---
name: stock-analysis
description: 综合股票分析 Skill，执行基本面+技术面+消息面分析
model: sonnet  # 推荐模型
user-invocable: true
argument-hint: <股票代码>
depends-on:
  - data-fetcher
  - valuation
---

# 股票综合分析 Skill

## 执行流程

1. 数据获取
   - 调用 get_stock_price 获取当前价格
   - 调用 get_financials 获取财务数据
   - 调用 get_news 获取最新新闻

2. 技术分析
   - 计算 MA, MACD, KDJ, RSI
   - 识别支撑位和压力位

3. 基本面分析
   - 计算 PE, PB, ROE
   - 评估增长性和盈利能力

4. 综合评估
   - 给出投资建议和目标价
```

### 6.3 核心 Skills 设计

#### Skill 1: stock-analysis (股票分析)

```yaml
# skills/investment/stock-analysis/SKILL.md
---
name: stock-analysis
description: 执行综合股票分析
model: sonnet
user-invocable: true
argument-hint: <股票代码>
depends-on:
  - data-fetcher
  - valuation
---

# 股票综合分析 Skill

## 功能
- 基本面分析: 财务指标、估值水平
- 技术面分析: 趋势、支撑阻力
- 消息面分析: 新闻、公告、研报
- 综合评级: 买入/持有/卖出

## 输出格式
```markdown
## 贵州茅台 (600519) 分析报告

### 1. 基本面
- 当前价格: ¥1850
- PE: 35x (行业平均: 30x)
- ROE: 28%
- 结论: 估值略高于行业平均

### 2. 技术面
- 趋势: 上升通道
- 支撑位: ¥1800
- 压力位: ¥1900
- MACD: 金叉

### 3. 综合评级
- 综合评分: 8/10
- 建议: 持有
- 目标价: ¥2000
```
```

#### Skill 2: backtest (策略回测)

```yaml
# skills/investment/backtest/SKILL.md
---
name: backtest
description: 策略回测 Skill
model: opus
user-invocable: true
argument-hint: <策略ID或参数>
depends-on:
  - data-fetcher
  - risk-metrics
---

# 策略回测 Skill

## 功能
- 加载策略参数
- 历史数据回测
- 性能指标计算
- 生成回测报告

## 支持策略模板
- MA 金叉/死叉
- 突破策略
- 均值回归
- 缠论
```

#### Skill 3: report (报告生成)

```yaml
# skills/investment/report/SKILL.md
---
name: report
description: 投资报告生成 Skill
model: haiku
user-invocable: true
argument-hint: <报告类型>
---

# 投资报告生成 Skill

## 支持报告类型
- 每日简报
- 周度总结
- 月度分析
- 个股深度报告
- 组合绩效报告

## 通知渠道
- 飞书
- 钉钉
- 邮件
```

---

## 7. Plugins 扩展体系

### 7.1 Plugin 架构

```
packages/plugins/
├── plugin-sdk/           # Plugin SDK
│   ├── src/loader.ts   # 加载器
│   ├── src/registry.ts # 注册表
│   └── src/types.ts    # 类型定义
│
└── plugins/
    ├── lumostock/      # lumostock 数据源
    ├── trading/       # 交易执行
    └── visualization/  # 可视化
```

### 7.2 Plugin 类型

```typescript
// 插件类型
type PluginType = 
  | 'data'           // 数据源插件
  | 'trading'        // 交易插件
  | 'visualization'   // 可视化插件
  | 'notification'    // 通知插件

// 插件接口
interface UpUpPlugin {
  type: PluginType;
  name: string;
  version: string;
  description: string;
  
  // 生命周期
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;
  
  // 工具注册
  registerTools(registry: ToolRegistry): void;
}
```

### 7.3 lumostock 数据源插件

```yaml
# packages/plugins/lumostock/plugin.yaml
name: lumostock-data
type: data
version: 1.0.0
description: A股实时行情、K线、估值数据

tools:
  - lumo_stock_query
  - lumo_stock_valuation
  - lumo_generate_report

config:
  server_url: http://localhost:8080
```

### 7.4 交易插件

```yaml
# packages/plugins/trading/plugin.yaml
name: trading-simulation
type: trading
version: 1.0.0
description: 模拟交易执行

tools:
  - sim_place_order
  - sim_get_positions
  - sim_get_orders

features:
  - 模拟下单
  - 持仓跟踪
  - 绩效统计
```

---

## 8. 参考项目融合

### 8.1 daily_stock_analysis 融合

```
来源: /Users/louloulin/Documents/linchong/touzhi/daily_stock_analysis

融合方式: Skill 封装

✓ 策略模板系统
  └── 封装为 backtest Skill
  
✓ 多数据源整合
  └── 通过 lumostock MCP 集成

✓ 自动化报告
  └── 封装为 report Skill

✓ 通知推送
  └── 通过 notification Plugin 集成
```

### 8.2 TradingAgents-CN 融合

```
来源: /Users/louloulin/Documents/linchong/touzhi/TradingAgents-CN

融合方式: MCP 集成 + Skill 封装

✓ MCP Tools 生态
  └── 直接集成 TradingAgents-CN MCP Server
  └── 工具: fundamental_analysis, technical_analysis
  └── 工具: strategy_backtest, portfolio_tools

✓ 多Agent协作
  └── 参考其架构设计 SubAgent 系统
```

### 8.3 lumostock 融合

```
来源: /Users/louloulin/Documents/linchong/touzhi/lumostock

融合方式: Plugin + MCP 集成

✓ Go MCP Server
  └── 集成 lumostock MCP Server
  └── 工具: stock_query, stock_valuation
  └── 工具: generate_report, portfolio_overview

✓ GUI 可视化
  └── 参考其 K线/看板设计
  └── 可作为独立可视化 Skill
```

### 8.4 融合架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         参考项目融合架构                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    daily_stock_analysis              TradingAgents-CN                    │
│    ┌──────────────────┐            ┌──────────────────┐               │
│    │ 策略模板         │            │ MCP Tools        │               │
│    │ 报告生成         │            │ 回测框架         │               │
│    │ 通知推送         │            │ 多Agent协作      │               │
│    └────────┬─────────┘            └────────┬─────────┘               │
│             │                              │                          │
│             ▼                              ▼                          │
│    ┌─────────────────────────────────────────────────────────┐        │
│    │                   UpUp Skills 层                        │        │
│    │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │        │
│    │  │backtest │  │ report  │  │analysis │  │sentiment│   │        │
│    │  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │        │
│    └─────────────────────────────────────────────────────────┘        │
│                                 │                                       │
│                                 ▼                                       │
│    ┌─────────────────────────────────────────────────────────┐        │
│    │                   UpUp Plugins 层                        │        │
│    │  ┌──────────────────────────────────────────────────┐   │        │
│    │  │           lumostock MCP Server                  │   │        │
│    │  │  stock_query | valuation | report | portfolio    │   │        │
│    │  └──────────────────────────────────────────────────┘   │        │
│    └─────────────────────────────────────────────────────────┘        │
│                                                                         │
│    lumostock                                                          │
│    ┌──────────────────┐                                               │
│    │ Go MCP Server    │                                               │
│    │ K线可视化        │                                               │
│    │ 本地存储         │                                               │
│    └──────────────────┘                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. 实施路线图

### 9.1 Phase 1: 核心完善 (1-2周)

```
目标: 完善投资核心层 (L2)

任务:
1. [ ] 完善投资配置加载器
   - 验证 GOALS/RULES/GOVERN 加载
   - 添加配置验证

2. [ ] 扩展投资知识库
   - 添加更多字段支持
   - 优化查询接口

3. [ ] 增强数据获取
   - 添加港股数据支持
   - 添加基金数据支持

4. [ ] 完善风控管理
   - 头寸限制检查
   - 风险预警
```

### 9.2 Phase 2: Skills 开发 (2-3周)

```
目标: 开发核心 Skills (L3)

任务:
1. [ ] stock-analysis Skill
   - 基本面分析
   - 技术面分析
   - 综合评级

2. [ ] backtest Skill
   - 策略模板系统
   - 回测引擎
   - 报告生成

3. [ ] report Skill
   - 报告模板
   - 多格式导出
   - 通知推送
```

### 9.3 Phase 3: Plugins & MCP (2-3周)

```
目标: 集成 Plugins 和 MCP (L4)

任务:
1. [ ] lumostock MCP 集成
   - MCP Server 连接
   - 工具映射
   - 错误处理

2. [ ] TradingAgents-CN MCP 集成
   - 回测工具
   - 组合工具

3. [ ] 数据源 Plugin
   - Plugin SDK 完善
   - lumostock Plugin

4. [ ] 交易 Plugin (可选)
   - 模拟交易
   - 实盘接口
```

### 9.4 Phase 4: 可视化增强 (2-3周)

```
目标: 增强可视化能力

任务:
1. [ ] K线组件
   - 基础K线渲染
   - 技术指标叠加

2. [ ] 看板组件
   - 持仓概览
   - 盈亏分析

3. [ ] 报告可视化
   - 图表生成
   - 导出功能
```

---

## 10. 架构图

### 10.1 完整分层架构

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    Claude Code 投资助手 - 分层架构                    ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                     ┃
┃  ╔═══════════════════════════════════════════════════════════════╗  ┃
┃  ║                     Level 5: 用户自定义                        ║  ┃
┃  ║  ┌─────────────────────────────────────────────────────────┐  ║  ┃
┃  ║  │  用户 SKILL.md  |  用户 Plugin  |  私有知识库          │  ║  ┃
┃  ║  └─────────────────────────────────────────────────────────┘  ║  ┃
┃  ╚═══════════════════════════════════════════════════════════════╝  ┃
┃                                  │                                  ┃
┃                                  ▼                                  ┃
┃  ╔═══════════════════════════════════════════════════════════════╗  ┃
┃  ║                    Level 4: Plugins                         ║  ┃
┃  ║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    ║  ┃
┃  ║  │ MCP Plugins  │  │ Data Plugins │  │Trading Plugin│    ║  ┃
┃  ║  ├──────────────┤  ├──────────────┤  ├──────────────┤    ║  ┃
┃  ║  │lumostock    │  │lumostock-data│  │sim-trading  │    ║  ┃
┃  ║  │tradingagents│  │              │  │             │    ║  ┃
┃  ║  └──────────────┘  └──────────────┘  └──────────────┘    ║  ┃
┃  ╚═══════════════════════════════════════════════════════════════╝  ┃
┃                                  │                                  ┃
┃                                  ▼                                  ┃
┃  ╔═══════════════════════════════════════════════════════════════╗  ┃
┃  ║                    Level 3: Skills                           ║  ┃
┃  ║  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────┐║  ┃
┃  ║  │stock-      │  │ backtest   │  │  report    │  │senti- │║  ┃
┃  ║  │analysis    │  │            │  │            │  │ment   │║  ┃
┃  ║  └────────────┘  └────────────┘  └────────────┘  └───────┘║  ┃
┃  ╚═══════════════════════════════════════════════════════════════╝  ┃
┃                                  │                                  ┃
┃                                  ▼                                  ┃
┃  ╔═══════════════════════════════════════════════════════════════╗  ┃
┃  ║                   Level 2: Investment Core                   ║  ┃
┃  ║  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────┐║  ┃
┃  ║  │Investment │  │Knowledge   │  │  Data      │  │ Risk  │║  ┃
┃  ║  │Config     │  │Manager    │  │  Fetcher   │  │Mgmt   │║  ┃
┃  ║  ├────────────┤  ├────────────┤  ├────────────┤  ├───────┤║  ┃
┃  ║  │GOALS.md   │  │Companies  │  │Finance     │  │Metrics│║  ┃
┃  ║  │RULES.md   │  │Sectors    │  │A-Stock     │  │Limits │║  ┃
┃  ║  │GOVERN.md  │  │Strategies │  │Quant       │  │Alerts │║  ┃
┃  ║  └────────────┘  └────────────┘  └────────────┘  └───────┘║  ┃
┃  ╚═══════════════════════════════════════════════════════════════╝  ┃
┃                                  │                                  ┃
┃                                  ▼                                  ┃
┃  ╔═══════════════════════════════════════════════════════════════╗  ┃
┃  ║                    Level 1: Agent Core                      ║  ┃
┃  ║  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────┐║  ┃
┃  ║  │  Agent    │  │   Tool    │  │    LLM    │  │Context│║  ┃
┃  ║  │  Loop     │──│  Executor │──│   Manager │──│Manager│║  ┃
┃  ║  ├────────────┤  ├────────────┤  ├────────────┤  ├───────┤║  ┃
┃  ║  │Iteration  │  │ Parallel  │  │ Multi-Model│  │Compact│║  ┃
┃  ║  │Recovery   │  │ Serial    │  │ Fallback   │  │Session│║  ┃
┃  ║  └────────────┘  └────────────┘  └────────────┘  └───────┘║  ┃
┃  ╚═══════════════════════════════════════════════════════════════╝  ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### 10.2 数据流架构

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                         数据流架构图                                 ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                     ┃
┃    ┌──────────┐                                                     ┃
┃    │  用户    │                                                     ┃
┃    │  请求    │                                                     ┃
┃    └────┬─────┘                                                     ┃
┃         │                                                           ┃
┃         ▼                                                           ┃
┃    ┌─────────────────────────────────────────────────────────┐     ┃
┃    │                     Agent Core                           │     ┃
┃    │  ┌─────────────────────────────────────────────────┐   │     ┃
┃    │  │  1. 意图识别 → 匹配 Skill/Plugin                  │   │     ┃
┃    │  │  2. Tool 调用序列生成                             │   │     ┃
┃    │  │  3. Tool 执行 (并行/串行)                         │   │     ┃
┃    │  │  4. 结果整合 → 响应生成                           │   │     ┃
┃    │  └─────────────────────────────────────────────────┘   │     ┃
┃    └─────────────────────────────────────────────────────────┘     ┃
┃                              │                                      ┃
┃         ┌───────────────────┼───────────────────┐                  ┃
┃         ▼                   ▼                   ▼                  ┃
┃    ┌──────────┐        ┌──────────┐       ┌──────────┐          ┃
┃    │ Skills  │        │ Core    │       │Plugins │          ┃
┃    │ Layer   │        │ Tools   │       │ Layer │          ┃
┃    ├──────────┤        ├──────────┤       ├──────────┤          ┃
┃    │analysis │        │get-price │       │MCP     │          ┃
┃    │backtest │        │financial │       │Server  │          ┃
┃    │report   │        │valuation │       │        │          ┃
┃    └────┬─────┘        └────┬─────┘       └────┬─────┘          ┃
┃         │                   │                   │                  ┃
┃         └───────────────────┼───────────────────┘                  ┃
┃                             ▼                                     ┃
┃    ┌─────────────────────────────────────────────────────────┐     ┃
┃    │                     数据源层                               │     ┃
┃    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │     ┃
┃    │  │ 东方财富 │  │ Tushare │  │lumostock│  │ 自有    │  │     ┃
┃    │  │ EastMoney│  │         │  │         │  │ 缓存    │  │     ┃
┃    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │     ┃
┃    └─────────────────────────────────────────────────────────┘     ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### 10.3 工具注册流程

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                        工具注册流程图                                 ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                     ┃
┃  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             ┃
┃  │ Skill 加载 │     │Plugin 加载  │     │ MCP 连接   │             ┃
┃  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘             ┃
┃         │                   │                   │                    ┃
┃         ▼                   ▼                   ▼                    ┃
┃  ┌─────────────────────────────────────────────────────────────┐     ┃
┃  │                    Tool Registry                            │     ┃
┃  │  ┌─────────────────────────────────────────────────────┐   │     ┃
┃  │  │                  统一工具表                            │   │     ┃
┃  │  ├─────────────────────────────────────────────────────┤   │     ┃
┃  │  │ Core Tools (L2):                                     │   │     ┃
┃  │  │  • get_stock_price     • get_financials              │   │     ┃
┃  │  │  • calculate_valuation • analyze_risk                │   │     ┃
┃  │  ├─────────────────────────────────────────────────────┤   │     ┃
┃  │  │ Skill Tools (L3):                                    │   │     ┃
┃  │  │  • stock_analysis      • strategy_backtest           │   │     ┃
┃  │  │  • generate_report    • sentiment_analyze             │   │     ┃
┃  │  ├─────────────────────────────────────────────────────┤   │     ┃
┃  │  │ Plugin Tools (L4):                                    │   │     ┃
┃  │  │  • lumo_stock_query   • lumo_valuation             │   │     ┃
┃  │  │  • sim_place_order    • portfolio_overview           │   │     ┃
┃  │  └─────────────────────────────────────────────────────┘   │     ┃
┃  └─────────────────────────────────────────────────────────────┘     ┃
┃                              │                                      ┃
┃                              ▼                                      ┃
┃  ┌─────────────────────────────────────────────────────────────┐     ┃
┃  │                     Tool Executor                             │     ┃
┃  │  • 并行执行 (read-only tools)                                 │     ┃
┃  │  • 串行执行 (write operations)                               │     ┃
┃  │  • 错误处理 & 重试                                           │     ┃
┃  └─────────────────────────────────────────────────────────────┘     ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 附录

### A. 核心文件索引

| 功能 | 文件路径 |
|------|----------|
| Agent 核心 | `src/agent/agent.ts` |
| 工具执行 | `src/agent/tool-executor.ts` |
| 上下文压缩 | `src/agent/compact.ts` |
| 投资配置 | `src/agent/investment-config.ts` |
| 投资知识 | `src/agent/investment-knowledge.ts` |
| 投资知识工具 | `src/agent/investment-knowledge-tools.ts` |
| Skill 加载 | `packages/skills/src/loader.ts` |
| Plugin SDK | `packages/plugin-sdk/src/loader.ts` |
| MCP 客户端 | `packages/mcp/src/client.ts` |

### B. 参考文档

- [UpUp Agent Core](../packages/agent-core/README.md)
- [UpUp SDK](../packages/sdk/README.md)
- [UpUp Skills](../packages/skills/README.md)
- [UpUp Plugin SDK](../packages/plugin-sdk/README.md)
- [Paperclip Adapter](./paperclip1.0.md)

### C. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 8.0 | 2026-05-12 | Claude Code 投资助手架构设计，核心 vs 扩展分层 |
| 7.0 | 2026-05-11 | 投资功能增强计划 |
| ... | ... | ... |

---

*文档版本: 8.0 | 更新日期: 2026-05-12*
