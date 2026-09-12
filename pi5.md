# UpUp 基于 Pi 的核心 Agent 彻底改造计划

> 文档版本：v1.0
> 编制日期：2026-09-13
> 目标仓库：`/Users/louloulin/appx/upup`
> Pi 源码：`/Users/louloulin/appx/pi`
> 官方文档：<https://pi.dev/docs/latest>
> 核心目标：以 Pi Runtime 作为 UpUp 唯一生产 Agent 核心，UpUp 后续主要维护金融数据、投资分析、风险控制和投研工作流。

## 0. 执行摘要

本计划不是在现有 UpUp Agent 外面再包一层 Pi，也不是长期保留两个等价的 Agent Runtime。最终状态是：

```text
UpUp CLI / SDK / Gateway / Daemon / Cron / Bridge
                         │
                         ▼
              UpUp Pi Runtime Adapter
                         │
                         ▼
       @earendil-works/pi-coding-agent
       @earendil-works/pi-agent-core
       @earendil-works/pi-ai
       @earendil-works/pi-protocol / pi-client / pi-server
                         │
                         ▼
     UpUp Financial Extensions / Skills / Packages
```

Pi 负责通用 Agent 基础设施：模型调用、消息、工具循环、流式事件、取消、Session、分支、Fork、Compaction、Extension 生命周期、SDK、RPC 和 TUI。UpUp 负责领域能力：A 股/港股/基金/美股数据、金融工具、投资知识、估值、组合、回测、风险、投研报告、中文 i18n、数据审计以及 Gateway/Daemon/长周期任务。

改造完成的判定不是“Pi 能启动”，而是以下生产不变量同时成立：

1. 所有生产入口都通过 Pi `AgentSession`/`AgentSessionRuntime` 执行 Agent。
2. 生产代码不再依赖 UpUp 自研 `src/agent/agent.ts` 主循环。
3. 生产核心不再用 LangChain `BaseMessage`、`AIMessage`、`ToolMessage` 和 `StructuredToolInterface` 作为 Agent Runtime 协议。
4. 所有金融工具都通过统一的 UpUp→Pi Tool Adapter，并保留安全级别、并发策略、审计、权限和结果预算。
5. 所有自定义 Agent 定义统一为 `UpUpAgentSpec`，由 Pi Session Factory 创建，不再维护 `AgentDefinition`、`CustomAgent`、`SubagentConfig`、`AgentInstance` 多套核心执行模型。
6. 旧 Session 可读、可迁移、可审计；迁移失败不能覆盖原始文件。
7. 多 Agent、Plan、Permission、MCP、Daemon、Cron 等没有被错误地当作 Pi 已内置能力，而是以 UpUp 领域扩展和平台服务实现。
8. `/invest`、研究报告、风险控制、组合分析和现有金融工具的行为测试全部通过。

## 1. 盘点范围与事实基线

### 1.1 Pi 仓库结构

本计划基于 `/Users/louloulin/appx/pi` 的当前源码、包清单、文档、测试和 Extension 示例，而不是只依据宣传页面。Pi 当前核心 workspace 包如下：

| 包 | 当前本地版本 | 责任 | 在 UpUp 中的目标角色 |
|---|---:|---|---|
| `@earendil-works/pi-ai` | `0.84.3` | Provider、Model、流式 AI 协议、usage、认证相关能力 | 替换 `src/model/llm.ts` 的通用模型层 |
| `@earendil-works/pi-agent-core` | `0.84.3` | Agent loop、Tool Call、AgentMessage、事件和状态 | 替换 `src/agent/agent.ts` 的主循环 |
| `@earendil-works/pi-coding-agent` | `0.84.3` | `AgentSession`、Extension、Session Manager、Compaction、SDK、资源加载、TUI/CLI | UpUp 的主 Runtime 和 Extension Host |
| `@earendil-works/pi-protocol` | `0.84.3` | JSON/RPC/CBOR 协议和 schema | 统一 stdio、Gateway、远程控制协议的可选底层 |
| `@earendil-works/pi-client` | `0.84.3` | Pi RPC Client、Session Handle、transport | Bridge、外部客户端、Daemon 客户端 |
| `@earendil-works/pi-server` | `0.84.3` | Pi Server、listener、RPC 服务 | 远程 Agent 服务的标准 transport |
| `@earendil-works/pi-telemetry` | `0.84.3` | vendor-neutral typed telemetry schema | 接入 UpUp audit/telemetry |
| `@earendil-works/pi-tui` | `0.84.3` | 差分渲染 TUI、Editor、Markdown、组件 | 升级并统一当前 UpUp TUI |

本地 Pi 的源码规模约为：

- `packages/agent`：50 个源码文件，约 12.6k 行；
- `packages/ai`：177 个源码文件，约 23.6k 行；
- `packages/coding-agent`：206 个源码文件，约 60.8k 行；
- `packages/tui`：40 个源码文件，约 17.0k 行；
- Pi workspace 测试文件约 472 个；
- Pi coding-agent Extension 示例约 107 个文件。

### 1.2 Pi 的真正能力边界

官方文档和源码确认 Pi 的扩展点包括：

- `ExtensionAPI.on()`：资源、Session、Agent、Turn、Message、Provider、Tool、Compaction、输入和关闭事件；
- `registerTool()`：注册带 TypeBox schema、进度回调、AbortSignal、结果详情和自定义渲染的 LLM 工具；
- `registerCommand()`、`registerShortcut()`、`registerFlag()`：命令和 CLI 扩展；
- `registerProvider()`：自定义 Provider；
- `sendMessage()`、`sendUserMessage()`：向当前 Session 注入消息；
- `appendEntry()`：保存不进入 LLM context 的扩展状态；
- `setActiveTools()`：运行时工具白名单；
- `ctx.ui.select/confirm/input/notify/custom()`：交互式 UI；
- `ctx.modelRegistry`、`ctx.sessionManager`、`ctx.signal`、`ctx.compact()`：模型、Session、取消和压缩；
- `AgentSession.prompt()`、`steer()`、`followUp()`、`abort()`、`waitForIdle()`、`compact()`、`navigateTree()`、`exportToJsonl()`；
- `createAgentSession()` 和 `AgentSessionRuntime`：程序化 SDK；
- `--mode rpc`、JSON event mode、SDK：非 TUI 集成；
- Skill、Prompt Template、Theme、Extension、Pi Package：可分发生态。

Pi 明确不内置以下能力：

- 完整金融权限系统；
- UpUp 式领域多 Agent 编排；
- 投资 Plan Mode；
- 投资工作流状态机；
- 金融审计和数据一致性验证；
- UpUp 的 A 股/港股/基金数据；
- UpUp 的 Gateway、Cron、Daemon、实时行情；
- 默认 MCP 产品层。

因此本计划会“彻底替换核心 Agent”，但不会删除金融领域和平台层。

### 1.3 UpUp 当前事实基线

