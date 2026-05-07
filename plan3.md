# Dexter AI Agent 核心功能增强规划

**日期**: 2026-05-07
**版本**: 1.0
**重点**: 核心 AI Agent 功能对比与增强

---

## 1. 执行摘要

本文档深入分析 **Dexter** 与 **Loucode** (Claude Code) 在核心 AI Agent 功能上的差距，并制定详细的增强计划。

### 核心发现

| 功能领域 | Loucode (Claude Code) | Dexter | 差距 | 优先级 |
|---------|---------------------|--------|------|--------|
| **Agent 核心循环** | QueryEngine + query() | Agent.run() | 🟢 低 | - |
| **工具系统** | 50+ 工具，动态注册 | 23 工具，静态注册 | 🟡 中 | P1 |
| **上下文管理** | 智能压缩 + 记忆选择 | 3层压缩 | 🟢 低 | - |
| **内存系统** | AI 记忆选择 + MemDir | 向量+关键词搜索 | 🟡 中 | P2 |
| **MCP 集成** | ✅ 完整支持 | ❌ 无 | 🔴 高 | **P0** |
| **Subagent/Fork** | ✅ 完整实现 | ❌ 无 | 🔴 高 | **P0** |
| **后台任务** | Daemon + Workers | 仅 Cron | 🔴 高 | P1 |
| **任务系统** | 多种任务类型 | 基础 Cron | 🟡 中 | P1 |
| **计划模式** | ✅ EnterPlanMode | ❌ 无 | 🔴 高 | P1 |
| **权限系统** | 规则+分类器 | 基础审批 | 🟡 中 | P2 |
| **主动模式** | Proactive 事件 | ❌ 无 | 🟡 中 | P2 |
| **状态管理** | AppState + Provider | 基础变量 | 🟡 中 | P2 |

---

## 2. 架构对比

