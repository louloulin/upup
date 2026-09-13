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

LangChain 已从生产依赖和运行路径移除。金融数据适配器只使用 UpUp/Pi Tool Contract；不得新增 LangChain message、tool 或 model 依赖。

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
| 非交互 print 入口 | 旧 `src/run.ts` | `src/runtime/pi/event-stream.ts` / `runPiPrompt()` | 无 UI、可测试 |
| 打包/worker 入口 | 旧 bundled runner | Pi Runtime 原生构建与 worker/RPC | 不保留第二套 Agent loop |
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

### 10.1.1 A1–A20 语义验收命令

`bun run verify:pi5` 逐项执行 A1–A19 的 Pi 契约/迁移/安全测试，并对 A20 校验六份架构文档和 Finance Pi Package 的六类资源。该命令输出每个验收 ID 的 PASS/FAIL，当前基线为 `20/20 passed`；它是仓库内可重复语义验收，仍需与 Comet 独立 Verifier 的外部结论分开记录。

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

#### 进度量化

- **仓库实现进度：100%**：Pi Runtime 唯一入口、旧 Agent/LangChain/Paperclip 生产路径退出、金融 Package/Extension/Skill/Prompt/Workflow/Policy/Eval、权限与供应链边界、外围入口和恢复能力均已落地。
- **本地验证进度：100%**：A1–A20 仓库内语义验收 `20/20 PASS`；最新完整回归 `4247 pass / 0 fail`（`14289 expect()`、`294 files`），Pi Contract 套件为 `156 pass / 0 fail`，Finance SDK 为 `5 pass / 0 fail`，新增 Pi Package Extension 命令注册/加载失败硬门禁回归，类型检查、构建和 diff 校验通过。
- **Comet 独立语义验收：0%**：当前 `phase=verify`、`verificationResult=pending`，A1–A20 尚未获得独立 Verifier 的逐项结论。
- **正式综合进度：50%**：按“本地实现/验证 50% + 独立验收 50%”计算；不能用本地测试结果替代独立验收。真实外部行情、真实券商交易和 live trading 仍保持关闭，使用 deterministic fixtures 与 sandbox policy。