UpUp 当前 `src/` 约 1055 个 TypeScript/TSX 文件、约 237.9k 行，`packages/` 约 281 个 TypeScript/TSX 文件、约 35.6k 行，测试文件约 284 个。关键边界如下：

| 当前区域 | 事实 | 改造结论 |
|---|---|---|
| `src/agent/agent.ts` | 约 1305 行，主循环同时处理 LLM、工具、队列、压缩、Memory、Plan、Fallback、Telemetry | 删除生产主循环，改为 Pi Session 驱动 |
| `src/model/llm.ts` | 约 420 行，依赖 LangChain ChatModel 和 Message | 迁移到 Pi AI Model Adapter |
| `src/agent/subagent.ts` | 定义 Subagent、隔离、权限、任务和并行 worker | 只保留业务协议，执行改由 Pi Session Factory |
| `src/agent/subagent-runner.ts` | 自研子 Agent 状态和事件执行器 | 删除核心执行路径，转为 Pi Session orchestration |
| `src/agent/registry.ts` | 通用角色注册 | 合并为 `UpUpAgentSpec` Registry |
| `src/agent/investment-subagents.ts` | 5 个投研子 Agent 和工具集合 | 转为投资 Agent Profile/Extension 配置 |
| `src/multi-agent/agent-registry.ts` | Custom Agent、模板、Prompt 变量、导入导出 | 迁移为 Agent Manifest/Profile |
| `src/multi-agent/coordinator.ts` | Team、Backend、消息、生命周期、结果聚合 | 保留为领域编排器，底层 spawn Pi Session |
| `src/tools/registry/` | 工具注册、并发和金融元数据 | 保留为领域注册中心，输出 Pi Tool |
| `src/session/` | UpUp JSON/JSONL、旧格式、恢复和标签 | 保留迁移/兼容层，生产写入改 Pi Session |
| `src/plugins/` | Bun/Jiti/WASM/MCP 四 runtime | 保留安全运行时；增加 Pi Package/Extension Adapter |
| `src/skills/` | 50 个 SKILL.md + 14 个 bundled skill | 迁移为 Pi Skill/Package；bundled 逻辑变成 Extension Tool/Workflow |
| `src/plan/` | ResearchPlan、审计和阶段状态 | 保留为投资扩展，不依赖自研 Agent loop |
| `src/gateway/`、`src/cron/`、`src/daemon/` | 外部渠道、后台和调度 | 保留，改调用 Pi SDK/RPC |
| `src/memory/`、`src/telemetry/` | 记忆、观测、审计 | 通过 Pi Extension events 和 typed telemetry 接入 |

## 2. 最终目标架构

### 2.1 分层

```text
┌───────────────────────────────────────────────────────────┐
│ Product / Channels                                         │
│ CLI · SDK · stdio · Gateway · WhatsApp · Bridge · Daemon   │
└──────────────────────────────┬────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────┐
│ UpUp Application Services                                  │
│ /invest · reports · portfolio · cron · realtime · evals    │
└──────────────────────────────┬────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────┐
│ UpUp Pi Runtime Adapter                                    │
│ AgentSessionFactory · ToolAdapter · EventAdapter            │
│ PolicyAdapter · SessionAdapter · MemoryAdapter              │
└──────────────────────────────┬────────────────────────────┘
                               │ only production Agent core
┌──────────────────────────────▼────────────────────────────┐
│ Pi Runtime                                                 │
│ pi-coding-agent + pi-agent-core + pi-ai                   │
│ AgentSession · AgentSessionRuntime · ExtensionRunner       │
│ SessionManager · Compaction · ModelRegistry · RPC          │
└──────────────────────────────┬────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────┐
│ Investment Domain Extensions / Packages                    │
│ finance-data · investment-tools · skills · risk · reports  │
│ workflows · verification · compliance · evals              │
└───────────────────────────────────────────────────────────┘
```

### 2.2 Runtime 的唯一入口

新增目录建议如下：

```text
src/runtime/pi/
  index.ts
  types.ts
  agent-session-factory.ts
  agent-spec.ts
  model-runtime.ts
  tool-adapter.ts
  event-adapter.ts
  session-adapter.ts
  permission-adapter.ts
  memory-adapter.ts
  extension-loader.ts
  runtime-errors.ts
  runtime-health.ts

src/extensions/upup/
  finance-tools.ts
  investment-workflow.ts
  investment-policy.ts
  investment-memory.ts
  investment-telemetry.ts
  investment-commands.ts
  investment-renderers.ts

packages/pi-finance-sdk/
packages/pi-finance-tools/
packages/pi-investment-skills/
packages/pi-investment-workflows/
packages/pi-investment-evals/
```

`src/runtime/pi/` 是 UpUp 的产品适配层，不重新实现 Agent loop。它只做边界转换、领域策略注入、生命周期绑定和兼容迁移。

### 2.3 统一 Agent 定义

所有普通 Agent、投资 Agent、Custom Agent、Subagent、Coordinator Worker 都统一为领域定义：

```ts
interface UpUpAgentSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  systemPrompt?: string;
  promptFiles?: string[];
  skills?: string[];
  tools: string[] | "all";
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
  mode: "primary" | "subagent" | "worker" | "reviewer";
  capabilities: string[];
  taskTypes: string[];
  permissions: UpUpPermissionProfile;
  workflow?: string;
  maxConcurrency?: number;
  timeoutMs?: number;
  dataPolicy?: "live" | "delayed" | "cached" | "offline";
  outputContract?: "markdown" | "json" | "report" | "evidence";
}
```

重要原则：`UpUpAgentSpec` 描述“这个投资角色可以做什么”，Pi `AgentSession` 描述“这个角色如何运行”。两者不能再次混成一个大类。

### 2.4 统一运行接口

上层只依赖以下接口，不再直接 import 自研 `Agent`：

```ts
interface UpUpAgentRuntime {
  createSession(spec: UpUpAgentSpec, options?: CreateSessionOptions): Promise<UpUpAgentSession>;
}

interface UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  prompt(input: string, options?: PromptOptions): Promise<void>;
  steer(input: string): Promise<void>;
  followUp(input: string): Promise<void>;
  abort(): Promise<void>;
  waitForIdle(): Promise<void>;
  compact(instructions?: string): Promise<void>;
  fork(entryId?: string): Promise<UpUpAgentSession>;
  subscribe(listener: (event: UpUpAgentEvent) => void): () => void;
  dispose(): void;
}
```

实现内部必须由 `AgentSession`/`AgentSessionRuntime` 提供，不允许再出现第二个等价的 loop。

## 3. Pi 能替换的核心能力

### 3.1 Agent loop

Pi `pi-agent-core` 的 `agentLoop()` 已负责：

- AgentMessage context；
- provider streaming；
- 多 Tool Call；
- sequential/parallel tool execution；
- steering/follow-up queue；
- Tool result；
- abort；
- agent/turn/message/tool lifecycle events。

替换对象：

- `src/agent/agent.ts` 中的 `run()`；
- `callModelWithStreaming()`；
- `streamAndAccumulate()`；
- `callModelWithMessages()`；
- `executeToolsAndCollectMessages()`；
- 自研队列与 direct response loop。

