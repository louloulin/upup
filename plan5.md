# Dexter AI Agent - Phase 5 增强规划

**日期**: 2026-05-07
**版本**: 3.7
**状态**: 部分实现
**重点**: 基于现有代码最小改造，强化投资领域定位
**架构决策**: 采用轻量级ServiceLocator替代DI容器（高内聚低耦合）
**参考框架**: Codex / OpenClaw / Hermes / Loucode

**已实现**:
- ✅ Phase 6 P0: 核心工具 (EditTool, WriteTool, ReadTool, Bash sandbox)
- ✅ Phase 6 P1: Worktree工具 (create/remove/list worktree)
- ✅ Phase 6 P2: Skill发现工具 (list/search/get_skill)
- ✅ Phase 7: 量化风险指标工具 (VaR, Sharpe, Sortino, MaxDrawdown)
- ✅ Phase 8: 投资组合管理工具 (add/update/remove position, get portfolio P&L)
- ✅ Phase 9: 智能投研工具 (analyze_sentiment, detect_events, extract_entities)
- ✅ ServiceLocator 模式

---

## 🚀 执行摘要

Dexter 是专为**金融投资研究**设计的 AI Agent，定位为"投资版 Claude Code"。基于 plan4.md 完成的 8 个 phases，**基于现有代码最小改造**，实现以下目标：

1. **缩小与 Loucode 的功能差距**（最小改造，渐进式增强）
2. **强化投资领域优势**（金融数据、量化分析）
3. **高内聚低耦合架构**（复用现有组件，最小侵入式扩展）

### 最小改造原则

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           Dexter 最小改造策略                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   原则 1: 最大化复用现有组件                                                              │
│   ├── Agent Loop (agent.ts) → 直接复用，增加投资工具注入                                  │
│   ├── Tool Executor → 直接复用，增加金融工具注册                                          │
│   ├── Memory Manager → 复用，增加持仓记忆                                                 │
│   └── Cron System → 复用，增加投资监控任务                                               │
│                                                                                         │
│   原则 2: 最小侵入式扩展                                                                │
│   ├── 新增文件最小化 → 在现有目录结构内增加子目录                                        │
│   ├── 接口隔离 → 通过 interface 不修改现有类                                              │
│   └── 插件化 → 通过 skill.ts 机制扩展，不修改核心                                        │
│                                                                                         │
│   原则 3: 渐进式改造                                                                    │
│   ├── Phase 6: 核心工具增强 (小步快跑)                                                  │
│   ├── Phase 7: 投资功能集成 (验证后扩展)                                                │
│   └── Phase 8: 高级投研能力 (按需开发)                                                 │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### ANSI 架构图

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                    Dexter AI Agent v2026.5 - 投资研究版                               ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                         用户交互层                                            │   ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐    │   ║
║  │  │   CLI/TUI    │  │   WhatsApp   │  │    REST      │  │  Web     │    │   ║
║  │  │  (bun run)   │  │   Gateway    │  │   Gateway    │  │  UI      │    │   ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘    │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                              ║
║                                        ▼                                              ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                         Agent 核心层                                         │   ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │   ║
║  │  │  Agent     │  │  Subagent  │  │   Skills   │  │   Memory      │    │   ║
║  │  │   Loop     │  │   Runner   │  │   System   │  │   Manager     │    │   ║
║  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘    │   ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐    │   ║
║  │  │   State    │  │   Hooks    │  │   Cron     │  │   Proactive   │    │   ║
║  │  │   Store    │  │   System   │  │   System   │  │   Controller  │    │   ║
║  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘    │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                              ║
║                                        ▼                                              ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                         工具系统层                                         │   ║
║  │                                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │   ║
║  │  │   金融数据工具  │  │  文件系统工具  │  │   搜索工具     │              │   ║
║  │  │  • get_financials│ │  • ReadTool   │  │  • web_search  │              │   ║
║  │  │  • get_market_data│ │  • WriteTool  │  │  • x_search   │              │   ║
║  │  │  • read_filings │  │  • EditTool   │  │                │              │   ║
║  │  │  • stock_screener│  │  • GlobTool   │  │                │              │   ║
║  │  │  • get_astock_* │  │  • GrepTool   │  │                │              │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────┘              │   ║
║  │                                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │   ║
║  │  │    MCP 工具    │  │   浏览器工具   │  │   系统工具     │              │   ║
║  │  │   (mcp__*__)  │  │  • browser    │  │  • agent      │              │   ║
║  │  │                │  │  • web_fetch  │  │  • heartbeat  │              │   ║
║  │  │                │  │                │  │  • cron      │              │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────┘              │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                              ║
║                                        ▼                                              ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                    投资研究专业能力层                                      │   ║
║  │   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │   ║
║  │   │  金融数据  │ │  量化分析  │ │  估值建模  │ │  风控指标  │        │   ║
║  │   │  美/A/港股 │ │ DCF/PE/ROE │ │  DCF/NAV   │ │ VaR/Sharpe │        │   ║
║  │   └────────────┘ └────────────┘ └────────────┘ └────────────┘        │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## 一、AI Agent Harness 架构分析

### 1.0 Agent Harness 核心概念

**Harness (测试/执行框架)** 是 AI Agent 的核心引擎，负责：
- **工具执行循环** (Tool Execution Loop)
- **流式响应处理** (Streaming Response Handling)
- **状态管理** (State Management)
- **上下文窗口管理** (Context Window Management)
- **错误恢复** (Error Recovery)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           AI Agent Harness 核心架构                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   ┌───────────────────────────────────────────────────────────────────────────────┐     │
│   │                         Agent Harness 核心组件                                  │     │
│   │                                                                               │     │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │     │
│   │   │   Query     │───▶│   System   │───▶│   Message   │───▶│    LLM      │ │     │
│   │   │   Engine   │    │   Prompt   │    │   History   │    │   Streaming │ │     │
│   │   │  (循环控制) │    │   Builder  │    │   Manager   │    │   API       │ │     │
│   │   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │     │
│   │         │                                                              │ │     │
│   │         │    ┌──────────────────────────────────────────────────────────┘ │     │
│   │         │    │                                                               │     │
│   │         ▼    ▼                                                               │     │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │     │
│   │   │   Tool      │───▶│   Tool      │───▶│   Result    │                      │     │
│   │   │   Executor  │    │   Registry │    │   Handler   │                      │     │
│   │   │  (并发控制) │    │  (动态加载) │    │  (缓存/压缩) │                      │     │
│   │   └─────────────┘    └─────────────┘    └─────────────┘                      │     │
│   │         │                                                              │ │     │
│   │         └──────────────────────────────────────────────────────────────┘ │     │
│   │                          (循环回到 LLM)                                       │     │
│   └───────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Loucode Harness 架构详解

Loucode (Claude Code Clone) 的核心架构基于 **QueryEngine** 类：

```typescript
// Loucode src/QueryEngine.ts (46,607 行)
// 核心类职责: 管理查询生命周期和会话状态

export class QueryEngine {
  private config: QueryEngineConfig
  private mutableMessages: Message[]           // 可变消息历史
  private abortController: AbortController     // 中断控制器
  private permissionDenials: SDKPermissionDenial[]  // 权限拒绝追踪
  private totalUsage: NonNullableUsage        // 使用量统计
  private readFileState: FileStateCache        // 文件读取缓存
  private discoveredSkillNames: Set<string>     // 发现的技能追踪
  private loadedNestedMemoryPaths: Set<string> // 嵌套记忆路径

  // 核心方法: 异步生成器模式
  async *submitMessage(
    prompt: string | ContentBlockParam[],
    options?: { uuid?: string; isMeta?: boolean },
  ): AsyncGenerator<SDKMessage, void, unknown> {
    // 1. 获取系统提示
    const { defaultSystemPrompt, userContext, systemContext } = 
      await fetchSystemPromptParts({ tools, mainLoopModel, ... })

    // 2. 构建处理上下文
    let processUserInputContext: ProcessUserInputContext = { ... }

    // 3. 调用 processUserInput (核心处理)
    for await (const result of processUserInput(processUserInputContext)) {
      yield result  // 流式输出
    }
  }
}
```

**Loucode Harness 关键特性:**

| 特性 | 实现 | 代码位置 |
|------|------|----------|
| **流式处理** | `AsyncGenerator<SDKMessage>` | QueryEngine.ts:209 |
| **中断控制** | `AbortController` | QueryEngine.ts:203 |
| **权限管理** | `wrappedCanUseTool` | QueryEngine.ts:244-271 |
| **成本追踪** | `updateUsage/accumulateUsage` | QueryEngine.ts:17 |
| **记忆管理** | `loadMemoryPrompt` | QueryEngine.ts:317-319 |
| **会话持久化** | `recordTranscript` | QueryEngine.ts:76 |

### 1.2 Dexter Harness 架构详解

Dexter 的核心架构基于 **Agent** 类：

```typescript
// Dexter src/agent/agent.ts (680 行)
// 核心类职责: Agent 循环和工具执行

export class Agent {
  private readonly model: string
  private readonly maxIterations: number
  private readonly tools: StructuredToolInterface[]
  private readonly toolMap: Map<string, StructuredToolInterface>
  private readonly toolExecutor: AgentToolExecutor
  private readonly systemPrompt: string
  private readonly signal?: AbortSignal
  private readonly memoryEnabled: boolean
  private compactionFailures: number = 0

  static async create(config: AgentConfig = {}): Promise<Agent> {
    const tools = getTools(model)
    const concurrencyMap = getToolConcurrencyMap(model)
    const memoryContext = await MemoryManager.get().loadSessionContext()
    const systemPrompt = buildSystemPrompt(...)
    return new Agent(config, tools, systemPrompt, concurrencyMap)
  }

  async *run(initialInput: string, ...): AsyncGenerator<AgentEvent, void, unknown> {
    // Agent 主循环
  }
}
```