### 2.1 Loucode 完整 Agent 架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Loucode (Claude Code) Agent 架构                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         QueryEngine (Agent 核心)                            │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    query() AsyncGenerator                            │  │   │
│  │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │  │   │
│  │  │  │   State       │  │  BudgetTracker│  │  RecoveryLoop │      │  │   │
│  │  │  │  跨迭代状态   │  │  Token预算   │  │  错误恢复    │      │  │   │
│  │  │  └───────────────┘  └───────────────┘  └───────────────┘      │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                             │                                                    │
│  ┌──────────────────────────┼────────────────────────────────────────────────┐ │
│  │                    消息系统                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │ │
│  │  │  getSystemContext │ getUserContext │ buildMemoryLines │            │ │
│  │  │  (Git状态等)  │  │ (CLAUDE.md等)│  │  (行为指令) │            │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                             │                                                    │
│  ┌──────────────────────────▼────────────────────────────────────────────────┐ │
│  │                    工具系统 (50+ 工具)                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                         Tool 接口                                    │  │   │
│  │  │  call() │ description() │ isConcurrencySafe │ isReadOnly │       │  │   │
│  │  │  isDestructive │ renderToolResult │ interruptBehavior │          │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │   文件     │ │   Agent   │ │   网络     │ │   MCP     │        │   │
│  │  │   工具     │ │   工具     │ │   工具     │ │   工具     │        │   │
│  │  │ Read/Edit │ │ AgentTool │ │ Search/   │ │ MCPTool   │        │   │
│  │  │ Write     │ │ Fork      │ │ Fetch    │ │           │        │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐                       │   │
│  │  │   计划     │ │   通信     │ │   任务     │                       │   │
│  │  │   工具     │ │   工具     │ │   工具     │                       │   │
│  │  │ EnterPlan  │ │ SendMsg   │ │ LocalTask │                       │   │
│  │  │ ExitPlan   │ │ AskUser   │ │ TaskStop  │                       │   │
│  │  └────────────┘ └────────────┘ └────────────┘                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                 Tool Orchestration (runTools)                     │  │   │
│  │  │         并发安全工具并行执行 │ 非安全工具串行执行                   │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────┬────────────────────────────────────────────────┐ │
│  │         MCP 客户端         │               内存系统                         │ │
│  │  ┌───────────────────┐  │  ┌─────────────────────────────────────┐  │ │
│  │  │ MCPTool 包装器     │  │  │           MemDir 系统                 │  │ │
│  │  │ 动态工具注册       │  │  │  ┌─────────────────────────────┐    │  │ │
│  │  └───────────────────┘  │  │  │ findRelevantMemories()    │    │  │ │
│  │  ┌───────────────────┐  │  │  │ AI 驱动的记忆选择          │    │  │ │
│  │  │ 多种传输方式      │  │  │  └─────────────────────────────┘    │  │ │
│  │  │ - StreamableHTTP │  │  │  ┌─────────────────────────────┐    │  │ │
│  │  │ - SSE            │  │  │  │ MEMORY.md 行为指令          │    │  │ │
│  │  │ - Stdio          │  │  │  │ 用户/反馈/项目/参考分类     │    │  │ │
│  │  │ - WebSocket      │  │  │  └─────────────────────────────┘    │  │ │
│  │  └───────────────────┘  │  └─────────────────────────────────────┘  │ │
│  └───────────────────────────┴────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Subagent / Fork 系统                               │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      AgentTool                                       │  │   │
│  │  │  description │ prompt │ subagent_type │ model │ run_in_background │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      ForkSubagent                                    │  │   │
│  │  │  隐式 Fork │ 继承父上下文 │ 共享缓存 │ permissionMode=bubble │    │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      LocalAgentTask                                │  │   │
│  │  │  后台执行 │ 生命周期跟踪 │ pendingMessages │ retain │           │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Daemon 架构 (后台常驻)                            │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    DaemonSupervisor                                  │  │   │
│  │  │   Worker 池管理 │ IPC 路由 │ 事件总线 │ 健康监控                  │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │            │              │              │              │                │   │
│  │            ▼              ▼              ▼              ▼                │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │  │  Assistant  │ │   Tasks     │ │   Monitor   │ │  Evolution  │    │   │
│  │  │   Worker    │ │   Worker    │ │   Worker    │ │   Worker    │    │   │
│  │  │ (KAIROS)   │ │ (定时任务)  │ │  (PR监控)  │ │  (自我改进) │    │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  │  ┌─────────────┐                                                   │   │
│  │  │   Bridge    │                                                   │   │
│  │  │   Worker    │                                                   │   │
│  │  │ (外部桥接)  │                                                   │   │
│  │  └─────────────┘                                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Proactive 主动模式                               │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    EventBus (发布/订阅)                            │  │   │
│  │  │  'task:fired' │ 'pr:activity' │ 'assistant:dream' │ ...         │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │  activateProactive() │ isProactiveActive() │ ProactiveTick     │  │   │
│  │  │  后台自主处理 │ 事件驱动                                          │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         上下文智能管理                                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │ AutoCompact  │  │ Reactive    │  │ Compact     │                   │   │
│  │  │ (13000 tokens)│  │ Compact     │  │ Boundary   │                   │   │
│  │  │              │  │ (特征标志)  │  │ (摘要保留) │                   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Dexter 当前 Agent 架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Dexter Agent 架构                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Agent 类 (Agent 核心)                              │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    run() AsyncGenerator                            │  │   │
│  │  │  while (iteration < maxIterations) {                            │  │   │
│  │  │    1. microcompact()      - 轻量级上下文压缩                    │  │   │
│  │  │    2. stripOldThinking()   - 移除旧思考                        │  │   │
│  │  │    3. callModelStreaming() - 流式LLM调用                       │  │   │
│  │  │    4. executeTools()      - 工具执行                           │  │   │
│  │  │    5. manageContext()     - 上下文管理                         │  │   │
│  │  │  }                                                        │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                             │                                                    │
│  ┌──────────────────────────┼────────────────────────────────────────────────┐ │
│  │                    消息系统                                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │ │
│  │  │ buildSystemPrompt │ loadSoulDoc │ loadRulesDoc │               │ │
│  │  │ (系统提示)    │  │ (灵魂文档)  │  │ (规则)     │               │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                             │                                                    │
│  ┌──────────────────────────▼────────────────────────────────────────────────┐ │
│  │                    工具系统 (23 工具)                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    DynamicStructuredTool                            │  │   │
│  │  │  静态注册 │ Zod Schema │ 基础并发安全检查                         │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │   美股     │ │   A股      │ │   网络     │ │  文件系统 │        │   │
│  │  │   金融     │ │   金融     │ │   工具     │ │   工具     │        │   │
│  │  │   (8个)   │ │   (7个)   │ │   (4个)   │ │   (3个)   │        │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │   │
│  │  ┌────────────┐ ┌────────────┐                                      │   │
│  │  │   内存     │ │   其他     │                                      │   │
│  │  │   工具     │ │   工具     │                                      │   │
│  │  │   (3个)   │ │   (4个)   │                                      │   │
│  │  └────────────┘ └────────────┘                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                 AgentToolExecutor                                  │  │   │
│  │  │         并发执行只读工具 │ 破坏性工具需审批                         │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────┬────────────────────────────────────────────────┐ │
│  │         LLM 提供商         │               内存系统                         │ │
│  │  ┌───────────────────┐  │  ┌─────────────────────────────────────┐  │ │
│  │  │ 8 个提供商支持     │  │  │         MemoryManager                │  │ │
│  │  │ OpenAI, Anthropic │  │  │  ┌─────────────────────────────┐    │  │ │
│  │  │ Google, xAI       │  │  │  │ 混合搜索 (向量 + 关键词)   │    │  │ │
│  │  │ Moonshot, DeepSeek│  │  │  └─────────────────────────────┘    │  │ │
│  │  │ OpenRouter, Ollama│  │  │  ┌─────────────────────────────┐    │  │ │
│  │  └───────────────────┘  │  │  │ Temporal Decay (时间衰减)   │    │  │ │
│  │  ┌───────────────────┐  │  │  │ MMR 多样性重排序           │    │  │ │
│  │  │ LangChain 适配器  │  │  │  └─────────────────────────────┘    │  │ │
│  │  │ + Prompt 缓存     │  │  │  ┌─────────────────────────────┐    │  │ │
│  │  └───────────────────┘  │  │  │ Memory Flush (压缩前提取)   │    │  │ │
│  │                          │  │  └─────────────────────────────┘    │  │ │
│  │                          │  │  ┌─────────────────────────────┐    │  │ │
│  │                          │  │  │ SQLite (FTS5 + 向量)       │    │  │ │
│  │                          │  │  └─────────────────────────────┘    │  │ │
│  └───────────────────────────┴────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      三层上下文压缩系统                                    │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      Tier 1: Microcompact                        │  │   │
│  │  │   每次迭代前 │ 轻量级 │ 仅清理ToolMessage │ 保留最近4个          │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      Tier 2: Full Compact                        │  │   │
│  │  │   LLM总结 │ 9段结构化摘要 │ 替换整个消息数组                       │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    Tier 3: Truncation (截断)                     │  │   │
│  │  │   最后手段 │ 保留最近3轮对话                                       │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Scratchpad (工作日志)                              │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │   │
│  │  │  appendFileSync JSONL │ 不可变日志 │ 工具调用计数 │ 循环检测         │  │   │
│  │  └─────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Cron 定时任务 (唯一后台)                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │   │
│  │  │   Runner     │  │   Store     │  │  Executor   │                   │   │
│  │  │  (定时唤醒) │  │  (JSON)    │  │ (Agent执行)│                   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         ❌ 缺失的核心功能                                 │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │   │
│  │  │   MCP     │ │  Subagent  │ │   Daemon   │ │   Plan    │        │   │
│  │  │   客户端   │ │   Fork    │ │  Workers   │ │   Mode    │        │   │
│  │  │   (无)   │ │   (无)   │ │   (无)   │ │   (无)   │        │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │   │
│  │  ┌────────────┐ ┌────────────┐                                      │   │
│  │  │ Proactive │ │   Task    │                                      │   │
│  │  │   Mode    │ │   Types  │                                      │   │
│  │  │   (无)   │ │  (仅Cron)│                                      │   │
│  │  └────────────┘ └────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 详细差距分析