保留在 UpUp Adapter 的逻辑：

- 注入中文金融 system prompt；
- 计算并注入投资上下文；
- 工具白名单；
- 领域权限；
- 数据新鲜度策略；
- 结果审计；
- 工作流状态更新。

### 3.2 Model/Provider

目标依赖：

- `@earendil-works/pi-ai` 作为唯一运行时 Provider 协议；
- `ModelRuntime` 作为模型选择、认证和模型能力来源；
- Provider metadata 统一由 Pi 管理；
- DeepSeek、OpenAI、Anthropic、Google、Ollama、OpenRouter 等按 Pi provider 机制接入；
- UpUp 仅保留中国模型默认值、金融任务模型路由和成本策略。

迁移后删除核心路径中的：

- `BaseMessage`；
- `AIMessage`；
- `AIMessageChunk`；
- `ToolMessage`；
- `StructuredToolInterface`；
- LangChain ChatModel 作为 Agent Runtime 输入。

LangChain 不必第一阶段立即从所有数据工具中删除，但它不能继续作为核心 Agent message/tool 协议。数据源中若仍使用 LangChain，必须隔离在 domain adapter 内。

### 3.3 Session、Tree、Fork、Compaction

Pi 原生提供：

- JSONL Session；
- parent/branch tree；
- `/tree` 导航；
- fork/clone；
- Session Manager；
- 自动和手动 Compaction；
- overflow retry；
- Session stats；
- JSONL/HTML export。

UpUp 需要通过 `session_before_compact` 和 `session_compact` 注入金融专用压缩规则：

- 保留股票代码、市场、币种和日期；
- 保留数据源及查询时间；
- 保留估值假设和版本；
- 保留风险结论及证据 ID；
- 保留未完成的投研阶段；
- 保留用户确认和拒绝；
- 不把工具原始大结果完整塞入 summary；
- 结果文件使用 evidence reference，而不是不可验证的自然语言摘要。

### 3.4 Extension 生命周期

投资 Extension 应使用以下 Pi 事件：

| Pi 事件 | UpUp 用途 |
|---|---|
| `project_trust` | 确认项目金融插件和数据权限 |
| `resources_discover` | 发现投资 Skills、Prompt、Agent Profile |
| `session_start` | 加载用户投资偏好、账户上下文和市场日历 |
| `before_agent_start` | 注入中文金融系统指令、数据新鲜度、合规提示 |
| `context` | 注入当前 watchlist、研究计划、证据摘要 |
| `tool_call` | 检查安全级别、股票市场、权限和参数 |
| `tool_execution_start` | 创建 audit span 和 evidence record |
| `tool_execution_update` | 传递行情/回测进度 |
| `tool_execution_end` | 保存结果摘要、来源、耗时、usage 和错误 |
| `tool_result` | 统一结果预算和敏感信息清理 |
| `session_before_compact` | 生成金融专用压缩摘要 |
| `message_end` | 抽取研究事实和可引用证据 |
| `agent_end` | 完成研究运行、写报告索引和 metrics |
| `session_shutdown` | 关闭数据连接、flush audit、释放 worker |

## 4. 金融插件生态设计

### 4.1 插件分层原则

不要把 296 个左右工具一次性塞进一个巨大 Extension。应按“协议稳定、数据源可替换、风险隔离、按需加载”拆分：

```text
pi-finance-sdk                 # 类型、Tool Contract、Evidence、Policy
    │
    ├── pi-finance-market-data # 价格、行情、交易日、指数、实时流
    ├── pi-finance-fundamentals# 财务报表、比率、分部、估计
    ├── pi-finance-filings     # SEC、公告、研报、监管文件
    ├── pi-finance-cn          # Tushare、AKShare、Eastmoney、A/H/fund
    ├── pi-finance-search      # Exa、Tavily、Perplexity、X、浏览器
    ├── pi-investment-analysis # DCF、DDM、可比、Graham、技术分析
    ├── pi-investment-portfolio# 组合、归因、风险、监控、watchlist
    ├── pi-investment-backtest # 回测、指标、报告、数据快照
    ├── pi-investment-workflow # /invest 五阶段和报告产物
    ├── pi-investment-policy   # 权限、合规、模拟交易和审批
    └── pi-investment-evals    # 研究质量、引用、数据一致性评估
```

第一阶段可将这些包放在 UpUp monorepo 的 `packages/` 下；生态稳定后再按 Pi Package 发布到 npm 或 Git，并通过 `.pi/settings.json` 加载。

### 4.2 `pi-finance-sdk`

这是所有金融插件的稳定底座，不直接绑定具体数据源。至少定义：

```ts
interface MarketDataPoint {
  symbol: string;
  market: "cn" | "hk" | "us" | "fund" | "crypto";
  timestamp: string;
  timezone: string;
  price?: number;
  currency?: string;
  source: string;
  freshness: "realtime" | "delayed" | "historical" | "cached";
}

interface EvidenceRecord {
  id: string;
  source: string;
  url?: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  dataHash?: string;
  confidence?: "high" | "medium" | "low";
}

interface FinancialToolDetails {
  evidence: EvidenceRecord[];
  dataFreshness: "realtime" | "delayed" | "historical" | "cached";
  warnings?: string[];
  assumptions?: Record<string, string | number | boolean>;
  auditId: string;
}
```

所有工具结果都必须能回答：数据来自哪里、截至什么时候、是否缓存、是否有警告、采用了什么假设。

### 4.3 Pi Tool Adapter

UpUp 当前 `RegisteredTool` 包含安全级别、类别、side effects、并发元数据和 LangChain Tool。迁移后保留 UpUp metadata，输出 Pi Tool：

```text
RegisteredTool
  ├── name / description
  ├── TypeBox parameters
  ├── safety / sideEffects / concurrency
  ├── permission policy
  └── execute(input, signal, progress)
              │
              ▼
        pi.registerTool()
```

Adapter 必须完成：

1. Zod/JSON Schema/LangChain schema → TypeBox schema 的显式转换或逐工具重写。
2. `AbortSignal` 传入所有网络、计算和子进程调用。
3. Pi `onUpdate` 映射为 UpUp `tool_progress`。
4. `details` 保留 evidence、auditId、warnings、usage 和 data freshness。
5. 错误转换为稳定的 `FinancialToolError`，不能把 API key、cookie、完整请求头放入结果。
6. 在 `tool_call` 事件之前执行 UpUp policy；被拒绝的调用必须可解释并可审计。
7. 读工具可并发，写工具、实时连接和同一组合的写操作必须由 UpUp concurrency key 串行化。

### 4.4 投资 Agent Profiles

原有 5 个投资 Subagent 不再是五套 Runner，而是五个 Profile：