### 1.3 Loucode vs Dexter Harness 对比

| 组件 | Loucode (46K行) | Dexter (3.1K行) | 差距 | 改进方向 |
|------|------------------|------------------|------|----------|
| **QueryEngine** | 46,607 行 | ~680 行 (Agent) | **68x** | 完善核心循环 |
| **ToolExecutor** | 分散在各Tool | ~208 行 | 需要扩展 | 增强并发控制 |
| **MessageManager** | ~14K 行 (history.ts) | ~100 行 | **140x** | 引入历史管理 |
| **PermissionSystem** | ~89 hooks | 基础实现 | **需要增强** | 完善权限钩子 |
| **Streaming** | 完整 AsyncGenerator | 基础 | **需要完善** | 完整流式处理 |
| **CostTracking** | ~10K 行 | 无 | **缺失** | 引入成本追踪 |

### 1.4 Agent Loop 核心模式对比

**Loucode 模式 (ReAct + Streaming):**
```
用户输入 → fetchSystemPrompt → processUserInput → 
  [循环]
    LLM.llm.complete() → 解析 tool_calls →
    canUseTool() 权限检查 →
    executeTool() 执行工具 →
    yield 流式结果 →
    更新消息历史
  [/循环]
→ 最终响应
```

**Dexter 当前模式 (简化版):**
```
用户输入 → buildSystemPrompt →
  [循环]
    LLM.invoke() → 检查 tool_calls →
    AgentToolExecutor.execute() →
    返回结果 → 检查是否需要继续
  [/循环]
→ 最终响应
```

### 1.5 Dexter Harness 增强方案

基于 Loucode 架构，Dexter 需要以下增强：

```typescript
// src/agent/harness/QueryEngine.ts (新增)
// 参考: Loucode QueryEngine.ts

export interface QueryEngineConfig {
  cwd: string
  tools: Tools
  commands: Command[]
  mcpClients: MCPServerConnection[]
  agents: AgentDefinition[]
  canUseTool: CanUseToolFn
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  initialMessages?: Message[]
  readFileCache: FileStateCache
  customSystemPrompt?: string
  maxTurns?: number
  maxBudgetUsd?: number
  jsonSchema?: Record<string, unknown>
  verbose?: boolean
  abortController?: AbortController
}

export class QueryEngine {
  private mutableMessages: Message[]
  private abortController: AbortController
  private permissionDenials: PermissionDenial[]
  private totalUsage: Usage
  private discoveredSkillNames: Set<string> = new Set()
  private loadedNestedMemoryPaths: Set<string> = new Set()

  async *submitMessage(
    prompt: string | ContentBlockParam[],
    options?: { uuid?: string; isMeta?: boolean },
  ): AsyncGenerator<SDKMessage, void, unknown> {
    // 1. 清空本次发现的技能
    this.discoveredSkillNames.clear()

    // 2. 获取系统提示
    const { defaultSystemPrompt, userContext, systemContext } =
      await fetchSystemPromptParts({ tools, mainLoopModel, ... })

    // 3. 构建处理上下文
    const processUserInputContext: ProcessUserInputContext = {
      messages: this.mutableMessages,
      setMessages: fn => {
        this.mutableMessages = fn(this.mutableMessages)
      },
      // ... 其他配置
    }

    // 4. 处理用户输入 (核心循环)
    for await (const result of processUserInput(processUserInputContext)) {
      yield result
    }

    // 5. 记录使用量
    this.accumulateUsage()
  }

  private accumulateUsage(): void {
    // 追踪 token 使用和成本
  }
}
```

### 1.6 上下文窗口管理对比

**Loucode 的上下文管理:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    上下文窗口管理策略                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   软上限 (90%)     硬上限 (100%)     压缩触发                   │
│       │                │               │                        │
│       ▼                ▼               ▼                        │
│   ┌────────┐      ┌────────┐      ┌────────┐                   │
│   │ 警告   │ ────▶ │ 压缩   │ ────▶ │ 删除   │                   │
│   │ 提示   │      │ (Snip) │      │ (Compact) │                   │
│   └────────┘      └────────┘      └────────┘                   │
│                                                                  │
│   Loucode: HISTORY_SNIP 功能 + 文件历史快照                      │
│   Dexter:  基础 Microcompact + Token 预算                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Dexter 当前压缩策略:**
```typescript
// src/agent/compact.ts (~227 行)
// Microcompact: 简单的消息精简

export async function compactContext(
  messages: BaseMessage[],
  options: CompactOptions
): Promise<BaseMessage[]> {
  // 1. 计算当前 token
  // 2. 检查是否超过阈值
  // 3. 精简工具调用结果
  // 4. 保留关键信息
}
```

---

## 二、Dexter vs Loucode 差距分析

### 2.0 最新数据对比 (2026-05-07 实测)

| 指标 | Loucode | Dexter | 差距倍数 | 差距类型 |
|------|---------|--------|----------|----------|
| **代码行数** | ~398,000 | ~29,500 | **13.5x** | 数量差距 |
| **工具目录数** | **56** | **13** | **4.3x** | 核心差距 |
| **工具数量** | **54+** | **~30** | **1.8x** | 功能差距 |
| **SubAgent类型** | **7种** | **2种** | **3.5x** | 能力差距 |
| **Plan工具** | **5个** | **5个** | 1:1 | 持平 |
| **文件系统工具** | **6类** | **5类** | 1.2x | 接近 |

### 1.1 Loucode 完整工具目录清单 (56 个)

```
AgentTool              - 子代理创建
AskUserQuestionTool    - 用户问答
BashTool               - Bash执行 (20个子目录，完整沙箱)
BriefTool              - 简报生成
ConfigTool             - 配置管理
DiscoverSkillsTool     - Skill发现 ⭐
EnterPlanModeTool      - 进入计划模式
EnterWorktreeTool      - 进入工作区 ⭐
ExitPlanModeTool       - 退出计划模式
ExitWorktreeTool       - 退出工作区 ⭐
FileEditTool           - 文件编辑 (8个子目录)
FileReadTool           - 文件读取 (7个子目录)
FileWriteTool          - 文件写入 (5个子目录)
GlobTool               - 文件查找 (5个子目录)
GrepTool               - 内容搜索 (5个子目录)
LSPTool                - 语言服务器 ⭐
ListMcpResourcesTool   - MCP资源列表
MCPTool                - MCP工具
McpAuthTool            - MCP认证
MonitorTool            - 监控工具
NotebookEditTool       - Jupyter编辑 ⭐
OverflowTestTool       - 溢出测试
PowerShellTool         - PowerShell
PushNotificationTool   - 推送通知 ⭐
REPLTool               - REPL执行
ReadMcpResourceTool    - 读取MCP资源
RemoteTriggerTool      - 远程触发
ReviewArtifactTool     - 制品审查 ⭐
ScheduleCronTool        - 定时调度
SendMessageTool         - 发送消息 ⭐
SendUserFileTool        - 发送用户文件
SkillTool              - Skill调用
SleepTool              - 睡眠等待
SnipTool               - 截图工具 ⭐
SubscribePRTool         - PR订阅 ⭐
SuggestBackgroundPRTool - PR建议 ⭐
SyntheticOutputTool    - 合成输出
TaskCreateTool         - 任务创建
TaskGetTool            - 任务获取
TaskOutputTool         - 任务输出 ⭐
TaskStopTool           - 任务停止
TaskUpdateTool         - 任务更新
TeamCreateTool         - 团队创建 ⭐
TeamDeleteTool         - 团队删除 ⭐
TerminalCaptureTool    - 终端捕获
TodoWriteTool          - 待办事项
ToolSearchTool         - 工具搜索 ⭐
TungstenTool           - 钨工具
VerifyPlanExecutionTool - 验证计划执行
WebBrowserTool         - 网页浏览器 (Playwright)
WebFetchTool           - 网页抓取
WebSearchTool          - 网页搜索
WorkflowTool           - 工作流
```

### 1.2 Dexter 当前工具清单 (13 个目录)

```
├── astock/           - A股数据 (6个工具)
│   ├── get-astock-price.ts
│   ├── get-astock-financials.ts
│   ├── get-astock-news.ts
│   ├── screen-astocks.ts
│   ├── get-sector-data.ts
│   └── get-technical-data.ts
├── browser/          - 浏览器 (基础)
├── cron/              - 定时任务
├── fetch/             - 网页抓取
├── filesystem/        - 文件系统 (5个工具)
│   ├── read-file.ts
│   ├── write-file.ts
│   ├── edit-file.ts
│   ├── glob.ts
│   └── grep.ts
├── finance/           - 金融数据 (9个工具)
│   ├── get-financials.ts
│   ├── get-market-data.ts
│   ├── read-filings.ts
│   └── screen-stocks.ts
├── heartbeat/         - 心跳检查
├── memory/            - 内存管理
├── plan/              - 计划模式 (5个工具)
├── search/            - 搜索工具
│   ├── exa-search.ts
│   ├── perplexity-search.ts
│   ├── tavily-search.ts
│   └── x-search.ts
├── agent-tool.ts      - 子代理
└── skill.ts           - Skill调用
```

### 1.3 详细能力差距分析