### 3.1 功能对比矩阵

| 功能 | Loucode | Dexter | 差距 | 优先级 |
|------|---------|--------|------|--------|
| **Agent 循环** | QueryEngine + query() | Agent.run() | 🟢 同级 | - |
| **上下文压缩** | AutoCompact (13K) + Reactive | 3层压缩 | 🟢 Dexter更优 | - |
| **工具数量** | 50+ | 23 | 🟡 中 | P1 |
| **工具接口** | 丰富的 Tool 接口 | 基础 DynamicStructuredTool | 🟡 中 | P1 |
| **工具执行** | runTools() 并发分区 | AgentToolExecutor | 🟢 同级 | - |
| **MCP 集成** | ✅ 4种传输 | ✅ 已实现 | 🟢 完成 | **✅ P0** |
| **Subagent** | ✅ AgentTool + Fork | ❌ 无 | 🔴 高 | **P0** |
| **后台任务** | Daemon + 5 Workers | 仅 Cron | 🔴 高 | P1 |
| **任务类型** | 7种任务类型 | 仅 Cron | 🟡 中 | P1 |
| **计划模式** | EnterPlanMode + ExitPlanMode | ❌ 无 | 🔴 高 | P1 |
| **内存系统** | AI 记忆选择 | 向量+关键词搜索 | 🟡 Dexter偏弱 | P2 |
| **权限系统** | 规则+分类器 | 基础审批 | 🟡 中 | P2 |
| **主动模式** | Proactive + EventBus | ❌ 无 | 🟡 中 | P2 |
| **状态管理** | AppState + Provider | 基础变量 | 🟡 中 | P2 |