| Profile | 主要工具 | 允许副作用 | 输出 |
|---|---|---|---|
| `invest-explore` | 行情、基本面、财报、新闻、搜索 | 只读 | evidence bundle |
| `invest-plan` | 研究计划、筛选、任务分解 | 写计划文件 | `plan.json`/`plan.md` |
| `invest-risk` | 风险、组合、压力测试、情景分析 | 只读 | `risk.json`/`risk.md` |
| `invest-trade` | 回测、模拟交易、组合变更草案 | 模拟/审批后写入 | `trade-log.json` |
| `invest-review` | 证据校验、引用、归因、报告 | 写报告 | `verification.json`/`report.md` |

每个 Profile 通过 Pi `setActiveTools()` 或 Session 初始 tool allowlist 限制工具，不在 Prompt 中“请求模型自觉不要调用”。

### 4.5 /invest 五阶段

保留现有业务流程，但运行对象改为 Pi Session：

```text
detect
  → intent router
  → create Pi primary session
plan
  → fork/child Pi session, user confirmation
execute
  → coordinator spawns Pi worker sessions
verify
  → reviewer Pi session + deterministic validators
report
  → report composer + evidence index
```

阶段状态必须是确定性的 TypeScript 状态机，不能只靠 Agent Prompt 驱动。Pi Extension 负责触发和事件，UpUp Workflow Service 负责状态转移、幂等、重试和审计。

## 5. Agent、Plugin、Skill 和 Package 的关系

### 5.1 四种资源的职责

| 资源 | 应承载 | 不应承载 |
|---|---|---|
| Pi Extension | 工具注册、生命周期、权限拦截、命令、UI、Session 状态 | 大量静态投资知识 |
| Pi Skill | 投资方法、分析步骤、写作规范、领域规则 | 真实数据访问和敏感写操作 |
| Prompt Template | 可复用的研究提示和报告格式 | 权限判断、数据真实性保证 |
| Pi Package | 组合发布 Extension、Skill、Prompt、Theme | 不经审查的任意第三方代码 |

### 5.2 推荐的 Package Manifest

金融包应显式声明资源，不依赖隐式全量扫描：

```json
{
  "name": "@upup/pi-investment-workflows",
  "version": "0.1.0",
  "keywords": ["pi-package", "finance", "investment"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": []
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "0.84.3",
    "@upup/pi-finance-sdk": "0.1.0"
  }
}
```

版本、来源和依赖必须锁定；生产环境不允许直接加载未审查的远程 Git HEAD。

### 5.3 Skill 迁移规则

现有 `src/skills/**/SKILL.md` 分三类处理：

1. **纯知识/方法论**：直接迁移为 Pi Skill。
2. **需要金融工具**：迁移为 Skill + Tool Package，并在 Skill 中引用工具名称和 evidence 要求。
3. **含确定性计算或状态变更**：迁移为 Skill + Pi Extension Tool/Workflow，不允许只靠 Markdown 执行。

每个 Skill 必须具备：

- YAML frontmatter 的稳定 name/description；
- 适用场景和不适用场景；
- 数据来源和 freshness 要求；
- 计算公式和单位；
- 证据/引用要求；
- 失败和缺失数据处理；
- 中文输出约束；
- 禁止模拟成真实数据的规则。

## 6. 权限、合规和安全设计

### 6.1 不能照搬 Pi 默认安全模型

Pi 官方 README 明确说明：Pi 默认不提供限制 filesystem/process/network/credential 的内建 permission system，Extension 具有宿主进程权限。UpUp 不能把金融工具作为普通 Extension 直接暴露。

安全边界分四层：

```text
Pi project trust / package allowlist
          ↓
UpUp tool safety policy
          ↓
Data source / portfolio authorization
          ↓
OS sandbox / subprocess / network boundary
```

### 6.2 工具风险分级

| 级别 | 例子 | 默认策略 |
|---|---|---|
| `safe` | 历史行情、财报读取、只读搜索 | 自动允许并记录 |
| `warning` | 大规模筛选、回测、外部请求 | 自动允许但显示数据/成本提示 |
| `dangerous` | 写入研究计划、修改 watchlist、组合草案 | 用户确认或显式 session policy |
| `critical` | 模拟下单、组合写入、外部消息发送 | 每次确认、强参数校验、审计；真实交易默认禁用 |

Pi `tool_call` Hook 只负责进入 UpUp policy；真正的授权、审批、账户隔离和凭证访问由 UpUp 实现。敏感插件应通过 Pi 推荐的容器化/隔离方式运行，优先考虑独立进程或受控 sandbox，而不是仅依赖 Extension 代码自律。

### 6.3 数据和输出安全

- API key、cookie、Authorization header 永不进入 Session、Tool result、telemetry 或报告。
- 所有实时行情标注时间、时区、延迟和市场状态。
- 所有历史数据标注 `asOf`，禁止把当前值伪装成历史值。
- 报告中的每个关键结论必须关联 evidence ID。
- 缺少数据时必须输出“不可得/缓存/估算”，不能静默补全。
- 真实交易能力保持禁用或独立产品，不因 Pi 迁移扩大权限。
- Pi Package 必须使用 pinned npm version 或 pinned Git commit，并经过源码审查。

## 7. Session 和数据迁移方案

### 7.1 新 Session 的权威格式

改造后生产写入以 Pi JSONL Session 为权威。UpUp 额外信息使用：

- Pi custom entry：保存 workflow、evidence index、risk state、agent spec version；
- custom message：只有需要进入 LLM context 的金融上下文才使用；
- 外部 `.upup/runs/<runId>/`：保存大工具结果、原始数据和报告产物；
- telemetry/audit store：保存不可变调用记录。

不要把大行情表、完整财报或原始搜索页面塞入 Pi message context。

### 7.2 旧 Session 迁移

实现独立 CLI：

```text
bun run src/session/migrate-to-pi.ts --dry-run
bun run src/session/migrate-to-pi.ts --session <id>
bun run src/session/migrate-to-pi.ts --all --backup-dir <dir>
```

迁移规则：

1. 原文件只读打开，生成新文件，不覆盖原文件。
2. 映射 user/assistant/tool/tool_result/system/error。
3. `parentUuid` 映射到 Pi entry `parentId`。
4. `toolUseId` 映射到 Pi tool call identity，并保留原 ID 到 custom details。
5. `context_collapse_snapshot` 映射为 Pi compaction entry，并保存 UpUp 原摘要。
6. `file_history_snapshot` 保存为 custom entry 或外部 snapshot reference。
7. metadata 映射 project、branch、title、tag、firstPrompt、token totals。
8. 每个文件生成 migration report 和 hash。
9. 迁移后使用 Pi 读取、树导航、fork、compact、export 做回读测试。

### 7.3 双读单写阶段

迁移期间采用：

- Pi 写新 Session；
- UpUp legacy reader 只读旧 Session；
- `--session-format=legacy|pi` 仅用于迁移和回滚；
- 不允许两个 runtime 同时写同一个 Session。

完成迁移验证后删除生产 legacy writer，最后再删除旧 Agent 对 Session 的依赖。

## 8. 迁移阶段与工作分解