| 能力领域 | Loucode | Dexter | 差距 | 优先级 |
|---------|---------|--------|------|--------|
| **Worktree管理** | EnterWorktreeTool + ExitWorktreeTool | ❌ 无 | 🔴 高 | **P0** |
| **Bash 沙箱** | 完整 20 目录实现 | ❌ 仅基础调用 | 🔴 高 | **P0** |
| **LSP 集成** | LSPTool (8目录) | ❌ 无 | 🔴 高 | **P1** |
| **团队协作** | TeamCreate/Delete | ❌ 无 | 🟡 中 | **P1** |
| **Jupyter支持** | NotebookEditTool | ❌ 无 | 🟡 中 | **P1** |
| **推送通知** | PushNotificationTool | ❌ 无 | 🟡 中 | **P1** |
| **文件系统工具** | 完整 6 类 (31 目录) | 基础 5 类 | 🟡 中 | **P1** |
| **Task 系统** | 完整 5 工具 | 仅 Cron | 🟡 中 | **P1** |
| **Skill 发现** | DiscoverSkillsTool | 基础搜索 | 🟡 中 | **P2** |
| **WebBrowser** | Playwright 完整 | 基础实现 | 🟡 中 | **P2** |
| **Plan 模式** | 5 工具 | 5 工具 | 🟢 已追上 | - |

### 1.4 Dexter 独有优势

| 能力 | Loucode | Dexter | 说明 |
|------|---------|--------|------|
| **金融数据** | ❌ | ✅ | Tushare, AKShare, SEC filings |
| **A 股支持** | ❌ | ✅ | 上交所/深交所/科创板 |
| **WhatsApp 网关** | ❌ | ✅ | 移动端消息推送 |
| **定时任务** | Cron 基础 | 完整 Cron 系统 | 主动监控和提醒 |
| **主动模式** | ❌ | ✅ | 事件驱动的后台处理 |
| **投资研究** | ❌ | ✅ | DCF 估值、财报分析、筛选 |

### 1.5 投资版 Agent 定位架构

Dexter 的核心差异化在于**金融领域的深度集成**：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                     Dexter 投资版 Agent 架构 - 差异化定位                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────┐       │
│   │                     Agent Harness 层 (通用)                                    │       │
│   │   QueryEngine + ToolExecutor + MessageManager + PermissionSystem              │       │
│   └─────────────────────────────────────────────────────────────────────────────┘       │
│                                       │                                                │
│                                       ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────────────┐       │
│   │                    金融数据抽象层 (Dexter 特色)                                │       │
│   │                                                                             │       │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │       │
│   │   │  Tushare   │  │  AKShare   │  │   SEC API   │  │   Yahoo    │     │       │
│   │   │  Adapter   │  │  Adapter   │  │   Adapter   │  │   Finance  │     │       │
│   │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │       │
│   │          │                 │                 │                 │              │       │
│   │          └─────────────────┼─────────────────┼─────────────────┘              │       │
│   │                          ▼                 ▼                               │       │
│   │                   ┌────────────────────────────────┐                    │       │
│   │                   │      Financial Data Gateway     │                    │       │
│   │                   │   统一数据接口 + 缓存 + 限流    │                    │       │
│   │                   └────────────────────────────────┘                    │       │
│   └─────────────────────────────────────────────────────────────────────────────┘       │
│                                       │                                                │
│                                       ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────────────┐       │
│   │                    投资分析引擎层 (Dexter 特色)                                │       │
│   │                                                                             │       │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │       │
│   │   │  DCF/NAV   │  │  Quant     │  │  Portfolio  │  │   Risk     │     │       │
│   │   │  Valuation │  │  Engine   │  │   Tracker  │  │   Monitor  │     │       │
│   │   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │       │
│   │                                                                             │       │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │       │
│   │   │  Screener  │  │  Earnings   │  │  Event     │                      │       │
│   │   │  Engine   │  │  Analyzer  │  │  Driver   │                      │       │
│   │   └─────────────┘  └─────────────┘  └─────────────┘                      │       │
│   └─────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.6 投资工具扩展清单

基于当前 Dexter 工具，需要增加以下投资专用工具：

| # | 工具名称 | 功能描述 | 数据源 | 优先级 |
|---|----------|----------|--------|--------|
| I1 | `get_portfolio` | 投资组合持仓查询 | SQLite + Tushare | P0 |
| I2 | `calculate_var` | VaR 风险价值计算 | 自研 | P0 |
| I3 | `calculate_sharpe` | 夏普比率计算 | 自研 | P0 |
| I4 | `screen_by_factors` | 多因子选股 | Tushare | P1 |
| I5 | `calculate_dcf` | DCF 估值 | 自研 + Python | P1 |
| I6 | `analyze_earnings` | 财报分析 | AKShare | P1 |
| I7 | `track_news_sentiment` | 舆情分析 | Exa/Tavily | P2 |
| I8 | `backtest_strategy` | 策略回测 | Backtrader | P2 |
| I9 | `generate_report` | 投资报告生成 | Markdown + PDF | P2 |
| I10 | `portfolio_rebalance` | 再平衡提醒 | 自研 | P3 |

### 1.7 金融数据网关架构

```typescript
// src/finance/gateway.ts
// 统一金融数据访问接口

export interface FinancialDataGateway {
  // 市场数据
  getMarketData(symbol: string, options?: MarketDataOptions): Promise<MarketData>
  getHistoricalData(symbol: string, period: Period): Promise<OHLCV[]>

  // 财务数据
  getFinancials(symbol: string, statement: StatementType): Promise<Financials>
  getKeyMetrics(symbol: string): Promise<KeyMetrics>

  // 实时数据
  getRealtimeQuote(symbol: string): Promise<Quote>

  // 筛选数据
  screenStocks(criteria: ScreenCriteria): Promise<Stock[]>
}

// 实现示例
export class TushareAdapter implements FinancialDataGateway {
  private client: TushareClient
  private cache: Cache

  async getMarketData(symbol: string, options?: MarketDataOptions) {
    const cacheKey = `market:${symbol}:${options?.date}`

    // 1. 检查缓存
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }

    // 2. 限流控制
    await this.rateLimiter.acquire()

    // 3. 调用 API
    const data = await this.client.daily({ ts_code: symbol, ...options })

    // 4. 缓存结果
    this.cache.set(cacheKey, data, { ttl: 60 * 5 }) // 5分钟缓存

    return data
  }
}
```
| **定时任务** | Cron 基础 | 完整 Cron 系统 | 主动监控和提醒 |
| **主动模式** | ❌ | ✅ | 事件驱动的后台处理 |
| **投资研究** | ❌ | ✅ | DCF 估值、财报分析、筛选 |

### 1.5 详细技术差距列表

#### G1: Worktree 管理 (P0) - 关键差距

**Loucode 有**:
```typescript
// EnterWorktreeTool
interface EnterWorktreeTool {
  name: 'EnterWorktree'
  description: 'Create or enter a git worktree for isolated development'
  input: {
    action: 'enter' | 'create'
    name?: string      // 工作区名称
    branch?: string    // 分支名
    path?: string     // 可选路径
  }
}

// ExitWorktreeTool
interface ExitWorktreeTool {
  name: 'ExitWorktree'
  description: 'Exit a worktree and optionally clean up'
  input: {
    action: 'keep' | 'remove' | 'auto'
    discardChanges?: boolean
  }
}
```

**Dexter 缺**:
- ❌ EnterWorktreeTool
- ❌ ExitWorktreeTool
- ❌ 工作区隔离能力

#### G2: Bash 沙箱 (P0) - 安全差距

**Loucode 有** (20 个子目录实现):
```
BashTool/
├── BashTool.ts          - 主实现
├── BashOptions.ts       - 选项配置
├── BashResult.ts        - 结果类型
├── createBashTool.ts    - 工厂函数
├── index.ts
├── parse.ts
├── sandbox.ts           - 沙箱实现 ⭐
├── sandbox.test.ts
├── shell.ts
└── types.ts
```

**Dexter 有**:
- ✅ 基础 Bash 调用
- ❌ 无沙箱隔离
- ❌ 无命令过滤
- ❌ 无超时控制

---

## 三、Dexter 投资定位

### 2.1 核心定位

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   ██████╗ ███████╗███████╗██╗   ██╗███╗   ███╗███████╗     ██████╗ ██████╗   │
│   ██╔══██╗██╔════╝██╔════╝██║   ██║████╗ ████║██╔════╝     ██╔══██╗██╔══██╗  │
│   ██║  ██║█████╗  ███████╗██║   ██║██╔████╔██║█████╗       ██║  ██║██████╔╝  │
│   ██║  ██║██╔══╝  ╚════██║██║   ██║██║╚██╔╝██║██╔══╝       ██║  ██║██╔══██╗  │
│   ██████╔╝███████╗███████║╚██████╔╝██║ ╚═╝ ██║███████╗     ██████╔╝██████╔╝  │
│   ╚═════╝ ╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝     ╚═════╝ ╚═════╝   │
│                                                                                     │
│                        投资研究版 Claude Code                                         │
│                                                                                     │
│   ┌───────────────────────────────────────────────────────────────────────────┐     │
│   │                                                                           │     │
│   │   • 金融数据: 美股/A股/港股/期货                                          │     │
│   │   • 量化分析: DCF/PE/ROE/筛选                                            │     │
│   │   • 投资组合: 持仓/风控/收益                                              │     │
│   │   • 智能投研: 财报/公告/研报                                              │     │
│   │                                                                           │     │
│   └───────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 差异化功能矩阵

| 功能 | Loucode | 普通 Agent | Dexter |
|------|---------|-----------|--------|
| **美股数据** | ❌ | ❌ | ✅ |
| **A 股数据** | ❌ | ❌ | ✅ |
| **港股数据** | ❌ | ❌ | ✅ |
| **DCF 估值** | ❌ | ❌ | ✅ |
| **财报分析** | ❌ | ❌ | ✅ |
| **基金筛选** | ❌ | ❌ | ✅ |
| **量化筛选** | ❌ | ❌ | ✅ |
| **投资组合** | ❌ | ❌ | ✅ |
| **风险控制** | ❌ | ❌ | ✅ |
| **代码编辑** | ✅ | ✅ | 基础 |
| **Git 操作** | ✅ | ✅ | 基础 |