---

## 3. 实现状态追踪

### ✅ Phase 0: 已完成

| 功能 | 状态 | 文件 | 日期 |
|------|------|------|------|
| **MCP 集成** | ✅ 已实现 | `src/mcp/client.ts`, `src/mcp/registry.ts`, `src/mcp/index.ts` | 2026-05-07 |
| MCP SDK 集成 | ✅ 使用官方 `@modelcontextprotocol/sdk` | `package.json` | 2026-05-07 |
| Stdio 传输 | ✅ 已实现 | `src/mcp/client.ts` | 2026-05-07 |
| SSE 传输 | ✅ 已实现 | `src/mcp/client.ts` | 2026-05-07 |
| 工具注册集成 | ✅ 已实现 | `src/tools/registry.ts` | 2026-05-07 |
| 配置文件 | ✅ 已创建 | `.dexter/mcp-config.json` | 2026-05-07 |

### ✅ Phase 1: Subagent 系统 (已完成)

| 功能 | 状态 | 文件 | 日期 |
|------|------|------|------|
| **Subagent 类型定义** | ✅ 已实现 | `src/agent/subagent.ts` | 2026-05-07 |
| SubagentRunner | ✅ 已实现 | `src/agent/subagent-runner.ts` | 2026-05-07 |
| AgentTool | ✅ 已实现 | `src/tools/agent-tool.ts` | 2026-05-07 |
| 工具注册集成 | ✅ 已实现 | `src/tools/registry.ts` | 2026-05-07 |

### 📋 Phase 1: 进行中

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 后台任务系统 | 🔄 待实现 | P1 |
| 计划模式 | 🔄 待实现 | P1 |

### 📋 Phase 2-4: 待实现

| 功能 | 状态 | 优先级 |
|------|------|--------|
| Daemon + Workers | 🔄 待实现 | P1 |
| AI 记忆选择 | 🔄 待实现 | P2 |
| 权限系统增强 | 🔄 待实现 | P2 |
| Proactive 模式 | 🔄 待实现 | P2 |

---

## 4. MCP 实现详情

### 4.1 已实现功能

```
src/mcp/
├── client.ts       # MCP 客户端核心
│   ├── MCPClientManager 类
│   ├── StdioClientTransport 支持
│   ├── SSEClientTransport 支持
│   ├── 自动工具发现
│   └── LangChain 工具转换
├── registry.ts     # 工具注册集成
│   ├── mcpToolsToRegisteredTools()
│   ├── getMCPToolDescriptions()
│   └── getMCPStatus()
└── index.ts        # 模块导出
```

### 4.2 使用方式

1. **安装依赖** (网络恢复后):
```bash
bun add @modelcontextprotocol/sdk
```

2. **配置 MCP 服务器** (`.dexter/mcp-config.json`):
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

3. **自动集成**: 工具会自动注册到工具注册表

---

## 5. 关键差距详解

### 5.1 MCP 集成 (✅ 已完成)

**现状**: Dexter 已支持 MCP

**已实现**:
- 使用官方 `@modelcontextprotocol/sdk`
- Stdio 传输支持
- SSE 传输支持
- 动态工具发现
- LangChain DynamicStructuredTool 转换
- 工具注册表集成

**Loucode 实现**:
```typescript
// /src/services/mcp/client.ts
const transports = [
  StreamableHTTPClientTransport,  // 主要
  SSEClientTransport,              // Server-Sent Events
  StdioClientTransport,           // 本地 stdio
  WebSocketTransport              // WebSocket
];

export class MCPTool implements Tool {
  // 动态包装 MCP 工具
  // 自动发现服务器上的工具
  // 支持 OAuth 认证
  // 会话管理和重连
}
```

**需要实现**:
```
src/mcp/
├── client.ts           # MCP 客户端核心
├── types.ts           # 类型定义
├── config.ts          # 配置管理
└── transport/
    ├── base.ts        # 传输基类
    ├── stdio.ts      # Stdio 传输
    ├── http.ts       # HTTP 传输
    ├── sse.ts        # SSE 传输
    └── websocket.ts   # WebSocket 传输
```