### Phase 0：基线、锁定版本和决策记录

目标：建立可回归基线，不改业务行为。

任务：

1. 记录 UpUp 当前 `bun run typecheck`、`bun test`、核心 `/invest` fixture 结果。
2. 锁定 Pi 版本，初期使用本地 `0.84.3` 对应的完整包版本。
3. 确认 Node 22 与 Bun 的兼容性；Pi package 当前声明 Node `>=22.19.0`，不得默认假设 Bun 完全兼容。
4. 若 Bun 无法稳定承载 Pi，采用 Node Pi Worker/sidecar，UpUp 主进程通过 RPC/stdio 调用。
5. 生成工具目录、Agent 定义、Session 格式、事件类型和入口依赖清单。
6. 建立 `pi5` feature flag，但不允许新旧 runtime 在同一 Session 并行写入。

退出条件：基线可复现；Pi 版本和运行时策略冻结；所有高风险模块有 owner 和回滚方案。

### Phase 1：统一领域契约，不替换运行时

目标：先消除 Agent 定义分裂。

任务：

1. 新建 `UpUpAgentSpec`、`UpUpToolContract`、`UpUpAgentEvent`、`EvidenceRecord`、`PermissionProfile`。
2. 将通用 Agent、投资 Subagent、Custom Agent 转换为 Spec。
3. 保留旧 API 作为转换输入，不再新增旧类型。
4. 为每个 Spec 添加 schema/version/capability/tool allowlist。
5. 为 `invest-explore`、`invest-plan`、`invest-risk`、`invest-trade`、`invest-review` 写契约测试。

退出条件：所有生产 Agent 定义都能序列化为 Spec；路由、模板、导入导出不再依赖具体 Runner。

### Phase 2：引入 Pi Runtime Adapter

目标：建立唯一 Pi Session 创建入口。

任务：

1. 引入 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、必要的 protocol/client 包。
2. 实现 `AgentSessionFactory`，从 `UpUpAgentSpec` 创建 Pi `AgentSession`。
3. 实现 `ToolAdapter`，先接入 5 个无副作用工具：行情、基本面、新闻、搜索、交易日。
4. 实现 `EventAdapter`，将 Pi event 映射到现有 UI/SDK event，但内部只以 Pi event 为真实来源。
5. 实现模型解析、默认 DeepSeek、中国模型 alias 和 fallback policy。
6. 实现 `runtime-health`，报告 Node/Bun、Pi version、provider、tool count、extension load errors。

退出条件：一个只读金融 Agent 可以在 Pi Session 中完成真实 fixture；主 CLI 仍可使用旧 runtime 回归。

### Phase 3：替换主 Agent Loop

目标：生产主 Agent 彻底使用 Pi。

任务：

1. 将 `src/controllers/agent-runner.ts` 改为调用 `UpUpAgentRuntime`。
2. 将 CLI、print、stdio、SDK 的入口统一到 Runtime Adapter。
3. 迁移 stream/thinking/tool/progress/done 事件渲染。
4. 迁移 steering、follow-up、abort、timeout 和 queue。
5. 迁移 Fallback 到 Pi model/provider 级别；UpUp 保留领域重试和数据源 fallback。
6. 迁移 token usage 和成本计算。
7. 迁移 tool result budget、大结果外置和引用生成。
8. 禁止新生产代码 import `src/agent/agent.ts`。

退出条件：默认运行路径没有 `new Agent()`、没有 `callLlmWithMessages()`、没有 LangChain message loop；核心 Agent 事件和用户体验回归通过。

### Phase 4：替换 Session 和 Compaction

目标：Pi Session 成为唯一生产写入格式。

任务：

1. 实现旧 Session → Pi Session 迁移器。
2. 实现 Pi Session → UpUp display summary 读取器。
3. 接入 `session_before_compact`，实现投资领域摘要。
4. 将 `/resume`、`/continue`、`--fork-session` 映射 Pi Session API。
5. 将 `.upup/runs` evidence reference 写入 custom entry，而不是写入大文本。
6. 验证 crash、abort、compaction overflow、fork 和 tree navigation。

退出条件：新 Session 全部由 Pi 写入；旧 Session 经过迁移后可以继续、分支、压缩和导出；原始文件可回滚。

### Phase 5：迁移 Subagent 和 Coordinator

目标：多 Agent 底层全部创建 Pi Session，业务编排逻辑保留。

任务：

1. `SubagentRunner` 改为 `PiSubagentFactory`。
2. `CustomAgentRegistry` 输出 `UpUpAgentSpec`，删除自定义 execution path。
3. `SwarmCoordinator.spawnAgent()` 创建 Pi Session 或受控 Pi worker process。
4. Team message 使用 Pi custom message 或 Coordinator event bus；不直接拼接隐式 Prompt。
5. 并行模式使用独立 Session、独立 abort signal、独立 tool allowlist、独立 evidence namespace。
6. 结果聚合由 Coordinator 负责，最终 reviewer 仍通过 Pi Agent 执行。
7. 如果使用 tmux/workerpool，进程只启动 Pi SDK/RPC worker，不启动旧 UpUp Agent loop。

退出条件：所有子 Agent 和 worker 的底层模型调用、工具调用、Session 和 compaction 均来自 Pi；Coordinator 只负责调度和聚合。

### Phase 6：插件化投资能力

目标：将领域能力拆成可组合、可审查、可发布 Pi Packages。

任务：

1. 发布 `pi-finance-sdk`。
2. 将金融工具按数据源和风险边界拆包。
3. 将纯 Markdown 技能迁移为 Pi Skills。
4. 将确定性计算、数据获取和写操作迁移为 Extension Tools。
5. 将 `/invest`、`/dossier`、`/strategy`、`/risk-dashboard` 注册为 Pi commands，但状态机留在 UpUp Workflow Service。
6. 增加 package manifest、pinned dependency、签名/哈希和 allowlist。
7. 在 `.pi/settings.json` 中只加载经过验证的本地/内部包。

退出条件：新投资能力可通过新增/升级领域 Package 实现，不需要修改 Pi Runtime 或核心 Agent loop。

### Phase 7：删除旧核心并收敛仓库

目标：完成“彻底使用 Pi 替换核心 Agent”。

任务：

1. 删除或迁移 `src/agent/agent.ts` 生产代码路径。
2. 删除 `src/model/llm.ts` 的核心调用和 LangChain message adapter。
3. 删除 `src/agent/subagent-runner.ts` 的旧执行路径。
4. 删除重复的 `packages/agent-core` runtime 实现；若外部 SDK 仍使用，改成导出 Pi-backed API。
5. 将 `packages/sdk` 改成 Pi-backed Client/SDK。
6. 将旧 `src/agent/types.ts` 的底层事件改为 Pi event adapter 类型，保留必要的公开兼容类型一段时间。
7. 删除 feature flag 和 shadow runtime，保留迁移 CLI 和只读 legacy reader。
8. 更新 README、AGENTS、架构文档、Release 文档和开发命令。