### 2.3 目标用户

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dexter 目标用户                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   🏢 机构投资者                                                 │
│      - 量化研究员                                              │
│      - 投资组合经理                                            │
│      - 风险分析师                                              │
│                                                                 │
│   💼 高净值个人                                                │
│      - 价值投资者                                              │
│      - 主动管理型                                              │
│      - 全球配置型                                              │
│                                                                 │
│   📊 金融科技                                                  │
│      - 券商/银行 IT                                            │
│      - 财富管理平台                                            │
│      - 量化交易系统                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、架构设计

### 3.1 完整架构图

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        Dexter AI Agent - 投资研究版                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                          用户交互层                                      │   ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │   ║
║  │  │   CLI/TUI    │  │   WhatsApp   │  │    REST      │  │  Web     │  │   ║
║  │  │  (bun run)   │  │   Gateway    │  │   Gateway    │  │  UI      │  │   ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘  │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                       ║
║                                        ▼                                       ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                          Agent 核心层                                      │   ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   ║
║  │  │   Agent    │  │  Subagent  │  │   Skills   │  │   Memory      │  │   ║
║  │  │   Loop     │  │   Runner   │  │   System   │  │   Manager     │  │   ║
║  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   ║
║  │                                                                          │   ║
║  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   ║
║  │  │   State    │  │   Hooks    │  │   Cron     │  │   Proactive   │  │   ║
║  │  │   Store    │  │   System   │  │   System   │  │   Controller  │  │   ║
║  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                       ║
║                                        ▼                                       ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                          工具系统层                                      │   ║
║  │                                                                          │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │   ║
║  │  │  金融数据工具   │  │  文件系统工具   │  │  搜索工具      │            │   ║
║  │  │  • get_financials│ │  • ReadTool   │  │  • web_search  │            │   ║
║  │  │  • get_market_data│ │  • WriteTool  │  │  • x_search   │            │   ║
║  │  │  • read_filings │  │  • EditTool   │  │               │            │   ║
║  │  │  • stock_screener│  │  • GlobTool   │  │               │            │   ║
║  │  │  • get_astock_* │  │  • GrepTool   │  │               │            │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────┘            │   ║
║  │                                                                          │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │   ║
║  │  │   MCP 工具     │  │   浏览器工具    │  │   系统工具     │            │   ║
║  │  │  (mcp__*__)   │  │  • browser    │  │  • agent      │            │   ║
║  │  │               │  │  • web_fetch  │  │  • heartbeat  │            │   ║
║  │  │               │  │               │  │  • cron      │            │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────┘            │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                        │                                       ║
║                                        ▼                                       ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │                          数据层                                          │   ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   ║
║  │  │  Tushare Pro │  │   AKShare    │  │   SEC EDGAR  │               │   ║
║  │  │  (A股数据)   │  │  (多市场)    │  │  (美股文件)  │               │   ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘               │   ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   ║
║  │  │   Exa/       │  │  SQLite +    │  │   File      │               │   ║
║  │  │   Perplexity  │  │   Embeddings │  │   System     │               │   ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘               │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 3.2 数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           用户请求流程                                       │
└─────────────────────────────────────────────────────────────────────────────┘

     用户输入
         │
         ▼
┌─────────────────┐
│   CLI / TUI     │
│   或            │
│   WhatsApp     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Agent Loop   │ ◀──── System Prompt
│  (LLM + Tools) │       + Skills
└────────┬────────┘       + Memory
         │
         ├──▶ ┌─────────────┐
         │    │  Skill      │
         │    │  Invocation │
         │    └─────────────┘
         │
         ├──▶ ┌─────────────┐     ┌─────────────┐
         │    │  Tool       │────▶│  External   │
         │    │  Executor   │     │  APIs       │
         │    └─────────────┘     │  (Tushare,  │
         │                         │   AKShare,   │
         │                         │   Exa...)    │
         │                         └─────────────┘
         │
         ├──▶ ┌─────────────┐
         │    │  Memory     │
         │    │  Search    │
         │    └─────────────┘
         │
         ▼
┌─────────────────┐
│   Response      │ ───▶ 用户
│   (Markdown)    │
└─────────────────┘
```

### 3.3 子系统交互图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         子系统交互                                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐
    │   Gateway    │         │    Cron     │
    │  (WhatsApp) │         │   Runner    │
    └──────┬───────┘         └──────┬───────┘
           │                          │
           │                          │
           ▼                          ▼
    ┌──────────────────────────────────────────┐
    │                                          │
    │              ┌────────────┐              │
    │              │   Agent   │              │
    │              │   Core    │              │
    │              └─────┬──────┘              │
    │                    │                     │
    │     ┌─────────────┼─────────────┐      │
    │     │             │             │      │
    │     ▼             ▼             ▼      │
    │ ┌───────┐  ┌──────────┐  ┌────────┐ │
    │ │Tools  │  │ Skills   │  │Memory  │ │
    │ │       │  │          │  │        │ │
    │ └──┬────┘  └─────┬────┘  └───┬────┘ │
    │    │              │            │     │
    │    └──────────────┼────────────┘     │
    │                   │                  │
    │                   ▼                  │
    │              ┌─────────┐            │
    │              │   MCP   │            │
    │              │   Hub   │            │
    │              └────┬────┘            │
    │                   │                  │
    └───────────────────┼──────────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │  External    │
                 │  Data Sources │
                 │  (Tushare,   │
                 │   AKShare,    │
                 │   Exa...)     │
                 └──────────────┘
```

---

## 五、Phase 6 增强计划

### 4.0 实现优先级矩阵

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                           Phase 6 实现优先级                                      ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║   紧急程度    │     高价值        │     高价值        │   紧急程度    ║
║    (立即)     │   (优先实现)      │    (规划中)       │    (忽略)     ║
║               │                   │                   │               ║
║  ─────────────┼───────────────────┼───────────────────┼──────────────  ║
║               │                   │                   │               ║
║   P0:        │   P1:            │   P2:            │   P3:         ║
║   • EditTool  │   • Worktree    │   • DiscoverSkills │   • LSP       ║
║   • WriteTool │   • Task System │   • Skill 优化    │   • Bridge    ║
║   • ReadTool  │   • Bash 沙箱  │                   │   • Team      ║
║   • Bash 增强 │                   │                   │               ║
║               │                   │                   │               ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

### 4.1 P0: 核心工具增强 (立即)

| # | 任务 | 优先级 | 状态 | 参考实现 |
|---|------|--------|------|----------|
| 6.1 | 实现 EditTool (old_string/new_string) | P0 | ✅ | Loucode FileEditTool |
| 6.2 | 实现 WriteTool (原子创建/覆盖) | P0 | ✅ | Loucode FileWriteTool |
| 6.3 | 增强 ReadTool (PDF/图片支持) | P0 | ✅ | Loucode FileReadTool |
| 6.4 | Bash 沙箱安全增强 | P0 | ✅ | Loucode BashTool/sandbox.ts |

#### 6.1.1 EditTool 实现方案

```typescript
// src/tools/filesystem/edit-tool.ts
// 参考: Loucode src/tools/FileEditTool/

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { readFile, writeFile } from 'fs/promises';
import { GlobTool } from './glob.js';

const EditToolSchema = z.object({
  file_path: z.string().describe('The path of the file to edit'),
  old_string: z.string().describe('The text to find in the file'),
  new_string: z.string().describe('The replacement text'),
});

export function createEditTool() {
  return new DynamicStructuredTool({
    name: 'edit',
    description: 'Edit a file by replacing text',
    schema: EditToolSchema,
    async execute({ file_path, old_string, new_string }) {
      const content = await readFile(file_path, 'utf-8');

      if (!content.includes(old_string)) {
        throw new Error(`old_string not found in file: ${old_string}`);
      }

      const newContent = content.replace(old_string, new_string);
      await writeFile(file_path, newContent, 'utf-8');

      return `Edited ${file_path}: replaced "${old_string}" → "${new_string}"`;
    },
  });
}
```

#### 6.1.2 Bash 沙箱安全方案

```typescript
// src/tools/bash/sandbox.ts
// 参考: Loucode src/tools/BashTool/sandbox.ts

interface SandboxConfig {
  maxTimeout: number;      // 最大执行时间 (ms)
  maxOutputSize: number;   // 最大输出大小 (bytes)
  allowedCommands: string[]; // 白名单命令
  blockedPatterns: RegExp[]; // 禁止的模式
}

const DEFAULT_SANDBOX: SandboxConfig = {
  maxTimeout: 60000,  // 1分钟
  maxOutputSize: 1024 * 1024,  // 1MB
  allowedCommands: ['git', 'npm', 'bun', 'node', 'python3', 'curl'],
  blockedPatterns: [
    /rm\s+-rf\s+\//,           // 危险删除
    /curl.*\|.*sh/,            // pipe to shell
    /wget.*\|.*sh/,            // wget pipe
    /nc\s+[^\s]+\s+-e/,       // netcat reverse shell
    /;\s*sh\s*$/,              // command ending with shell
  ],
};

export async function executeInSandbox(
  command: string,
  config: SandboxConfig = DEFAULT_SANDBOX
): Promise<BashResult> {
  // 1. 命令验证
  validateCommand(command, config);

  // 2. 执行带超时
  const result = await Promise.race([
    exec(command),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), config.maxTimeout)
    ),
  ]);

  // 3. 输出截断
  return truncateOutput(result, config.maxOutputSize);
}
```

### 4.2 P1: 工作区和任务系统 (短期)

| # | 任务 | 优先级 | 状态 | 参考实现 |
|---|------|--------|------|----------|
| 6.5 | 实现 create_worktree | P1 | ✅ | Loucode EnterWorktreeTool |
| 6.6 | 实现 remove_worktree | P1 | ✅ | Loucode ExitWorktreeTool |
| 6.7 | 实现 list_worktree | P1 | ✅ | Loucode WorktreeList |
| 6.8 | 增强 TasksWorker (TaskOutput blocking) | P1 | ⬜ | Loucode TaskOutputTool |