- 已完成本轮实现：Pi 依赖锁定、唯一 `src/runtime/pi/` Session Factory、金融 Tool Adapter/证据审计、统一 Pi prompt/model runner、CLI/Gateway/Daemon/stdio/SDK 入口切换、MCP/共享工具 Pi 化、生产 LangChain import 门禁、旧核心 loop 删除、Pi-backed `/invest` 五阶段工作流、Pi custom-entry checkpoint、pause/resume/fork/idempotency、共享 Pi worker 后端、Custom Agent → `UpUpAgentSpec` 出口、插件工具 allowlist/安全策略/路径审计和架构图留档。
- 本轮新增：`PiSessionService` 将 CLI、stdio `session/*` RPC 统一落到 Pi JSONL `SessionManager`；CLI resume/fork/list/rename/tag/delete 不再调用 legacy `src/session/storage.ts`，Pi session metadata/lifecycle 以 custom entries 持久化；`PiBackgroundService` 将 Daemon 和 Agent 工具的 background task 统一落到 Pi prompt/session；Subagent 执行路径已去除重复 AgentSession/worktree/timeout loop，统一委托 Pi runner。
- 已验证：`bun run check:pi-migration`、`bun run check:pi-packages`、`bun run check:pi-runtime`、`bun run typecheck`、`bun run build` 均通过；Pi runtime、金融 fixture、权限、插件信任、Pi Package 的五个金融 Extension 工具、Skill/Prompt 发现、Session migration、`/invest`、MCP、DuckDB、多 Agent backend、AgentSpec、Daemon session 和 snip 消息适配通过；最新 Pi 合约套件为 `154 pass / 0 fail`，Finance SDK 独立测试为 `5 pass / 0 fail`，新增 deterministic 金融 E2E 覆盖 A/H/美股、基金、财报、DCF、可比估值、技术指标、回测、组合归因、VaR 和模拟交易审批。
- 本轮修复：PiTool 现在同时接受 Zod 和原生 JSON Schema，DuckDB 无参数工具可正常注册；Skill fork 错误保留 `SubagentRunner` 兼容语义；Phase Handler 改为显式金融依赖注入，避免测试 mock 污染 Pi Registry；`bunx tsc --noEmit --pretty false`、Pi 迁移门禁和 Pi Package 门禁均通过。
- 本轮契约补充：`src/cron/executor.pi.test.ts` 验证 Cron 使用注入的 Pi-backed runner、固定 `cron:<job.id>` session key、消息投递和 heartbeat suppression；`src/multi-agent/backends/backend.test.ts` 验证 InProcess worker 真实创建 Pi session 并返回 assistant；SDK、Gateway、Bridge、stdio session 契约继续通过。
- 本轮 Agent 定义收口：新增 `src/runtime/pi/agent-catalog.ts`，以 `UpUpAgentSpec` 作为唯一可执行 Agent 存储；`AgentRegistry` 只在边界处投影元数据，不再维护第二个可执行定义存储。用户 Agent、Markdown Agent 文件和 Subagent 配置现在均以 `PiAgentSpecInput`、`PiAgentFileSpec`、`PiSubagentConfig` 命名，注册和执行统一进入 Pi catalog/session；兼容字段只用于输入/结果 DTO。
- 本轮统一 Agent Spec 保真：新增 `subagentConfigToPiSpec()` 和 `toPiSubagentSpec()`，Subagent、Markdown Agent、自定义 Agent 和 Worker 现在统一保留 `tools`、`skills`、`permissions`、`workflow`、`mode`、`dataPolicy`、`outputContract`、`timeoutMs` 等 Pi 执行元数据；`runPiPrompt()` 接收完整 `agentSpec`，不再把 Subagent 配置降级为仅 prompt/toolFilter 的匿名 Agent。新增自定义权限/workflow、Subagent 完整 Spec 和导出→导入 round-trip 回归，类型检查、迁移门禁和定向契约测试均通过（本轮 18/18）。
- 本轮补强 Session 隔离：`runPiPrompt()` 为缓存及持久化 Pi Session 记录 `UpUpAgentSpec` SHA-256 指纹；同一 `sessionKey` 切换工具白名单、权限、Profile 或 workflow 会明确拒绝，进程重启后仍保持该约束；同一 `sessionKey` 的并发首次初始化由锁合并为单一 Pi Session。新增内存复用、dispose/reopen 和并发初始化三条隔离回归；最新 Pi 合约套件 `107 pass / 0 fail`，Finance SDK `2 pass / 0 fail`。
- 本轮补强多 Agent Pi 真实性：`InProcessBackend` 不再关闭注册工具，worker 创建的 Pi Session 会加载受信任 Finance Package 和 Pi Tool；回归验证 `finance_evidence_quote` 出现在 worker 的实际工具面，并保留 WorkerPool 的同一 Session 合约。
- 本轮修复 Pi 提示词边界：`AgentSpec.systemPrompt` 改由 Pi `systemPromptOverride` 作为内容注入，避免提示词恰好等于目录路径时被 Pi 当成文件读取；新增目录路径提示词回归，Pi 合约套件升至 `108 pass / 0 fail`，Finance SDK 保持 `2 pass / 0 fail`。
- 本轮继续修复 Pi 提示词边界：`appendSystemPrompt` 同样改由 Pi `appendSystemPromptOverride` 作为内容注入，并增加目录路径作为 Agent 名称/身份提示的回归；`agent-session-factory.test.ts` 定向测试 `14 pass / 0 fail`，避免任意提示词内容被误判为文件路径。
- 本轮收口 Worker Factory：`InProcessBackend` 与 `WorkerPoolBackend` 统一调用 `src/multi-agent/backends/pi-worker.ts`，迁移门禁禁止重复创建 Worker Session/AgentSpec，避免多 Agent 执行路径漂移。
- 本轮补强 Worker Spec 保真：共享 Pi Worker Factory 在传入完整 `UpUpAgentSpec` 时保留其全部字段，并仅在原 Spec 未声明时补充请求级 `timeoutMs`，避免 Worker 超时配置在后端收口时丢失。
- 本轮新增迁移门禁：生产代码中的 `createAgentSession()` 只能存在于 `src/runtime/pi/agent-session-factory.ts`，InProcess worker 必须复用共享 `pi-worker.ts`，并禁止重复的 Pi Session Factory/Spec 创建路径；`check:pi-migration` 已通过。
- 本轮补强 A9 Pi Tool Contract：五个 Finance fixture 显式声明 `maxConcurrent`，统一在执行入口检查 `AbortSignal`；行情 fixture 保留 `onUpdate`/progress。新增回归验证五个工具通过 Pi `registerTool()` 执行时同时满足 safety、concurrency、progress、details、AbortSignal 语义。
- 本轮补强 A14 插件沙箱：`validatePluginSandbox()` 在 Pi Plugin Bridge 注册前校验 manifest `security.sandbox` 与 runtime 匹配（`bun/jiti→process`、`wasm→wasm`、`mcp→mcp`）；由于 Bun/Jiti 是进程内执行，`dangerous`/`critical` 或有金融影响的插件工具即使声明 `process` 也会被拒绝，必须使用 WASM/MCP 隔离；缺少 sandbox、声明 `none` 或 runtime/sandbox 不匹配同样拒绝。新增三条安全回归；普通只读插件保持兼容。
- 当前候选说明：上述 Agent Spec 保真改动发生在 Attempt 29 独立 Verifier 启动之后，因此 Attempt 29 的结果不能证明本轮变更；必须在该执行结束后按最新工作区重新派发独立语义验收，A1–A20 在独立结果返回前继续保持 `pending`。
- 当前候选说明（Attempt 31）：Attempt 31 派发后又加入了 InProcess worker 工具加载和 system prompt 内容边界修复；即使 Attempt 31 返回结果，也不能覆盖这些新增改动，必须在 Comet 允许的最新 continuation 下重新派发独立验收。
- 当前 Comet 验收状态（Attempt 33–35）：三次独立 Verifier execution 均从本机进程表消失，Comet 已记录 `execution_failure_count=3`、`status=blocked`、`next_action=retry-verifier`；没有收到 A1–A20 独立语义结果，A1–A20 必须继续保持 `pending`。这是独立验收基础设施阻塞，不是代码测试失败；恢复时必须使用 Comet continuation 提供的 `stateVersion=114` 和 `retry-verifier`。
- 已验证补充：`bun run typecheck` 已通过；Pi 定向合约套件为 `100 pass / 0 fail`，Finance SDK 为 `2 pass / 0 fail`，最新本地全量回归为 `4180 pass / 0 fail`（当前候选的 Runtime 快照为 `4179 pass / 0 fail`）；发行构建已实际生成 `dist/upup` 与 `dist/pi-finance-sdk`，并通过 `dist/upup --version` 烟测；Finance Extension 已改为自包含协议实现，不依赖工作区源码，且可通过受控 host bridge 注册生产金融合同，包门禁对此有静态检查；Paperclip 适配层、重复 `agent-core` DTO 包、`upup-agent` 和旧 bundled runner 已物理删除；交易 registry 的下单/撤单工具已提升为 `dangerous`，`invest-trade` 仅暴露 sandbox-shaped 工具并要求逐次审批。
- 本轮 Pi Package 接入：默认生产 Session 自动加载受信任且固定 `@upup/pi-finance-sdk@0.1.0`，同时加载其 Extension、Skill、Prompt、Workflow、Policy 和 Eval；Finance Extension 通过受控 host bridge 注册经 UpUp 权限审计的生产金融 Tool Contract，Runtime 仅在未加载 Finance Package 时使用内置 fallback；`UPUP_PI_PACKAGE_PATHS` 仍可显式替换包集合，但所有包继续要求 trusted paths、精确版本 pin 和资源审计。新增测试证明默认 Session 暴露 `finance_evidence_quote`，以及受信任 Package 能注册 host production tool 并保留 policy/evidence 审计。
- 已知限制：真实模型和真实外部金融数据仍未在本地 E2E 中调用；性能/恢复基准和生产依赖图仍需独立 verifier 复核。旧 `src/agent/` 目录已物理删除，投资 Profile、Subagent 注册、意图路由和生命周期能力均归入 `src/runtime/pi/`；历史测试中的顶层 `vi.mock` 已改为依赖注入，串行全量测试已覆盖删除后的生产树。
- 架构留档：`docs/architecture/pi5-runtime.md` 固化 Runtime/session、金融 evidence、Pi 生态、插件信任权限和多 Agent worker 数据流图。
- 历史 Comet 状态：曾恢复并派发 Attempt 31；该状态已被后续候选和执行故障记录 supersede，不能作为当前验收结论。
- 已知边界：`PiAgentRegistry`、Markdown loader 和 `PiSubagentConfig` 仅作为 Pi 输入/结果 DTO 与目录适配；所有执行委托 `PiBackgroundService`/`runPiPrompt`，不再存在旧 Agent loop。生产源码、锁文件和包清单均不含旧模型/Agent runtime。不得恢复旧 Agent loop。
- 本轮新增（State Port Pi-化 & 旧 Daemon Session 拆除）：
  - `src/state/index.ts` 不再调用 legacy `@upup/state` `SessionManager.listSessions` 收集 Session 元数据；StatePort `getSessionManager().listSessions` 直接代理到 `PiSessionService.list(cwd)` 并按 limit 切片，保证 CLI/SDK 看到的 Session 列表与 Pi JSONL 持久化完全一致。
  - 新增 `src/state/index.pi.test.ts`，断言 StatePort 在隔离 `.upup` 临时目录里通过 PiSessionService 创建/重命名/删除会话并按需切片，验证 `formatCost/formatTokens` 仍然可用。
  - `src/state/index.ts` 暴露 `__registerStatePort()`，允许测试在 `__resetAgentPorts()` 后重新注入 StatePort。
  - 物理删除 `src/daemon/session.ts` 与 `src/daemon/session.test.ts`；通过 `rg "daemon/session"` 确认生产代码没有任何 import 残留，`SessionManager`/`MemoryKVStore` 仅存于 `@upup/state` 的领域 Session 计时（CLI 当前命令会话时长），不再承担 Session 生命周期职责。
  - 复跑 `bun run check:pi-migration`、`bun run check:pi-packages`、`bun run typecheck` 全通过；State/runtime/session 多文件测试 305 例全部 0 fail；最新 Pi 合约套件 100/100 通过，Finance SDK 2/2 通过；最新本地全量回归 4180/4180 通过。