#### Gap 2: Subagent 系统 (✅ 已完成)

**现状**: Dexter 已支持 Subagent

**已实现**:
- Subagent 类型定义 (`src/agent/subagent.ts`)
- SubagentRunner 类 (`src/agent/subagent-runner.ts`)
- AgentTool (`src/tools/agent-tool.ts`)
- 工具注册集成 (`src/tools/registry.ts`)

**实现详情**:
```typescript
// src/agent/subagent.ts - 类型定义
export type SubagentType = 'general' | 'specialized' | 'fork';
export type PermissionMode = 'default' | 'bubble' | 'plan';
export type IsolationMode = 'none' | 'worktree';

export interface SubagentConfig {
  type: SubagentType;
  tools: string[] | '*';
  maxTurns?: number;
  model?: string | 'inherit';
  permissionMode?: PermissionMode;
  isolation?: IsolationMode;
  cwd?: string;
  runInBackground?: boolean;
}

// src/agent/subagent-runner.ts - 执行器
export class SubagentRunner {
  async run(config, prompt, context): Promise<SubagentResult>;
  async runAsync(config, prompt, context): Promise<string>;
  getTaskStatus(taskId): SubagentTaskStatus;
  cancelTask(taskId): Promise<void>;
}

// src/tools/agent-tool.ts - 工具接口
export const AgentToolInputSchema = z.object({
  description: z.string(),
  prompt: z.string(),
  subagent_type: z.enum(['general', 'specialized', 'fork']).optional(),
  model: z.string().optional(),
  run_in_background: z.boolean().optional(),
  max_turns: z.number().optional(),
  tools: z.array(z.string()).optional(),
});
```

#### Gap 3: 后台任务系统 (P1)

**现状**: Dexter 只有 Cron，没有 Daemon

**Loucode Daemon 架构**:
```typescript
// /src/daemon/worker.ts
interface Worker {
  kind: string;
  name: string;
  execute(task: Task): Promise<void>;
  healthCheck(): Promise<boolean>;
}

// Workers 类型
const workers = [
  { kind: 'assistant', name: 'KAIROS Assistant' },
  { kind: 'tasks', name: 'Cron Tasks' },
  { kind: 'monitor', name: 'PR Monitor' },
  { kind: 'evolution', name: 'Evolution' },
  { kind: 'bridge', name: 'CC Bridge' }
];
```

**需要实现**:
```
src/daemon/
├── supervisor.ts      # 主控制器
├── worker.ts          # Worker 基类
├── workers/
│   ├── tasks.ts       # 任务执行
│   ├── monitor.ts     # 监控 (PR 等)
│   └── scheduler.ts   # 调度器
├── ipc/
│   └── router.ts      # IPC 路由
└── store.ts           # 状态持久化
```

#### Gap 4: 计划模式 (P1)

**现状**: Dexter 无计划模式

**Loucode 实现**:
```typescript
// /src/tools/plan/
EnterPlanModeTool  // 进入计划模式
ExitPlanModeV2Tool // 退出计划模式
```

**需要实现**:
```typescript
// src/tools/plan/
├── enter-plan-mode.ts   // 进入计划模式
└── exit-plan-mode.ts   // 退出计划模式

// src/plan/
├── plan-context.ts      // 计划上下文
├── plan-storage.ts      // 计划持久化
└── plan-generator.ts    // 计划生成器
```

#### Gap 5: 内存系统增强 (P2)

**现状**: Dexter 有向量搜索，但缺少 AI 驱动的记忆选择

**Loucode 实现**:
```typescript
// /src/memdir/findRelevantMemories.ts
export async function findRelevantMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
): Promise<RelevantMemory[]>
```

**需要增强**:
```typescript
// src/memory/
├── ai-selector.ts      # AI 驱动的记忆选择
├── memdir.ts           # MemDir 风格的行为指令
└── types.ts            # 记忆类型分类
```

#### Gap 6: 权限系统 (P2)

**现状**: Dexter 只有基础审批提示

**Loucode 实现**:
```typescript
// 权限检查流程
1. 检查规则 (rules.ts)
2. Bash 命令分类器 (classifier.ts)
3. Coordinator 委托
4. 用户交互提示

// 自动批准模式
const patterns = [
  /git (add|commit|push)/,
  /npm (install|test|run)/,
  // ...
];
```