#### 6.2.1 WorktreeTool 实现方案

```typescript
// src/tools/worktree/index.ts

import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

export function createEnterWorktreeTool() {
  return new DynamicStructuredTool({
    name: 'EnterWorktree',
    description: 'Create or enter a git worktree for isolated development',
    schema: z.object({
      action: z.enum(['enter', 'create']),
      name: z.string().optional(),
      branch: z.string().optional(),
      path: z.string().optional(),
    }),
    async execute({ action, name, branch, path }) {
      if (action === 'create') {
        const worktreePath = path || join('.claude/worktrees', name!);
        await execAsync(`git worktree add -b ${branch} ${worktreePath}`);
        return `Created worktree at ${worktreePath} with branch ${branch}`;
      } else {
        const worktrees = await getWorktreeList();
        return formatWorktreeList(worktrees);
      }
    },
  });
}

export function createExitWorktreeTool() {
  return new DynamicStructuredTool({
    name: 'ExitWorktree',
    description: 'Exit a worktree and optionally clean up',
    schema: z.object({
      action: z.enum(['keep', 'remove', 'auto']),
      discardChanges: z.boolean().optional(),
    }),
    async execute({ action, discardChanges }) {
      const currentWorktree = await getCurrentWorktree();

      if (action === 'remove') {
        await execAsync(`git worktree remove ${currentWorktree}`);
        return `Removed worktree ${currentWorktree}`;
      }
      // ... handle other actions
    },
  });
}
```

### 4.3 P2: Skill 和发现系统 (中期)

| # | 任务 | 优先级 | 状态 | 参考实现 |
|---|------|--------|------|----------|
| 6.9 | 实现 list_skills | P2 | ✅ | Loucode DiscoverSkillsTool |
| 6.10 | 实现 search_skills | P2 | ✅ | Skill 搜索 |
| 6.11 | 实现 get_skill | P2 | ✅ | Skill 详情 |
| 6.12 | Skill 版本管理 | P2 | ⬜ | Semantic Versioning |

### 4.4 P3: 企业级功能 (长期)

| # | 任务 | 优先级 | 状态 | 参考实现 |
|---|------|--------|------|----------|
| 6.13 | Session 内存提取 (SessionMemory) | P3 | ⬜ | Loucode SessionSummary |
| 6.14 | Bridge API 集成 | P3 | ⬜ | Loucode Bridge API |
| 6.15 | 团队协作功能 | P3 | ⬜ | Loucode TeamCreateTool |
| 6.16 | LSP 集成 | P3 | ⬜ | Loucode LSPTool |

---

## 六、投资功能增强

### 5.1 Phase 7: 量化分析能力

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           量化分析能力架构                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   数据获取层    │────▶│   技术指标层    │────▶│   风险指标层    │              │
│   │  AKShare/Tushare│     │  • MACD         │     │  • VaR          │              │
│   │                 │     │  • KDJ         │     │  • Sharpe       │              │
│   │                 │     │  • Bollinger   │     │  • Sortino      │              │
│   │                 │     │  • RSI         │     │  • Calmar       │              │
│   │                 │     │  • WR          │     │  • Omega        │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│           │                       │                       │                         │
│           ▼                       ▼                       ▼                         │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   回测框架层    │     │   因子分析层    │     │   策略优化层    │              │
│   │  Backtrader/    │     │  • 价值因子     │     │  • 参数优化     │              │
│   │   Pyfolio       │     │  • 动量因子     │     │  • 组合权重     │              │
│   │                 │     │  • 质量因子     │     │  • 风险平价     │              │
│   │                 │     │  • 成长因子     │     │                 │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| # | 功能 | 数据源 | 状态 | 实现方案 |
|---|------|--------|------|----------|
| 7.1 | 技术指标计算 (MACD, KDJ, Bollinger) | AKShare | ⬜ | Python/TA-Lib |
| 7.2 | 量化回测框架 | Python/pyfolio | ⬜ | Backtrader |
| 7.3 | 风险指标计算 (VaR, Sharpe, Sortino, MaxDrawdown) | 自研 | ✅ | TypeScript (src/tools/quant/) |
| 7.4 | 因子分析 | Tushare | ⬜ | Statsmodels |

#### 5.1.1 技术指标工具实现

```python
# src/tools/quant/technical_indicators.py

import akshare as ak
import pandas as pd
import numpy as np
from typing import Dict, List

class TechnicalIndicators:
    """技术指标计算器"""

    def __init__(self, symbol: str, period: str = "daily"):
        self.symbol = symbol
        self.period = period
        self.data = self._fetch_data()

    def _fetch_data(self) -> pd.DataFrame:
        """获取K线数据"""
        df = ak.stock_zh_a_hist(
            symbol=self.symbol.replace("SH", "").replace("SZ", ""),
            period=self.period,
            adjust="qfq"
        )
        return df

    def calculate_macd(
        self,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9
    ) -> Dict[str, pd.Series]:
        """MACD指标"""
        ema_fast = self.data['收盘'].ewm(span=fast).mean()
        ema_slow = self.data['收盘'].ewm(span=slow).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal).mean()
        bar = 2 * (dif - dea)

        return {
            'DIF': dif,
            'DEA': dea,
            'MACD': bar
        }

    def calculate_kdj(
        self,
        n: int = 9,
        m1: int = 3,
        m2: int = 3
    ) -> Dict[str, pd.Series]:
        """KDJ指标"""
        low_n = self.data['最低'].rolling(window=n).min()
        high_n = self.data['最高'].rolling(window=n).max()

        rsv = (self.data['收盘'] - low_n) / (high_n - low_n) * 100

        K = rsv.ewm(com=m1-1, adjust=False).mean()
        D = K.ewm(com=m2-1, adjust=False).mean()
        J = 3 * K - 2 * D

        return {'K': K, 'D': D, 'J': J}

    def calculate_bollinger(
        self,
        window: int = 20,
        num_std: float = 2.0
    ) -> Dict[str, pd.Series]:
        """布林带指标"""
        ma = self.data['收盘'].rolling(window=window).mean()
        std = self.data['收盘'].rolling(window=window).std()

        upper = ma + num_std * std
        lower = ma - num_std * std

        return {
            'upper': upper,
            'middle': ma,
            'lower': lower
        }
```

#### 5.1.2 风险指标工具实现

```python
# src/tools/quant/risk_metrics.py

import numpy as np
import pandas as pd
from typing import Dict, Tuple

class RiskMetrics:
    """风险指标计算器"""

    @staticmethod
    def calculate_var(
        returns: pd.Series,
        confidence: float = 0.95,
        method: str = 'historical'
    ) -> float:
        """计算VaR (Value at Risk)"""
        if method == 'historical':
            return np.percentile(returns, (1 - confidence) * 100)
        elif method == 'parametric':
            mu = returns.mean()
            sigma = returns.std()
            z = np.random.normal(0, 1, 10000)
            return mu + sigma * np.percentile(z, (1 - confidence) * 100)
        else:
            raise ValueError(f"Unknown method: {method}")

    @staticmethod
    def calculate_sharpe(
        returns: pd.Series,
        risk_free_rate: float = 0.03,
        periods_per_year: int = 252
    ) -> float:
        """计算Sharpe Ratio"""
        excess_returns = returns - risk_free_rate / periods_per_year
        return np.sqrt(periods_per_year) * excess_returns.mean() / excess_returns.std()

    @staticmethod
    def calculate_sortino(
        returns: pd.Series,
        target_return: float = 0,
        periods_per_year: int = 252
    ) -> float:
        """计算Sortino Ratio"""
        excess_returns = returns - target_return
        downside_returns = excess_returns[excess_returns < 0]

        if len(downside_returns) == 0:
            return np.inf

        downside_std = np.sqrt((downside_returns ** 2).mean() * periods_per_year)
        return np.sqrt(periods_per_year) * excess_returns.mean() / downside_std

    @staticmethod
    def calculate_max_drawdown(equity_curve: pd.Series) -> Dict[str, float]:
        """计算最大回撤"""
        cummax = equity_curve.cummax()
        drawdown = (equity_curve - cummax) / cummax

        return {
            'max_drawdown': drawdown.min(),
            'max_drawdown_duration': (drawdown == 0).cumsum() - (drawdown == 0).cumsum().where(drawdown == 0).ffill().fillna(0)
        }
```

### 5.2 Phase 8: 投资组合管理

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           投资组合管理架构                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   持仓管理      │────▶│   收益分析      │────▶│   风控监控      │              │
│   │  • 实时持仓    │     │  • 日收益      │     │  • VaR监控     │              │
│   │  • 成本跟踪    │     │  • 月收益      │     │  • 止损提醒     │              │
│   │  • 分红再投    │     │  • 年收益      │     │  • 集中度预警   │              │
│   │  • 持仓成本    │     │  • 超额收益    │     │               │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│           │                       │                       │                         │
│           ▼                       ▼                       ▼                         │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   再平衡引擎    │     │   归因分析      │     │   报告生成      │              │
│   │  • 阈值触发    │     │  • Brinson     │     │  • Markdown    │              │
│   │  • 时间触发    │     │  • 因子归因    │     │  • PDF导出     │              │
│   │  • 动态权重    │     │  • 交易归因    │     │  • 可视化图表   │              │
│   │               │     │               │     │               │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| # | 功能 | 说明 | 状态 | 实现方案 |
|---|------|------|------|----------|
| 8.1 | 持仓追踪 | 实时更新 | ✅ | TypeScript (src/tools/portfolio/) |
| 8.2 | 收益归因 | 日/月/年收益 | ✅ | 内置PnL计算 |
| 8.3 | 再平衡提醒 | 阈值触发 | ⬜ | Cron + Webhook |
| 8.4 | 组合分析报告 | Markdown/PDF | ⬜ | Marked + Puppeteer |