- 本轮新增（旧 Agent 工具链清理）：`scripts/check-scc.ts` 与 `src/code-archaeology/` 的分层规则、测试夹具和路径推断已迁移到 `src/runtime/pi/`；`scripts/test-upup-cli.sh` 的 Agent/投资测试改为 Pi runtime、Finance Adapter、Pi Agent Session 和 Pi Tool Contract；AppleScript 验证脚本不再读取已删除的 `src/agent/`。代码考古 `17/17`、SCC 审计 `0` 循环/层违规/深层动态 import/跨包违规，Pi 迁移门禁、Pi 包门禁和类型检查继续通过。
- 本轮新增（架构文档收口）：现行 `docs/ARCHITECTURE.md` 已重写为 Pi-native 架构，明确唯一 Runtime、AgentSpec、Pi Session、金融 Package、权限/evidence、Port、`/invest` 状态机和验证规则；不再把已删除的 `src/agent`、LangChain Runtime 或 Paperclip 描述为当前实现。
- 本轮新增（金融上下文与 Compaction 真实性）：`UpUpAgentSession` 新增 `setFinanceContext/getFinanceContext`，通过 Pi custom entry `upup_finance_context` 持久化 ticker、market、asOf、assumptions、risks、evidence 和 unfinishedPhases；Pi compaction extension 从同一结构化上下文生成 JSON 摘要，Session dispose/reopen 后可回读。新增 `src/runtime/pi/finance-context.test.ts`，2/2 通过；最新 Pi 合约套件为 `102 pass / 0 fail`，Finance SDK `2 pass / 0 fail`。
- 本轮新增（Pi 运行时门禁）：新增 `bun run check:pi-runtime`，可执行校验 Node `>=22.19.0`、当前 Bun 版本、`build:node` 的 `node22` 目标和 `build:pkg` 的 Node 22 targets，并接入 CI matrix；A3/A19 的运行时兼容性不再只依赖 manifest 文本。
- 本轮新增（依赖级 LangChain 防回归门禁）：`check:pi-migration` 现在扫描根及所有 `packages/*/package.json` 的 dependencies/devDependencies/peerDependencies/optionalDependencies，并检查 `bun.lock`，禁止 LangChain 包重新进入 workspace；同时将非法 Package manifest 作为明确门禁失败报告。该门禁首次运行发现并修复 `packages/memory/package.json` 的非法尾逗号，之后迁移门禁、包门禁、类型检查和构建均通过。
- 本轮新增（Pi Session metadata 完整投影）：`PiSessionService.list()` 现在从 Pi JSONL 的 `upup_session_metadata` custom entry 回读 `tag/tags`，StatePort 和 `/session` UI 可稳定显示标签；新增 StatePort 标签 round-trip 回归，避免 Session 列表只显示标题和时间而丢失投资工作流标签。
- 当前 Comet 验收状态（2026-09-13，iteration 12 / attempt 3）：Runtime 管理的旧候选检查已完成，但独立 Verifier operation 正在运行，尚未返回当前工作区 A1–A20 的逐项结论；Comet 状态为 `active`、`verificationResult=pending`。A1–A20 继续保持 `pending`，正式综合进度仍为 **50%**；这代表独立语义验收尚未完成，不等同于代码测试失败。
- 当前 Comet 恢复周期阻塞（2026-09-13）：恢复后的 Attempt 19、20、21 独立 Verifier execution 均从本机进程表消失，Comet 在第三次同类故障后再次进入 `status=blocked`、`execution_failure_count=3`；没有收到 A1–A20 独立语义结果，因此完成矩阵仍全部 `pending`。这是独立验收基础设施阻塞，不是本地实现或测试失败；恢复后应从 `retry-verifier` 继续。
- 当前 Comet 验收阻塞（2026-09-13）：Attempt 16、17、18 的独立 Verifier execution 均从本机进程表消失，Comet 在第三次同类故障后进入 `status=blocked`、`execution_failure_count=3`；没有收到任何 A1–A20 独立语义结果，因此 A1–A20 必须继续保持 `pending`。阻塞原因是 Verifier 基础设施不可用，不是代码测试失败；恢复后应从 `retry-verifier` 继续，不能把本地门禁替代独立验收。
- 当前 Comet 验收状态（Attempt 33–35，stateVersion `114`）：三次独立 Verifier execution 均从本机进程表消失，当前为 `phase=verify`、`status=blocked`、`next_action=retry-verifier`、`verificationResult=pending`、`execution_failure_count=3`；A1–A20 全部保持 `pending`。这是独立验收基础设施阻塞，不是代码测试失败；恢复时必须使用 Comet continuation 提供的最新 stateVersion/action 重新派发，不能把旧 Attempt 或本地结果冒充独立语义验收。
- 当前 Comet 验收状态（iteration 8，Attempt 1，stateVersion `120`）：A9 修复后已重新生成候选，Runtime 已执行全部检查并通过，当前等待独立 Verifier 返回 A1–A20 逐项结果；A1–A20 仍全部保持 `pending`，不能把 Runtime 检查替代独立语义验收。
- 当前 Comet 验收状态（iteration 11，Attempt 1，stateVersion `135`）：A12/A14 包来源、依赖锁定、插件安全审计和 Manifest scope 回归已完成；Runtime 检查与全量回归均通过，当前需要基于最新工作区重新生成候选后再等待独立 Verifier；A1–A20 仍全部保持 `pending`，不能把 Runtime 检查替代独立语义验收。
- 本轮新增 A14 安全审计：敏感插件工具必须声明 `networkDomains` 与 `credentialScopes`；每次 Pi 工具结果携带不含凭证值的 `securityAudit` 快照。来源 allowlist 已通过 `allowedSources`（包名→精确来源标识）强制校验。
- 本轮新增 A12/A14 包边界：Pi Package 必须声明 `pi.source`，部署策略按包名精确 allowlist 来源；dependencies、peerDependencies、optionalDependencies 统一要求 exact semver。
- 本轮新增 Package Catalog 注册边界：同名 Pi Package 从不同根目录重复注册会被拒绝，避免未审查路径覆盖已加载包；只有显式 `rollback()` 允许按同名包替换，并保留失败时恢复原记录。新增同名不同根目录回归，Package/Trust/Session 定向套件当前为 `34 pass / 0 fail`。
- 本轮补强 Package Catalog 供应链边界：运行时注册现在同时要求 Package 自身 `name@version` 出现在 `pinnedPackages`；显式 rollback 保留原有启用/禁用状态，避免回滚意外启用已禁用 Package。新增缺失自身版本 pin 和禁用状态回滚回归，Package Catalog 定向测试当前为 `9 pass / 0 fail`。
- 本轮新增 Package 运行时依赖图门禁：Catalog 区分 dev 与运行时依赖，并在 Pi Session 加载前解析 `@upup/*` 依赖的实际注册记录、exact version 和 enabled 状态；仅 pin 但未加载的内部依赖会拒绝启动，避免出现半加载金融生态。新增缺失依赖和完整依赖图回归，Pi Package/Session 定向套件当前为 `26 pass / 0 fail`。
- 本轮继续收紧 Package 供应链：跨 `dependencies`/`peerDependencies`/`optionalDependencies` 的 exact version 冲突、内部 `@upup/*` 循环依赖，以及已注册但 disabled 的依赖均在 Session 加载前拒绝；定向 Package/Session 套件新增到 `28 pass / 0 fail`。
- 本轮补齐 Package 回滚事务：`rollback()` 替换候选后先重新验证完整依赖图；若候选会造成缺失/禁用/版本错误/循环依赖，则恢复当前 Package 记录，避免“回滚成功但运行时依赖断裂”。新增回滚失败保留当前版本回归，Package/Session 定向套件当前为 `30 pass / 0 fail`。
- 本轮完成按需 Package 接线：`UpUpAgentSpec` 新增 `packages` allowlist，自动加载内部依赖闭包并关闭未选 Package；五个内置投资 Profile 默认声明 `@upup/pi-finance-sdk`，显式 `packages: []` 时不会偷偷启用旧 Finance fallback Extension。Custom Agent/Subagent 转换保留 Package 元数据，新增真实 Session 回归。
- 本轮验收接线：A12 现在直接覆盖 `agent-spec`、Package Catalog 和 Session Factory 的按需加载回归，避免只验证 Package 静态资源而遗漏 Agent 实际选择面。
- 本轮新增（金融 Package Host Contract）：新增 `src/runtime/pi/finance-host-contract.ts` 与同名 Pi SDK Host Contract，Finance Extension 不再读取无版本的宿主全局对象；宿主必须声明 `upup.pi.finance.host.v1`、精确 Package 身份 `@upup/pi-finance-sdk@0.1.0`、session ID 和 `tool-definitions` capability，跨 Session、错误包身份或未知 Contract 的请求返回空工具集且不调用宿主。新增 Host Contract、Package Extension 和并发 Session 回归，确保金融工具仍由 Pi Package 注册且生命周期隔离。
- 本轮新增（Pi 原生金融命令）：Finance Package manifest 声明并由 Extension 注册 `/invest`、`/dossier`、`/strategy`、`/risk-dashboard`、`/portfolio-review`；命令只将结构化投资意图发送到当前 Pi Session，状态机和金融工具仍由 Pi Workflow/Extension 提供，不再复制 `src/commands` 执行逻辑。Package Catalog 解析命令清单，门禁校验稳定命令集合。
- 本轮新增（跨平台稳定性与 CLI TUI fixture）：`createSkillWatcher` 在 `fs.watch` 成功但丢失平台事件时也通过 `SKILL.md` 快照轮询兜底，递归 fallback 同时维护子目录 watcher；通知工具支持显式 `NotificationStore`，消除测试/并发 Session 的模块级共享状态耦合；新增 `src/components/chat-log.pi.test.ts`，覆盖 Pi 金融 Tool 的查询、开始、进度、完成和答案渲染链。
- 本轮新增（10 个命名投研 E2E 场景）：新增 `src/runtime/pi/investment-scenarios.pi.test.ts`，默认离线且禁止真实下单/外部网络，真实执行 `invest-cn-stock-readonly`、`invest-us-stock-readonly`、`invest-fund-portfolio-readonly`、`invest-dcf-with-evidence`、`invest-risk-dashboard`、`invest-backtest`、`invest-session-resume`、`invest-subagent-parallel`、`invest-gateway-message`、`invest-cron-run`；覆盖跨市场金融证据、Session 恢复、并行 Pi worker、Gateway 和 Cron 投递。
- 本轮新增安全边界：Pi Package manifest 的名称/版本必须合法且版本为 exact semver；Extension/Skill/Prompt/Workflow/Policy/Eval 资源必须是非空声明、位于 Package 根目录内且不能重复，防止路径穿越和资源覆盖；新增 Package Catalog 负向回归覆盖非 exact 版本、资源路径逃逸、空声明和重复声明。定向安全回归 `26 pass / 0 fail`。
- 本轮补强依赖供应链边界：Package manifest 中的 `dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies` 每个依赖都必须在 `pinnedPackages` 中以相同 exact semver 显式锁定；缺失或版本不一致时在 Pi Extension 加载前拒绝。新增缺失依赖 pin 负向回归，Package/Session/Trust 定向套件 `33 pass / 0 fail`。
- 本轮补强外围入口可靠性：日志目录被外部删除后，Pi Daemon/多 Agent/工具错误路径会在每次写入前自动恢复目录；新增 logger 生命周期回归 `1 pass / 0 fail`，消除全量运行中观察到的 `ENOENT` 噪声。
- 本轮最新验证：Pi 迁移/包/runtime 三项门禁、类型检查、Pi 合约 `154 pass / 0 fail`、Finance SDK `5 pass / 0 fail`、插件/信任/包/沙箱/依赖图/按需 Package/命令冲突/延迟选择定向回归 `43 pass / 0 fail`、Finance Host Contract 定向套件 `7 pass / 0 fail`、Manifest scope 回归 `2 pass / 0 fail` 均通过；完整串行回归 `4245 pass / 0 fail`（`14286 assertions`、`294 files`）；`bun run verify:pi5` A1–A20 `20/20 PASS`；`bun run benchmark:pi5` 本轮真实基准通过（10 次金融工具调用：启动 `48.31ms`、批量调用 `0.25ms`、恢复 `24.84ms`、Session JSONL `455 bytes`，均低于 `500/1000/500ms` 门槛）；发行构建和 `git diff --check` 均通过。
- 本轮补强 AgentSpec Package 边界：当 `spec.packages` 声明非空 allowlist、但没有任何 `piPackagePaths` 或项目/内置 Package 配置时，`PiAgentSessionFactory` 现在显式拒绝创建会话，不再静默启动缺少领域能力的 Session；新增回归后定向 Agent/Package/Session 套件为 `41 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮补强 Finance Pi Extension 宿主边界：`upup.pi.finance.host.v1` 现在同时校验精确 Package 身份 `@upup/pi-finance-sdk@0.1.0`、Session 身份和 capability；合同、包名、版本、Session 或 capability 任一不匹配都返回空能力且不调用宿主 Provider，防止第三方 Extension 冒用内置金融包获取生产工具。新增 Runtime/SDK 身份错配回归，相关定向套件 `23 pass / 0 fail`，类型检查、Package 门禁和 `git diff --check` 通过。
- 本轮补强 Pi Package 命令生态边界：启用 Package 之间不得声明同名 slash command；Catalog 在 register、enable 和 allowlist select 阶段检查命令所有权，冲突时事务性恢复旧状态，避免加载顺序导致命令覆盖。新增重复命令负向回归，Package/Session 定向套件 `34 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮修正按需 Package 与命令冲突的组合语义：AgentSpec 使用显式 Package allowlist 时，候选 Package 注册允许延迟命令冲突检查，最终 `select()` 只对 enabled 闭包强制校验并在冲突时事务性恢复；未选中的同名命令不再阻塞最小 Session。新增延迟选择回归，Package/Session 定向套件 `35 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮新增旧 Plugin Loader 退出门禁：生产源码不得调用 `loadAndStartPlugin`、`stopAndUnloadPlugin`、`registerAllAdapters` 或 `discoverPlugins` 形成第二套执行路径；旧插件管理/数据适配器仅保留为兼容边界，真正进入 Agent 的插件必须经过 `src/runtime/pi/plugin-adapter.ts` 的 Pi 注册、allowlist、权限、sandbox 和 evidence 审计。新增生产入口契约与迁移静态检查，防止后续绕过 Pi Runtime。
- 本轮新增 Pi Package Extension 完整性门禁：`PiPackageCatalog.validateExtensionLoad()` 在 Session 创建前检查每个已启用 Package 的 Extension 是否实际加载、是否产生加载错误，以及 manifest 声明的每个 slash command 是否由 Extension 真正注册；任一不满足即阻断 Session，避免“资源已信任但能力半加载”的不一致状态。新增第三方项目 `.pi/settings.json` Package 成功加载与命令缺失失败回归，并修复内置 Package 与显式 Extension 路径重复加载导致的工具冲突。
- 本轮新增（A1–A20 仓库内语义验收）：新增 `scripts/verify-pi5.ts` 与 `bun run verify:pi5`，逐项绑定 Runtime 入口、旧核心退出、Pi Agent loop、Session、金融 Tool/evidence、投资 Profile、Pi Package、权限、插件安全、迁移、`/invest`、多 Agent、外围入口、门禁和架构文档；最新结果为 **20/20 PASS**。该结果证明当前工作区的 A1–A20 本地语义契约全部满足，但不替代 Comet 独立 Verifier。
- 本轮新增（项目级 Pi Package 配置）：`src/runtime/pi/package-config.ts` 读取项目 `.pi/settings.json` 的 `packages`，但只接受项目根目录内的本地路径；`upupPiPackages.trustedPaths`、`pinnedPackages`、`allowedSources` 均为必填且严格校验，远程 npm/git/HTTP 源和路径穿越直接拒绝；`PiAgentSessionFactory` 与 `runPiPrompt` 自动使用该受信配置。新增 6 个配置回归，证明项目级包配置不会绕过 Pi/UpUp 信任边界。




### A1–A20 实现证据矩阵（2026-09-13 审计）

> 每项验收的本地证据可在 `bun run check:pi-migration` / `bun run check:pi-packages` / `bun run test:pi-contracts` / `bun test` 中复现；Comet verifier 仍为 `phase=verify / verificationResult=pending`、A1–A20 `result=pending`，待独立 verifier 给出最终结论。当前正式综合进度为 **50%**，其中仓库实现/本地验证 **100%**，独立语义验收 **0%**。

| ID | 主题 | 实施证据 | 本地验证命令 | 状态（本地 / 独立） |
|---|---|---|---|---|
| A1 | Runtime 唯一性 | CLI、Pi-native `print`、stdio、SDK、Gateway、Cron、Daemon、Bridge、Eval 均通过 `runtime/pi`；无第二套 Agent loop | `src/runtime/pi/production-entry-contract.test.ts` + `src/print.test.ts` | ✅ / ⏳ |
| A2 | 旧核心退出 | `src/agent/`、`src/model/llm.ts`、`src/runtime/pi/message-compat.ts` 全部物理删除；`callLlmWithMessages` 仅在测试断言中保留 | `bun run check:pi-migration` | ✅ / ⏳ |
| A3 | Pi 版本与运行时 | 7 个 Pi 包均 `0.84.3`；`engines.node = ">=22.19.0"`；`build:pkg` 走 `node22-*`；`check:pi-runtime` 实际校验 Node/Bun 与 Node22 构建目标 | `bun run check:pi-migration` + `bun run check:pi-runtime` | ✅ / ⏳ |
| A4 | Runtime Adapter | `src/runtime/pi/` 57 个 `.ts` 文件（Factory / Runner / SessionService / BackgroundService / ToolAdapter / Subagent / PackageCatalog / InvestmentWorkflow / Permissions / AgentCatalog） | `src/runtime/pi/agent-session-factory.test.ts` | ✅ / ⏳ |
| A5 | Agent Spec | `UpUpAgentSpec` 出现在 14 个文件（runner / tool-contract / registry / agent-catalog / plugin-adapter / …） | `src/runtime/pi/agent-spec.test.ts` | ✅ / ⏳ |
| A6 | Pi Agent loop | `pi-fixture.test.ts`（198 行）覆盖多轮 streaming、多个 Tool Call、steer/follow-up、abort、timeout、error、final answer；`event-stream.test.ts`（3 tests）覆盖 `streamPiAgent` 公共 API 的 done/stream_progress 映射；`runner.test.ts`（7 tests）覆盖 `toPiSessionId` / `isPiSessionRunning` / `disposePiSessions` / `runPiPrompt` end-to-end | `bun test src/runtime/pi/pi-fixture.test.ts src/runtime/pi/event-stream.test.ts src/runtime/pi/runner.test.ts` | ✅ / ⏳ |
| A7 | Pi Model protocol | `@earendil-works/pi-ai` 0.84.3 锁定；生产代码 `rg "langchain"` 0 命中 | `bun run check:pi-migration` | ✅ / ⏳ |
| A8 | Session/Compaction | `PiSessionService`：list / create / resume / get / fork / compact / rename / tag / remove / export / dispose 全部覆盖；`reliability.test.ts` 验证 crash recovery；`upup_finance_context` 保留 ticker、market、asOf、assumptions、risks、evidence、unfinishedPhases 并在恢复后回读 | `bun test src/runtime/pi/session-service.test.ts src/runtime/pi/reliability.test.ts src/runtime/pi/finance-context.test.ts` | ✅ / ⏳ |
| A9 | Tool Adapter | `finance-fixtures.ts`：`fixture_market_quote` / `fixture_fundamentals` / `fixture_news` / `fixture_search` / `fixture_trading_day`；携带 `safetyLevel` / `parameters` / `hasFinancialImpact` / `auditId` / `retrievedAt` / `dataFreshness` | `src/extensions/upup/index.test.ts` | ✅ / ⏳ |
| A10 | 金融证据 | 工具结果统一带 `evidence[].id/source/retrievedAt/asOf/query`、`dataFreshness`、`auditId`；`secrets` 走 `production-finance-contract.test.ts` 断言不进入结果 | `src/runtime/pi/production-finance-contract.test.ts` | ✅ / ⏳ |
| A11 | 投资 Profiles | `agent-spec.ts`：`invest-explore` / `invest-plan` / `invest-risk` / `invest-trade` / `invest-review` 全部走 Pi Session 与工具 allowlist | `src/runtime/pi/agent-spec.test.ts` | ✅ / ⏳ |
| A12 | Pi 生态 | `packages/pi-finance-sdk` 6 类资源 + 5 个 Pi `registerTool()` 金融 Extension + 5 个 Pi 原生 `registerCommand()` 命令；版本化 `upup.pi.finance.host.v1` Host Contract 提供 session/capability 隔离；Package slash command 冲突在 Catalog 中事务性拒绝；Extension 加载失败或 manifest 命令未实际注册时在 Session 创建前硬失败；默认受信任固定包和项目 `.pi/settings.json` 包配置自动加载；`pi.source` 按包名 `allowedSources` 精确 allowlist；包自身及其 dependencies、peer/optional/dev dependencies 必须在 `pinnedPackages` 中显式以相同 exact semver 锁定；新增金融能力不修改 Agent loop | `bun run check:pi-packages` + `bun --cwd packages/pi-finance-sdk test` + `bun test src/runtime/pi/finance-host-contract.test.ts src/runtime/pi/package-catalog.test.ts src/runtime/pi/package-config.test.ts src/runtime/pi/agent-session-factory.test.ts` | ✅ / ⏳ |
| A13 | 金融权限 | `safe` / `warning` / `dangerous` / `critical` 四级；critical 走 `production-finance-contract.test.ts` 越权拒绝；`tool-contract.test.ts` 验证只读策略 | `src/runtime/pi/production-finance-contract.test.ts src/runtime/pi/tool-contract.test.ts` | ✅ / ⏳ |
| A14 | 插件安全 | `plugin-trust.ts` 含 path / hash / package pin / source allowlist 校验；敏感工具强制 WASM/MCP 隔离、manifest `networkDomains`/`credentialScopes` 声明；Pi 结果携带脱敏 `securityAudit`；回归覆盖符号链接、disable、rollback、sandbox mismatch、进程内敏感工具、来源和安全 scope；旧 standalone bundle 已删除 | `bun test src/runtime/pi/plugin-trust.test.ts src/runtime/pi/plugin-adapter.test.ts src/runtime/pi/package-catalog.test.ts` + `bun run check:pi-migration` | ✅ / ⏳ |
| A15 | Session 迁移 | `src/session/migrate-to-pi.ts` 支持 `--dry-run` / `--backup-dir` / hash / report；原文件只读；`pi-migration.test.ts` 验证 Pi 回读 | `bun test src/session/pi-migration.test.ts` | ✅ / ⏳ |
| A16 | /invest 5 阶段 | `investment-workflow.ts` 5 阶段（research / valuation / backtest / trade / review）+ 状态机（detect / plan / paused / [*]）；checkpoint 走 Pi custom entry `upup-investment-workflow`；`investment-workflow.test.ts` 覆盖 pause/resume/fork/idempotency；新增 10 个命名投研 E2E 场景覆盖金融、恢复和外围入口 | `bun test src/runtime/pi/investment-workflow.test.ts src/runtime/pi/investment-scenarios.pi.test.ts` | ✅ / ⏳ |
| A17 | 多 Agent | `subagent.ts` / `subagent-runner.ts` / `subagent-types.ts` 委托 `PiBackgroundService` + `runPiPrompt`；`coordinator.ts` 仅负责分解 / spawn / 聚合 / 生命周期 | `src/multi-agent/backends/backend.test.ts` | ✅ / ⏳ |
| A18 | 外围入口 | CLI / Pi-native print / stdio / Gateway / Cron / Daemon / Bridge / SDK / Eval 全部走 `streamPiAgent` / `runPiPrompt` / `PiSessionService` / `PiBackgroundService`；`chat-log.pi.test.ts` 覆盖 CLI TUI 渲染；10 个命名场景覆盖 Gateway、Cron、并行 worker 和 Session 恢复 | `src/runtime/pi/production-entry-contract.test.ts` + `src/print.test.ts` + `src/runtime/pi/event-stream.test.ts` + `src/runtime/pi/runner.test.ts` + `src/components/chat-log.pi.test.ts` + `src/runtime/pi/investment-scenarios.pi.test.ts` | ✅ / ⏳ |
| A19 | 验证门禁 | `check:pi-migration` / `check:pi-packages` / `check:pi-runtime` / `typecheck` / `benchmark:pi5` / `test:pi-contracts` / `verify:pi5` / `bun test` 全部可重复；新增五工具/五命令 Package Extension、Host Contract、Package Catalog manifest、Extension 完整性、print/package-config 回归与 faux Pi fixture | 见 `package.json` scripts | ✅ / ⏳ |
| A20 | 架构留档 | `docs/architecture/` 6 份（`pi5-runtime.md` / `plugin-ecosystem.md` / `finance-dataflow.md` / `session-lifecycle.md` / `multi-agent-dataflow.md` / `invest-workflow.md`），覆盖 Runtime / Plugin / 金融数据流 / Session 生命周期 / Multi-Agent / /invest 状态机 | `wc -l docs/architecture/*.md` | ✅ / ⏳ |

> 综合实施进度：**20/20 = 100% 实施**；**Runtime 定向自动验证：100% 通过**（迁移门禁、包门禁、运行时门禁、类型检查、Pi 合约 156+5、插件/信任/包/沙箱/依赖图/按需 Package/命令冲突/延迟选择/Extension 完整性定向回归、Finance Host Contract、Manifest scope、logger 生命周期、CLI TUI 渲染 fixture、`benchmark:pi5` 性能/恢复基准、发行构建和 `git diff --check` 均通过）；**Runtime 全量回归：4247/4247 通过**（`14289 assertions`、`294 files`）；**仓库内 A1–A20 语义验收：20/20 通过**（`bun run verify:pi5`）；**Comet 独立语义验证：0/20**（当前 `phase=verify`、`verificationResult=pending`，A1–A20 尚未返回逐项最终结论，不能将本地结果替代独立验收）。按“实现完成 + 独立验证”口径，当前整体正式进度仍为 **50%（实现 100%，正式独立验收 0%）**；若按当前代码和可重复本地证据衡量，工程实现、本地语义验收和全量回归均为 **100%**。


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
- [x] Session tree/fork/compact/resume/export 已有 Pi runtime/stdio/SDK 契约覆盖；`src/components/chat-log.pi.test.ts` 已补齐 Pi 金融 Tool 事件到 CLI TUI 的查询、进度、完成和答案渲染 fixture。
- [x] Gateway、Cron、Daemon、Bridge、stdio、SDK 全部通过独立契约测试证明使用 Pi-backed runtime。
- [x] stdio `session/create|resume|get|messages|update|end` 已使用 `PiSessionService` 和 Pi JSONL。
- [x] Daemon background task 与 Agent tool background 分支已使用 `PiBackgroundService`。
- [x] 运行时、工具、权限、数据 freshness、报告引用和性能门禁全部通过（`src/runtime/pi/performance.test.ts`、`bun run benchmark:pi5`、Pi contract suite、full test suite）；基准输出包含启动、工具批量调用、Session JSONL 持久化和恢复耗时，可重复验证阈值。

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


### UpUp 架构留档（docs/architecture/）

- `docs/architecture/pi5-runtime.md` — Runtime / Session 主流程图、金融 evidence 数据流、Pi 生态分层、信任/权限边界、Multi-Agent worker 生命周期。
- `docs/architecture/plugin-ecosystem.md` — Pi Package / Extension / Skill / Prompt 分层、信任流水线、Skill/Tool/Workflow 职责矩阵、Pinning 规则、失败模式。
- `docs/architecture/finance-dataflow.md` — 端到端金融数据流图、Evidence / Freshness 契约、`/invest` 五阶段状态图、Audit / Report 边界、失败隔离。
- `docs/architecture/session-lifecycle.md` — Session 写/读/迁移路径、`PiSessionService` 操作矩阵、并发写策略、Crash / Recovery 不变量、Legacy → Pi 迁移规则。
- `docs/architecture/multi-agent-dataflow.md` — Coordinator 任务分解图、Worker 生命周期时序、Tool allowlist / 隔离、并发、聚合与 Reviewer、失败抑制。
- `docs/architecture/invest-workflow.md` — `/invest` 状态机（research / valuation / backtest / trade / review + detect / plan / paused / [*]）、phase 数据结构、idempotency、pause / resume / fork、audit / evidence 边界、failure containment。

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