**需要实现**:
```typescript
// src/permissions/
├── rules.ts            # 规则配置
├── classifier.ts        # Bash 命令分类器
├── auto-approve.ts     # 自动批准模式
└── delegation.ts       # 委托机制
```

---

## 4. 实施计划

### 4.1 优先级矩阵

```
           对 Dexter 价值
                ▲
                │
           高   │  MCP集成      Subagent系统
                │   P0           P0
                │
           中   │  后台任务      计划模式
                │   P1           P1
                │
           低   │  内存增强      权限系统
                │   P2           P2
                │
                └────────────────────────►
                      低    中    高
                         工作量
```

### 4.2 分阶段实施

#### Phase 0: 核心基础设施 (第1-2周)

**目标**: 为 P0 功能建立基础设施

| 任务 | 工作量 | 文件 | 依赖 |
|------|--------|------|------|
| MCP 类型定义 | 2h | `src/mcp/types.ts` | - |
| 传输基类 | 4h | `src/mcp/transport/base.ts` | - |
| Stdio 传输 | 4h | `src/mcp/transport/stdio.ts` | 传输基类 |
| HTTP 传输 | 4h | `src/mcp/transport/http.ts` | 传输基类 |
| MCP 客户端核心 | 8h | `src/mcp/client.ts` | 传输实现 |
| 工具注册集成 | 4h | `src/mcp/registry.ts` | MCP 客户端 |
| Subagent 接口 | 2h | `src/agent/subagent.ts` | - |
| Fork 实现框架 | 4h | `src/agent/fork.ts` | Subagent |

#### Phase 1: MCP + Subagent (第3-5周)

**目标**: 完成 P0 功能

| 任务 | 工作量 | 文件 | 依赖 |
|------|--------|------|------|
| SSE/WebSocket 传输 | 4h | `src/mcp/transport/sse.ts` | 传输基类 |
| MCP 配置管理 | 2h | `src/mcp/config.ts` | MCP 客户端 |
| Supabase MCP 支持 | 4h | `src/mcp/servers/supabase.ts` | MCP 客户端 |
| AgentTool 实现 | 8h | `src/tools/agent-tool.ts` | Subagent |
| 通用 Subagent | 4h | `src/agent/general-subagent.ts` | AgentTool |
| Fork Subagent 完整 | 8h | `src/agent/fork.ts` | AgentTool |
| 专业 Subagent | 4h | `src/agent/specialized.ts` | AgentTool |
| 上下文继承 | 4h | `src/agent/context.ts` | Fork |

#### Phase 2: 后台任务系统 (第6-8周)

**目标**: 实现 Daemon 架构

| 任务 | 工作量 | 文件 | 依赖 |
|------|--------|------|------|
| Supervisor 核心 | 8h | `src/daemon/supervisor.ts` | - |
| Worker 基类 | 4h | `src/daemon/worker.ts` | - |
| Tasks Worker | 6h | `src/daemon/workers/tasks.ts` | Worker |
| Scheduler Worker | 4h | `src/daemon/workers/scheduler.ts` | Worker |
| Monitor Worker | 6h | `src/daemon/workers/monitor.ts` | Worker |
| IPC 路由 | 6h | `src/daemon/ipc/router.ts` | Supervisor |
| 状态持久化 | 4h | `src/daemon/store.ts` | Supervisor |

#### Phase 3: 计划模式 (第9-10周)

**目标**: 实现计划工具

| 任务 | 工作量 | 文件 | 依赖 |
|------|--------|------|------|
| EnterPlanMode 工具 | 6h | `src/tools/plan/enter-plan-mode.ts` | - |
| ExitPlanMode 工具 | 4h | `src/tools/plan/exit-plan-mode.ts` | EnterPlanMode |
| 计划上下文 | 4h | `src/plan/plan-context.ts` | - |
| 计划存储 | 4h | `src/plan/plan-storage.ts` | 计划上下文 |
| 计划生成器 | 8h | `src/plan/plan-generator.ts` | 计划上下文 |

#### Phase 4: 增强功能 (第11-12周)

**目标**: 完善其他功能

| 任务 | 工作量 | 文件 | 依赖 |
|------|--------|------|------|
| AI 记忆选择 | 6h | `src/memory/ai-selector.ts` | MemoryManager |
| MemDir 风格指令 | 4h | `src/memory/memdir.ts` | MemoryManager |
| 权限规则 | 4h | `src/permissions/rules.ts` | - |
| Bash 分类器 | 6h | `src/permissions/classifier.ts` | 权限规则 |
| 自动批准模式 | 4h | `src/permissions/auto-approve.ts` | 分类器 |