### 5.3 Phase 9: 智能投研

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           智能投研架构                                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   数据采集层    │────▶│   分析处理层    │────▶│   智能决策层    │              │
│   │  • 公告数据    │     │  • NLP解析      │     │  • 投资建议     │              │
│   │  • 新闻舆情    │     │  • 情感分析     │     │  • 风险预警     │              │
│   │  • 研报数据    │     │  • 事件提取     │     │  • 机会识别     │              │
│   │  • 政策文件    │     │  • 关系抽取     │     │  • 组合推荐     │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│           │                       │                       │                         │
│           ▼                       ▼                       ▼                         │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐              │
│   │   事件驱动      │     │   知识图谱      │     │   智能问答      │              │
│   │  • 业绩预告    │     │  • 产业链图    │     │  • 持仓诊断     │              │
│   │  • 股权变动    │     │  • 关联方      │     │  • 风险咨询     │              │
│   │  • 高管变动    │     │  • 竞争图谱    │     │  • 机会推荐     │              │
│   │  • 重大合同    │     │               │     │               │              │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

| # | 功能 | 说明 | 状态 | 实现方案 |
|---|------|------|------|----------|
| 9.1 | 研报解读 | NLP 分析 | ✅ | 基于关键词的NLP解析 |
| 9.2 | 舆情分析 | 情绪打分 | ✅ | 情感分析工具 (analyze_sentiment) |
| 9.3 | 事件驱动 | 公告/政策 | ✅ | 事件检测工具 (detect_events) |
| 9.4 | 智能投顾 | 个性化建议 | ⬜ | RAG + LLM |

---

## 七、预期成果

### 6.1 代码规模目标 (实测数据)

| 指标 | Loucode | Dexter当前 | Dexter目标 | 差距缩小 |
|------|---------|------------|------------|----------|
| **代码行数** | ~398,000 | ~29,500 | ~100,000 | **3.4x → 4x** |
| **工具目录数** | 56 | 13 | 40 | **3.2x → 1.4x** |
| **工具数量** | 54+ | ~30 | 50+ | **1.8x → 1.1x** |
| **Skills** | N/A | 12 | 30 | **+150%** |

### 6.2 功能完整性目标

| 能力 | Loucode | Dexter当前 | 差距 | Dexter目标 |
|------|---------|------------|------|------------|
| 文件系统工具 | 6类31目录 | 5类13目录 | 接近 | ✅ **100%** |
| Bash 沙箱 | 完整20目录 | 基础调用 | 🔴 高 | **80%** |
| 工作区管理 | ✅ 完整 | ❌ 无 | 🔴 高 | ✅ **100%** |
| 任务系统 | 5工具完整 | 仅Cron | 🟡 中 | **90%** |
| Skill 系统 | 动态发现 | 基础搜索 | 🟡 中 | ✅ **100%** |
| Plan 模式 | 5工具 | 5工具 | 🟢 持平 | ✅ **已超越** |

### 6.3 投资能力目标

| 能力 | Loucode | Dexter | Dexter目标 |
|------|---------|--------|------------|
| 金融数据覆盖 | ❌ | 美股/A股 | ✅ **+港股/期货/期权** |
| 量化分析 | ❌ | 基础指标 | ✅ **+完整因子库** |
| 投资组合 | ❌ | 概念 | ✅ **+实际追踪** |
| 风控 | ❌ | 基础 | ✅ **+实时监控** |
| 智能投研 | ❌ | ❌ | ✅ **+NLP/事件驱动** |

### 6.4 路线图

```
Phase 6 (P0-P2): 核心工具增强
├── P0: EditTool, WriteTool, Bash沙箱
├── P1: Worktree, Task系统
└── P2: DiscoverSkills, Skill优化

Phase 7 (量化分析): 技术指标 + 风控
├── 技术指标: MACD, KDJ, Bollinger, RSI
├── 风险指标: VaR, Sharpe, Sortino
└── 回测框架: Backtrader + Pyfolio

Phase 8 (投资组合): 持仓管理 + 报告
├── 持仓追踪: SQLite + 实时API
├── 收益归因: Brinson Model
└── 再平衡: Cron + Webhook

Phase 9 (智能投研): NLP + 知识图谱
├── 研报解读: transformers ✅ 实现 (基于关键词)
├── 舆情分析: SnowNLP/ChatGPT ✅ 实现 (analyze_sentiment)
├── 事件驱动: Rule + ML ✅ 实现 (detect_events)
└── 智能投顾: RAG + LLM ⬜ 待实现
```

---

## 八、高内聚低耦合架构设计

### 7.0 架构设计原则

基于 Dexter 现有框架，最大化复用已有组件：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                    Dexter 高内聚低耦合架构原则                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   高内聚 (High Cohesion)                        低耦合 (Low Coupling)                     │
│   ─────────────────────────                        ────────────────────────                  │
│                                                                                         │
│   ┌─────────────────────────┐                      依赖倒置 (DIP)                            │
│   │  每个模块只做一件事     │                      ┌─────────────────────────┐              │
│   │  并做到极致             │                      │  高层模块不依赖低层模块  │              │
│   └─────────────────────────┘                      │  都依赖抽象接口         │              │
│                                                    └─────────────────────────┘              │
│   模块内聚性评分:                                                                       │
│   • Agent Loop: 单一职责 ✅                                                              │
│   • Tool Executor: 单一职责 ✅                                                           │
│   • Finance Gateway: 单一职责 ✅ (新增)                                                  │
│   • Portfolio Engine: 单一职责 ✅ (新增)                                                │
│                                                                                         │
│   轻量级服务定位器 (ServiceLocator) —— 替代 DI 容器                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐        │
│   │  Agent ────▶ ToolExecutor ────▶ [Tool implementations]                    │        │
│   │     │              │                                                         │        │
│   │     ▼              ▼                                                         │        │
│   │  Memory ────▶ FinancialGateway ────▶ [Data adapters]                       │        │
│   │                    │                                                         │        │
│   │                    ▼                                                         │        │
│   │              ServiceLocator (全局单例)                                        │        │
│   └─────────────────────────────────────────────────────────────────────────────┘        │
│                                                                                         │
│   为什么不使用 DI 容器:                                                                  │
│   1. Dexter 是中小型项目，DI 容器增加不必要的复杂度                                       │
│   2. ServiceLocator 更轻量，代码量少，易于理解和维护                                       │
│   3. 直接 Import 模式更适合 TypeScript/Node.js 生态                                       │
│   4. 模块间依赖关系清晰，易于追踪和调试                                                   │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.1 Dexter 现有组件复用策略

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                         Dexter 现有组件复用矩阵                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   现有组件                    复用方式                    新增投资功能                       │
│   ─────────                   ────────                    ─────────────                       │
│                                                                                         │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐              │
│   │  Agent Loop      │────▶│  复用主循环      │────▶│  投资工具注入     │              │
│   │  (agent.ts)      │     │  + 流式处理      │     │  + 投资Skills    │              │
│   │  680 行          │     │  + 错误恢复      │     │                  │              │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘              │
│           │                                                                       │
│           ▼                                                                       │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐              │
│   │  Tool Executor   │────▶│  复用工具执行器   │────▶│  金融工具新增     │              │
│   │  (tool-exec.ts) │     │  + 并发控制      │     │  + 量化计算工具   │              │
│   │  208 行         │     │  + 权限管理      │     │                  │              │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘              │
│           │                                                                       │
│           ▼                                                                       │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐              │
│   │  Memory Manager │────▶│  复用记忆管理    │────▶│  投资记忆存储     │              │
│   │  (memory/)      │     │  + 会话上下文    │     │  + 持仓记忆      │              │
│   │  ~15 文件       │     │  + 持久化        │     │  + 分析结果      │              │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘              │
│           │                                                                       │
│           ▼                                                                       │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐              │
│   │  Cron System    │────▶│  复用定时任务    │────▶│  投资监控任务     │              │
│   │  (cron/)       │     │  + 任务调度      │     │  + 价格预警      │              │
│   │  ~8 文件       │     │  + 持久化        │     │  + 再平衡提醒    │              │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 模块依赖关系图

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Dexter 模块依赖图 (实线=核心，虚线=扩展)                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│                                        ┌──────────────────┐                            │
│                                        │   CLI / Gateway   │                            │
│                                        │   (用户入口)       │                            │
│                                        └─────────┬──────────┘                            │
│                                                  │                                          │
│                                                  ▼                                          │
│                                        ┌──────────────────┐                            │
│                                        │     Agent         │                            │
│                                        │  ┌────────────┐  │                            │
│                                        │  │ Agent Loop │  │                            │
│                                        │  └────────────┘  │                            │
│                                        │  ┌────────────┐  │                            │
│                                        │  │ToolExecutor│  │                            │
│                                        │  └────────────┘  │                            │
│                                        └─────────┬──────────┘                            │
│                                                  │                                          │
│           ┌─────────────────────────────────────┼─────────────────────────────────────┐   │
│           │                                     │                                     │   │
│           ▼                                     ▼                                     ▼   │
│   ┌───────────────┐                    ┌───────────────┐                    ┌───────────────┐   │
│   │    Tools      │                    │    Skills     │                    │   Finance     │   │
│   ├───────────────┤                    ├───────────────┤                    ├───────────────┤   │
│   │ ReadTool     │                    │ /financial    │                    │ Gateway      │   │
│   │ WriteTool    │                    │ /astock      │                    │     │         │   │
│   │ EditTool     │                    │ /macro       │                    │     ▼         │   │
│   │ GlobTool     │                    │ /dcf         │                    │ Adapters     │   │
│   │ GrepTool     │                    │ /screening   │                    │ Tushare      │   │
│   │ BashTool     │                    │ /web-search  │                    │ AKShare      │   │
│   │ ...          │                    │ ...          │                    │ SEC EDGAR    │   │
│   └───────┬───────┘                    └───────────────┘                    └───────────────┘   │
│           │                                                                           │
│           │     ┌─────────────────────────────────────────────────────────────────────┐   │
│           │     │                         扩展模块 (新增)                               │   │
│           │     ├─────────────────────────────────────────────────────────────────────┤   │
│           │     │                                                                          │   │
│           │     │     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐        │   │
│           │     │     │   Quant     │      │  Portfolio  │      │    Risk     │        │   │
│           │     │     │   Engine    │      │   Tracker   │      │   Monitor   │        │   │
│           │     │     │             │      │             │      │             │        │   │
│           │     │     │ • Technical │      │ • Holdings  │      │ • VaR       │        │   │
│           │     │     │ • Factors   │      │ • P&L       │      │ • Sharpe    │        │   │
│           │     │     │ • Backtest  │      │ • Rebalance │      │ • Drawdown  │        │   │
│           │     │     └──────┬──────┘      └──────┬──────┘      └──────┬──────┘        │   │
│           │     │            │                      │                      │              │   │
│           │     │            └──────────────────────┼──────────────────────┘              │   │
│           │     │                                   ▼                                       │   │
│           │     │                          ┌─────────────────┐                            │   │
│           │     │                          │  Report Engine  │                            │   │
│           │     │                          │  (Markdown/PDF) │                            │   │
│           │     │                          └─────────────────┘                            │   │
│           │     └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                           │
│           ▼                                                                           │
│   ┌───────────────┐                                                                    │
│   │   Memory      │                                                                    │
│   ├───────────────┤                                                                    │
│   │ • Session     │                                                                    │
│   │ • Persistent │                                                                    │
│   │ • Financial* │  ← 扩展                                                           │
│   └───────────────┘                                                                    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 接口设计规范

