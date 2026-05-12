# UpUp Claude Code 投资助手架构计划 v8.0

> 版本: 8.0 | 更新日期: 2026-05-12
> 目标: 构建 Claude Code 风格的投资助手，核心+Skills+Plugins 架构

---

## 目录

1. [设计理念](#1-设计理念)
2. [Claude Code 核心架构分析](#2-claude-code-核心架构分析)
3. [UpUp 核心架构分析](#3-upup-核心架构分析)
4. [能力分层模型](#4-能力分层模型)
5. [核心能力设计](#5-核心能力设计)
6. [Skills 扩展体系](#6-skills-扩展体系)
7. [Plugins 扩展体系](#7-plugins-扩展体系)
8. [参考项目融合](#8-参考项目融合)
9. [实施路线图](#9-实施路线图)
10. [架构图](#10-架构图)

---

## 1. 设计理念

### 1.1 Claude Code 设计哲学

Claude Code (loucode) 实现了**渐进式复杂度**架构：

```
Claude Code 设计哲学:
├── 核心框架保持简洁稳定
├── 扩展功能通过 Skills/Plugins
├── 用户可自由定制和扩展
├── 能力通过系统提示词注入
└── 子 Agent 实现复杂任务
```

**核心洞察来自 loucode 分析：**

| 组件 | 文件 | 核心功能 |
|------|------|----------|
| QueryEngine | `src/QueryEngine.ts` | 会话生命周期管理，消息持久化 |
| tools.ts | `src/tools.ts` | 59 种工具类型统一注册表 |
| SkillTool | `src/tools/SkillTool/` | 技能执行（inline/forked 双模式） |
| AgentTool | `src/tools/AgentTool/` | 子 Agent 创建和协作 |
| MCP 集成 | `src/services/mcp/` | 外部工具连接 |

### 1.2 UpUp 投资助手定位

```
┌─────────────────────────────────────────────────────────────────┐
│           UpUp 投资助手 - Claude Code 风格定位                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Level 5: 用户自定义                                     │   │
│   │  • 用户 SKILL.md / 用户 Plugin                          │   │
│   │  • 私有知识库 / 自定义工作流                              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Level 4: Plugins (系统扩展)                             │   │
│   │  • MCP Server / 数据源插件 / 交易插件 / 可视化插件        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Level 3: Skills (投资扩展)                             │   │
│   │  • 股票分析 Skill / 策略回测 Skill / 报告生成 Skill       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Level 2: Investment Core (投资核心)                    │   │
│   │  • 投资配置 / 知识库 / 基础数据获取 / 估值计算 / 风控      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Level 1: Agent Core (Agent 核心)                      │   │
│   │  • Agent Loop / Tool Executor / LLM / 上下文管理        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Claude Code 核心架构分析

### 2.1 QueryEngine 架构

**文件**: `/Users/louloulin/Documents/linchong/claw/loucode/src/QueryEngine.ts`

Claude Code 的 QueryEngine 是核心查询引擎，管理整个会话生命周期：

```typescript
export class QueryEngine {
  // 核心状态
  private mutableMessages: Message[]      // 消息历史
  private totalUsage: NonNullableUsage     // Token 使用统计
  private discoveredSkillNames: Set        // 发现的技能
  private abortController: AbortController  // 中断控制

  // 核心方法
  async *submitMessage(prompt, options): AsyncGenerator<SDKMessage>
  interrupt(): void
  getMessages(): readonly Message[]
}
```

**关键设计模式：**

1. **AsyncGenerator 输出**: 使用 AsyncGenerator 逐步 yield 消息，支持流式 UI 更新
2. **Session 持久化**: 消息自动记录到 transcript，支持 --resume 恢复
3. **技能发现追踪**: `discoveredSkillNames` 用于追踪发现的技能
4. **权限管理**: `wrappedCanUseTool` 包装权限检查并追踪拒绝

### 2.2 工具系统架构

**文件**: `/Users/louloulin/Documents/linchong/claw/loucode/src/tools.ts`

Claude Code 定义了 59 种工具，分为几大类：

| 类别 | 工具数 | 核心工具 |
|------|--------|----------|
| 文件操作 | 8 | FileReadTool, FileEditTool, FileWriteTool |
| Agent 协作 | 5 | AgentTool, TaskCreate/Stop/List/Output |
| 技能系统 | 2 | SkillTool, ExitPlanModeTool |
| 网络搜索 | 2 | WebSearchTool, WebFetchTool |
| 系统命令 | 5 | BashTool, GrepTool, GlobTool |
| 计划模式 | 2 | EnterPlanModeTool, ExitPlanModeV2Tool |
| MCP 集成 | 2 | ListMcpResourcesTool, ReadMcpResourceTool |
| 其他 | 35+ | TodoWrite, AskUser, Cron, Push, etc |

**工具注册流程：**

```typescript
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // ... 条件加载的工具
    SkillTool,           // 技能执行
    // ... 更多工具
  ]
}

export function assembleToolPool(
  permissionContext,
  mcpTools: Tools
): Tools {
  // 1. 获取内置工具
  const builtInTools = getTools(permissionContext)
  // 2. 过滤 MCP 工具
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)
  // 3. 合并去重
  return uniqBy([...builtInTools, ...allowedMcpTools], 'name')
}
```

### 2.3 SkillTool 实现

**文件**: `/Users/louloulin/Documents/linchong/claw/loucode/src/tools/SkillTool/SkillTool.ts`

Claude Code 的 SkillTool 支持两种执行模式：

```typescript
// 技能执行接口
export interface SkillTool {
  input: { skill: string; args?: string }
  output: {
    // inline 模式 (默认)
    success: boolean
    commandName: string
    allowedTools?: string[]
    model?: string
    status: 'inline'
    // forked 模式 (context: 'fork')
    forked: true
    agentId: string
    result: string
    status: 'forked'
  }
}

// 执行流程
async call({ skill, args }, context, canUseTool) {
  // 1. 验证技能存在
  const commands = await getAllCommands(context)
  const command = findCommand(commandName, commands)

  // 2. 检查执行模式
  if (command?.type === 'prompt' && command.context === 'fork') {
    // Forked: 在子 Agent 中执行
    return executeForkedSkill(command, args, context, canUseTool)
  }

  // 3. Inline: 直接处理命令
  const processedCommand = await processPromptSlashCommand(commandName, args, commands, context)
  return { newMessages: processedCommand.messages, ... }
}
```

### 2.4 AgentTool 实现

**文件**: `/Users/louloulin/Documents/linchong/claw/loucode/src/tools/AgentTool/`

Claude Code 支持创建子 Agent 实现复杂任务：

```typescript
// Agent 定义
interface AgentDefinition {
  agentType: 'general' | 'code' | 'research'
  model?: string
  effort?: 'light' | 'medium' | 'maximum'
  tools?: string[]
  instructions?: string
}

// Agent 执行
async function runAgent({ agentDefinition, promptMessages, ... }) {
  // 创建子 Agent
  const agent = new Agent(agentDefinition)
  // 执行消息循环
  for await (const message of agent.run()) {
    yield message
  }
}
```

---

## 3. UpUp 核心架构分析

### 3.1 当前架构

```
src/
├── agent/                      # Agent 核心
│   ├── agent.ts               # 主 Agent 类 (~43KB)
│   ├── tool-executor.ts        # 工具执行器
│   ├── compact.ts              # 上下文压缩
│   ├── loop-recovery.ts        # 循环检测恢复
│   ├── session-persistence.ts  # Session 持久化
│   ├── investment-config.ts     # 投资配置加载
│   ├── investment-knowledge.ts  # 投资知识库
│   └── investment-knowledge-tools.ts # 投资知识工具
│
├── tools/                      # 工具模块
│   ├── finance/               # 美股/A股数据
│   ├── astock/                # A股专用工具
│   ├── quant/                 # 量化工具
│   ├── valuation/             # 估值工具
│   └── registry/              # 工具注册表
│
├── model/                      # LLM 模型
│   └── llm.ts                 # 模型调用封装
│
├── memory/                     # 记忆系统
│   ├── flush.ts               # 记忆刷新
│   ├── extraction.ts           # 知识提取
│   └── observation-buffer.ts  # 观察缓冲
│
└── utils/                     # 工具函数
    ├── config.ts              # 配置管理
    ├── tokens.ts              # Token 计算
    └── tool-result-*.ts       # 工具结果处理
```

### 3.2 扩展模块

```
packages/
├── agent-core/                 # Agent 核心包
├── sdk/                       # SDK 包
├── skills/                    # Skills 系统
│   ├── src/loader.ts         # Skill 加载器
│   ├── src/registry.ts       # Skill 注册表
│   └── src/scheduler.ts      # Skill 调度器
├── mcp/                       # MCP 集成
│   └── src/client.ts         # MCP 客户端
├── plugin-sdk/                # Plugin SDK
│   └── src/loader.ts         # Plugin 加载器
└── memory/                    # 记忆系统包
```

---

## 4. 能力分层模型

### 4.1 能力矩阵

| 层级 | 能力 | 说明 | 稳定性 | 扩展方式 |
|------|------|------|--------|----------|
| **L1 Agent 核心** | Agent Loop | 主循环、迭代控制 | ⭐⭐⭐⭐⭐ | 不扩展 |
| L1 | Tool Executor | 工具并行/串行执行 | ⭐⭐⭐⭐⭐ | 通过注册 |
| L1 | LLM 接口 | 多模型支持、fallback | ⭐⭐⭐⭐⭐ | 配置驱动 |
| L1 | 上下文压缩 | Microcompact/Compaction | ⭐⭐⭐⭐ | 算法优化 |
| L1 | Session 持久化 | 跨会话记忆 | ⭐⭐⭐⭐ | 存储扩展 |
| **L2 投资核心** | 投资配置 | GOALS/RULES/GOVERN | ⭐⭐⭐⭐ | 配置驱动 |
| L2 | 投资知识库 | 公司/行业/策略/风险 | ⭐⭐⭐ | 知识积累 |
| L2 | 基础数据获取 | 行情/财务/新闻 | ⭐⭐⭐ | 工具注册 |
| L2 | 估值计算 | PE/PB/DCF | ⭐⭐⭐ | 算法扩展 |
| L2 | 风控管理 | 风险指标/头寸限制 | ⭐⭐⭐ | 规则扩展 |
| **L3 Skills** | 股票分析 | 综合分析报告 | ⭐⭐ | Skill 加载 |
| L3 | 策略回测 | 策略模板/回测 | ⭐⭐ | Skill 加载 |
| L3 | 报告生成 | 定期报告/推送 | ⭐⭐ | Skill 加载 |
| L3 | 情感分析 | 新闻/舆情分析 | ⭐ | Skill 加载 |
| **L4 Plugins** | MCP 集成 | 外部 MCP 服务 | ⭐ | Plugin 加载 |
| L4 | 数据源插件 | lumostock 等 | ⭐ | Plugin 加载 |
| L4 | 交易插件 | 模拟/实盘交易 | ⭐ | Plugin 加载 |

### 4.2 设计原则

```
设计原则:
1. 核心保持稳定 - Agent Loop / LLM 接口 / 上下文管理 不轻易改动
2. 投资能力模块化 - 投资配置/知识库 可独立演进
3. Skills 即插即用 - 用户可自由添加/删除
4. Plugins 按需加载 - MCP 连接、交易插件 可选
5. 向后兼容 - 不破坏现有 Skills 和 Plugins
```

---

## 5. 核心能力设计

### 5.1 L1: Agent 核心

```
Agent Core (L1)
├── 核心文件
│   ├── src/agent/agent.ts          # 主 Agent 类 (~43KB)
│   ├── src/agent/tool-executor.ts  # 工具执行器
│   ├── src/agent/compact.ts        # 上下文压缩
│   └── src/agent/session-persistence.ts # Session 持久化
│
├── 核心功能
│   ├── Agent Loop: run() 方法执行主循环
│   ├── Tool Executor: 并行/串行执行工具
│   ├── Context Manager: 消息压缩/历史管理
│   └── LLM Manager: 模型调用/fallback
│
└── 设计参考
    └── 借鉴 loucode QueryEngine 的会话管理
```

### 5.2 L2: 投资核心

```
Investment Core (L2)
├── 投资配置系统
│   ├── src/agent/investment-config.ts   # GOALS/RULES/GOVERN 加载
│   ├── .upup/GOALS.md                   # 投资目标配置
│   ├── .upup/RULES.md                   # 分析规则
│   └── .upup/GOVERN.md                  # 治理规则
│
├── 投资知识库
│   ├── src/agent/investment-knowledge.ts      # 知识管理
│   ├── src/agent/investment-knowledge-tools.ts # 知识工具
│   └── .upup/knowledge/                       # 知识存储
│       ├── companies/                         # 公司数据
│       ├── sectors/                           # 行业数据
│       ├── strategies/                        # 策略数据
│       └── risks/                             # 风险数据
│
├── 数据获取层
│   └── src/tools/
│       ├── finance/                          # 美股数据
│       ├── astock/                           # A股数据
│       └── quant/                            # 量化工具
│
├── 估值计算层
│   └── src/tools/valuation/
│       ├── valuation-tools.ts               # DCF/PE/PB
│       └── target-price.ts                  # 目标价计算
│
└── 风控管理层
    └── src/tools/quant/risk-metrics.ts      # 风险指标
```

### 5.3 投资配置格式

```yaml
# .upup/GOALS.md - 投资目标
# Investment Goals
---
risk_tolerance: moderate
analysis_depth: comprehensive
time_horizon: long
max_single_position: 0.2
portfolio_target: 10
rebalance_threshold: 0.05
---

# 投资目标说明
- risk_tolerance: 风险承受能力 (conservative/moderate/aggressive)
- analysis_depth: 分析深度 (basic/intermediate/comprehensive)
- time_horizon: 投资周期 (short/medium/long)
- max_single_position: 单股最大仓位
- portfolio_target: 目标持仓数量
- rebalance_threshold: 再平衡阈值
```

```yaml
# .upup/RULES.md - 分析规则
# Analysis Rules
---
research:
  - Always verify data sources
  - Use multiple analysis methods
  - Cross-reference financial data
  
valuation:
  - Use DCF as primary method
  - Compare with peers
  
risk:
  - Check VaR before trade
  - Monitor position limits
  - Alert on drawdown
---

# 分析规则说明
- research: 研究规则
- valuation: 估值规则
- risk: 风控规则
```

```yaml
# .upup/GOVERN.md - 治理规则
# Governance
---
limits:
  max_position: 0.1
  single_stock_limit: 0.2
  sector_limit: 0.3
  daily_trades: 10
  
alerts:
  drawdown_threshold: 0.05
  position_alert: 0.15
  concentration_alert: 0.4
  
notifications:
  - email: config
  - feishu: config
---

# 治理规则说明
- limits: 仓位限制
- alerts: 预警阈值
- notifications: 通知配置
```

---

## 6. Skills 扩展体系

### 6.1 Claude Code Skill 格式

借鉴 Claude Code 的 Skill 设计：

```yaml
# SKILL.md 格式 (参考 Claude Code)
---
name: stock-analysis
description: 综合股票分析 Skill，执行基本面+技术面+消息面分析
model: sonnet
user-invocable: true
argument-hint: <股票代码>
depends-on:
  - data-fetcher
  - valuation
context: inline  # 或 'fork' 用于子 Agent 执行
---

# 股票综合分析 Skill

## 功能
- 基本面分析: 财务指标、估值水平
- 技术面分析: 趋势、支撑阻力
- 消息面分析: 新闻、公告、研报
- 综合评级: 买入/持有/卖出

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

## 输出格式
```markdown
## [股票名称] ([代码]) 分析报告

### 1. 基本面
- 当前价格: ¥XXX
- PE: XXx (行业平均: XXx)
- ROE: XX%
- 结论: ...

### 2. 技术面
- 趋势: ...
- 支撑位: ¥XXX
- 压力位: ¥XXX
- MACD: ...

### 3. 综合评级
- 综合评分: X/10
- 建议: 买入/持有/卖出
- 目标价: ¥XXX
```
```

### 6.2 UpUp Skills 目录结构

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
│   └── templates/     # 报告模板
├── sentiment/
│   ├── SKILL.md      # 情感分析
│   └── lexicon/       # 情感词典
└── portfolio/
    ├── SKILL.md      # 组合管理
    └── rebalancing/  # 再平衡规则
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
context: inline
---

# 股票综合分析 Skill
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
context: fork
effort: medium
---

# 策略回测 Skill
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
```

---

## 7. Plugins 扩展体系

### 7.1 Plugin 架构

```
packages/plugins/
├── plugin-sdk/           # Plugin SDK
│   ├── src/loader.ts     # 加载器
│   ├── src/registry.ts   # 注册表
│   └── src/types.ts     # 类型定义
│
└── plugins/
    ├── lumostock/       # lumostock 数据源
    ├── trading/         # 交易执行
    └── visualization/   # 可视化
```

### 7.2 Plugin 类型

```typescript
// 插件类型
type PluginType =
  | 'data'           // 数据源插件
  | 'trading'        // 交易插件
  | 'visualization'  // 可视化插件
  | 'notification'   // 通知插件

// 插件接口
interface UpUpPlugin {
  type: PluginType
  name: string
  version: string
  description: string

  // 生命周期
  onLoad(): Promise<void>
  onUnload(): Promise<void>

  // 工具注册
  registerTools(registry: ToolRegistry): void
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

### 10.2 Claude Code vs UpUp 架构对比

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃              Claude Code (loucode) vs UpUp 架构对比                 ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                     ┃
┃  Claude Code (loucode)              UpUp 投资助手                   ┃
┃  ┌─────────────────────────┐        ┌─────────────────────────┐   ┃
┃  │ QueryEngine             │        │ Agent                   │   ┃
┃  │ • 会话管理              │   ←→   │ • 主循环                │   ┃
┃  │ • 消息持久化            │        │ • 工具执行              │   ┃
┃  │ • 流式输出              │        │ • 上下文压缩            │   ┃
┃  └─────────────────────────┘        └─────────────────────────┘   ┃
┃           ↓                                   ↓                   ┃
┃  ┌─────────────────────────┐        ┌─────────────────────────┐   ┃
┃  │ tools.ts                │        │ tools/registry/          │   ┃
┃  │ • 59种工具              │   ←→   │ • 投资工具注册           │   ┃
┃  │ • 条件编译              │        │ • 并发控制               │   ┃
┃  └─────────────────────────┘        └─────────────────────────┘   ┃
┃           ↓                                   ↓                   ┃
┃  ┌─────────────────────────┐        ┌─────────────────────────┐   ┃
┃  │ SkillTool               │        │ packages/skills/        │   ┃
┃  │ • inline/forked 双模式  │   ←→   │ • Skill 加载器          │   ┃
┃  │ • 子 Agent 执行         │        │ • 投资技能定义          │   ┃
┃  └─────────────────────────┘        └─────────────────────────┘   ┃
┃           ↓                                   ↓                   ┃
┃  ┌─────────────────────────┐        ┌─────────────────────────┐   ┃
┃  │ MCP 集成                │        │ packages/mcp/            │   ┃
┃  │ • 外部工具连接          │   ←→   │ • MCP 客户端            │   ┃
┃  │ • 资源读取              │        │ • lumostock 集成         │   ┃
┃  └─────────────────────────┘        └─────────────────────────┘   ┃
┃                                                                     ┃
┃  关键差异:                                                          ┃
┃  • Claude Code: 通用编程助手，工具驱动                              ┃
┃  • UpUp: 投资领域，配置驱动 + 知识积累                              ┃
┃                                                                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### 10.3 数据流架构

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

### 10.4 工具注册流程

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
┃  │  │ Plugin Tools (L4):                                    │   ┃
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

- [Claude Code (loucode)](file:///Users/louloulin/Documents/linchong/claw/loucode/src/QueryEngine.ts)
- [UpUp Agent Core](../packages/agent-core/README.md)
- [UpUp SDK](../packages/sdk/README.md)
- [UpUp Skills](../packages/skills/README.md)
- [UpUp Plugin SDK](../packages/plugin-sdk/README.md)
- [Paperclip Adapter](./paperclip1.0.md)
- [daily_stock_analysis](../daily_stock_analysis/)
- [TradingAgents-CN](../TradingAgents-CN/)
- [lumostock](../lumostock/)

### C. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 8.0 | 2026-05-12 | Claude Code 投资助手架构设计，核心 vs 扩展分层 |
| 7.0 | 2026-05-11 | 投资功能增强计划 |
| ... | ... | ... |

---

*文档版本: 8.0 | 更新日期: 2026-05-12*