# UpUp 顶级投资版架构计划 v8.2

> 版本: 8.2  
> 更新日期: 2026-05-13  
> 目标: 基于当前仓库真实代码，把 UpUp 打造成“顶级投资版 Claude Code / Claude Code for Investing”。  
> 方法: 先承认代码现实，再围绕投研主航道收敛，而不是继续堆能力。  
> 本文定位: 在 `plan8.md` / 旧 `plan8.2.md` 基础上的增强版总规划，强调“代码现状 → 核心问题 → 目标架构 → 分阶段落地”。

---

## 目录

1. [执行结论](#1-执行结论)
2. [基于代码的现状审计](#2-基于代码的现状审计)
3. [相比 `plan8.md` 的新增判断](#3-相比-plan8md-的新增判断)
4. [要成为顶级投资版，还缺什么](#4-要成为顶级投资版还缺什么)
5. [最关键的架构问题](#5-最关键的架构问题)
6. [v8.2 目标架构](#6-v82-目标架构)
7. [核心工作流重构方案](#7-核心工作流重构方案)
8. [分阶段路线图](#8-分阶段路线图)
9. [优先级与依赖关系](#9-优先级与依赖关系)
10. [验收标准](#10-验收标准)
11. [关键代码索引](#11-关键代码索引)
12. [一句话总结](#12-一句话总结)

---

## 1. 执行结论

从代码现实出发，UpUp 已经具备成为“投资版 Claude Code”的**底座**，但还没有成为真正的“顶级投资工作台”。

当前系统的真实状态可以概括为：

- **底座很强**：Agent、tool registry、skills、plugins、mcp、sdk、daemon、cron、gateway、subagent 都已有实现。
- **投资原子能力很多**：行情、财务、A 股数据、估值、量化、回测、研究、组合、watchlist、导出、通知、知识库都已经存在。
- **产品闭环不够强**：这些能力还没有被收敛成一条“研究 → 决策 → 组合 → 监控 → 复盘”的默认主航道。

所以，未来最重要的方向不是继续泛化为“更大的 agent 平台”，而是把现有能力压缩成一个**高质量、可复用、可复盘的投研操作系统**。

v8.2 的核心判断是：

> UpUp 现在缺的不是更多工具，而是更强的投研对象模型、更硬的默认工作流、更清晰的投资决策生命周期，以及更严密的投资评测体系。

---

## 2. 基于代码的现状审计

本节只写“代码里真实存在的东西”。

### 2.1 这已经是一个平台，不是单一 CLI

当前仓库已明显是平台化 monorepo：

- 入口与交互：`src/index.tsx`、`src/cli.ts`
- Agent 运行时：`src/agent/agent.ts`
- 工具总线：`src/tools/registry/index.ts`
- 投资工具域：`src/tools/finance/`、`src/tools/astock/`、`src/tools/valuation/`、`src/tools/quant/`、`src/tools/backtest/`、`src/tools/research/`、`src/tools/portfolio/`、`src/tools/watchlist/`
- Skills：`src/skills/`、`packages/skills/`
- Plugins：`src/plugins/`、`packages/plugin-sdk/`
- MCP：`src/mcp/`、`packages/mcp/`
- 持久化运行与调度：`src/daemon/`、`src/cron/`
- 外部通道：`src/gateway/`
- 外部调用能力：`packages/sdk/`

这说明：

- `plan8.md` 里“核心 + Skills + Plugins”的方向没错；
- 但真实代码已经比那张图复杂得多，必须按平台工程的标准来设计下一阶段。

### 2.2 Agent 运行时已经很强

`src/agent/agent.ts` 已具备：

- 迭代型 Agent Loop
- 工具流式执行
- 上下文压缩与 compaction
- loop recovery
- session backgrounding
- daemon session
- recovery auto-save
- memory monitor

这类能力说明 UpUp 的通用运行时已相当成熟。

但是问题也非常清楚：

- 这些能力大多是**通用 agent runtime**；
- 它们并没有自动让系统成为“顶级投资助手”；
- 当前缺的是**投资任务的强编排**，不是通用运行时再做一层抽象。

### 2.3 Tool Registry 非常强，但主航道不够清晰

`src/tools/registry/index.ts` 当前汇总：

- finance tools
- web search tools
- filesystem tools
- mcp tools
- agent planning tools
- quant tools
- domain tools
- duckdb tools
- investment knowledge tools

`src/tools/registry/domain-tools.ts` 则接入了大量高阶工具：

- portfolio
- worktree
- skill discovery
- send-message / sleep / monitor
- valuation
- notebook
- notify
- export
- LSP
- subagent
- research
- workflow
- watchlist / benchmark / fx / calendar / short-interest / backtest / cache

结论：

- 系统**绝不缺工具**；
- 但从投研产品视角看，缺的是“用户问一个投资问题时，系统默认走哪条最优路径”。

### 2.4 Skills 系统已具备雏形，且比旧计划估计得更成熟

当前已看到：

- `src/tools/skill.ts`
- `src/tools/skill-tool.ts`
- `src/skills/registry.ts`
- `src/skills/dependency.ts`
- `src/skills/scheduler.ts`
- 现有技能：
  - `src/skills/dcf/SKILL.md`
  - `src/skills/investment/stock-analysis/SKILL.md`
  - `src/skills/investment/stock-screening/SKILL.md`
  - `src/skills/investment/portfolio-review/SKILL.md`
  - `src/skills/investment/risk-assessment/SKILL.md`
  - `src/skills/investment/decision-dashboard/SKILL.md`
  - `src/skills/investment/market-brief/SKILL.md`
  - `src/skills/a-share-analysis/SKILL.md`
  - `src/skills/x-research/SKILL.md`

这说明旧 `plan8.md` 对 skills 的描述已经偏保守。

但还存在关键差距：

- 当前 skills 更多像“指令模板”或“prompt SOP”；
- 还没有成为“受约束的、可验证的、能沉淀产物的投研流程单元”；
- 没有和 thesis / valuation / watchlist / portfolio / monitor 形成稳定的数据闭环。

### 2.5 Plugins / MCP 已有骨架，但还没有形成“投资生态中枢”

代码里已存在：

- `src/plugins/loader.ts`
- `src/plugins/types.ts`
- `packages/plugin-sdk/README.md`
- `src/mcp/client.ts`
- `src/mcp/registry.ts`
- `src/mcp/resource-tools.ts`
- `packages/mcp/src/index.ts`

这说明：

- Plugin 不是纸面计划；
- MCP 不是纸面计划；
- SDK 也不是纸面计划。

但距离“顶级投资版”的差距不在基建，而在：

- 还缺**统一投资数据适配层**；
- 还缺“数据源质量 / 可追溯性 / 成本 / 时效性”的编排策略；
- 还缺把外部数据源真正纳入 research pipeline 的统一入口。

### 2.6 Portfolio / Watchlist / Knowledge 已有持久化，但仍偏工具级

已存在：

- `src/tools/portfolio/portfolio-tools.ts`
- `src/tools/portfolio/multi-portfolio.ts`
- `src/tools/watchlist/watchlist-tools.ts`
- `src/agent/investment-knowledge.ts`
- `src/agent/investment-knowledge-tools.ts`

优点：

- 已有本地持久化和状态沉淀；
- 组合、观察名单、知识并非一次性输出；
- 这比单纯“回答问题”更接近投资工作台。

但问题非常大：

- 它们当前更多还是**文件型工具集合**；
- 缺少统一的领域对象模型；
- 缺少研究对象、决策对象、监控对象之间的显式关系；
- 缺少真正的 thesis 生命周期。

### 2.7 Workflow 工具存在，但仍只是“工作流计划器”

`src/tools/workflow/workflow-tools.ts` 的核心作用是：

- 定义步骤
- 生成 workflow plan
- 提示后续按顺序执行

它**不是**真正强约束的投资工作流执行引擎。

这是一个很关键的现实差距：

- 代码里有 workflow 工具；
- 但它更像“编排描述层”，不是“投研主流程引擎”；
- 所以不能把它误判成“研究闭环已经完成”。

### 2.8 Monitor 工具存在，但语义不是“投资监控”

`src/tools/monitor-tool.ts` 当前监控的是：

- CPU
- 内存
- uptime

也就是说，`monitor` 当前是**系统资源监控**，不是：

- thesis monitor
- price/valuation/event monitor
- watchlist trigger engine

这是一个非常重要的命名与语义偏差。

### 2.9 Evals 有基础，但离投研级评测还很远

`src/evals/run.ts` 当前已有：

- 基础评测 runner
- 数据集读取
- correctness evaluator
- `gpt-5.4` 作为 judge

但从顶级投资版角度看仍然不够：

- 主要还是问答正确性导向；
- 缺少研究报告质量评测；
- 缺少估值合理性评测；
- 缺少风险枚举完整性评测；
- 缺少组合建议与监控命中率评测；
- 缺少工具使用顺序和数据引用质量评测。

### 2.10 Gateway / Cron / Daemon 已具备长期化潜力

代码里已有：

- `src/gateway/`
- `src/cron/`
- `src/daemon/`

这意味着：

- UpUp 已经具备从“即时问答”演进到“长期跟踪代理”的技术可能；
- 未来 thesis lifecycle、定时复审、异步监控、渠道推送，都不是从零开始。

但目前还没有把这些能力围绕“投资 lifecycle”统一编排。

---

## 3. 相比 `plan8.md` 的新增判断

在充分审计代码后，v8.2 相比 `plan8.md` / 旧 `plan8.2.md` 增加了几个更深的判断。

### 3.1 UpUp 的主要矛盾已经变化了

以前的主要矛盾像是：

- 功能不够多
- 扩展性不够
- 缺少 skills/plugins/mcp

现在的主要矛盾已经变成：

- 能力足够多，但投研主航道不够强；
- 投资对象没有 first-class 建模；
- 长期使用价值没有被 lifecycle 化。

### 3.2 现在最危险的不是“缺功能”，而是“继续发散”

因为当前仓库已经很大，如果继续沿着这些方向发散：

- 再加更多工具
- 再加更多 plugin 类型
- 再加更多通道
- 再加更多 generic workflow 层

最终会得到一个很强的 agent 平台，但不是一个顶级投资产品。

### 3.3 真正的产品壁垒会来自“研究资产化”

顶级投资版不会靠“能查更多数据”建立壁垒，而是靠：

- 能否把研究产出沉淀为可复用资产；
- 能否跟踪 thesis 的演化；
- 能否从历史错误中形成复盘记忆；
- 能否把一次分析自然转成长期组合管理动作。

### 3.4 未来最值钱的不是工具数量，而是默认路径质量

用户不需要 50 个散乱工具，用户需要的是：

- 问一个问题时系统自动走对流程；
- 给出稳定、结构化、可执行、可追溯的结论；
- 后续还能持续更新、跟踪、复盘。

---

## 4. 要成为顶级投资版，还缺什么

### 4.1 缺少 first-class 投资对象模型

建议引入统一的领域对象，而不是继续把能力散落在工具返回值里。

核心对象建议：

- `Asset`
  - 标的对象，支持股票 / ETF / 指数 / 宏观主题 / 行业
- `Coverage`
  - 某个标的的研究覆盖上下文
- `ResearchArtifact`
  - 一次研究产物，带版本、来源、时间戳、作者、引用证据
- `InvestmentThesis`
  - 核心逻辑、触发条件、失效条件、置信度
- `ValuationCase`
  - 假设、方法、区间、敏感性分析、结论
- `RiskCase`
  - 风险项、类型、概率、影响、对冲或应对方式
- `DecisionRecord`
  - 观察 / 建仓 / 加仓 / 减仓 / 清仓 / 暂不行动
- `MonitorRule`
  - 价格、估值、财报、事件、情绪等触发器
- `ReviewCycle`
  - 周度/月度/财报后/事件后复审记录

如果没有这些对象，系统很难完成从“答题”到“投研资产管理”的跃迁。

### 4.2 缺少强约束默认 workflow

理想的默认工作流应至少覆盖：

1. Clarify
   - 识别市场、标的、问题类型、时间范围
2. Gather
   - 拉价格、财务、新闻、行业、可比公司
3. Analyze
   - thesis / anti-thesis / quality / growth / capital allocation
4. Value
   - DCF / multiples / target range / sensitivity
5. Risk
   - 风险树与失效条件
6. Decide
   - watch / buy / add / trim / sell / reject
7. Persist
   - 写入 knowledge / watchlist / portfolio / monitor / review queue

当前代码里有 pieces，但没有这条“强默认主路径”。

### 4.3 缺少组合级决策中枢

当前 portfolio 层已支持：

- position CRUD
- cash / transactions
- multi-portfolio

但顶级投资版还需要：

- 行业集中度检查
- 风格暴露检查
- 单票风险预算检查
- 新建议对现有组合的边际影响评估
- thesis 冲突检测
- 组合层再平衡建议

也就是说，当前更多是“组合记账工具”，还不是“组合决策中枢”。

### 4.4 缺少 thesis lifecycle

未来最重要的资产不是单次分析，而是 thesis 的生命周期：

- thesis 何时建立
- thesis 何时加固
- thesis 何时受损
- thesis 何时失效
- 何时需要重新研究
- 何时自动降级到 watch-only

当前代码里虽然有 cron / gateway / knowledge / watchlist，但还没有把 thesis 作为第一等对象长期管理。

### 4.5 缺少投资级评测矩阵

顶级投资系统的 evals 应至少有 5 组：

1. **Research Quality**
   - 研究是否完整、结构化、抓住关键矛盾
2. **Valuation Quality**
   - 假设是否合理、区间是否稳健、敏感性是否完整
3. **Risk Quality**
   - 风险是否全面、是否包含 thesis breaker
4. **Portfolio Decision Quality**
   - 建议是否考虑组合约束与替代机会成本
5. **Monitoring Quality**
   - 监控规则是否有效、是否触发正确的复审动作

当前 evals 还远未覆盖这套矩阵。

### 4.6 缺少投资安全边界

未来若接入券商、下单、通知渠道，必须明确分层：

- Research
- Recommendation
- Simulation
- Execution

每层要有不同权限、确认机制和审计记录。

当前 capability / access-control 是好起点，但还没有升级成“投资动作安全模型”。

---

## 5. 最关键的架构问题

### 5.1 `workflow` 是浅层 seam

当前 `run_workflow` 更像“计划生成器”，而不是深度工作流引擎。

问题：

- 接口看起来像能执行完整工作流；
- 实际上只是把步骤包装出来；
- 真正的业务状态、依赖、重试、产物沉淀并未封装进去。

结论：

- 未来要么把它真正深化为“投资工作流引擎”；
- 要么明确降格为“workflow planner”，避免产品层误判。

### 5.2 `monitor` 命名误导严重

当前 `monitor` 监控的是系统资源，不是投资监控。

风险：

- 产品规划里容易误把它当成 thesis/event/price monitor；
- 架构设计和命名会越来越混乱。

建议：

- 保留系统监控，但明确命名为 `system_monitor` 或同义层；
- 另建真正的 `investment_monitor` / `thesis_monitor` 语义层。

### 5.3 Portfolio / Watchlist / Knowledge 缺少共享领域层

目前三者各自能工作，但更像平行工具：

- watchlist 是 symbol + alert
- portfolio 是 position + cash + transactions
- knowledge 是 company / sector / strategy / risk

问题是：

- 它们缺少显式共享对象；
- 一个 symbol 在三个系统里没有统一身份与生命周期；
- 无法自然沉淀为“从研究到持有”的链路。

### 5.4 Skills 很多，但与状态系统结合不够深

当前 skills 更接近“文本工作流”，而非“状态机式工作流”。

理想状态是：

- skill 不只返回说明，而是产出结构化 artifact；
- artifact 能继续驱动 portfolio / monitor / review；
- skill 执行结果可评测、可回放、可比对。

### 5.5 Plugin / MCP 缺少统一投资适配接口

当前 plugin 与 mcp 是能力接入层，但不是投资语义层。

顶级投资版需要一个中间层，把不同来源统一抽象为：

- price
- fundamentals
- filings
- news
- estimates
- events
- alt-data
- execution

否则数据源越多，主流程越混乱。

---

## 6. v8.2 目标架构

### 6.1 总体架构思路

不是推倒重来，而是在当前代码上分四层演进：

```text
L0 Runtime Foundation
- Agent loop
- Tool execution
- Session / daemon / cron / gateway
- Skills / plugin / mcp loading

L1 Investment Domain Layer
- Asset
- Coverage
- Thesis
- ValuationCase
- RiskCase
- DecisionRecord
- MonitorRule
- ReviewCycle

L2 Investment Workflow Layer
- Company deep research
- Relative comparison
- Portfolio review
- Watchlist triage
- Thesis refresh
- Event-triggered review

L3 Integration & Delivery Layer
- Data adapters (finance/A-share/MCP/plugins)
- Report/export
- Notifications/channels
- SDK / external control plane
```

### 6.2 核心原则

1. **Runtime 不重写，业务中枢重构**
   - 运行时基础已经强，不要随意推翻 `src/agent/agent.ts`

2. **先建对象，再建流程，再接生态**
   - 没有统一对象模型，任何流程都会松散

3. **优先把默认主路径做强**
   - 顶级体验来自默认路径，不来自可选分支

4. **把研究产物当资产，而不是一次性文本**
   - 这是长期价值的核心

5. **监控、复盘、评测必须从第一天纳入架构**
   - 否则会一直停留在“会回答问题”阶段

---

## 7. 核心工作流重构方案

### 7.1 公司深度研究主流程

这是未来最核心的 golden path。

**输入**
- ticker / company / sector prompt

**执行**
1. 识别市场、标的、研究目标
2. 拉取价格、财务、新闻、可比公司、行业背景
3. 形成 thesis / anti-thesis
4. 跑估值
5. 枚举风险与 thesis breaker
6. 输出结论与行动建议
7. 将结果持久化为 `ResearchArtifact + Thesis + ValuationCase + RiskCase + DecisionRecord`
8. 如果需要，加入 watchlist / portfolio / review queue / monitor rules

**输出要求**
- facts
- interpretation
- valuation range
- risk map
- decision
- follow-up triggers

### 7.2 组合复审主流程

输入：
- portfolio name / strategy / risk constraints

执行：
1. 读取当前组合
2. 汇总行业、风格、主题、单票暴露
3. 识别 thesis 过时项
4. 识别候选增减仓对象
5. 形成 rebalance 建议
6. 保存 review artifact

### 7.3 thesis 刷新与事件复审流程

输入：
- earnings / price move / valuation band / news event / manual trigger

执行：
1. 定位对应 thesis
2. 对比旧假设与新事实
3. 标记 thesis: reinforced / weakened / broken
4. 更新 recommendation
5. 写入 review log

### 7.4 watchlist triage 流程

输入：
- 当前 watchlist + optional filters

执行：
1. 识别最值得优先研究的标的
2. 排出优先级
3. 标记触发原因
4. 一键转深度研究任务

---

## 8. 分阶段路线图

## 8.1 Phase 1：统一投资对象与研究产物

目标：把“分析结果”变成结构化资产。

### 必做项

1. 设计投资对象 schema
   - `Asset`
   - `Coverage`
   - `ResearchArtifact`
   - `InvestmentThesis`
   - `ValuationCase`
   - `RiskCase`
   - `DecisionRecord`
   - `MonitorRule`

2. 建立统一 persistence 接口
   - 不要求一开始就换存储引擎
   - 但要先统一读写抽象，别让 portfolio/watchlist/knowledge 各自分裂

3. 定义统一研究输出格式
   - 让 skills / workflows / agent answers 可以稳定地产出相同结构

### 阶段成果

- 系统第一次具备“研究资产化”能力。

## 8.2 Phase 2：做强默认研究 workflow

目标：让 UpUp 的默认使用路径非常强。

### 必做项

1. 把现有投资 skills 升级为 artifact-producing workflows
2. 增加缺失技能：
   - `company-deep-research`
   - `compare-companies`
   - `earnings-review`
   - `thesis-refresh`
3. 明确 tool routing 与 preferred sequence
4. 把 workflow 从“步骤描述”升级为“可执行状态流”

### 阶段成果

- 用户输入一个标的，系统会自动走高质量投研路径，而不是随机拼工具。

## 8.3 Phase 3：做强组合决策中枢

目标：从研究助手升级为投资决策助手。

### 必做项

1. 引入组合约束模型
2. 实现候选标的对组合的边际影响分析
3. 实现 rebalance / position sizing / replacement logic
4. 让 thesis 与 portfolio state 联动

### 阶段成果

- 系统不只是分析单票，而是能围绕组合给建议。

## 8.4 Phase 4：做强 thesis lifecycle 与监控

目标：形成长期使用价值。

### 必做项

1. 建立 thesis state machine
2. 建立真正的 investment monitoring
3. 用 cron / gateway / daemon 驱动异步复审
4. 形成 review history

### 阶段成果

- UpUp 从“会分析”升级为“会持续跟踪”。

## 8.5 Phase 5：做强投资评测与生态

目标：证明质量，并放大外部能力。

### 必做项

1. 扩建 eval matrix
2. 建立 data adapter 层
3. 接入高价值 MCP/provider/plugin
4. 接入 paper trading / broker adapter（若安全边界成熟）

### 阶段成果

- 质量可以被量化，生态服务主流程而不是扰乱主流程。

---

## 9. 优先级与依赖关系

### P0：必须先完成

1. 统一投资对象模型
2. 统一研究产物 schema
3. 默认深度研究 workflow
4. thesis / decision / monitor 基础关系模型
5. 投资 eval baseline

### P1：在 P0 后推进

6. 组合约束与组合决策中枢
7. 真正的投资监控系统
8. 多市场统一适配层
9. review / postmortem 体系

### P2：主航道稳定后推进

10. MCP 高价值数据源精选接入
11. Broker / paper trading adapter
12. 多渠道投研通知与轻交互
13. 插件生态与模板市场

### 明确非优先项

短期内不应优先：

- 复杂可视化平台重构
- 过度通用化的 workflow DSL
- 更多与投研主航道无关的 CLI/IDE 辅助能力
- 只增加工具数量、不提升默认路径质量的功能

---

## 10. 验收标准

### 10.1 研究质量

- 单一公司研究输出稳定、结构化、具备可执行结论
- 输出能区分事实、解释、假设、不确定性
- 输出能沉淀为结构化 artifact，而不仅是文本

### 10.2 决策质量

- 有 thesis、valuation、risk、decision 四件套
- 决策能映射到 watchlist / portfolio / monitor
- 决策能解释与组合约束的关系

### 10.3 生命周期能力

- thesis 可以刷新、削弱、失效、复审
- monitor 能触发真正的投资复审
- 历史研究与后续动作可追溯

### 10.4 平台能力

- skills / plugins / mcp 统一服务主流程
- workflow 不再只是描述，而能稳定驱动产物和状态变更
- evals 能持续衡量质量变化

### 10.5 顶级标准

只有当用户可以把 UpUp 当成下面这个系统使用时，才算真正接近目标：

> “我把它当成一个持续维护 thesis、组合、监控和复盘的投资研究操作系统，而不是一个临时查数据的金融聊天机器人。”

---

## 11. 关键代码索引

### 11.1 运行时与入口

- `src/index.tsx`
- `src/cli.ts`
- `src/controllers/agent-runner.ts`
- `src/agent/agent.ts`
- `src/agent/subagent-runner.ts`
- `src/agent/capability-registry.ts`

### 11.2 工具注册与工作流

- `src/tools/registry/index.ts`
- `src/tools/registry/domain-tools.ts`
- `src/tools/registry/finance-tools.ts`
- `src/tools/registry/agent-planning-tools.ts`
- `src/tools/workflow/workflow-tools.ts`
- `src/tools/skill.ts`
- `src/tools/skill-tool.ts`

### 11.3 投资能力层

- `src/tools/valuation/`
- `src/tools/quant/`
- `src/tools/backtest/`
- `src/tools/research/`
- `src/tools/portfolio/portfolio-tools.ts`
- `src/tools/portfolio/multi-portfolio.ts`
- `src/tools/watchlist/watchlist-tools.ts`
- `src/agent/investment-knowledge.ts`
- `src/agent/investment-knowledge-tools.ts`

### 11.4 Skills / Plugins / MCP / SDK

- `src/skills/registry.ts`
- `src/skills/scheduler.ts`
- `src/plugins/loader.ts`
- `src/plugins/types.ts`
- `src/mcp/client.ts`
- `src/mcp/registry.ts`
- `src/mcp/resource-tools.ts`
- `packages/plugin-sdk/src/index.ts`
- `packages/mcp/src/index.ts`
- `packages/skills/src/index.ts`
- `packages/sdk/README.md`

### 11.5 长期化与外部通道

- `src/cron/`
- `src/daemon/`
- `src/gateway/`
- `src/evals/run.ts`
- `src/plan/plan-context.ts`

---

## 12. 一句话总结

`plan8.md` 的方向是对的，但还不够深；v8.2 的核心升级在于明确了一个现实：

> UpUp 已经拥有足够强的平台底座，下一阶段真正决定成败的，不是继续扩展能力，而是把研究、估值、风险、组合、监控、复盘压缩成一个默认最强、可持续演化的投资决策闭环。

---

*文档版本: 8.2 | 更新日期: 2026-05-13*