**原则**: 所有模块间通信通过接口，不直接依赖实现

```typescript
// src/interfaces/index.ts
// 核心接口定义 - 高内聚低耦合的关键

// 1. 工具执行器接口
export interface IToolExecutor {
  execute(
    tool: StructuredToolInterface,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult>

  executeBatch(
    tools: Array<{ tool: StructuredToolInterface; input: Record<string, unknown> }>,
    context: ToolContext
  ): Promise<ToolResult[]>
}

// 2. 金融数据网关接口
export interface IFinancialDataGateway {
  // 市场数据
  getMarketData(symbol: string, options?: MarketOptions): Promise<MarketData>

  // 财务数据
  getFinancials(symbol: string, statement: StatementType): Promise<Financials>

  // 筛选
  screen(criteria: ScreenCriteria): Promise<Stock[]>
}

// 3. 投资组合追踪器接口
export interface IPortfolioTracker {
  getHoldings(): Promise<Holding[]>
  addHolding(holding: Holding): Promise<void>
  updateHolding(symbol: string, updates: Partial<Holding>): Promise<void>
  getPnL(period?: Period): Promise<PnL>
}

// 4. 风险管理器接口
export interface IRiskManager {
  calculateVaR(portfolio: Portfolio, confidence: number): Promise<number>
  calculateSharpe(returns: number[]): Promise<number>
  checkRiskLimits(portfolio: Portfolio): Promise<RiskAlert[]>
}

// 5. 报告生成器接口
export interface IReportGenerator {
  generatePortfolioReport(portfolio: Portfolio, period: Period): Promise<Report>
  generateStockAnalysis(symbol: string): Promise<Report>
  generateRiskReport(portfolio: Portfolio): Promise<Report>
}
```

### 7.4 插件化扩展机制（轻量级服务定位器）

```typescript
// src/plugins/finance-plugin.ts
// 投资功能插件 - 可插拔，使用直接Import模式

import type { Plugin, ToolDefinition } from '../types'
import { FinancialGateway } from '../finance/gateway'
import { PortfolioTracker } from '../portfolio/tracker'
import { RiskManager } from '../risk/manager'
import { QuantEngine } from '../quant/engine'

// 服务定位器 - 轻量级替代DI容器
class ServiceLocator {
  private static instance: ServiceLocator
  private services = new Map<string, unknown>()

  static getInstance(): ServiceLocator {
    if (!this.instance) {
      this.instance = new ServiceLocator()
    }
    return this.instance
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service)
  }

  get<T>(name: string): T {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service ${name} not registered`)
    }
    return service as T
  }
}

// 全局服务定位器实例
export const locator = ServiceLocator.getInstance()

// 初始化服务
export function initServices(): void {
  locator.register('FinancialGateway', new FinancialGateway())
  locator.register('PortfolioTracker', new PortfolioTracker())
  locator.register('RiskManager', new RiskManager())
  locator.register('QuantEngine', new QuantEngine())
}

export const financePlugin: Plugin = {
  name: 'finance',
  version: '1.0.0',

  // 注册工具
  tools: [
    {
      name: 'get_portfolio',
      description: '获取当前投资组合持仓',
      execute: async (input) => {
        const tracker = locator.get<PortfolioTracker>('PortfolioTracker')
        return tracker.getHoldings()
      },
    },
    {
      name: 'calculate_var',
      description: '计算投资组合VaR',
      execute: async (input) => {
        const risk = locator.get<RiskManager>('RiskManager')
        return risk.calculateVaR(input.portfolio, input.confidence)
      },
    },
  ],

  // 注册Skills
  skills: [
    {
      name: 'portfolio-analysis',
      description: '投资组合分析',
      trigger: ['组合分析', '持仓分析', '收益分析'],
      execute: async (input) => {
        // 直接使用服务
      },
    },
  ],

  // 注册Cron任务
  cronJobs: [
    {
      name: 'portfolio-monitor',
      schedule: '*/5 * * * *', // 每5分钟
      execute: async () => {
        // 检查风险阈值，发送预警
      },
    },
  ],

  // 初始化
  async onInit(): Promise<void> {
    initServices()
  },
}
```

### 7.6 目录结构规划

```
src/
├── agent/                    # Agent核心 (已存在)
│   ├── agent.ts            # Agent主类
│   ├── tool-executor.ts     # 工具执行器
│   └── ...
│
├── interfaces/              # 接口定义 (新增)
│   ├── index.ts
│   ├── i-tool-executor.ts
│   ├── i-financial-gateway.ts
│   ├── i-portfolio-tracker.ts
│   ├── i-risk-manager.ts
│   └── i-report-generator.ts
│
├── plugins/                 # 服务定位器 (轻量级)
│   ├── locator.ts           # ServiceLocator 替代 DI
│   └── finance-plugin.ts
│
### 7.6.1 最小改造路径 (相对于现有结构)

```
现有结构                              最小改造后
────────────────────────────────────────────────────────────
src/
├── tools/
│   ├── registry.ts         →  增加工具注册
│   ├── skill.ts           →  复用 (增加金融Skills)
│   ├── astock/            →  复用 (扩展参数)
│   └── finance/           →  复用 (增加新函数)
│
├── agent/
│   ├── agent.ts           →  直接复用
│   ├── tool-executor.ts   →  直接复用
│   ├── prompts.ts        →  扩展 system prompt
│   └── compact.ts        →  直接复用
│
├── memory/
│   └── ...               →  复用 (增加金融记忆)
│
├── cron/
│   └── ...               →  复用 (增加监控任务)
│
└── [NEW] src/finance/    →  新增金融网关
       └── gateway.ts

改造文件数: 3 (registry.ts, prompts.ts, index.ts)
新增文件数: 5 (gateway.ts, adapters/*.ts, ...)
```

### 7.6.2 具体改造步骤

| 步骤 | 文件 | 改造内容 | 工作量 |
|------|------|----------|--------|
| 1 | `tools/finance/index.ts` | 导出新工具函数 | 小 |
| 2 | `tools/registry.ts` | 注册新金融工具 | 小 |
| 3 | `agent/prompts.ts` | 增加金融 system prompt | 小 |
| 4 | `src/finance/gateway.ts` | 新增金融网关 | 中 |
| 5 | `src/finance/adapters/*.ts` | 新增数据适配器 | 中 |

├── finance/                 # 金融数据层 (新增)
│   ├── gateway.ts           # 数据网关
│   ├── adapters/           # 数据源适配器
│   │   ├── tushare.ts
│   │   ├── akshare.ts
│   │   └── sec-edgar.ts
│   ├── cache/              # 缓存层
│   └── rate-limiter.ts     # 限流器
│
├── quant/                   # 量化分析引擎 (新增)
│   ├── engine.ts           # 量化引擎
│   ├── indicators/          # 技术指标
│   │   ├── macd.ts
│   │   ├── kdj.ts
│   │   └── bollinger.ts
│   ├── factors/            # 因子分析
│   └── backtest/           # 回测框架
│
├── portfolio/               # 投资组合管理 (新增)
│   ├── tracker.ts          # 持仓追踪
│   ├── pnl.ts             # 收益计算
│   ├── rebalance.ts        # 再平衡
│   └── storage/            # 持久化
│
├── risk/                   # 风险管理 (新增)
│   ├── manager.ts          # 风控管理
│   ├── var.ts             # VaR计算
│   ├── sharpe.ts          # Sharpe计算
│   └── alerts.ts          # 预警
│
├── reports/                # 报告生成 (新增)
│   ├── generator.ts        # 报告生成器
│   ├── markdown.ts         # Markdown格式
│   └── pdf.ts            # PDF导出
│
├── plugins/                # 插件系统 (增强)
│   ├── manager.ts
│   └── finance-plugin.ts   # 金融插件
│
└── skills/                 # Skills (已存在)
    └── finance/            # 金融Skills
        ├── dcf/
        ├── screening/
        └── macro/