### 4.3 时间路线图

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           实施时间线 (12周)                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│ Phase 0: 核心基础设施 (第1-2周)                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ MCP类型 │ 传输基类 │ Stdio │ HTTP │ 客户端核心 │ 工具注册 │ Subagent接口 │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 1: MCP + Subagent (第3-5周)                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ SSE/WebSocket │ MCP配置 │ Supabase │ AgentTool │ 通用Subagent │ Fork │  │  │
│ │               │         │ 支持     │           │              │ 完整  │  │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 2: 后台任务系统 (第6-8周)                                               │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ Supervisor │ Worker基类 │ Tasks │ Scheduler │ Monitor │ IPC │ Store    │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 3: 计划模式 (第9-10周)                                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ EnterPlanMode │ ExitPlanMode │ 计划上下文 │ 计划存储 │ 计划生成器       │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│ Phase 4: 增强功能 (第11-12周)                                                  │
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ AI记忆选择 │ MemDir │ 权限规则 │ Bash分类器 │ 自动批准                   │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 详细规格

### 5.1 MCP 客户端规格

```typescript
// src/mcp/types.ts
export type MCPConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'failed'
  | 'pending'
  | 'disabled';

export interface MCPServer {
  name: string;
  command?: string[];
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse' | 'websocket';
  auth?: {
    type: 'oauth' | 'api-key';
    credentials?: Record<string, string>;
  };
}

export interface MCPClientConfig {
  servers: MCPServer[];
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

// src/mcp/client.ts
export class MCPClient {
  private connections: Map<string, MCPServerConnection>;
  private tools: Map<string, StructuredTool>;

  async connect(server: MCPServer): Promise<void>;
  async disconnect(serverName: string): Promise<void>;
  async discoverTools(serverName: string): Promise<StructuredTool[]>;
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  getServerState(serverName: string): MCPConnectionState;
  getAllTools(): StructuredTool[];
}
```

### 5.2 Subagent 规格

```typescript
// src/tools/agent-tool.ts
export interface AgentToolInput {
  description: string;
  prompt: string;
  agentType?: 'general' | 'specialized' | 'fork';
  model?: string;
  runInBackground?: boolean;
  maxTurns?: number;
  tools?: string[];
}

export const AgentToolSchema = z.object({
  description: z.string().describe('任务简短描述 (3-5字)'),
  prompt: z.string().describe('Agent 的任务指令'),
  agentType: z.enum(['general', 'specialized', 'fork']).optional(),
  model: z.string().optional(),
  runInBackground: z.boolean().optional(),
  maxTurns: z.number().optional(),
  tools: z.array(z.string()).optional(),
});

// src/agent/subagent.ts
export interface SubagentConfig {
  name: string;
  type: 'general' | 'specialized' | 'fork';
  tools: string[] | '*';
  maxTurns: number;
  model: string | 'inherit';
  systemPrompt?: string;
  parentContext?: boolean;
  sharedCache?: boolean;
}

export class SubagentRunner {
  async run(
    config: SubagentConfig,
    prompt: string,
    parentContext: AgentContext,
  ): Promise<SubagentResult>;
}
```

### 5.3 Daemon 规格

```typescript
// src/daemon/types.ts
export interface Worker {
  kind: string;
  name: string;
  description: string;

  initialize(): Promise<void>;
  execute(task: Task): Promise<TaskResult>;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}

export interface Task {
  id: string;
  type: string;
  payload: unknown;
  scheduledAt?: Date;
  priority?: number;
}

export interface TaskResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

// src/daemon/workers/tasks.ts
export class TasksWorker implements Worker {
  kind = 'tasks';
  name = 'Tasks';
  description = 'Executes scheduled and background tasks';

  async execute(task: Task): Promise<TaskResult>;
}

// src/daemon/workers/monitor.ts
export class MonitorWorker implements Worker {
  kind = 'monitor';
  name = 'Monitor';
  description = 'Monitors PRs, notifications, and events';

  async execute(task: Task): Promise<TaskResult>;
}
```

### 5.4 计划模式规格