退出条件：静态依赖检查确认生产 runtime 只有 Pi；旧核心仅存在于 migration/compat/历史说明中；所有入口、测试和构建使用 Pi。

## 9. 入口迁移矩阵

| 入口 | 当前 | 目标 | 备注 |
|---|---|---|---|
| `src/index.tsx` | CLI 分发和旧 Agent | Pi-backed CLI bootstrap | 保留 setup/doctor/config |
| 当前 CLI | Ink/React + UpUp runner | Pi TUI 或 Pi TUI Adapter | 先保持输出，再逐步换组件 |
| `src/run.ts` | 直接 new UpUp Agent | Pi SDK print session | 无 UI、可测试 |
| `src/bundled-runner.ts` | bundled UpUp Agent | Pi runtime bundle/worker | 处理全局 env/settings |
| `src/stdio/server.ts` | 自研 JSON-RPC | Pi protocol/client 或 Pi-backed adapter | 保留 UpUp 外部 schema 兼容 |
| `src/gateway/gateway.ts` | 直接调用 `runAgentForMessage` | session factory + Pi prompt | Gateway 不拥有 Agent loop |
| `src/cron/runner.ts` | 调度 UpUp Agent | 调度 Pi Session run | 每次任务独立 session/lease |
| `src/daemon/` | 自研 worker Agent | Pi worker process/RPC | 保留 supervisor 和重试 |
| `src/bridge/` | 远程控制 UpUp session | Pi client/server 或 facade | 统一 Session handle |
| `src/evals/` | LangChain/Ink eval runner | Pi event + Finance eval package | 保留金融质量指标 |
| `packages/sdk/` | 自研 Client/Tool/Session/Permission | Pi-backed SDK + UpUp domain API | 对外 API 需版本化 |

## 10. 测试与验证门禁

### 10.1 静态门禁

必须增加脚本检查：

```text
check-no-legacy-agent-runtime
check-no-langchain-core-runtime
check-pi-version-lock
check-finance-tool-metadata
check-extension-package-manifest
check-no-unpinned-pi-package
```

核心规则：

- `src/` 生产代码不能 import `src/agent/agent.ts`；
- Runtime 层不能 import LangChain message classes；
- 所有 Pi 包版本必须锁定；
- 金融 Tool 必须有 safety/concurrency/evidence metadata；
- Pi Package 不能加载未列入 allowlist 的远程资源；
- Extension 不能在加载时读写用户凭证或执行未声明的外部命令。

### 10.2 单元和契约测试

新增测试目录：

```text
src/runtime/pi/*.test.ts
src/runtime/pi/adapters/*.test.ts
src/extensions/upup/*.test.ts
packages/pi-finance-sdk/test/*.test.ts
packages/pi-investment-evals/test/*.test.ts
```

必测场景：

1. Pi Tool schema 和 UpUp Tool metadata 双向映射。
2. Tool 取消、超时、重试、网络错误和结构化错误。
3. 多工具并发和同一 portfolio 的串行保护。
4. Tool progress、details、evidence 和 audit ID 不丢失。
5. provider fallback、模型切换和 usage 统计。
6. 中文、多轮、图片/文件内容和长文本。
7. Session 写入、恢复、tree、fork、compact、export。
8. Permission allow/ask/deny/critical 四级策略。
9. Agent Profile 工具白名单不可越权。
10. Subagent crash、abort、重试、结果聚合和 worker 回收。
11. `/invest` 五阶段状态转移、幂等和恢复。
12. evidence 引用、数据 freshness、报告一致性。

### 10.3 双运行时对照测试

迁移期间使用同一 deterministic fixture 分别运行旧 Agent 和 Pi Agent，比较：

- Tool 调用集合；
- 工具参数；
- 工具顺序/并发；
- evidence 数量和来源；
- 阶段状态；
- 关键数值容差；
- 失败分类；
- token usage；
- 最终报告结构。

自然语言不要求字节级相同，但金融数字、数据截至日期、引用和风险等级必须在允许范围内一致。

### 10.4 端到端门禁

至少建立以下无真实交易、可重复 fixture：

```text
invest-cn-stock-readonly
invest-us-stock-readonly
invest-fund-portfolio-readonly
invest-dcf-with-evidence
invest-risk-dashboard
invest-backtest
invest-session-resume
invest-subagent-parallel
invest-gateway-message
invest-cron-run
```

禁止在测试中调用真实下单；外部 API 使用 mock/recorded fixture，真实数据 smoke test 单独 opt-in。

### 10.5 性能和可靠性门禁

记录并比较旧/新 runtime：

- 首次 Session 启动时间；
- 首 token 延迟；
- Tool 调用吞吐；
- 并发研究任务数；
- compaction 时间；
- Session 写入延迟；
- crash recovery 成功率；
- 内存峰值；
- provider retry 次数；
- 每次研究成本。

迁移不能通过降低验证、删除审计或吞掉异常来获得性能数据。

## 11. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| Pi 当前包声明 Node `>=22.19.0`，UpUp 以 Bun 为主 | 高 | 先做 Node worker/RPC 方案；确认后再决定主进程迁移 |
| LangChain Message/Tool 与 Pi AgentMessage/Tool 不兼容 | 高 | 先迁移 5 个只读工具，建立 adapter contract tests |
| Pi 默认不提供 UpUp 权限系统 | 高 | 保留 UpUp policy，tool_call 前置拦截，敏感工具 sandbox |
| Pi 不内置完整 Subagent/Plan/MCP | 高 | 作为 UpUp Extension/Coordinator/Workflow Service 实现 |
| Session 格式和历史审计不等价 | 高 | 双读单写、迁移报告、hash、不可覆盖原文件 |
| Pi Extension 默认宿主权限过高 | 高 | package allowlist、pinned source、审查、进程/sandbox 隔离 |
| TUI 从 Ink 切换到 Pi TUI 造成回归 | 中 | Agent 先迁移，UI 后迁移；事件 adapter 保持现有渲染 |
| Pi 上游版本变化 | 中 | pin 版本、内部镜像、升级 RFC、完整回归后升级 |
| 金融工具过多导致 Prompt/context 膨胀 | 中 | `setActiveTools()`、dynamic tool loading、按 Agent Profile 分组 |
| 子 Agent 并行导致数据竞争 | 高 | 每个 Session 独立 evidence namespace；写操作 coordinator 串行化 |
| 领域 Skill 被错误当成确定性程序 | 中 | 计算和写操作必须是 Tool/Workflow，Skill 只表达方法论 |

## 12. 回滚和发布策略

### 12.1 回滚单位

回滚必须按 runtime/session/extension 三个维度独立进行：

- Runtime 回滚：恢复 Pi 版本或切到 Node worker 旧版本；
- Session 回滚：新写 Pi Session 不覆盖旧 UpUp Session；
- Extension 回滚：禁用单个金融 Package，不回滚整个 Agent。

### 12.2 发布通道