```

### 7.7 实现优先级与复用策略

| 阶段 | 功能 | 复用现有组件 | 新增组件 | 依赖关系 |
|------|------|-------------|----------|----------|
| **Phase 6-1** | FinancialDataGateway | ❌ | ✅ | 独立 |
| **Phase 6-2** | PortfolioTracker | Memory Manager | ✅ | 依赖Gateway |
| **Phase 6-3** | RiskManager | Cron System | ✅ | 依赖Portfolio |
| **Phase 6-4** | QuantEngine | ToolExecutor | ✅ | 依赖Gateway |
| **Phase 7** | ReportGenerator | Skills System | ✅ | 依赖全部 |
| **Phase 8** | 智能投研 | Agent Loop | ✅ | 依赖全部 |

---

## 九、风险评估

### 7.1 技术风险矩阵

```
                        影响程度
              低        中        高
概率    ┌─────────────────────────────────────┐
 高     │  API依赖    │ 功能差距   │ 代码膨胀  │
        │  (P3)       │ (P1)      │ (P1)     │
        ├─────────────────────────────────────┤
 中     │  性能下降   │ 用户体验   │ 安全漏洞  │
        │  (P3)       │ (P2)      │ (P0)     │
        ├─────────────────────────────────────┤
 低     │  技术债务   │ 兼容性    │ 系统故障  │
        │  (P3)       │ (P2)      │ (P0)     │
        └─────────────────────────────────────┘
```

### 7.2 详细风险分析

| # | 风险 | 概率 | 影响 | 缓解措施 | 责任人 |
|---|------|------|------|----------|--------|
| R1 | **代码膨胀**导致维护困难 | 中 | 高 | 模块化设计, 严格测试, 代码审查 | 开发团队 |
| R2 | **与Loucode差距**持续存在 | 高 | 中 | 聚焦投资差异化, 定期对标 | 产品经理 |
| R3 | **外部API不稳定** (Tushare/AKShare) | 中 | 中 | 缓存+降级策略, 多数据源 | 后端团队 |
| R4 | **安全漏洞** (Bash沙箱) | 低 | 高 | 严格输入验证, 沙箱隔离 | 安全团队 |
| R5 | **Eval测试不稳定** | 中 | 中 | 固定测试模型, 版本记录 | QA团队 |
| R6 | **Skill触发准确率低** | 中 | 中 | Embeddings+Rerank, 持续优化 | NLP团队 |

### 7.3 投资功能风险

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|----------|
| R7 | **金融数据延迟** | 高 | 中 | 多源冗余, 实时监控 |
| R8 | **回测过拟合** | 中 | 高 | 样本外测试, 交叉验证 |
| R9 | **量化模型失效** | 高 | 高 | 实时监控, 动态调整 |
| R10 | **监管政策变化** | 中 | 高 | 政策跟踪, 合规检查 |

---

## 十、参考资料

### 9.1 官方文档

- [Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code)
- [Anthropic Agent SDK](https://docs.anthropic.com/en/docs/build-agent-loop)
- [LangChain Agent 指南](https://python.langchain.com/docs/concepts/agents/)

### 9.2 金融数据API

- [Tushare Pro 文档](https://tushare.pro/document/2)
- [AKShare 官方文档](https://akshare.akfamily.xyz/)
- [SEC EDGAR API](https://www.sec.gov/developer)
- [Yahoo Finance API](https://finance.yahoo.com/)

### 9.3 量化分析

- [TA-Lib 技术指标](https://ta-lib.org/)
- [Backtrader 回测框架](https://www.backtrader.com/)
- [Pyfolio 组合分析](https://pyfolio.ml4fun.com/)
- [QuantStats 量化统计](https://quantstats.readthedocs.io/)

### 9.4 参考实现

- [Loucode (Claude Code Clone)](https://github.com/clawclaws/loucode)
- [LangChain Agents](https://github.com/langchain-ai/langchain)
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
- [MetaGPT](https://github.com/geekan/MetaGPT)

### 9.5 AI Agent 架构参考

#### Codex 架构模式
```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Codex Agent Harness 架构                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   Codex 采用 Function Calling + Tool Use 模式:                                             │
│                                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│   │   LLM API   │◀───▶│  Function   │◀───▶│    Tool    │◀───▶│   Result    │           │
│   │  (GPT-4)    │     │   Calling   │     │  Registry   │     │   Handler   │           │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘           │
│           │               │                   │                                           │
│           │               ▼                   ▼                                           │
│           │        ┌─────────────┐     ┌─────────────┐                                   │
│           │        │   Schema    │     │   Sandbox   │                                   │
│           │        │  Generator  │     │   Executor  │                                   │
│           │        └─────────────┘     └─────────────┘                                   │
│           │               │                                                           │
│           ▼               ▼                                                           │
│   ┌─────────────────────────────────────────────────────────────────────────────┐       │
│   │                    Code Interpreter (Python/Rust)                              │       │
│   │         • 代码执行隔离 • 资源限制 • 异步执行 • 状态追踪                       │       │
│   └─────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### OpenClaw 架构模式
```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Agent 架构                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   OpenClaw 是一个模块化的 Agent 编排框架:                                                  │
│                                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                               │
│   │   Intent    │────▶│   Planner   │────▶│   Executor  │                               │
│   │   Parser    │     │             │     │             │                               │
│   └─────────────┘     └─────────────┘     └─────────────┘                               │
│           │                   │                   │                                       │
│           ▼                   ▼                   ▼                                       │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                               │
│   │   Memory    │     │   Task      │     │   Tool      │                               │
│   │   Store     │     │   Queue     │     │   Plugins   │                               │
│   └─────────────┘     └─────────────┘     └─────────────┘                               │
│                                                                                         │
│   关键特性:                                                                              │
│   • 多Agent协作 (Supervisor + Workers)                                                   │
│   • 任务分解与并行执行                                                                   │
│   • 可插拔的Tool系统                                                                    │
│   • 长期记忆与短期记忆分离                                                               │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Hermes Agent 架构模式
```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Hermes Agent 架构                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   Hermes 是一个自适应的 AI Agent 框架:                                                   │
│                                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                               │
│   │  感知层     │────▶│   决策层    │────▶│   执行层    │                               │
│   │ Perception  │     │  Decision   │     │   Action    │                               │
│   │             │     │   Engine    │     │   Layer     │                               │
│   │ • 文本输入  │     │             │     │             │                               │
│   │ • 工具结果  │     │ • LLM推理   │     │ • 工具调用  │                               │
│   │ • 环境反馈  │     │ • 状态机   │     │ • 响应生成  │                               │
│   └─────────────┘     └─────────────┘     └─────────────┘                               │
│           │                   │                   │                                       │
│           ▼                   ▼                   ▼                                       │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                               │
│   │   上下文    │     │   学习      │     │   安全      │                               │
│   │   管理      │     │   模块     │     │   模块      │                               │
│   │ Context     │     │ Learning    │     │ Security    │                               │
│   └─────────────┘     └─────────────┘     └─────────────┘                               │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.6 Dexer 与参考架构对比

| 架构特性 | Codex | OpenClaw | Hermes | Dexter | 说明 |
|---------|-------|----------|--------|--------|------|
| **Function Calling** | ✅ | ✅ | ✅ | ✅ | 核心工具调用机制 |
| **Tool Registry** | ✅ | ✅ | ✅ | ✅ | 动态工具注册 |
| **Code Interpreter** | ✅ | ❌ | ❌ | ❌ | 代码执行沙箱 |
| **Multi-Agent** | ❌ | ✅ | ✅ | 部分 | 协作能力 |
| **任务队列** | ❌ | ✅ | ✅ | Cron | 异步任务处理 |
| **记忆系统** | 基础 | 分层 | 自适应 | ✅ | 记忆持久化 |
| **安全沙箱** | ✅ | ✅ | ✅ | 基础 | Bash安全 |
| **投资领域** | ❌ | ❌ | ❌ | ✅ | 金融数据集成 |

---

## 十一、版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 3.6 | 2026-05-07 | 实现 Phase 6 P2 Skill发现工具 (list_skills, search_skills, get_skill) | Dexter Team |
| 3.5 | 2026-05-07 | 实现 Phase 6 P1 Worktree工具 (create/remove/list worktree) | Dexter Team |
| 3.4 | 2026-05-07 | 实现 Phase 8 投资组合管理工具 (add/update/remove position, get portfolio) | Dexter Team |
| 3.3 | 2026-05-07 | 实现 Phase 7 风险指标工具 (VaR, Sharpe, Sortino, MaxDrawdown) + ServiceLocator | Dexter Team |
| 3.2 | 2026-05-07 | 增加 Codex/OpenClaw/Hermes 架构图 + 对比表 | Dexter Team |
| 3.1 | 2026-05-07 | 删除DI，改用轻量级ServiceLocator模式 | Dexter Team |
| 3.0 | 2026-05-07 | 最小改造策略 + 复用现有组件 + 渐进式改造 | Dexter Team |
| 2.0 | 2026-05-07 | 完整重构：增加实测数据、ANSI架构图、实现方案 | Dexter Team |
| 1.0 | 2026-05-07 | 初始版本 | Dexter Team |

---

**Last Updated**: 2026-05-07
**版本**: 3.6
**架构决策**:
- 采用轻量级ServiceLocator替代DI容器
- 参考 Codex/OpenClaw/Hermes 架构设计

**已实现功能**:
- ✅ Phase 6 P0: EditTool, WriteTool, ReadTool, Bash sandbox
- ✅ Phase 6 P1: create_worktree, remove_worktree, list_worktree
- ✅ Phase 6 P2: list_skills, search_skills, get_skill
- ✅ Phase 7: calculate_var, calculate_sharpe, calculate_sortino, calculate_max_drawdown
- ✅ Phase 8: add_position, update_position, remove_position, get_portfolio