```typescript
// src/tools/plan/enter-plan-mode.ts
export interface PlanModeInput {
  goal: string;
  constraints?: string[];
  outputFormat?: 'markdown' | 'structured' | 'checklist';
}

export const EnterPlanModeSchema = z.object({
  goal: z.string().describe('要完成的目标'),
  constraints: z.array(z.string()).optional().describe('约束条件'),
  outputFormat: z.enum(['markdown', 'structured', 'checklist']).optional(),
});

// src/plan/plan-context.ts
export interface PlanContext {
  id: string;
  goal: string;
  constraints: string[];
  steps: PlanStep[];
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'cancelled';
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dependencies: string[];
  result?: string;
}
```

---

## 6. 快速开始

### Week 1: MCP 最小可用

**目标**: 实现最基础的 MCP 支持

```bash
# 1. 创建目录结构
mkdir -p src/mcp/transport

# 2. 创建类型定义
# src/mcp/types.ts

# 3. 创建传输基类
# src/mcp/transport/base.ts

# 4. 实现 Stdio 传输
# src/mcp/transport/stdio.ts

# 5. 创建 MCP 客户端
# src/mcp/client.ts
```

**最小 MCP 配置示例**:
```yaml
# .dexter/mcp.yaml
servers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
    transport: stdio
  - name: supabase
    url: http://localhost:54321/mcp
    transport: http
```

---

## 7. 成功指标

| 指标 | 当前 | Phase 1后 | Phase 2后 | 最终目标 |
|------|------|-----------|-----------|---------|
| 工具数量 | 23 | 30+ | 40+ | 50+ |
| MCP 服务器 | 0 | 2 | 5 | 10+ |
| Subagent 类型 | 0 | 2 | 3 | 5 |
| 后台 Worker | 0 | 2 | 3 | 5 |
| 计划模式 | ❌ | ✅ | ✅ | ✅ |
| 权限规则 | 基础 | 增强 | 完整 | 完整 |

---

## 8. 附录

### A. Loucode 参考文件

| 功能 | 文件路径 |
|------|---------|
| Agent 循环 | `/src/query.ts` |
| QueryEngine | `/src/QueryEngine.ts` |
| 工具定义 | `/src/Tool.ts` |
| 工具注册 | `/src/tools.ts` |
| 工具执行 | `/src/services/tools/toolOrchestration.ts` |
| MCP 客户端 | `/src/services/mcp/client.ts` |
| Agent 工具 | `/src/tools/AgentTool/AgentTool.tsx` |
| Fork Subagent | `/src/tools/AgentTool/forkSubagent.ts` |
| LocalAgentTask | `/src/tasks/LocalAgentTask/LocalAgentTask.tsx` |
| 内存系统 | `/src/memdir/` |
| AI 记忆选择 | `/src/memdir/findRelevantMemories.ts` |
| Daemon | `/src/daemon/` |
| Supervisor | `/src/daemon/supervisor.ts` |
| Workers | `/src/daemon/workers/` |
| Proactive | `/src/proactive/` |
| EventBus | `/src/daemon/evolution/eventBus.ts` |
| 计划工具 | `/src/tools/plan/EnterPlanModeTool.ts` |
| 权限 | `/src/hooks/useCanUseTool.tsx` |
| 状态管理 | `/src/state/AppStateStore.tsx` |

### B. Dexter 当前文件

| 功能 | 文件路径 |
|------|---------|
| Agent 核心 | `src/agent/agent.ts` |
| 工具注册 | `src/tools/registry.ts` |
| 工具执行 | `src/agent/tool-executor.ts` |
| 内存系统 | `src/memory/` |
| 压缩 | `src/agent/compact.ts` |
| 微压缩 | `src/agent/microcompact.ts` |
| Scratchpad | `src/agent/scratchpad.ts` |
| Cron | `src/cron/` |
| CLI | `src/cli.ts` |
| Skills | `src/skills/` |

---

## 9. 总结

### 核心差距

1. **MCP 集成** (P0): 无法连接外部工具/服务
2. **Subagent 系统** (P0): 无法并行化复杂任务
3. **后台任务** (P1): 无 Daemon/Worker 架构
4. **计划模式** (P1): 无结构化计划能力
5. **内存增强** (P2): 缺少 AI 驱动的记忆选择
6. **权限系统** (P2): 缺少规则和分类器

### 建议优先级

1. **Phase 0-1** (Week 1-5): MCP + Subagent - 最高价值
2. **Phase 2** (Week 6-8): 后台任务系统 - 提升用户体验
3. **Phase 3** (Week 9-10): 计划模式 - 核心差异化功能
4. **Phase 4** (Week 11-12): 增强功能 - 完善体验

---

*文档结束*