1. `experimental`：内部 fixture，只读金融工具。
2. `shadow`：旧 runtime 产生用户结果，Pi runtime 旁路运行并比较，不写生产 Session。
3. `canary`：允许单个用户/项目使用 Pi，独立 Session 目录。
4. `default`：Pi 成为默认生产 Runtime。
5. `cleanup`：删除旧 Agent loop 和旧写入器。

任何阶段如果发生金融数值错误、权限绕过、Session 丢失或 evidence 不可追溯，立即停止晋级，不通过“暂时忽略测试”继续。

## 13. 完成定义（Definition of Done）

### 当前执行状态（2026-09-13）

- 已完成本轮实现：Pi 依赖锁定、唯一 `src/runtime/pi/` Session Factory、金融 Tool Adapter/证据审计、统一 Pi prompt/model runner、CLI/Gateway/Daemon/stdio/SDK 入口切换、MCP/共享工具 Pi 化、生产 LangChain import 门禁、旧核心 loop 删除、Pi-backed `/invest` 五阶段工作流、Pi custom-entry checkpoint、pause/resume/fork/idempotency、共享 Pi worker 后端、Custom Agent → `UpUpAgentSpec` 出口、插件工具 allowlist/安全策略/路径审计和架构图留档。
- 本轮新增：`PiSessionService` 将 CLI、stdio `session/*` RPC 统一落到 Pi JSONL `SessionManager`；CLI resume/fork/list/rename/tag/delete 不再调用 legacy `src/session/storage.ts`，Pi session metadata/lifecycle 以 custom entries 持久化；`PiBackgroundService` 将 Daemon 和 Agent 工具的 background task 统一落到 Pi prompt/session；Subagent 执行路径已去除重复 AgentSession/worktree/timeout loop，统一委托 Pi runner。
- 已验证：`bun run check:pi-migration`、`bun run check:pi-packages` 均通过；Pi runtime、金融 fixture、权限、插件信任、Pi Package 的 extension/skill/prompt 发现、Session migration、`/invest`、MCP、DuckDB、多 Agent backend、AgentSpec、Daemon session 和 snip 消息适配通过；最新 Pi 合约套件为 `61 pass / 0 fail`，Finance SDK 独立测试为 `1 pass / 0 fail`，新增 deterministic 金融 E2E 覆盖 A/H/美股、基金、财报、DCF、可比估值、技术指标、回测、组合归因、VaR 和模拟交易审批。
- 本轮修复：PiTool 现在同时接受 Zod 和原生 JSON Schema，DuckDB 无参数工具可正常注册；Skill fork 错误保留 `SubagentRunner` 兼容语义；Phase Handler 改为显式金融依赖注入，避免测试 mock 污染 Pi Registry；`bunx tsc --noEmit --pretty false`、Pi 迁移门禁和 Pi Package 门禁均通过。
- 本轮契约补充：`src/cron/executor.pi.test.ts` 验证 Cron 使用注入的 Pi-backed runner、固定 `cron:<job.id>` session key、消息投递和 heartbeat suppression；`src/multi-agent/backends/backend.test.ts` 验证 InProcess worker 真实创建 Pi session 并返回 assistant；SDK、Gateway、Bridge、stdio session 契约继续通过。
- 本轮 Agent 定义收口：新增 `src/runtime/pi/agent-catalog.ts`，以 `UpUpAgentSpec` 作为唯一可执行 Agent 存储；`AgentRegistry` 只在边界处投影元数据，不再维护第二个可执行定义存储。用户 Agent、Markdown Agent 文件和 Subagent 配置现在均以 `PiAgentSpecInput`、`PiAgentFileSpec`、`PiSubagentConfig` 命名，注册和执行统一进入 Pi catalog/session；兼容字段只用于输入/结果 DTO。
- 已验证补充：`bun run typecheck` 已通过；完整 `bun test` 为 `4174 pass / 0 fail`（282 files）；Pi 定向合约套件为 `63 pass / 0 fail`，Finance SDK 为 `1 pass / 0 fail`；`packages/adapter-paperclip/standalone/agent-bundle.js` 已从根目录重建并审计，不再包含 `@memvid/sdk`、LangChain 或 `@langchain` 字符串；交易 registry 的下单/撤单工具已提升为 `dangerous`，`invest-trade` 仅暴露 sandbox-shaped 工具并要求逐次审批。
- 已知限制：真实模型和真实外部金融数据仍未在本地 E2E 中调用；性能/恢复基准和生产依赖图仍需独立 verifier 复核。旧 `src/agent/` 目录已物理删除，投资 Profile、Subagent 注册、意图路由和生命周期能力均归入 `src/runtime/pi/`；历史测试中的顶层 `vi.mock` 已改为依赖注入，串行全量测试已覆盖删除后的生产树。
- 架构留档：`docs/architecture/pi5-runtime.md` 固化 Runtime/session、金融 evidence、Pi 生态、插件信任权限和多 Agent worker 数据流图。
- 当前 Comet 验收：`pi5-core-agent-migration` 仍为 `phase=verify`、`verificationResult=pending`，A1–A20 不在本地文档中提前勾选；独立 verifier 返回最终证据后再更新完成矩阵。
- 已知边界：`PiAgentRegistry`、Markdown loader 和 `PiSubagentConfig` 仅作为 Pi 输入/结果 DTO 与目录适配；所有执行委托 `PiBackgroundService`/`runPiPrompt`，不再存在旧 Agent loop。生产源码和锁文件已无 LangChain runtime 依赖；记忆目录中的 `memvid` 命名是 UpUp 本地记忆实现，不是 LangChain Agent runtime。standalone generated bundle 已按 build script 重生成并审计。不得恢复旧 Agent loop。

### Runtime 完成

- [x] 所有生产入口使用 Pi runtime adapter，核心执行由 `AgentSession` 提供。
- [x] `src/agent/agent.ts` 已删除，不再存在生产自定义 Agent loop。
- [x] `src/model/llm.ts` 已删除；生产模型调用集中在 `src/runtime/pi/model.ts`。
- [x] 生产核心使用 Pi AgentMessage/Tool/Event/Model 协议，`src/runtime/pi/message-compat.ts` 已删除，生产代码和核心回归测试不再导入 LangChain 消息类。
- [x] Pi 版本和 Node/Bun 运行策略已锁定并有 `check:pi-migration` 检查。
- [x] 生产源码不再 import `src/agent` 兼容模块；`check:pi-migration` 对该依赖回流提供静态门禁。

### Agent 完成

- [x] `UpUpAgentSpec` 是唯一可执行领域 Agent 定义；`PiAgentSpecInput`/`PiAgentFileSpec`/`PiSubagentConfig` 仅作为边界 DTO。
- [x] Agent 注册存储已切换为 `PiAgentCatalog`；兼容 registry 不再持有第二套可执行定义。
- [x] 普通 Agent、投资 Agent、Custom Agent、Subagent、Worker 的生产执行均由 Pi Session Factory / Pi runner 创建；独立 verifier 仍需覆盖所有外围入口。
- [x] Agent Profile 的工具白名单和权限策略有自动契约测试。
- [x] Coordinator 只负责任务分解、spawn、聚合和生命周期，worker 的 LLM/tool/session 来自 Pi。

### 金融能力完成

- [x] A 股、港股、美股、基金、搜索、财报和行情工具全部有 Pi Adapter（生产 Registry → Pi contract 与跨市场 deterministic E2E）。
- [x] Pi Tool Adapter 对金融结果统一补充 evidence、source、retrievedAt、asOf、freshness、auditId，并对 secrets 脱敏。
- [x] DCF、DDM、可比估值、技术分析、回测、组合和风险工具通过行为回归（Pi finance E2E 与 production contract）。
- [x] `/invest` 五阶段可恢复、可审计、可从 Pi Session fork，并覆盖 pause/resume/idempotency。
- [x] 真实交易仍默认禁用，模拟交易有明确审批和隔离。

### 生态完成

- [x] 投资 Skill 可作为 Pi Skill 加载（Package resource discovery contract）。
- [x] 工具/工作流/政策/评估可作为内部 Pi Package 发布（`packages/pi-finance-sdk` 与 UpUp extension）。
- [x] Package 依赖 pinned、源码审查、allowlist 和版本回滚有效（Pi package/trust contract 与 package gate）。
- [x] 新增投资功能不需要修改 Pi Runtime（Pi extension/package boundary）。

### 数据和质量完成

- [x] 旧 Session 可迁移，原文件不被覆盖。
- [x] Session tree/fork/compact/resume/export 已有 Pi runtime/stdio/SDK 契约覆盖；完整 CLI UI fixture 仍待补齐。
- [x] Gateway、Cron、Daemon、Bridge、stdio、SDK 全部通过独立契约测试证明使用 Pi-backed runtime。
- [x] stdio `session/create|resume|get|messages|update|end` 已使用 `PiSessionService` 和 Pi JSONL。
- [x] Daemon background task 与 Agent tool background 分支已使用 `PiBackgroundService`。
- [x] 运行时、工具、权限、数据 freshness、报告引用和性能门禁全部通过（`src/runtime/pi/performance.test.ts`、Pi contract suite、full test suite）。

## 14. 建议的第一批实施 Issue

1. `pi5-001`：锁定 Pi 版本和 Node/Bun 运行策略。
2. `pi5-002`：建立 `UpUpAgentSpec`、Tool Contract、Evidence、Permission schema。
3. `pi5-003`：实现 Pi Model Runtime Adapter。
4. `pi5-004`：实现 Pi AgentSession Factory。
5. `pi5-005`：实现 LangChain/UpUp Tool → Pi Tool Adapter。
6. `pi5-006`：迁移行情、基本面、新闻、搜索、交易日五个只读工具。
7. `pi5-007`：实现 Pi event → UpUp event adapter。
8. `pi5-008`：建立旧/新 runtime deterministic comparison harness。
9. `pi5-009`：把 `/run` 和 CLI print mode 接到 Pi。
10. `pi5-010`：接入 Pi Session 和金融 compaction。
11. `pi5-011`：迁移五个 investment Agent Profile。
12. `pi5-012`：迁移 Coordinator 到 Pi worker sessions。
13. `pi5-013`：建立 `pi-finance-sdk` 和第一批 Pi Package。
14. `pi5-014`：迁移 `/invest` 和报告产物。
15. `pi5-015`：迁移 Gateway/Cron/Daemon/Bridge/SDK。
16. `pi5-016`：删除旧 Agent loop，加入静态禁止依赖检查。

## 15. 最终决策

采用“Pi Runtime 彻底替换、UpUp 领域能力保留并插件化”的方案。

不采用以下方案：

- 不把现有 UpUp `Agent` 继续作为默认，只在旁边实验 Pi；
- 不把 296 个工具一次性塞进一个巨大 Extension；
- 不把金融权限交给 Pi 默认宿主权限；
- 不把多 Agent、Plan、Workflow 误认为 Pi 已经内置；
- 不为了减少代码而删除 Session 审计、evidence、数据 freshness 和风险策略；
- 不在没有 Node/Bun、LangChain/Pi 消息、Session 迁移验证前切换生产默认值。

最终产品边界应稳定为：

```text
Pi = 可验证、可扩展、可复用的 Agent Operating Runtime
UpUp = 中国金融投资领域的 Data + Tools + Skills + Workflow + Risk Product
```

完成后，团队日常开发应主要落在：

- 数据源接入与质量；
- 投资方法和金融计算；
- 组合和风险模型；
- 研究证据、引用和报告；
- 中文金融体验；
- 市场日历、实时行情和投研工作流。

而不再重复建设：

- Agent loop；
- Provider streaming；
- Tool Call 状态机；
- Session tree/fork；
- 通用 Compaction；
- 通用 SDK/RPC；
- 通用 Extension 生命周期；
- 通用 TUI 基础组件。

## 16. 参考资料

### 官方 Pi 文档

- [Pi Documentation](https://pi.dev/docs/latest)
- [Pi Extensions](https://pi.dev/docs/latest#extensions)
- [Pi Skills](https://pi.dev/docs/latest#skills)
- [Pi Packages](https://pi.dev/docs/latest#pi-packages)
- [Pi SDK](https://pi.dev/docs/latest#sdk)
- [Pi RPC](https://pi.dev/docs/latest#rpc-mode)

### 本地 Pi 源码和文档

- `/Users/louloulin/appx/pi/README.md`
- `/Users/louloulin/appx/pi/packages/agent/src/agent-loop.ts`
- `/Users/louloulin/appx/pi/packages/agent/src/harness/agent-harness.ts`
- `/Users/louloulin/appx/pi/packages/agent/src/harness/compaction/compaction.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/agent-session.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/agent-session-runtime.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/sdk.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/extensions/types.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/extensions/runner.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/src/core/skills.ts`
- `/Users/louloulin/appx/pi/packages/coding-agent/docs/extensions.md`
- `/Users/louloulin/appx/pi/packages/coding-agent/docs/packages.md`
- `/Users/louloulin/appx/pi/packages/coding-agent/docs/session-format.md`
- `/Users/louloulin/appx/pi/packages/coding-agent/docs/compaction.md`
- `/Users/louloulin/appx/pi/packages/coding-agent/examples/extensions/subagent/`
- `/Users/louloulin/appx/pi/packages/coding-agent/examples/extensions/custom-compaction.ts`

### UpUp 关键源码

- `src/runtime/pi/agent-session-factory.ts`
- `src/runtime/pi/subagent.ts`
- `src/runtime/pi/subagent-runner.ts`
- `src/runtime/pi/investment-subagents.ts`
- `src/runtime/pi/agent-catalog.ts`
- `src/multi-agent/coordinator.ts`
- `src/tools/registry/types.ts`
- `src/session/storage.ts`
- `src/plugins/types.ts`
- `src/plan/plan-executor.ts`
- `src/gateway/gateway.ts`
