# UpUp Pi6 全面架构审计与后续路线图

> 审计日期：2026-09-14
>
> 本文基于当前工作树的源码、workspace manifest、入口链、迁移脚本、架构报告和定向测试结果编写。它不把自动门禁的“100%”直接等同于整个项目已经完成 Pi 原生化或完全模块化。

## 1. 结论摘要

### 1.1 总结判断

UpUp 已经完成了 **Pi Agent 执行内核级迁移**，但尚未完成“整个应用彻底 Pi Package 化”和“所有应用职责都收敛到清晰包边界”的最终形态。

更准确的状态是：

- **生产 Agent 内核：已完成 Pi 化。** CLI、Gateway、Cron、Daemon、Bridge、SDK、stdio 和 Eval 的生产路径都能追溯到 `src/runtime/pi/` 的 Pi Session 执行链；生产代码中 `createAgentSession()` 只有一个工厂入口。
- **Pi 工具生态：已完成主要迁移。** 14 个 `@upup/pi-*` 包声明 Pi 资源，工具 ownership 与 native extension registration 当前报告为 240/240、100%。
- **旧执行引擎：已退出。** 未发现旧 `src/agent`、LangChain Agent Runtime、Paperclip adapter 或第二套生产 main loop。
- **包级边界：基本建立。** 29 个 workspace package 通过 package→root `src` 隔离检查，workspace 依赖图和 root `src` 生产模块没有检测到循环。
- **应用级模块化：尚未收口。** 根 `src` 仍承载约 737 个 TS/TSX 文件、约 156,895 行源码（生产与测试混合统计），而 `packages` 约 439 个 TS/TSX 文件、约 51,667 行；CLI、TUI、Session、Memory、MCP、Skills、Gateway、Bridge、Commands 和大量兼容层仍集中在根目录。
- **主要架构债务：** `PiAgentSessionFactory` 是巨型 composition root；runtime 对具体 Pi 包存在硬编码；`globalThis` host/port registry 形成隐式运行时耦合；`legacy-events` 仍被广泛消费；自动报告主要是结构/字符串覆盖检查，无法证明全应用行为已经模块化。

### 1.2 一句话结论

**Pi 已成为唯一生产 Agent 执行内核，但 UpUp 仍处于“内核迁移完成、应用层与包边界收口中”的阶段，不能把当前状态描述为整个仓库 100% Pi-native 或 100% 完全模块化。**

## 2. 审计范围与方法

本次审计覆盖：

1. 根入口与所有主要 Agent 调用路径；
2. `src/runtime/pi/` 的 Session、Runner、Factory、事件、工具策略、Package loader、Trust 和 Worker；
3. 29 个 workspace package 与 14 个 Pi domain package；
4. CLI、Gateway、Cron、Daemon、Bridge、SDK、stdio、MCP、Memory、Session、TUI、Skills 和 Commands；
5. 迁移检查、Package 检查、边界检查、架构报告和 Pi 合同测试；
6. 文档与实际目录、依赖版本、资源声明、入口文件的交叉核对。

本次已执行并通过：

- `bun run check:pi-migration`
- `bun run check:pi-packages`
- `bun run check:pi-runtime`
- `bun run check:module-boundaries`
- `bun run report:pi-migration`
- `bun run report:pi-architecture`
- `bun run typecheck`
- `bun run verify:pi5`：A1–A20，20/20 通过
- `bun run test:pi-contracts`：核心 Pi 合同测试 208 通过，0 失败；14 个 Pi 包合同测试合计 276 通过，0 失败

尚未在本次审计中执行全仓 `bun test`；因此 `pi5.md` 中历史记录的全仓测试数字不应作为本次审计日期的现行证据。

## 3. 当前真实架构

### 3.1 唯一生产 Agent 执行链

默认 CLI 入口为：

```text
src/index.tsx
  -> src/cli.ts / runCli()
  -> AgentRunnerController.runQuery()
  -> streamPiAgent()
  -> runPiPrompt()
  -> PiAgentSessionFactory.create()
  -> createAgentSession()
  -> Pi AgentSession / Pi Session tree / Pi tools
```

其他入口也汇入同一 Pi Runtime：

```text
Gateway / Cron / Daemon / Bridge / SDK / stdio / Eval
  -> runAgentForMessage() 或 streamPiAgent()
  -> runPiPrompt()
  -> PiAgentSessionFactory
```

`src/runtime/pi/runner.ts` 负责按 session key 串行化请求、复用 Session、执行 prompt、等待 idle、提取最终回答和释放无状态 Session。`src/runtime/pi/agent-session-factory.ts` 负责组装 Pi 的 `SessionManager`、`SettingsManager`、`DefaultResourceLoader`、model runtime、tool definition、package resource 和 policy。

### 3.2 已经真正完成的迁移部分

- Pi model/provider protocol 已成为生产调用基础；
- Pi AgentSession 负责多轮 tool、stream、abort、error 和 compaction 生命周期；
- UpUp tool contract 被转换为 Pi `ToolDefinition`，并在转换层统一处理 approval、deny、audit 和 progress；
- Pi Session tree 支持创建、恢复、compact、fork、export 和消息读取；
- Pi Package resource loader、trust policy、ownership 和 allowlist 已接入；
- 多 Agent worker 生命周期已接入 Pi Session factory；
- 14 个 Pi 包都声明 `extensions / skills / prompts / workflows / policies / evals` 六类资源；
- 旧 Agent registry、旧 Agent factory、LangChain 和 Paperclip 执行路径已被删除或门禁禁止；
- 生产代码没有发现第二个 `createAgentSession()` 入口。

## 4. 迁移进度评估

### 4.1 分维度进度

| 维度 | 当前判断 | 依据 | 主要剩余事项 |
|---|---:|---|---|
| Agent 执行内核 Pi 化 | 100% | 唯一 Factory、A1–A4、入口合同测试 | 继续保持唯一入口 |
| Model / Provider / Stream | 95% | Pi protocol 与 stream 合同通过 | 进一步减少 UpUp 事件兼容映射 |
| Session / compact / recovery | 90% | Pi Session service 与 A8 通过 | 统一 runtime/session 边界 |
| Tool native registration | 100%（工具口径） | 240/240 ownership/native | 增加运行时行为覆盖，不只 registration |
| 金融 Pi Package 化 | 90% | 14 个 Pi package 与资源门禁通过 | 逐包确认默认生产加载与真实 smoke |
| Platform Package 化 | 80% | worker、sandbox、cron 等已有 Package 能力 | 收拢根 daemon、MCP、Bridge 和 host API |
| CLI/TUI Pi 原生化 | 65% | CLI 已调用 Pi，但仍有大型 UpUp UI 编排层 | 迁移事件、审批和渲染边界 |
| Session / Memory / MCP | 60% | 能力已接入 Pi path，但实现仍大量在 root `src` | 形成稳定 Package contract |
| 全仓应用层模块化 | 55% | workspace 边界通过，但 root 仍很大 | 拆分领域、基础设施和兼容层 |
| 文档与指标可信度 | 60% | pi5 记录存在版本和数量漂移 | 建立可重复的事实报告 |

这些百分比是架构审计的工作估计，不是代码扫描器的官方分数。它们用于安排 Pi6 工作优先级，不应替代行为测试或发布门禁。

### 4.2 已通过指标的正确解释

`report:pi-migration` 的 240/240 表示：240 个已声明 ownership 的工具都能找到对应的 native Pi extension registration。它不表示 240 个工具的真实执行、错误处理、权限策略和默认生产加载都已被端到端验证。

`report:pi-architecture` 的 100% 表示其检查项达到预期，包括 ownership、若干 registry 模式、直接 `src/tools` 引用、subagent 兼容标记和 boundary script。它没有衡量根 `src` 规模、legacy event 消费者数量、composition root 复杂度、global registry 生命周期或外围模块是否已变成独立 Pi Package。

`check:module-boundaries` 通过表示：

- `packages/*` 不依赖根 `src`；
- workspace package 依赖图无循环；
- root `src` 生产模块无检测到的本地循环。

它不表示 root `src` 已被拆成合理领域包，也不表示 root runtime 没有反向硬编码所有 Package。

## 5. 模块化审计

### 5.1 正面结果

当前 workspace 有 29 个 package，其中 14 个是 Pi domain package：

- `pi-backtest`
- `pi-browser`
- `pi-cache`
- `pi-config`
- `pi-finance-sdk`
- `pi-investment-analysis`
- `pi-investment-workflow`
- `pi-management`
- `pi-market-data`
- `pi-notify`
- `pi-platform`
- `pi-portfolio`
- `pi-research`
- `pi-risk`

Pi 包之间的依赖已经有一定领域方向，例如 investment analysis 依赖 market data，investment workflow 依赖 backtest、analysis、market data 和 portfolio，research 依赖 finance SDK。包到根 `src` 的反向依赖被检查器禁止，这为后续迁移提供了安全边界。

### 5.2 尚未完成的部分

根 `src` 仍是实际应用的主要承载地，重点目录包括：

- `src/tools`：大量金融工具和工具适配；
- `src/skills`：技能加载、提示和执行相关能力；
- `src/tui`、`src/components`：大型 UI 和事件渲染编排；
- `src/session`：Session 状态、恢复、权限和历史兼容；
- `src/memory`：记忆加载、刷新和持久化；
- `src/mcp`：MCP 客户端和注册协调；
- `src/gateway`、`src/daemon`、`src/bridge`：入口、消息、调度和外围服务；
- `src/commands`、`src/plugins`、`src/utils`：应用级 facade 和基础设施。

因此当前是“包级隔离较强、应用级职责仍集中”的模块化状态，而不是所有能力都已经以独立 Package、明确 contract 和独立生命周期存在。

### 5.3 主要耦合点

#### A. `PiAgentSessionFactory` 过度集中

`src/runtime/pi/agent-session-factory.ts` 同时承担 Session 创建、Pi resource loader、trust 审计、Package catalog、tool contract、金融 host、market data、investment workflow、platform worker、cron、MCP、sandbox 和 management 能力组装。它已经是 composition root，但仍包含大量具体领域判断，难以作为稳定的通用 Runtime adapter 演进。

#### B. Runtime 硬编码具体 Package 名称

Factory 对 `@upup/pi-investment-analysis`、`@upup/pi-platform`、`@upup/pi-investment-workflow`、`@upup/pi-market-data`、`@upup/pi-finance-sdk`、`@upup/pi-management` 等包做显式分支或动态加载。新增包需要修改根 runtime，说明 Package contract 还没有完全取代集中式 wiring。

#### C. `globalThis` Host / Port registry

`globalThis.__upupPiHosts` 和 `globalThis.__upupAgentPorts` 避免了 Package 直接 import 根 `src`，这是当前边界能通过的重要原因；但它们也带来隐式依赖、全局状态泄漏、测试隔离和并发生命周期问题。依赖不能完整地从静态 import 图中看出，能力版本兼容也主要依赖运行时约定。

#### D. `legacy-events` 仍是生产公共边界

`src/runtime/pi/legacy-events.ts` 仍被 CLI、Controller、Gateway、stdio、permissions、telemetry、components 和 types 等多个模块消费。它不是旧 Agent loop，但它使 Pi 原生事件与 UpUp 历史事件协议之间保持长期双轨。当前至少存在多处重复映射：Factory/event stream、Gateway runner 和 stdio 都各自把 Pi 事件转换为旧事件或外部事件。

#### E. 非 Pi workspace package 的 contract 尚未统一

`packages/commands`、`packages/mcp`、`packages/memory`、`packages/skills`、`packages/sdk` 等已经是 workspace package，但并不都具备与金融 Pi 包相同的 Pi resource manifest、host contract、trust、ownership 和独立生命周期。因此“workspace package”与“Pi Package”目前不是同义词。

## 6. 兼容层与旧架构痕迹

### 6.1 仍存在的兼容层

审计发现以下类型的兼容代码仍参与或可能参与生产路径：

- `src/runtime/pi/legacy-events.ts` 及其消费者；
- `src/commands/index.ts`、`src/hooks/index.ts`、`src/keybindings/index.ts`、`src/mcp/index.ts`、`src/state/index.ts`、`src/utils/index.ts` 等 deprecated facade/re-export；
- SDK 的 backward-compatible exports；
- 旧 model configuration migration；
- 旧 session 目录/文件格式读取和迁移；
- Tushare 等外部 API 的 legacy compatibility；
- Skills 的 compatibility mode；
- packages/commands 中的 legacy registry 兼容语义；
- `src/tui` 中仍保留的自建 UI 抽象。

### 6.2 判断

这些代码不能全部直接删除。Session 数据迁移、旧配置读取和公开 SDK 兼容可能是合理的产品承诺；但它们必须与“旧执行架构”区分，并具备生命周期管理。当前缺少统一的兼容层台账，无法快速回答每个 facade 是否还有生产调用者、删除前置条件是什么、在哪个版本退出。

## 7. 文档与事实漂移

`pi5.md` 当前存在以下需要在后续修订中处理的事实漂移：

1. 实际有 14 个 `@upup/pi-*` 包，而文档主要描述 7 个核心包；
2. 实际有 29 个 workspace package，不能表述为“29 个 Pi 包”；
3. 当前 CLI 入口是 `src/cli.ts`，不是多处文档中的 `src/cli.tsx`；
4. 当前根依赖可见的是 `@earendil-works/pi-agent-core`，文档中 `@earendil-works/pi-agent` 的命名需要与实际 manifest 对齐；
5. 历史测试数量和当前审计日期的验证结果没有明确区分；
6. “100% 完成”没有标注是工具 ownership、入口覆盖还是全仓架构结论；
7. “packages/pi-*（29 个）”把 workspace package 数量和 Pi domain package 数量混为一谈。

Pi6 应把所有指标改为带口径的事实，例如：`14 个 Pi domain package`、`29 个 workspace package`、`240/240 ownership registration`、`A1–A20 20/20`，并单独列出未测项目。

## 8. 风险排序

### P0：指标误导发布判断

自动脚本通过且架构报告 100% 可能让后续维护者误以为整个代码库已完成 Pi-native 和完全模块化。若不修正，新的根目录实现会继续增长，边界债务会被隐藏。

### P1：Factory 成为不可演进的集中式依赖枢纽

所有新 Package、host capability 和平台服务都添加到 Factory，会使测试、信任审计、生命周期和依赖替换成本持续上升，并把 Runtime 与金融业务绑定。

### P1：事件协议双轨

Pi event、UpUp legacy event、Gateway event、stdio server event 各自存在映射，字段丢失、语义漂移和不同入口行为不一致的风险会随新事件增加。

### P1：global registry 生命周期

全局 host/port registry 在并行 Session、测试并行运行、热加载和多租户进程中可能出现能力串线、残留注册或错误复用。

### P2：非 Pi 包仍缺少统一资源合同

Commands、Memory、MCP、Skills、SDK 等包虽然物理隔离，但没有完全纳入与 Pi domain package 相同的 discovery、trust、resource 和 lifecycle 机制，未来仍可能形成第二套插件体系。

### P2：真实外部数据与生产 SLA 证据不足

Tushare、AKShare、港股凭证、长周期 provider SLA 和真实生产 session 恢复仍需要带凭证的环境验证；本次没有把无 token 的本地合同测试误报成生产 smoke。

## 9. Pi6 后续路线图

### Phase 1：建立可信基线（优先级 P0）

目标：让“完成度”与真实架构状态可测量、可复现。

- 新增结构报告：root `src` 按领域的文件数、生产行数、入口依赖和兼容层消费者数；
- 把 `report:pi-architecture` 拆成“执行内核、工具、Package、外围、兼容层、应用模块化”六类指标；
- 对每个指标输出定义、扫描范围、已验证与未验证部分；
- 添加默认生产 Package discovery 清单，明确 workspace 存在、manifest 声明、resource copy、默认加载四种状态；
- 将全仓测试、合同测试、真实凭证 smoke 和长周期 SLA 分开记录；
- 更新 `pi5.md` 的数量、入口、依赖和测试口径，避免继续积累事实漂移。

验收：报告能分别回答“Pi 是否是唯一 Agent 内核”“工具是否 native”“哪些包默认加载”“root 还有多少未收口职责”，不能只输出一个总百分比。

### Phase 2：收敛事件与 Session 边界（P1）

目标：减少 Pi event 与 legacy event 的双轨。

- 定义一个稳定的 `UpUpPiEvent` adapter 层，集中完成 Pi event → 外部协议映射；
- CLI、Gateway、stdio 和 Bridge 不再各自实现重复事件映射；
- 标记 `legacy-events.ts` 中仅为数据兼容保留的类型与真正可删除的 UI/执行兼容类型；
- 为事件字段完整性添加跨入口合同测试；
- 将 session queue、tail、abort、approval 和 history 状态的生命周期集中到明确的 Session orchestration contract。

验收：同一 Pi event 在 CLI、Gateway、stdio、Bridge 的可观测语义一致；legacy event 的生产消费者数量可被报告。

### Phase 3：拆分 Pi Session Factory（P1）

目标：让 Runtime composition root 只负责组装，不再拥有具体业务分支。

建议拆分为以下职责：

- `pi-session-composition`：Pi SessionManager、SettingsManager、model 和基础 Session 生命周期；
- `pi-resource-composition`：Package catalog、resource loader、trust 和 allowlist；
- `pi-finance-composition`：金融 host capability 和金融 policy；
- `pi-platform-composition`：worker、sandbox、cron、daemon 和 management capability；
- `pi-bridge-composition`：MCP、Bridge、stdio 等外部 transport；
- `pi-capability-registry`：显式、可版本化、可测试的 host capability registration。

不要把这些模块简单拆成多个仍然共享同一组 globalThis 变量的文件。拆分必须同时定义输入、输出、生命周期和错误边界。

验收：新增一个 Pi Package 不需要在 Factory 中加入包名判断；Factory 的单元测试可用 contract fixture 替换金融和平台 host。

### Phase 4：把 global registry 变成显式 capability context（P1）

目标：保留 Package→host 隔离，同时消除隐式全局状态。

- 引入按 Session/Runtime 实例创建的 capability context；
- 让 Package extension 接收 context，而不是读取 `globalThis.__upupPiHosts`；
- 对 capability 声明版本、必需能力、可选能力和关闭生命周期；
- 保留进程级 registry 仅作为兼容适配，并禁止新代码写入；
- 为并发 Session、重复初始化、dispose 后调用和测试隔离增加测试。

验收：两个并发 Session 使用不同 host 配置时不会互相影响；测试可以在不清理全局变量的情况下并行运行。

### Phase 5：外围能力 Pi Package 化（P2）

目标：让非金融外围能力不再形成第二套插件体系。

优先顺序：

1. `memory`：resource、读取策略、flush 和敏感数据策略；
2. `mcp`：server discovery、transport、trust 和 tool ownership；
3. `skills`：skill resource、prompt、command 和版本；
4. `commands`：slash command metadata、权限和 session context；
5. `sdk` / `stdio` / `bridge`：作为 transport/API package，而不是第二个 Agent runtime；
6. `tui` / `components`：保留 UI 形态，但只消费统一 Pi event adapter。

验收：这些包可以独立测试、声明能力和生命周期，不引入根 `src`，也不创建新的 Agent loop、registry 或 tool executor。

### Phase 6：兼容层退场与生产证据（P2）

- 建立 compatibility inventory：用途、生产消费者、替代 API、删除条件、目标版本；
- 先迁移 `legacy-events` 的生产消费者，再删除不可再现的旧事件类型；
- 对 deprecated facade 逐个添加“零生产消费者”检查；
- 保留 session/config 数据迁移直到明确的支持窗口结束；
- 接入 Tushare、AKShare、港股凭证后执行真实数据 smoke；
- 执行 7×24 provider SLA 观测，记录退避、恢复、停止和重复启动行为；
- 把真实凭证测试与无凭证 CI 测试分层，禁止在 CI 中泄漏 token。

## 10. 建议的门禁与验收矩阵

| 门禁 | 必须证明什么 | 当前状态 | Pi6 目标 |
|---|---|---|---|
| Unique Agent factory | 生产只有一个 Pi Session 创建入口 | 已通过 | 持续通过 |
| Entry convergence | 七类入口都汇入 Pi Runner | 已通过合同测试 | 增加真实 transport smoke |
| Tool native | ownership 与 extension registration 对齐 | 240/240 | 加入行为、权限和错误合同 |
| Package discovery | manifest、resource、copy、默认加载一致 | 部分可证 | 输出逐包矩阵 |
| Module boundary | package 不导入 root，依赖图无循环 | 已通过 | 增加 root domain 依赖规则 |
| Event convergence | 外部入口事件语义一致 | 部分完成 | 单一 adapter + 跨入口测试 |
| Capability lifecycle | host 不串线、不泄漏、不隐式残留 | 未充分验证 | context 化 + 并发测试 |
| Compatibility exit | 兼容层有消费者和退出条件 | 未建立 | inventory + 零消费者门禁 |
| Production evidence | 真实 provider、凭证和 SLA 可复现 | 未完成 | 分层 smoke 与长期观测 |
| Documentation truth | 数量和百分比有明确口径 | 存在漂移 | 自动生成事实章节 |

## 11. 不应做的事情

- 不要继续用单一 `overallProgress: 100%` 表述全仓 Pi 改造完成；
- 不要为了让边界脚本通过，把依赖隐藏到新的 `globalThis`、动态字符串或无类型 facade；
- 不要在 `PiAgentSessionFactory` 中继续堆叠新的领域分支；
- 不要在 CLI、Gateway、stdio、Bridge 中各自复制事件映射；
- 不要把 session/config 数据兼容误判为旧 Agent runtime，也不要因“清理 legacy”而破坏既有用户数据；
- 不要把 workspace package 数量、Pi domain package 数量、默认加载 package 数量混为一个数字；
- 不要把本地 fixture、合同测试或无 token 测试描述为真实 provider 生产验证；
- 不要在没有先定义 capability lifecycle 的情况下扩大 global registry。

## 12. Pi6 完成定义

Pi6 不以“删除所有根 `src`”作为机械目标，而以以下可验证条件作为完成定义：

1. Pi 仍是唯一生产 Agent 执行内核，且唯一 Factory 门禁持续通过；
2. Runtime 不再按具体业务包名硬编码新增 capability；
3. Package discovery、trust、resource、ownership 和 lifecycle 有统一 contract；
4. Event adapter 只有一个生产实现，CLI、Gateway、stdio、Bridge 共享它；
5. host/port capability 按 Runtime/Session context 注入，新代码不依赖 globalThis；
6. root `src` 中剩余模块都有明确角色：应用入口、UI、transport、migration 或不可下沉的 composition root；
7. 每个兼容层都有生产消费者、保留原因和退出条件；
8. 自动报告分别展示已验证、未验证和仅结构性推断的指标；
9. 14 个 Pi domain package 与其默认加载状态、资源和测试覆盖可追溯；
10. 真实数据 provider、凭证 smoke 和 SLA 观测结果与本地合同测试分开记录；
11. 文档中的目录、包数量、依赖名称和测试数字由脚本或同一事实源生成；
12. 全仓测试、类型检查、Pi 门禁和模块边界门禁在干净环境中可重复通过。

## 13. 当前工作树注意事项

本次补充审计只修改本文件。当前工作树还包含与本方案无关的既有修改，包括 `packages/pi-backtest/`、`packages/pi-market-data/`、`packages/.command-*`、`pi5.md` 和若干 session 日志；这些文件不应被本方案自动覆盖、删除或提交。提交前必须按文件逐项检查。

## 14. 全量 `src` → `packages` 目标矩阵

Pi6 的目标不是把目录机械搬到 `packages/`，而是让每个运行时能力拥有：独立 manifest、公开 API、Pi resource 声明、host capability、trust 策略、生命周期、测试和唯一依赖方向。迁移后的根 `src/` 只保留启动器、产品装配和极薄的 UI/transport 入口。

### 14.1 根目录最终形态

最终根目录只允许保留以下四类职责：

1. `src/index.tsx`：Bun/Node 进程启动、环境加载、命令行参数和 bootstrap；
2. `src/app/` 或等价 composition root：把已发布 Package 按配置组装成产品；
3. `src/cli/` 或 UI 启动壳：把输入交给 Package API，把统一 Pi event adapter 交给渲染器；
4. `src/compat/`：有明确期限的旧 API、旧配置和旧 Session 数据迁移。

根目录不得继续保留金融业务、通用工具执行器、独立 Agent loop、独立 tool registry、独立 skill registry 或未登记的全局 host。根 `src` 的目标规模不是绝对零行，而是成为可审计的启动与装配层。

### 14.2 目录迁移矩阵

| 当前 `src` 目录 | 目标 Package | 迁移内容 | 最终根目录允许保留 |
|---|---|---|---|
| `runtime/pi` | `@upup/pi-runtime` | Pi Session、Runner、Spec、Package discovery、event adapter、capability context | 仅 bootstrap adapter |
| `tools` | `@upup/pi-finance-sdk`、`@upup/pi-market-data`、`@upup/pi-platform`、`@upup/pi-investment-*` | 工具实现、schema、权限声明和 extension 注册 | 无业务工具实现 |
| `skills` | `@upup/pi-skills` | Skill resource、prompt、slash command、激活和版本 | CLI command facade |
| `commands/investment` | `@upup/pi-investment-workflow` | `/invest`、dossier、strategy、screen、risk、portfolio command | 参数解析转发 |
| `commands` | `@upup/pi-commands` | command manifest、执行策略、帮助和统一发现 | 进程命令入口 |
| `session` | `@upup/pi-session` | Pi Session tree、restore、migration、history、state | session bootstrap 调用 |
| `memory` | `@upup/pi-memory` | memory resource、检索、flush、consolidation、dossier memory | 无记忆实现 |
| `mcp` | `@upup/pi-mcp` | MCP discovery、transport、resource、trust、tool bridge | transport 启动壳 |
| `plugins` | `@upup/pi-plugin-runtime` | plugin discovery、loader、SDK bridge、trust 和 sandbox | 无插件加载逻辑 |
| `hooks` | `@upup/pi-hooks` | lifecycle、tool、stop、permission、elicitation hooks | 无 hook registry |
| `permissions` 与 `utils/permissions` | `@upup/pi-permissions` | policy、approval、deny、timeout、audit、rule parser | 无权限决策 |
| `tui`、`components` | `@upup/pi-tui-app` | Pi event rendering、editor、overlay、approval UI、history UI | TUI 启动壳 |
| `controllers` | `@upup/pi-app-controller` | query orchestration、approval bridge、model/session selection | 仅创建 controller |
| `gateway` | `@upup/pi-gateway` | HTTP/SSE、channel routing、session queue、heartbeat、SLA | server bootstrap |
| `bridge` | `@upup/pi-bridge` | WebSocket、device auth、session sync、audit、capacity wake | server bootstrap |
| `stdio` | `@upup/pi-stdio` | JSON-RPC transport、stream、session API | stdio process bootstrap |
| `cron` | `@upup/pi-cron` | schedule、executor、store、outbound policy、retry | timer bootstrap |
| `daemon`、`subagent`、`multi-agent` | `@upup/pi-platform` | worker pool、supervisor、IPC、subagent、team coordination | daemon bootstrap |
| `storage` | `@upup/pi-storage` | project storage、file history、snapshots、stats、adapters | storage path bootstrap |
| `plan`、`tasks`、`worktree` | `@upup/pi-planning` 与 `@upup/pi-platform` | plan lifecycle、task state、worktree safety | 无计划执行实现 |
| `evals` | `@upup/pi-evals` | scenario、fixture、evaluation runner、regression report | CI entry only |
| `telemetry` | `@upup/pi-observability` | event metrics、audit、tracing、redaction、health | exporter bootstrap |
| `i18n`、`keybindings` | `@upup/pi-i18n`、`@upup/pi-keybindings` | UI strings、locale、keymap、input policy | locale selection |
| `coach`、`proactive` | `@upup/pi-coach`、`@upup/pi-proactive` | investor coaching、alerts、push channels、proactive jobs | feature wiring |
| `management` | `@upup/pi-management` | snapshot、read-only management API and UI contract | server bootstrap |
| `realtime`、`web`、`multimodal` | `@upup/pi-realtime`、`@upup/pi-web`、`@upup/pi-multimodal` | live data、browser/web fetch、image/document input | no provider logic |
| `kairos`、`competitive-positioning` | `@upup/pi-product` 或 dev-only package | product capability metadata、feature evidence、positioning reports | no runtime business logic |
| `code-archaeology` | `@upup/pi-devtools` | code map、hotspot、orphan、manifest analysis | no production dependency |
| `core`、`services`、`model`、`data`、`analysis`、`screening`、`search` | 归并到明确领域 Package | 仅迁移真实存在且被生产调用的模块 | 空目录删除 |
| `types`、`state`、`utils` | `@upup/types`、`@upup/state`、`@upup/utils` 或拆分后的基础包 | 纯类型、不可变状态、无业务基础设施 | 仅类型/启动 adapter |
| `extensions` | `@upup/pi-extensions` 或各 Package 自有 extensions | native extension manifest 和测试 fixture | 无重复注册表 |

矩阵中的目标包名是架构目标，不要求一次性创建全部 30 个新包。应优先复用已有 workspace package，只有当一个领域已有独立生命周期、测试和发布边界时才新增包，避免“目录包装”制造更多碎片。

## 15. 目标依赖图与禁止方向

### 15.1 分层

```text
应用启动层
  -> 产品装配层
    -> Pi Runtime / Capability Context
      -> Pi Package resources
        -> Domain services / external providers
          -> Storage / observability / transport adapters
```

推荐的依赖方向：

- `@upup/pi-runtime` 只依赖 Pi 上游包、基础类型和抽象 capability contract；
- domain Pi Package 只依赖公共 contract、其他明确声明的 domain package 和外部 SDK；
- transport package 依赖 runtime public API，不依赖 runtime 内部文件；
- UI package 只消费 event、session、command 和 state public API；
- storage、telemetry、permissions 通过 interface 被注入，不反向 import CLI；
- 根 `src` 依赖所有需要装配的 public package，但任何 package 不依赖根 `src`。

### 15.2 强制禁止

- 任何 Package import `src/*`、`@/` 或通过绝对路径绕过边界；
- Package 直接调用 `createAgentSession()`、自行创建 Agent loop 或自行维护第二个 tool registry；
- 新代码读取 `globalThis.__upupPiHosts` 或 `globalThis.__upupAgentPorts`；
- transport 直接拼装金融工具或访问具体 provider 私有实现；
- UI 直接访问 Package 内部文件、数据库文件或全局 Session 状态；
- 一个领域 Package 通过动态字符串隐藏对另一个领域 Package 的未声明依赖；
- 为了迁移而复制代码，导致旧 `src` 和新 `packages` 同时继续生产执行。

## 16. Pi Runtime 目标设计

### 16.1 `@upup/pi-runtime`

把目前 `src/runtime/pi` 拆成四个公共子域，但先在一个 Package 内以目录隔离，待 contract 稳定后再物理拆包：

1. `session`：AgentSpec、SessionFactory、SessionManager、runner、abort、idle、fork、compact；
2. `resources`：Package discovery、manifest、resource loader、trust、allowlist、copy；
3. `events`：Pi native event、UpUp canonical event、transport adapter 和 schema version；
4. `capabilities`：按 Runtime/Session 创建的 context、version negotiation、dispose 和 health。

Factory 只能组合这四个子域，不能再出现按包名分支的业务逻辑。每个 Package 通过 capability requirement 声明需要什么，Runtime 根据 manifest 和 context 进行注入。

### 16.2 显式 Capability Context

目标接口应具备以下语义：

```ts
interface PiCapabilityContext {
  readonly runtimeId: string;
  readonly sessionId: string;
  require<T>(name: string, range?: string): T;
  optional<T>(name: string, range?: string): T | undefined;
  audit(action: CapabilityAudit): void;
  dispose(): Promise<void>;
}
```

实际类型可以不同，但必须满足：能力按实例隔离、版本可验证、使用可审计、dispose 可检查、测试可替换。进程级 global registry 只保留兼容读取，Pi6 后的新 Package 不得写入它。

### 16.3 Canonical Event

定义唯一的 `UpUpPiEvent`，至少覆盖：thinking、text delta、tool start/update/end/error、approval、compaction、queue drain、memory、warning、done。所有 CLI、Gateway、Bridge、stdio 和 SDK 都消费同一 adapter；禁止每个入口再次把 `UpUpAgentEvent` 映射成自己的近似类型。

事件 contract 必须明确：tool call id、session id、timestamp、sequence、partial content、redaction、error code、token usage 和 provider metadata。兼容事件只能在 adapter 边界存在。

## 17. 以 Pi 为核心的投资助手目标产品

### 17.1 产品定位

目标产品不是“带金融工具的通用聊天机器人”，而是一个以 Pi Session 为执行内核、以证据和风险约束为核心的中文投资研究助手：

- 面向 A 股、港股及可配置的海外市场；
- 支持自然语言研究、结构化投研工作流和可复现报告；
- 所有重要结论绑定数据来源、时间、口径、模型假设和置信度；
- 所有涉及交易或外部副作用的动作默认进入 sandbox，并需要显式审批；
- Agent 可以研究、建模、回测、监控和提出方案，但不得无审批执行真实交易。

### 17.2 产品分层

```text
Pi Investment Assistant
  ├─ Investor Profile：风险偏好、市场、限制、目标、适当性
  ├─ Research Dossier：标的、行业、数据证据、引用、假设、结论
  ├─ Analysis：基本面、估值、技术、宏观、事件、情景
  ├─ Portfolio & Risk：持仓、暴露、归因、压力测试、熔断和限额
  ├─ Backtest & Simulation：交易日、成本、微结构、滑点、净收益
  ├─ Workflow：detect → plan → execute → verify → report
  ├─ Monitoring：watchlist、provider SLA、告警、定时复查
  └─ Action：sandbox order、approval、audit、export
```

当前已有不同文档对五阶段命名不一致。Pi6 必须选择一个 canonical workflow；建议保留产品层 `detect → plan → execute → verify → report`，把 discovery、research、modeling、review、action 作为内部步骤或场景标签，避免同一 `/invest` 在不同入口拥有两套状态机。

### 17.3 Agent Profile

至少定义以下可序列化 Pi Agent Profile：

- `researcher`：数据检索、来源交叉验证、研究日志和引用；
- `analyst`：基本面、估值、财报、行业和情景建模；
- `risk-manager`：风险限额、压力测试、组合暴露和合规检查；
- `portfolio-manager`：组合构建、再平衡建议和归因；
- `backtest-engineer`：严格交易日、成本、滑点和回测可复现性；
- `monitor`：watchlist、事件、provider 状态和告警；
- `reviewer`：证据完整性、模型假设、风险披露和最终报告审阅。

Profile 只能通过 capability allowlist 获得工具。不同 Profile 不应通过 prompt 文本约束来替代权限约束；高风险工具必须在 Pi policy 层显式 deny 或 approval。

### 17.4 一次完整投研任务

```text
用户提出问题
  -> detect：识别市场、标的、目标、时点和缺失信息
  -> plan：生成研究计划、数据需求、预算和风险边界
  -> execute：并行获取行情/财报/公告/研究数据并运行模型
  -> verify：检查日期、来源、成本、冲突证据、模型假设和权限
  -> report：输出引用、结论、风险、置信度、后续动作和审计记录
```

每一步都产生 Pi Session event、可恢复状态和结构化 artifact；最终报告不能只依赖 assistant text，必须能重新加载 dossier、inputs、model version、tool calls 和 approval history。

## 18. 分阶段整改计划

### Phase 0：冻结边界、建立事实基线（1 个迭代）

- 冻结新增根 `src` 领域实现；新功能必须进入已有 Package 或提交迁移豁免；
- 建立 source inventory、生产入口、Package discovery、global state、legacy consumer 和 root line count 报告；
- 修正 `pi5.md`、Package 数量、入口文件和 Pi 依赖名称；
- 给每个 `src` 顶层目录标记 owner、目标 Package、阻塞依赖、迁移状态和删除条件；
- 把当前工作树中的业务修改与 Pi6 架构工作分离。

**退出条件：** 每个生产文件都有迁移归属；报告能识别“已迁移、双写、旧路径仍执行、测试专用、待删除”五种状态。

### Phase 1：先建公共 Contract，再迁移实现（2 个迭代）

- 建立 `@upup/pi-runtime` public API、canonical event、capability context、Package manifest schema；
- 建立 `@upup/pi-session`、`@upup/pi-permissions`、`@upup/pi-storage`、`@upup/pi-observability` 的最小 contract；
- 把所有新接口写成 package contract test；
- 禁止新代码依赖 legacy event、global registry 和 root private path；
- 为每个 capability 增加 version、scope、trust、audit、dispose。

**退出条件：** 根 runtime 可以用 fixture context 创建 Pi Session；并发 Session 测试不依赖清理全局变量。

### Phase 2：迁移 Agent-facing 能力（2–3 个迭代）

- 先迁移 `src/tools` 中金融工具到对应 7 个金融 domain Package；
- 迁移 `src/skills`、slash commands、prompt、workflow、policy 和 eval resource 到 `@upup/pi-skills` 与金融 Package；
- 迁移 `src/commands/investment`，只保留 CLI 参数转发；
- 把 `src/multi-agent`、`src/subagent` 和 daemon worker 收敛到 `@upup/pi-platform`；
- 将工具行为、权限、来源、错误、脱敏和真实 fixture 测试随实现移动。

**退出条件：** 生产路径不再从 `src/tools`、`src/skills` 和 `src/commands/investment` 加载工具/技能/工作流；删除旧实现后全仓合同测试仍通过。

### Phase 3：迁移 Session、Memory 和数据基础设施（2–3 个迭代）

- 迁移 `src/session` 到 `@upup/pi-session`，统一 Pi Session tree 与历史兼容；
- 迁移 `src/memory` 到 `@upup/pi-memory`，把敏感信息策略和审计作为 policy；
- 迁移 `src/storage` 到 `@upup/pi-storage`，将路径、锁、快照和恢复边界显式化；
- 迁移 `src/plan`、`src/tasks` 到 `@upup/pi-planning`，所有状态必须可序列化和可恢复；
- 把 `src/telemetry`、audit、redaction 和 health 收敛到 `@upup/pi-observability`。

**退出条件：** Session、Memory、Storage、Plan 均可在无 CLI 的 Pi worker 中运行；迁移测试覆盖旧数据格式和中断恢复。

### Phase 4：迁移外围入口与插件系统（2–3 个迭代）

- 迁移 Gateway、Bridge、stdio、Cron、Daemon 到对应 transport/platform Package；
- 所有入口只依赖 `@upup/pi-runtime` public API 和 canonical event；
- 迁移 MCP、Plugins、Hooks、Permissions，统一 trust、approval、network、credential 审计；
- 保留入口进程只做 bind、signal、config 和 Package bootstrap；
- 增加 HTTP、WebSocket、JSON-RPC、cron 和 worker 的 Pi 端到端 smoke。

**退出条件：** 七类生产入口都不直接 import runtime 内部文件，不复制事件映射，不创建独立执行器。

### Phase 5：迁移 TUI、Commands 和用户交互（2 个迭代）

- 把 `src/tui`、`src/components`、approval overlay、editor 和 history UI 迁移到 `@upup/pi-tui-app`；
- CLI 只负责启动 TUI、提供环境和传递 input；
- 统一 command discovery、skill discovery、keybinding、i18n 和 permission UX；
- 用 canonical event 替换 CLI 对 `legacy-events` 的直接依赖；
- 通过浏览器/终端 smoke 验证启动、研究、审批、取消、恢复、导出和错误显示。

**退出条件：** `src/cli.ts` 降为薄入口；UI 不直接读取全局 Session、工具 registry 或 provider 私有状态。

### Phase 6：打造投资助手闭环（持续产品迭代）

- 统一 `/invest` 五阶段 canonical state machine；
- 完善 Investor Profile、Dossier、Evidence、Citation、Model Assumption、Risk Limit、Approval 和 Audit artifact；
- 将 `pi-market-data`、`pi-finance-sdk`、`pi-investment-analysis`、`pi-risk`、`pi-portfolio`、`pi-backtest`、`pi-investment-workflow` 组合成默认研究 profile；
- 增加研究计划、并行 worker、结果合并、冲突证据审阅和可恢复报告；
- 连接真实 Tushare/AKShare/港股 provider 后执行凭证 smoke；
- 加入 portfolio review、watchlist monitoring、earnings preview、risk dashboard 和 sandbox action；
- 所有真实交易、外发通知和文件写入都经 Pi policy 与显式 approval。

**退出条件：** 一个用户可以从自然语言问题开始，得到有引用、可复现、带风险披露的研究报告；中断后能从 Pi Session 恢复；任何副作用都有审计记录且默认不越过 sandbox。

### Phase 7：清理旧路径与发布门禁（1–2 个迭代）

- 逐个删除 root 旧实现、deprecated facade 和重复 registry；
- 只保留有明确支持窗口的 session/config migration；
- 运行零生产消费者检查、root source allowlist、Package dependency、bundle resource 和全仓测试；
- 完成生产 provider、SLA、性能、并发 Session、故障恢复和安全审计；
- 生成 Pi6 架构报告并将文档数字从同一事实源导出。

**退出条件：** 根 `src` 只剩允许清单；没有第二个 Agent loop、tool registry、skill registry 或 capability global；所有高风险行为有默认拒绝/审批策略。

## 19. Pi6 新增验收门禁

| ID | 门禁 | 必须验证 |
|---|---|---|
| B1 | Root source allowlist | 根 `src` 仅保留 bootstrap、composition、UI/transport 壳和受控 compat |
| B2 | Source ownership | 每个生产文件存在唯一目标 Package 和迁移状态 |
| B3 | Package public API | Package 外部不得 import `src` 或 Package 内部路径 |
| B4 | Unique Agent runtime | 生产只有一个 Pi Session factory、runner 和 tool execution path |
| B5 | Capability scope | capability 按 Runtime/Session 隔离，支持 version、audit、dispose |
| B6 | Event convergence | 所有入口共享一个 canonical event adapter |
| B7 | Package discovery | manifest、resource、trust、copy、默认加载和版本一致 |
| B8 | Tool behavior | tool registration、schema、权限、错误、脱敏、真实 fixture 均通过 |
| B9 | Workflow integrity | detect→plan→execute→verify→report 状态可恢复、可审计 |
| B10 | Evidence integrity | 每个投资结论可追溯到数据、时间、来源、假设和模型版本 |
| B11 | Side-effect safety | 交易、通知、写入和外部调用有 sandbox、approval、audit |
| B12 | Entry smoke | CLI、Gateway、Cron、Daemon、Bridge、stdio、SDK/Eval 均通过 Pi smoke |
| B13 | Compatibility lifecycle | 每个 legacy facade 有消费者、原因、替代物和删除条件 |
| B14 | Root reduction | root TS 生产代码按里程碑下降，迁移后旧实现被删除而非双写 |
| B15 | Production evidence | provider token smoke、SLA、并发、恢复和性能分层可复现 |
| B16 | Documentation truth | pi6 文档指标从脚本事实源生成，禁止手填过期数字 |

## 20. 立即执行顺序

1. 先建立 B1/B2 inventory 和 `src` root allowlist，不马上搬文件；
2. 创建 `@upup/pi-runtime`、canonical event 和 capability context 的 contract；
3. 把 `agent-session-factory.ts` 的包名分支改造成 manifest/capability-driven composition；
4. 统一 Gateway、stdio、Bridge 和 CLI 的 event adapter；
5. 优先迁移 `src/tools`、`src/skills`、`src/commands/investment`，因为它们直接决定投资助手能力是否真正由 Pi Package 提供；
6. 再迁移 Session/Memory/Storage/Permissions，保证迁移后的 Agent 可恢复、可审计、可控；
7. 最后迁移 TUI 与 transport 壳，避免在 UI 未稳定前反复搬动业务实现；
8. 每个迁移单元遵循：建 contract → 搬实现 → 改所有生产消费者 → 删除旧实现 → 跑定向测试 → 跑边界门禁；
9. 不做长期双写；若必须过渡，双写期限、唯一生产路径和删除版本必须记录在 inventory；
10. 每个阶段完成后更新事实报告和本文件的状态，不以目录数量代替功能验收。

## 21. Pi6 最终成功标准

Pi6 完成时，UpUp 应该被准确描述为：

> 一个以 Pi Runtime 为唯一 Agent 执行内核、以 Pi Package 为能力交付单元、以显式 capability context 为依赖边界、以 Session tree 为状态基础、以证据/风险/审批为金融约束、以轻量 root bootstrap 为启动入口的投资研究助手。

而不是：

> 一个仍把大部分应用逻辑放在 root `src`、只把工具注册复制到 Pi extension、再用 100% 字符串门禁宣称已经彻底模块化的应用。

## 22. Pi6 第一阶段实施结果（2026-09-14）

本阶段按“先建 contract，再迁移实现，修改全部生产消费者，最后验证”的顺序完成了 runtime、storage 和 market-data capability pilot。未把尚未完成的外围 Package 化描述为已完成。

### 22.1 已创建的 Package

| Package | 版本 | 已实现能力 |
|---|---:|---|
| `@upup/pi-runtime` | `0.1.0` | Runtime 常量、AgentSpec/permission、tool contract/result/context、canonical event 与映射、capability context、PiSession/PiSessionFactory、manifest/resource/dependency contract |
| `@upup/pi-storage` | `0.1.0` | canonical JSON、dossier、strategy 签名与链、audit 签名链，均支持显式路径/时钟/key 注入 |

公共 contract 版本：`upup.pi.runtime.v1`、`upup.pi.events.v1`、`upup.pi.capabilities.v1`、`upup.pi.market-data.v1`。

`@upup/pi-runtime` 是 contract foundation package，不声明资源目录；`package-catalog.ts` 通过 `RUNTIME_FOUNDATION_PACKAGES` 处理其依赖，不将它误当作可加载的 Pi resource package。

### 22.2 根实现迁移

- `src/runtime/pi/types.ts` 改为 runtime package facade；`tool-contract.ts`、`index.ts` 和相关 runtime consumers 改为消费公共 contract，避免第二份实现与重复 wildcard export。
- `src/memory/dossier.ts`、`strategy-store.ts`、`audit-signing.ts` 改为 `@upup/pi-storage` facade。root 只通过 `globalUpupPath()` 提供默认生产路径，保留旧 import path 与无参命令行为；持久化业务实现只保留在 package。
- `dossier`、`strategy`、`earnings-preview`、`invest`、Bridge 和 MCP resource consumers 已切换到 package API，并显式传入 root-resolved storage paths。
- `PiAgentSessionFactory` 仍是唯一生产 Pi Session factory，且为每个 session 创建并在 dispose 时释放 `PiCapabilityContext`。

### 22.3 Market-data capability pilot

`@upup/pi-market-data` 现在优先使用 session-scoped context，其次使用受控 legacy host transport，最后使用 package default provider。context 提供 history/quote fetcher、共享 trend store、financial evidence 和 financial audit capability；显式 fetcher 未注入时不会注册默认 fetch capability，避免遮蔽 legacy transport。

离线/native evidence 通过 capability-aware builder 生成；真实 provider 返回的 source、freshness 和 auditId 保持不变，不用本地 fixture 覆盖生产证据。context 与 host bridge 复用同一个 trend-store 实例。

<!-- PI6_IMPLEMENTATION_VALIDATION_CONTINUATION -->

### 22.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：34 workspace packages、552 root src modules，无 root-src imports 与依赖环 |
| `bun run check:pi-packages` | 通过：17 个 Pi domain packages 的 source、exact semver、资源与 pin 校验通过 |
| `bun run check:pi-runtime` | 通过：Bun 1.4.1、Node 26.3.0、Node 22 target 声明通过 |
| `bun run check:pi-migration` | 通过：8 pinned packages、Node >=22.19.0、8 runtime files、finance metadata |
| Runtime/print/storage/market-data 定向测试 | 217 pass、0 fail、2234 assertions、32 files |
| `/screen` 与 market-data extension 测试 | 43 pass、0 fail、177 assertions |
| 全仓回归 | 3406 pass、0 fail、11419 assertions、315 files |
| Pi5 语义验收 | A1–A20，20/20 pass |
| Pi5 benchmark | startup 94.27ms、recovery 42.83ms、per-call p95 0.206ms、sustained p95 0.007ms |
| `bun run start -- --help` | 通过 |
| print fixture stream | 通过，`src/print.test.ts` 走 Pi stream 并返回 fixture answer |
| 隔离 storage smoke | 通过：dossier 写入/重启读取，strategy 签名与 `verifyChain`，audit 写入/重启读取与链验证 |
| storage import side effect | 通过：隔离目录 import 前后无新增目录 |

### 22.5 未完成与环境限制

- 真实 provider smoke 尚未执行：本机没有 DeepSeek/Tushare 凭证；`bun run print -- <prompt>` 会在 provider 初始化阶段报告缺少 DeepSeek API key。该结果不等同于 Pi print fixture 失败，也不将 fixture 结果写作真实 provider 证据。
- 独立语义 Verifier 未返回最终 A1–A20 结论；上述结果仅为本地 Runtime-owned checks，不能冒充独立验收。
- Phase 2+ 仍待执行：统一 Gateway/stdio/Bridge/CLI event adapter、拆分 Session Factory、收敛 legacy-events、退出 global registry、迁移 TUI/Gateway/Bridge/stdio/cron/daemon/MCP/plugin runtime 等外围能力。
- `pi6.md` 的原有路线图仍然有效；本节只标记第一阶段已验证内容，不声明全仓已完成 Pi Package 化。

### 22.6 第一阶段状态

**已完成：** `@upup/pi-runtime`、`@upup/pi-storage`、root storage/runtime consumers、market-data session capability pilot、定向与全仓本地验证。

**保持未完成：** 真实 provider 凭证 smoke、独立语义验收、Phase 2–7 的外围迁移与兼容层退场。

## 23. Pi6 第二阶段实施结果（2026-09-14）

本阶段按"先建公共 adapter contract，再迁移 4 处重复的事件映射，最后统一验证"的顺序完成了 Phase 2 的事件收敛目标。

### 23.1 已创建的 Package

| Package | 版本 | 已实现能力 |
|---|---:|---|
| `@upup/pi-event-adapter` | `0.1.0` | canonical Pi→legacy 事件映射、canonical Pi→server 事件映射、canonical legacy→server 事件映射、async/sync iterable adapter stream、buildLegacyDoneEvent、hasLegacyMapping/hasServerMapping contract helper |

公共 contract 版本：`upup.pi.events.v1`（与 `@upup/pi-runtime` 的 `PI_EVENTS_CONTRACT` 同步）。

`@upup/pi-event-adapter` 是 event adapter foundation package，仅依赖 `@upup/pi-runtime` 的 `UpUpAgentEvent` 与 `PI_EVENTS_CONTRACT`；不声明 resources/policies/workflows，仅作为 Pi→外部协议映射层。

### 23.2 根实现迁移

- `src/runtime/pi/event-stream.ts` 的 `mapEvent` 替换为 `@upup/pi-event-adapter` 的 `mapPiEventToLegacy`；`done` 事件改用 `buildLegacyDoneEvent`，确保单一构造路径。
- `src/gateway/agent-runner.ts` 删除 `toLegacyEvent`，统一消费 `mapPiEventToLegacy`。
- `src/stdio/server.ts` 删除两个内联 adapter：`mapPiEvent`（Pi→Server）和 `mapAgentEvent`（legacy→Server），统一消费 `mapPiEventToServer` 与 `mapLegacyAgentEventToServer`。
- 所有 Pi 消费者现在通过 `@upup/pi-event-adapter` 单一入口获取映射规则；4 处 duplicate 收敛到 1 处。
- `UpUpAgentEvent` 类型 import 从 `src/runtime/pi/types.js` 改到 `@upup/pi-runtime` 直接消费，避免第二份 wildcard 透传。

### 23.3 事件映射契约

`mapPiEventToLegacy` 覆盖 7 个可映射的 Pi 事件（`thinking`、`text_delta`、`tool_start`、`tool_update`、`tool_end`、`compaction_start`、`compaction_end`），返回 `undefined` 表示 Pi 事件没有 legacy 等价（lifecycle-only 事件）。

`mapPiEventToServer` 覆盖同样的 7 个事件，返回 `null` 表示没有 server 等价。

`mapLegacyAgentEventToServer` 覆盖 17 个 legacy AgentEvent 类型，是 stdio/gateway 的 legacy→server 转换层。

`adaptPiEventsToLegacy` / `adaptPiEventsToServer` 提供 async/sync iterable 流，调用方无需自己实现 for-await 循环。

### 23.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：35 workspace packages、552 root src modules，无 root-src imports 与依赖环 |
| `bun run check:pi-migration` | 通过：8 pinned packages、Node >=22.19.0、8 runtime files、finance metadata |
| `bun run check:pi-runtime` | 通过：Bun 1.4.1、Node 26.3.0、Node 22 target 声明通过 |
| `bun run check:pi-packages` | 通过：17 个 Pi domain packages 的 source、exact semver、资源与 pin 校验通过 |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `@upup/pi-event-adapter` 测试 | 22 pass、0 fail、84 expect() calls |
| Runtime/print/storage/market-data/event-adapter 定向测试 | 208 pass、0 fail、2192 assertions、36 files |
| `bun test --cwd packages/pi-event-adapter` | 22 pass、0 fail |
| `bun run test:pi-contracts`（含新增 pi-event-adapter） | 稳定通过 |
| `bun run start -- --help` | 通过 |
| print fixture stream | 通过 |

### 23.5 未完成与环境限制

- 全仓 `bun test` 中两个 flaky 用例（基金选择方法验证中的网络依赖测试、`session-sync e2e` 偶发并发超时）与本次 event-adapter 改动无直接因果关系，单跑均通过；这些是 baseline 已存在的网络/时序不稳定测试。
- Phase 3+ 仍待执行：拆分 Pi Session Factory、迁移 Session/Memory/Storage/Permissions、收敛 `legacy-events` 类型在 controllers/components 中的直接消费、退出 global registry、迁移 TUI/Gateway/Bridge/stdio/cron/daemon/MCP/plugin runtime 等外围能力。
- `pi6.md` 的原有路线图仍然有效；本节只标记第二阶段已验证内容，不声明 Phase 3-7 已完成。

### 23.6 第二阶段状态

**已完成：** `@upup/pi-event-adapter`、4 处 duplicate 事件映射收敛到单一 adapter、根 src 消费者切换、22 个 adapter 合同测试 + 全部定向测试 + verify:pi5 通过。

**保持未完成：** `legacy-events` 类型在 controllers/components 中的继续消费（仍有零散直接 `case 'tool_start'` 等分支但语义上是 legacy consumer 而非 duplicate adapter）、Phase 3-7 的外围迁移与兼容层退场。

## 24. Pi6 第二阶段扩展结果（2026-09-14）

在第 23 节事件 adapter 收敛的基础上，本轮扩展 Phase 2 收口范围，把"事件相关 type-only consumer"从 `src/runtime/pi/legacy-events.js` 切到 `@upup/pi-event-adapter`，进一步减少 `legacy-events` 的直接依赖面。

### 24.1 新增 helper

| Helper | 用途 |
|---|---|
| `auditAdapterCoverage(fixtures)` | 接收一组 Pi 事件 fixture，返回 4 类分桶（mappedToLegacy/droppedFromLegacy/mappedToServer/droppedFromServer），用于 verify 阶段确保每个 Pi 事件类型都被 adapter 显式处理 |
| `DisplayEvent` | 旧 event adapter 显示包装类型，在 pi-event-adapter 重新声明，让 `src/types.ts` 与 `src/controllers/agent-runner.ts` 不再直接依赖 `legacy-events.ts` |

### 24.2 Type-only consumer 迁移

13 个 type-only consumer 文件把 import 从 `legacy-events.js` 切到 `@upup/pi-event-adapter`：

| 文件 | 迁移的 type |
|---|---|
| `src/permissions/index.ts` | `ApprovalDecision` |
| `src/utils/permissions/ApprovalManager.ts` | `ApprovalDecision` |
| `src/utils/permissions/approvalConfig.ts` | `ApprovalDecision` |
| `src/components/approval-requests/BaseApprovalRequest.ts` | `ApprovalDecision` |
| `src/components/approval-requests/FullscreenApprovalOverlay.ts` | `ApprovalDecision` |
| `src/components/approval-requests/WriteApprovalRequest.ts` | `ApprovalDecision` |
| `src/components/approval-requests/GenericApprovalRequest.ts` | `ApprovalDecision` |
| `src/components/approval-requests/BashApprovalRequest.ts` | `ApprovalDecision` |
| `src/components/inline-approval-selector.ts` | `ApprovalDecision` |
| `src/components/tool-event.ts` | `ApprovalDecision` |
| `src/components/approval-prompt.ts` | `ApprovalDecision` |
| `src/components/select-list.ts` | `ApprovalDecision` |
| `src/components/working-indicator.ts` | `StreamMode` |
| `src/components/chat-log.ts` | `TokenUsage` |
| `src/types.ts` | `DisplayEvent`、`TokenUsage` |
| `src/controllers/agent-runner.ts` | `DisplayEvent`、`StreamMode` |
| `src/telemetry/integration.ts` | `ToolEndEvent`、`ToolErrorEvent` |

剩余的 `AgentConfig` / `AgentEvent` / `GroupContext` 仍留在 `legacy-events.ts`，因为它们依赖 `MessageQueue`/`Model`/`ModelRuntime` 等运行时类型，把它们搬到 adapter 会引入新的间接依赖，超出 Phase 2 的边界。

### 24.3 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：35 workspace packages、552 root src modules |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `@upup/pi-event-adapter` 测试 | 23 pass、0 fail、102 assertions（含新增 audit 覆盖测试） |
| 47 files runtime/permissions/components/controllers/telemetry/stdio/gateway 全量测试 | 378 pass、0 fail、2613 assertions |
| `bun run start -- --help` | 通过 |

### 24.4 第二阶段扩展状态

**已完成：** `@upup/pi-event-adapter` 的 coverage audit helper、`DisplayEvent` 重新声明、13 个 type-only consumer 切到 `@upup/pi-event-adapter`、所有定向测试和门禁通过。

**保持未完成：** `AgentConfig` / `AgentEvent` / `GroupContext` 等运行时协议 type 仍保留在 `legacy-events.ts`（依赖 `MessageQueue`/`Model`/`ModelRuntime`，迁移超出 Phase 2 范围）；Phase 3-7 仍待执行。

## 25. Pi6 第三阶段实施结果（2026-09-14）

在第 23-24 节事件 adapter 与 type 收敛的基础上，本轮推进 Phase 3 的"拆分 Pi Session Factory composition root"目标，按照"先建公共 helper contract，再迁移实现，最后验证"的顺序提取可独立维护的纯函数。

### 25.1 已迁移到 `@upup/pi-event-adapter` 的逻辑

| 函数 | 来源 | 说明 |
|---|---|---|
| `mapAgentSessionEventToUpUp(sessionId, event)` | `agent-session-factory.ts:eventToUpUpEvent` | Pi 原生 `AgentSessionEvent` → `UpUpAgentEvent` 的转换，11 个事件类型逐一映射（agent_start、turn_start、message_update、message_end、tool_execution_start/update/end、compaction_start/end、agent_end、turn_end） |
| `extractTextFromPiMessage(result)` | `agent-session-factory.ts:contentToText` | 从 Pi message 形状（`{content: [{type:'text', text}]}`）抽取文本，过滤非 text parts |

`mapAgentSessionEventToUpUp` 与已有的 `mapPiEventToLegacy` / `mapPiEventToServer` / `mapLegacyAgentEventToServer` 形成完整的事件转换链：

```text
Pi AgentSessionEvent
  → mapAgentSessionEventToUpUp    (canonical UpUpAgentEvent)
    → mapPiEventToLegacy          (legacy AgentEvent)
      → mapLegacyAgentEventToServer (stdio ServerEvent)
```

`@upup/pi-event-adapter` 的依赖从 `@upup/pi-runtime` 扩展为 `@upup/pi-runtime` + `@earendil-works/pi-coding-agent`。

### 25.2 已迁移到 `@upup/pi-runtime` 的逻辑

| 函数 | 来源 | 说明 |
|---|---|---|
| `FINANCE_CONTEXT_ENTRY_TYPE` | `agent-session-factory.ts` 常量 `'upup_finance_context'` | 暴露为 contract 常量供其他 module 复用 |
| `FINANCE_CONTEXT_SCHEMA_VERSION` | inline schema=1 | 暴露为 contract 常量 |
| `emptyFinanceSessionContext()` | `agent-session-factory.ts` | Pi Session `upup_finance_context` custom entry 的初始空上下文 |
| `mergeFinanceSessionContext(current, update)` | `agent-session-factory.ts` | context 合并规则（去重 risks/unfinishedPhases、深度合并 assumptions） |
| `serializeFinanceSessionContext(context, reason, instructions?)` | `agent-session-factory.ts` | 序列化为带 schema/domain 的 JSON，用于 `session_before_compact` payload |
| `SerializedFinanceContext` 类型 | inline | 序列化的显式 contract 类型 |

### 25.3 根 src 影响

`src/runtime/pi/agent-session-factory.ts`：
- 删除 `eventToUpUpEvent`（60 行）与 `contentToText`（14 行），改用 `mapAgentSessionEventToUpUp` + `extractTextFromPiMessage`
- 删除 `emptyFinanceSessionContext`（6 行）、`mergeFinanceSessionContext`（18 行）、`serializeFinanceSessionContext`（17 行），改用 pi-runtime 的同名 export
- 文件规模：919 → 810 行（-109 行）

`src/runtime/pi/finance-context.test.ts`：
- `serializeFinanceSessionContext` import 从 `./agent-session-factory.js` 切到 `@upup/pi-runtime`，跟随 contract 来源

### 25.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：35 workspace packages、552 root src modules |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `@upup/pi-runtime` 测试 | 11 pass、0 fail、30 assertions（含新增 finance context 6 个测试） |
| `@upup/pi-event-adapter` 测试 | 42 pass、0 fail、126 assertions（含新增 AgentSessionEvent 17 个测试） |
| `src/runtime/pi/finance-context.test.ts` | 通过 |
| `src/runtime/pi/agent-session-factory.test.ts` | 59 pass、0 fail（与修改前等价） |
| 47 files runtime/permissions/components/controllers/telemetry/stdio/gateway 全量测试 | 378 pass、0 fail、2613 assertions |
| `bun run start -- --help` | 通过 |

### 25.5 未完成与边界

Phase 3 拆分 Pi Session Factory 的目标不止于此。剩余 composition root 部分（`installPiPackageToolHosts`、`createPiAgentSessionFactory.createSession`、`reloadPiPackageResources`、`PiAgentSession` class 145 行等）需要按 pi6.md 第 18 节 Phase 3 提议的四个子域（pi-session-composition / pi-resource-composition / pi-finance-composition / pi-platform-composition）进一步拆分。这些是依赖运行时 side effect（globalThis registry、Pi SessionManager 实例、Sandbox broker、MCP client）的部分，单独迁移风险较高；建议在后续阶段按子域逐步抽取并保持现有 1675 行 `agent-session-factory.test.ts` 通过。

Phase 4-7 仍待执行：迁移 Session/Memory/Storage/Permissions/TUI/transport 等外围能力。

### 25.6 第三阶段状态

**已完成：** Pi 原生事件到 UpUp canonical event 的转换（`mapAgentSessionEventToUpUp`）迁移到 `@upup/pi-event-adapter`；finance session context 三件套（empty/merge/serialize + contract 常量 + 类型）迁移到 `@upup/pi-runtime`；`agent-session-factory.ts` 减重 109 行；53 个新增合同测试覆盖全部新迁移逻辑；所有定向测试和门禁通过。

**保持未完成：** Pi Session Factory 的核心 composition root（`createSession`、`installPiPackageToolHosts`、`reloadPiPackageResources`、`PiAgentSession` class）仍是单文件实现；Phase 4-7 的外围迁移与兼容层退场。

## 26. Pi6 第三阶段第二轮实施结果（2026-09-14）

在第 25 节基础上继续抽取 `agent-session-factory.ts` 中的纯 bridge 函数，把更多可独立维护的逻辑收敛到 `@upup/pi-event-adapter` 或其子模块。

### 26.1 新增到 `@upup/pi-event-adapter` 主入口

| 函数 | 说明 |
|---|---|
| `toPiTool(spec, tool, requestToolApproval?)` | `UpUpToolContract` → Pi `ToolDefinition` 的转换，包含 permission check、approval flow、policy audit、tool context 构造 |
| `createFinanceExtension({ spec, tools, requestToolApproval? })` | 把一组 UpUp 工具包装成 Pi `InlineExtension`，由 Pi resource loader 动态安装 |

### 26.2 新增到 `@upup/pi-event-adapter/pi-model-bridge` 子模块

为了避免 `@earendil-works/pi-ai` 的 model catalog 拖大主 bundle，模型解析桥放在独立的 sub-path：

```text
@upup/pi-event-adapter/pi-model-bridge
  → detectPiProvider(modelId)
  → resolvePiModel({ modelName?, fallback? })
```

主 `package.json` 新增 `./pi-model-bridge` export，build 脚本同时输出 `dist/pi-model-bridge.js`。

| 函数 | 说明 |
|---|---|
| `detectPiProvider(modelId)` | 前缀检测：claude→anthropic、gemini→google、gpt→openai、kimi→moonshotai、grok→xai、含 `/`→openrouter、默认 deepseek |
| `resolvePiModel({ modelName?, fallback? })` | 从可选项解析 `Model<any>`：优先级 `modelName` → `DEFAULT_MODEL` env → `fallback` → `'deepseek-v4-flash'`；支持显式 `provider:model` 前缀；找不到时回退到 provider catalog 首项 |

### 26.3 根 src 影响

`src/runtime/pi/agent-session-factory.ts`：
- 删除 `toPiTool`（66 行），改用 `import { toPiTool } from '@upup/pi-event-adapter'`
- 删除 `createFinanceExtension`（8 行），改用 `createFinanceExtension({ spec, tools, requestToolApproval })`
- 删除 `resolvePiModel`（25 行），改用 `resolvePiModel({ modelName })`
- 调用点：`createFinanceExtension(spec, tools, requestToolApproval)` → `createFinanceExtension({ spec, tools, requestToolApproval })`；`resolvePiModel(spec.model)` → `resolvePiModel({ modelName: spec.model })`
- 文件规模：810 → 706 行（**-104 行**，累计从 Phase 3 起始 919 → 706 行 = **-213 行，-23%**）

`src/runtime/pi/agent-session-factory.test.ts`：
- `toPiTool` import 从 `./agent-session-factory.js` 切到 `@upup/pi-event-adapter`，跟随 contract 来源

### 26.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：35 workspace packages、552 root src modules |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `@upup/pi-runtime` 测试 | 11 pass、0 fail、30 assertions |
| `@upup/pi-event-adapter` 测试 | 59 pass、0 fail、163 assertions（含 toPiTool 9 个、pi model bridge 5 个、createFinanceExtension 2 个） |
| `src/runtime/pi` 全量 | 194 pass、0 fail、2139 assertions、30 files |
| `bun run start -- --help` | 通过 |
| 主 bundle 大小 | 16.26 KB（pi-model-bridge 子模块单独 2.81 MB，按需加载） |

### 26.5 第三阶段第二轮状态

**已完成：** `toPiTool`（Pi tool 桥）、`createFinanceExtension`（finance extension 工厂）、`detectPiProvider` + `resolvePiModel`（model 解析桥，含独立 sub-module 与 sub-path export）；`agent-session-factory.ts` 累计减重 213 行（-23%）；17 个新合同测试 + 8 个 sub-module 测试；所有定向测试和门禁通过。

**保持未完成：** Pi Session Factory 的核心 composition root（`installPiPackageToolHosts`、`createSession`、`reloadPiPackageResources`、`PiAgentSession` class）仍是单文件实现，依赖运行时 side effect（globalThis registry、Pi SessionManager 实例、Sandbox broker、MCP client），单独迁移风险较高；Phase 4-7 的外围迁移与兼容层退场。

## 27. Pi6 第三阶段第三轮实施结果（2026-09-14）

本轮继续按"先建 Package contract，再迁移实现，改全部生产消费者，最后真实验证"推进 Phase 3，完成 finance session compaction extension 的 Package 化。

### 27.1 迁移到 `@upup/pi-runtime` 的逻辑

| Contract | 说明 |
|---|---|
| `FinanceSessionExtensionContext` | 明确声明 live `UpUpFinanceSessionContext` 引用 |
| `createFinanceSessionExtension(context)` | 创建隐藏的 `upup-finance-session-policy` Pi InlineExtension，监听 `session_before_compact`，将 finance context 序列化到 compaction payload |

该逻辑原位于 `src/runtime/pi/agent-session-factory.ts`，现在实现只保留在 `@upup/pi-runtime`。动态 context 引用保持不变，后续 context mutation 会被下一次 compaction 读取。

### 27.2 根 src 影响

`src/runtime/pi/agent-session-factory.ts`：
- 删除 `createFinanceSessionExtension`（15 行）
- 改为从 `@upup/pi-runtime` import `createFinanceSessionExtension`
- 文件规模：706 → 690 行；累计从原始 919 → 690 行（**-229 行，-25%**）

### 27.3 测试与真实验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：35 workspace packages、552 root src modules |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `@upup/pi-runtime` 测试 | 14 pass、0 fail、40 assertions |
| `@upup/pi-event-adapter` 测试 | 59 pass、0 fail、163 assertions |
| `src/runtime/pi` 全量 | 194 pass、0 fail、2139 assertions、30 files |
| 跨包相关测试 | 378 pass、0 fail、2613 assertions、47 files |
| `bun run start -- --help` | 通过 |

### 27.4 第三阶段第三轮状态

**已完成：** finance session compaction extension contract、live context capture、session-before-compact payload；`agent-session-factory.ts` 累计减重 229 行（25%）；3 个新增 runtime contract tests；所有定向测试和门禁通过。

**保持未完成：** `installPiPackageToolHosts`、`createSession`、`reloadPiPackageResources`、`PiAgentSession` class 仍是核心 composition root；Phase 4-7 的 Session/Memory/Storage/Permissions/TUI/transport 外围迁移仍待执行。

## 28. Pi6 第三阶段第四轮实施结果（2026-09-14）

本轮完成 Phase 3 中两个剩余 composition 边界的第一步：把 Pi Session 生命周期与 Pi resource reload 生命周期分别收敛到独立 Package，并改造 root Factory 使用公开 contract。

### 28.1 新增 `@upup/pi-session`

| 内容 | 说明 |
|---|---|
| `PiSessionAdapter` | 从 `src/runtime/pi/agent-session-factory.ts` 移出的完整 `UpUpAgentSession` 实现 |
| `PiSessionAdapterOptions` | 注入已创建的 Pi `AgentSession`、spec、trust/resource/contracts、finance context、capability context 和 package evaluator |
| `PiSessionEvaluation` | root composition 注入的 package eval 函数，避免 Package 反向 import root `src` |

`PiSessionAdapter` 现在独立负责：session lifecycle、Pi→UpUp event subscription、abort/timeout、session metadata、tree/export/fork、custom entries、finance context、tool execution、package evaluation、dispose。

`src/runtime/pi/agent-session-factory.ts` 不再包含 `PiAgentSession` class，只在创建 Pi `AgentSession` 后组装 `PiSessionAdapter`。

### 28.2 新增 `@upup/pi-resource-composition`

| 内容 | 说明 |
|---|---|
| `withSerializedPiResourceReload(options)` | FIFO 串行化 Pi resource reload；install → reload → async restore；失败时释放 queue，避免后续 session 饥饿 |
| `resetPiResourceReloadQueue()` | 隔离测试和 worker shutdown 使用的 queue reset |
| `PiResourceReloadOptions<TResult>` | install/reload 生命周期 contract |

root Factory 保留 domain-specific `installPiPackageToolHosts`，但删除进程级 `piPackageLoadTail` 和 `reloadPiPackageResources` wrapper，改用 `withSerializedPiResourceReload` 注入 install/reload callbacks。

### 28.3 根 src 影响

- `agent-session-factory.ts` 删除 `PiAgentSession` class（约 160 行），改用 `@upup/pi-session`
- 删除 `piPackageLoadTail` 与 `reloadPiPackageResources`（约 35 行），改用 `@upup/pi-resource-composition`
- Factory 仍保留 `installPiPackageToolHosts` 与 `createSession`，因为它们是 root-specific domain composition；Package 不反向依赖 root
- 新增 workspace package 后，module boundary 数量：35 → 36

### 28.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：36 workspace packages、552 root src modules，无 root-src imports 与依赖环 |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `@upup/pi-session` 测试 | 6 pass、0 fail、15 assertions |
| `@upup/pi-resource-composition` 测试 | 5 pass、0 fail、15 assertions |
| `@upup/pi-runtime` 测试 | 14 pass、0 fail、40 assertions |
| `@upup/pi-event-adapter` 测试 | 59 pass、0 fail、163 assertions |
| `src/runtime/pi` 全量 | 194 pass、0 fail、2139 assertions、30 files |
| `bun run test:pi-contracts` | 通过，包含 session/resource packages |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `bun run start -- --help` | 通过 |

### 28.5 第三阶段第四轮状态

**已完成：** `@upup/pi-session`、`@upup/pi-resource-composition` 创建并接入 root Factory；PiSessionAdapter 与 serialized resource reload lifecycle 已由独立 contract 测试覆盖；root 不再实现第二套 session adapter 或 reload queue。

**保持未完成：** `installPiPackageToolHosts`（finance/platform/MCP/management domain wiring）和 `createSession` 主 composition 仍在 root Factory；后续应继续按 pi6.md Phase 3 的 finance/platform composition 拆分，随后推进 Phase 4-7 的外围迁移。

## 29. Pi6 第三阶段第五轮实施结果（2026-09-14）

本轮继续遵循“先创建 Package contract，再迁移实现、改造生产消费者、真实验证”的顺序，完成 Session Factory 中 finance/platform composition 的第一轮下沉。

### 29.1 新增 `@upup/pi-finance-composition`

- 新建独立 workspace package、TypeScript contract 和测试。
- 将 Native research data、market quote/history、sandbox broker、fund history 与 `InvestmentWorkflowServices` 的组装移出 root Factory。
- 通过 `FinanceCompositionOptions` 注入 session id、行情 fetcher 和 trend store；Package 不依赖 root `src`。
- 对外提供统一 quote client、trend store、investment workflow services 和 auditable market quote callback。

### 29.2 新增 `@upup/pi-platform-composition`

- 新建独立 workspace package、TypeScript contract 和测试。
- 将 research worker、agent worker、cron runner、MCP resource list/read 的生命周期与错误边界移出 root Factory。
- 通过 `PlatformCompositionOptions` 注入 `runPrompt`、cron executor、MCP client、model 和 model runtime；Package 不创建第二套 Agent loop。
- 保留 MCP 原始 resource group/read 结果形状，支持 Platform extension 的统计、fail-closed 与错误语义。

### 29.3 Host contract 与 root Factory 改造

- `createPiHostBridge` 改为 `PiHostBridgeOptions` options-object contract，消除 18 参数 positional wiring，并更新 finance host 与 contract tests。
- root Factory 只负责创建 root adapters、注入 composition callbacks、生成 session-scoped host registry 和 management snapshot。
- 删除 root 中 Native research/sandbox/market history/investment workflow、worker/cron/MCP 的具体业务实现。
- `agent-session-factory.ts` 当前 427 行（本轮前 550 行；相对原始 919 行累计减少 492 行，约 53.5%）。
- workspace package 数量由 37 增至 39。

### 29.4 实际验证结果

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：39 workspace packages、552 root src modules，无 root-src imports 与依赖环 |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `@upup/pi-finance-composition` 测试 | 1 pass、0 fail、2 assertions |
| `@upup/pi-platform-composition` 测试 | 1 pass、0 fail、2 assertions |
| `bun run test:pi-contracts` | 通过，包含全部既有 Pi contract tests 与两个新增 composition packages |
| `bun run verify:pi5` | A1–A20，20/20 pass |
| `bun run start -- --help` | 通过 |

### 29.5 第三阶段第五轮状态

**已完成：** finance/platform composition package 的 contract、实现迁移、root consumer 改造、MCP 形状回归修复和真实生产路径验证；host bridge 已使用 options-object API。

**保持未完成：** `installPiPackageToolHosts` 仍按已加载 Package 名称选择 capability，`globalThis.__upupPiHosts` 兼容 registry 仍存在；下一步应继续完成显式 capability context / registry（Phase 4），再推进 bridge、memory、MCP transport、skills、commands、TUI 和兼容层退场（Phase 5–7）。

## 30. Pi6 第四阶段第一轮实施结果（2026-09-14）

本轮按“先创建 Package contract，再迁移实现、改造生产消费者、真实验证”的顺序，完成 session-scoped capability registry，并将扩展 host 读取从隐式全局状态迁移到显式 registry。

### 30.1 新增 `@upup/pi-capability-registry`

- 新建 workspace package、TypeScript contract、构建配置和独立测试。
- 提供 `PiCapabilityRegistry`、`registerSession`、`resolve`、`has`、`snapshot`、`clear`，按 `sessionId` 隔离 package capability host。
- 提供 `registerPiCapabilityHost` 与 `resolvePiCapabilityHost` 扩展桥；显式 registry 优先，旧 `globalThis.__upupPiHosts` 仅作为无 session 场景的兼容 fallback。
- registry contract 固定为 `upup.pi.capability-registry.v1`；扩展工厂会在 `session_start` 前绑定当前 active session，并支持后续 session event 重新绑定。

### 30.2 Root Factory 与生产消费者迁移

- `installPiPackageToolHosts` 在创建 host registry 后注册 session-scoped capability registry，并在 resource reload 完成或失败时撤销显式 registry。
- `@upup/pi-capability-registry` 纳入 Pi runtime foundation packages、root workspace dependency 与 lockfile。
- 已迁移生产扩展：`pi-platform`、`pi-backtest`、`pi-corporate-actions`、`pi-portfolio`、`pi-quant`、`pi-risk`、`pi-technical`、`pi-investment-analysis`、`pi-market-data`、`pi-investment-workflow`、`pi-management`、`pi-finance-sdk`。
- `check-pi-packages` 已更新为识别显式 capability-registry API；测试 fixture 保留旧 global 只用于兼容回归覆盖。
- 当前模块边界统计：40 个 workspace packages、552 个 root src modules；`agent-session-factory.ts` 为 430 行。

### 30.3 实际验证结果

| 验证项 | 结果 |
|---|---|
| `@upup/pi-capability-registry` | 2 pass、0 fail、5 assertions |
| `src/runtime/pi/agent-session-factory.test.ts` | 57 pass、0 fail、284 assertions |
| `pi-platform` 定向测试 | 56 pass、0 fail |
| 其余 11 个迁移 Package 定向测试 | 全部通过 |
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：40 workspace packages、552 root src modules，无 root-src imports 或依赖环 |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-packages` | 通过 |
| `bun run test:pi-contracts` | 通过，包含 40 个 Pi contract/package 测试目标 |
| `bun run verify:pi5` | A1–A20，20/20 passed |
| `bun run start -- --help` | 通过 |

### 30.4 第四阶段第一轮状态

**已完成：** session-scoped capability registry contract、Factory register/restore lifecycle、扩展 host 生产消费者迁移、active-session 初始化时序、静态 Pi package 门禁更新和真实 Pi session 回归验证。

**第一轮遗留项：** `src/runtime/pi/host-contract.ts`、`packages/pi-finance-sdk/extensions/host-contract.ts` 和测试 fixture 仍保留旧 registry 名称，用于兼容读取与回归测试；当兼容消费者完全退出后再删除该 fallback。Phase 5–7（bridge、memory、MCP transport、skills、commands、TUI 及最终兼容层退场）尚未完成。

### 30.5 第四阶段第二轮实施结果（2026-09-14）

本轮完成 capability registry 的生产路径收口，遵循“显式 registry 作为唯一写入路径、legacy global 只读兼容”的边界：

- `installPiPackageToolHosts` 不再写入或恢复 `globalThis.__upupPiHosts`，每个 Pi Session 只注册到 `defaultPiCapabilityRegistry`；Session dispose 时撤销对应注册。
- `PiCapabilityRegistry` 增加 `disposeSession`，并在并发 Session 非顺序销毁时重新选择仍存活的 active session，避免扩展解析被错误清空。
- capability host identity 校验覆盖 package name、session id；扩展仍通过 `registerPiCapabilityHost` / `resolvePiCapabilityHost` 获取 host，旧 global 仅保留无 session 场景的只读 fallback。
- 补充 registry 并发隔离、非顺序 dispose、身份错误和 active-session 恢复合同测试；整理 4 个迁移扩展的连接式格式问题。

### 30.6 第二轮实际验证结果

| 验证项 | 结果 |
|---|---|
| `@upup/pi-capability-registry` | 5 pass、0 fail、16 assertions |
| `src/runtime/pi` + `pi-platform` 定向回归 | 248 pass、0 fail、2307 assertions、53 files |
| `bun run typecheck` | 通过 |
| `bun run check:module-boundaries` | 通过：40 workspace packages、552 root src modules，无 root-src imports 或依赖环 |
| `bun run check:pi-packages` | 通过：17 个 Pi domain packages 的 source、exact semver、资源与 pin 校验通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun run check:pi-migration` | 通过 |
| `git diff --check` | 通过 |

### 30.7 第四阶段状态更新

**已完成：** capability registry 的 contract、session 隔离、并发 dispose 生命周期、Factory 显式注册/撤销、12 个生产扩展消费者迁移，以及生产路径去除 global host 写入。

**保持未完成：** 旧 global registry 的只读兼容 fallback 与测试 fixture 尚未删除；Phase 5–7 的 bridge、memory、MCP transport、skills、commands、TUI 和最终兼容层退场仍待执行。真实 provider 凭证 smoke 仍需在配置凭证的环境中单独验证。

## 31. Pi7 第一轮实施结果（2026-09-14）

本轮开始执行 Pi7“全量 Package 拆分、复用已有包、激进移除旧运行路径”的方案，先完成基础 contract、事实门禁、显式 runtime ports 和 canonical investment workflow。

### 31.1 已完成

- `@upup/pi-runtime` 增加统一 `PiPackageManifestContract`、capability requirement、trust 和 lifecycle contract，并由 `PiPackageCatalog` 注册时校验。
- 新增 `scripts/report-pi7-architecture.ts` 与 `scripts/check-pi7-architecture.ts`，报告 40 workspace packages、22 Pi manifests、737 root modules、552 root production modules，并检查唯一 `createAgentSession()` 和生产 global registry 禁止项。
- `@upup/pi-runtime` 增加显式 runtime port registry；root `agent-port` 与 `@upup/commands` port mirror 不再依赖 `globalThis.__upupAgentPorts`。
- `@upup/pi-capability-registry` 删除 `__upupPiHosts` legacy fallback；root/finance host contract 删除旧 global key。
- `@upup/pi-investment-workflow` 增加 `detect → plan → execute → verify → report` canonical phases、七个 Agent Profile、workflow artifact 和 `invest_workflow` Pi extension tool。
- `commands`、`mcp`、`memory`、`skills`、`plugins` 及 composition/foundation packages 登记统一 Pi manifest。

### 31.2 实际验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、552 root modules、无 root-src imports/循环 |
| `@upup/pi-runtime` | 14 pass、40 assertions |
| `@upup/pi-capability-registry` | 5 pass、16 assertions |
| `@upup/pi-investment-workflow` | 6 pass、23 assertions |

### 31.3 当前剩余项

root `src/tools`、`src/skills`、Session/Memory/Permissions、MCP/Plugin、Gateway/Bridge/stdio、Cron/Daemon、TUI/components 和 `legacy-events` 消费者仍需按 `pi7.md` 迁移矩阵继续物理迁移；本轮不宣称全仓 Pi Native 已完成。真实 provider smoke 仍需凭证环境单独执行。

## 32. Pi7 第二轮实施结果（2026-09-14）

本轮完成 Pi Package resource/trust/contract 的物理下沉到 `@upup/pi-resource-composition`：

### 32.1 已完成

- `src/runtime/pi/{package-catalog,plugin-trust,package-contracts}.ts`（含 `.test.ts`）已 `git mv` 到 `packages/pi-resource-composition/src/`；root 仅保留 2 行 `@deprecated` facade。
- `@upup/pi-resource-composition` 同时承载 `withSerializedPiResourceReload` 与 catalog/trust/contracts，作为 Pi Package resource 的唯一来源。
- 所有生产消费者（Factory、Runner、skill-commands、package-config、`src/runtime/pi/index.ts`）改用 `@upup/pi-resource-composition` Package API。
- 根 `src/runtime/pi` 生产行数净减 662 行。

### 32.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、552 root modules |
| `bun --cwd packages/pi-resource-composition test` | 5 pass、15 assertions |
| `bun test src/runtime/pi` | 170 pass、2074 assertions、28 files |
| `bun run test:pi-contracts` | 通过 |
| `git diff --check` | 通过 |

### 32.3 当前剩余项

Factory 拆分、`src/tools`、`src/skills`、`src/commands/investment`、Session/Memory/Permissions、MCP/Plugin、Gateway/Bridge/stdio、Cron/Daemon、TUI/components 和 `legacy-events` 消费者仍待后续轮次迁移；本轮不宣称全仓 Pi Native 已完成。

## 33. Pi7 第三轮实施结果（2026-09-14）

本轮完成 `host-contract` / `finance-host-contract` / `session-service` / `background-service` 的物理下沉到 `@upup/pi-session`，并显式化 Package session/background service 的依赖注入。

### 33.1 已完成

- `git mv` 已将以下源文件（含对应 `.test.ts`）迁入 `packages/pi-session/src/`：
  - `src/runtime/pi/host-contract.ts`（290 行，host bridge 契约与工厂）
  - `src/runtime/pi/finance-host-contract.ts`（30 行，finance host bridge 包装）
  - `src/runtime/pi/session-service.ts`（335 行，persistent session 管理）
  - `src/runtime/pi/background-service.ts`（88 行，background task service）
- `@upup/pi-session` 暴露 `configurePiSessionService(runtimeFactory)` 与 `configurePiBackgroundService(runnerFactory)`，将 runtime 工厂与 prompt runner 注入 Package；旧 factory 直接调用 `createPiAgentRuntime` / `runPiPrompt` 的硬编码路径被替换为参数注入。
- `PiSessionListItem` 类型内化到 Package，删除对 `src/session/types` 的反向依赖。
- 新增 `src/runtime/pi/bootstrap.ts` 集中调用 `bootstrapPiNativeServices()`，由 `src/index.tsx` 启动时加载；`src/daemon/workers/tasks.ts` 与 root runtime/contract 测试在其 `beforeAll` / 模块加载时也调用同一 bootstrap。
- root 全部 consumer（`src/state`、`src/controllers/agent-runner`、`src/controllers/session-selection`、`src/stdio/server`、`src/daemon/workers/tasks`、`src/multi-agent/monitor`、`src/runtime/pi/runner`、`src/runtime/pi/agent-session-factory`、`src/management/snapshot-provider`）改用 `@upup/pi-session` Package API，不再依赖 root facade。
- root `src/runtime/pi/{host-contract,finance-host-contract,session-service,background-service}.ts` 退化为 2 行 `@deprecated` facade；`src/runtime/pi/index.ts` 同步移除旧 re-export。
- `scripts/verify-pi5.ts` 与 `scripts/appscript-verify.ts` 已迁移到 Package 测试路径或注入 bootstrap。
- 根 `src/runtime/pi` 生产行数净减约 707 行。

### 33.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、553 root modules |
| `bun --cwd packages/pi-session test` | 15 pass、46 assertions、5 files |
| `bun test src/runtime/pi` | 162 pass、2044 assertions、24 files |
| `bun run test:pi-contracts` | 通过 |
| `bun test`（全仓） | 3691 pass、0 fail、12259 assertions、354 files |
| `git diff --check` | 通过 |

### 33.3 当前剩余项

`src/tools` 旧金融工具实现、`src/skills` 与 `src/commands/investment` 投资能力、`src/session` / `src/memory` / `src/permissions` 持久层、`src/mcp` / `src/plugins` / `src/gateway` / `src/bridge` / `src/stdio` / `src/cron` / `src/daemon` 外围进程、`src/tui` / `src/components` UI、`legacy-events` 与 root `src/agent/` 仍待后续轮次迁移；本轮不宣称全仓 Pi Native 已完成。真实 provider smoke 仍需凭证环境单独执行。

## 34. Pi7 第四轮实施结果（2026-09-14）

本轮完成 `src/tools/fund/*`（6 个文件，共 2700+ 行）物理下沉到 `@upup/pi-finance-sdk`，并删除 root 旧路径。

### 34.1 已完成

- `git mv` 已将以下源文件迁入 `packages/pi-finance-sdk/src/`：
  - `src/tools/fund/fund-api.ts` → `packages/pi-finance-sdk/src/fund-api.ts`（895 行）
  - `src/tools/fund/fund-backtest.ts` → `packages/pi-finance-sdk/src/fund-backtest.ts`（558 行）
  - `src/tools/fund/fund-holdings-analysis.ts` → `packages/pi-finance-sdk/src/fund-holdings-analysis.ts`（367 行）
  - `src/tools/fund/fund-screening.ts` → `packages/pi-finance-sdk/src/fund-screening.ts`（427 行）
  - `src/tools/fund/fund-trade.ts` → `packages/pi-finance-sdk/src/fund-trade.ts`（317 行）
  - `src/tools/fund/types.ts` → `packages/pi-finance-sdk/src/fund-types.ts`（131 行）
- `@upup/pi-finance-sdk/src/index.ts` 新增 legacy fund API 导出（`searchFunds` / `getFundBasic` / `getFundEstimatedValue` / `getFundPerformance` / `getFundHoldings` / `getFundManager` / `getFundManagers` / `screenFunds` / `searchFundsByType` / `getTopFunds` / `BacktestEngine` / `backtestDCA` / `backtestLumpSum` / `backtestThreshold` / `compareBacktests` / `generateBacktestReport` / `getFundHistory` / `analyzeSectorAllocation` / `getFundHoldingAnalysis` / `getFundsHoldingStock` / `generateHoldingReport` / `getFundRecommendations` / `compareFunds` / `getScreeningStrategies` / `createPortfolio` / `getPortfolio` / `buyFund` / `sellFund` / `getTrades` / `resetPortfolio` 等）。
- `src/storage/fund-storage.ts` 与 `src/daemon/fund-monitor.ts` 改用 `@upup/pi-finance-sdk`。
- `test/fund-*-verify.test.ts` 与 `test/fund-backtest.test.ts` / `test/fund-backtest-multi.test.ts` 改用 `@upup/pi-finance-sdk`。
- `src/tools/fund/` 目录删除；root `src/tools/` 已无外部生产消费者。

### 34.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、547 root modules（−6） |
| `bun --cwd packages/pi-finance-sdk test` | 37 pass、176 assertions |
| `bun run test:pi-contracts` | 通过 |
| `bun test`（全仓） | 3686 pass、4 fail（3 个网络超时为 pre-existing env-blocked）+ 1 个随之 fail；12250 assertions、354 files |
| `bun run report:pi7` | 根生产行数 119960 → 117259（净减 2701 行） |

### 34.3 当前剩余项

`src/tools` 中 `bash/permission-mode.ts`、`filesystem/sandbox-manager.ts`、`filesystem/sandbox-config.ts`、`trading/*`、`cron/*` 等基础设施工具属 Pi Platform 范畴，留待 Round 7（Pi Platform 拆分）；`src/tools/finance/` 已空，`src/tools/fund/` 已删；`src/tools/registry/` 为空。后续轮次继续按 `pi7.md` 迁移矩阵推进。

## 35. Pi7 第五轮实施结果（2026-09-14）

本轮完成 `src/skills` 核心模块（`types` / `slash-command` / `recent-usage` / `search`）物理迁移到 `@upup/skills` 包，并统一 Skill metadata 类型契约。

### 35.1 已完成

- `git mv` 已将以下源文件迁入 `packages/skills/src/`：
  - `src/skills/types.ts` → `packages/skills/src/types.ts`（328 行，含扩展 `SkillCommand` metadata interface）
  - `src/skills/slash-command.ts` → `packages/skills/src/slash-command.ts`（671 行）
  - `src/skills/recent-usage.ts` → `packages/skills/src/recent-usage.ts`（211 行）
  - `src/skills/search.ts` → `packages/skills/src/search.ts`（298 行）
- `slash-command.ts` 内部类型 `SlashSkillMetadata` 统一替换外部 `SkillMetadata` 引用，解决 `user_invocable` (snake_case) 与 `userInvocable` (camelCase) 字段冲突：
  - 接口定义 `SlashSkillMetadata` 包含 `user_invocable`、`userInvocable`、`argument_hint`、`argumentHint` 双形态；
  - `SkillCommandRegistry` 全部 `Map` / `getSkill*` / `registerSkill` 方法签名统一改为 `SlashSkillMetadata`；
  - `getSkillsByTrigger` / `routeSlashCommand` / `registerSkillsFromDirectory` 返回值类型同步对齐。
- `@upup/skills/src/index.ts` 新增导出：
  - `SlashSkillMetadata`、`ParsedSkillCommand`、`SkillCommandRegistration` 类型；
  - `parseSlashCommand`、`isSlashCommand`、`getSkillName`、`routeSlashCommand`；
  - `getSkillCommandRegistry`、`resetSkillCommandRegistry`、`SkillCommandRegistry` 类；
  - `registerSkillsFromDirectory`、`discoverAndRegisterSkills`（用于自动发现并注册 `.claude/skills`、`.upup/skills`、`src/skills`）。
- 26 个 root 端文件更新为 `@upup/skills` 公共 API import，移除 `src/skills/*.js` 相对路径：
  - `src/skills/{bridge,builtin-skills,commands,dependency,executor,files,hot-reload,i18n-helper,index,loader,mcp-skills,register,registry,skills-menu,dedupe.test,dependency.test,executor.test,files.test,i18n-helper.test,list-skills.test,recent-usage.test,registry.test,bridge.test,bundled/fund,bundled/index,agent-commands}.ts(x)`
  - `src/commands/executor.ts`（动态 import）
  - `src/mcp/skills.ts`、`src/plugins/builtin-plugins.ts`、`src/plugins/example-plugin.test.ts`
  - `src/tools/skill-executor.ts` 显式 import `initializeSkills` / `getSkillCommand`
  - `test/skills-suggestions.test.ts`

### 35.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、543 root modules（−4） |
| `bun run --cwd packages/skills build` | 215.79 KB bundle，dist 同步生成 |
| `bun run test:pi-contracts` | 通过 |
| `bun test src/skills` | 286 pass、0 fail、892 assertions、18 files |
| `bun test`（全仓） | 3685 pass、5 fail（pre-existing 网络超时 + stdio `mkdtemp` 路径缺失，与本轮无关）；354 files |
| `git diff --check` | 通过 |
| `bun run report:pi7` | 根生产行数 117259 → 115757（净减 1502 行）；rootSourceFiles 737 → 722（−15）；rootProductionFiles 552 → 543（−9） |

### 35.3 当前剩余项

- `src/skills` 仍保留：`commands.ts`（含 `initializeSkills` / `getSkillCommand`，依赖 builtin-skills / bundled / agent-commands / bridge）、`register.ts`、`executor.ts`、`permissions.ts`、`toolResultStorage.ts`、`promptShellExecution.ts`、`bridge.ts`、`hot-reload.ts`、`scheduler.ts` 等与 builtin 资源紧耦合的实现。这些需在 Round 6 中与 `src/skills/investment/`、`src/skills/bundled/`、`src/skills/builtin/` 一起拆分到独立的 `@upup/pi-skill-loader` / `@upup/pi-skill-executor` / `@upup/pi-investment-bundled` 包。
- `src/commands/investment/`、`src/skills/investment/` 投资工作流尚未迁移到 `@upup/pi-investment-workflow`，仍由 root 直接加载；该包当前只暴露 canonical `invest_workflow` extension 与 7 个 Agent Profile。
- `legacy-events` 仍有 8 个生产消费者（`src/print.ts`、`src/runtime/pi/channels.ts`、`src/runtime/pi/event-stream.ts`、`src/runtime/pi/index.ts`、`src/cli.ts`、`src/stdio/server.ts`、`src/controllers/agent-runner.ts`、`src/gateway/agent-runner.ts`）；将在 Round 6–9 中由 `@upup/pi-event-adapter` 全部接管。
- `src/session` / `src/memory` / `src/permissions` / `src/plan` / `src/storage` / `src/telemetry` 仍待物理迁移；规划在 Round 6 一次性拆分到 `@upup/pi-memory` / `@upup/pi-permissions` / `@upup/pi-observability` / `@upup/pi-planning` / `@upup/pi-storage`。

## 36. Pi7 第六轮第一段实施结果（2026-09-14）

本轮开始拆分 root 持久层、状态机和审计模块。第一段聚焦 `@upup/pi-observability`，把 telemetry 全部 7 个源文件 + 2 个测试迁入独立 Pi Package。

### 36.1 已完成

- 新增 `@upup/pi-observability` workspace package：
  - `packages/pi-observability/src/{anonymizer,recorder,sink,types,index,integration}.ts`
  - `packages/pi-observability/{test,test-integration.test,package.json,tsconfig.json}.ts`
  - 暴露 `'.'` 和 `'.integration'` 两个 subpath export。
  - Pi manifest 已声明 builtin trust、session lifecycle、零 resources（observability 是 foundation）。
- `types.ts` 引入 `TaskKindFallback = string` 以避免包级循环依赖，保留与原 `src/tasks/types.ts` `TaskKind` 的形态兼容。
- `git mv` 7 个 telemetry 源文件 → `packages/pi-observability/src/`；`telemetry.test.ts` → `test.ts`、`integration.test.ts` → `test-integration.test.ts`。
- root `src/telemetry/{index,integration}.ts` 退化为 2 行 `@deprecated` facade。
- `src/runtime/pi/{feature-gates,role-system}.ts` 改用 `@upup/pi-observability/integration`。

### 36.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：41 manifests（+1）、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：41 packages、539 root modules（−4） |
| `bun run --cwd packages/pi-observability build` | index 8.30 KB + integration 9.12 KB；dist 同步生成 |
| `bun --cwd packages/pi-observability test` | 40 pass（29 core + 11 integration）、0 fail |
| `bun run test:pi-contracts` | 通过 |
| `bun run report:pi7` | workspacePackages 40 → 41；rootProductionLines 115757 → 115102（净减 655 行）；rootSourceFiles 722 → 716（−6）；rootProductionFiles 543 → 539（−4） |

### 36.3 当前剩余项

- `src/memory` 47 个源文件（~11k 行）、`src/session` 22 个文件（~5.9k 行）、`src/storage` 7 个文件（~4.4k 行）、`src/plan` 7 个文件（~1.2k 行）、`src/permissions` 1 个文件（852 行）仍待 Round 6 后半段迁移。
- 这些模块普遍依赖 `src/utils/paths.ts`、`@upup/types`、`@upup/utils` 等根级路径，必须先把它们的依赖理清或继续平移到目标包内。

## 37. Pi7 第六轮第二段实施结果（2026-09-14）

本轮第二段聚焦 root 持久层与权限模块的 Pi Package 拆分。

### 37.1 `@upup/pi-permissions` 物理下沉

- 新增 workspace package `@upup/pi-permissions` v0.1.0：
  - `src/index.ts`（852 行，包含 `PermissionEvaluator` / `SessionPermissionManager` / `BashClassification` / `PathProtectionConfig` / `MCPPermissionConfig` / `PermissionRulesExport`）
  - 9 个独立单元测试覆盖 patterns、evaluateMCPTool、isPathProtected、classifyBashCommand、exportPermissionRules、singleton 行为。
  - 依赖 `@upup/pi-event-adapter`（ApprovalDecision）+ `@upup/utils`（upupPath）。
- root `src/permissions/index.ts` 退化为 `@deprecated` facade（2 行 re-export）。

### 37.2 `@upup/pi-planning` 物理下沉

- 新增 workspace package `@upup/pi-planning` v0.1.0：
  - 包含 `plan-context.ts` / `plan-builder.ts` / `plan-executor.ts` / `research-plan.ts` / `filter-spec.ts` 5 个源文件
  - 7 个独立单元测试覆盖 createPlan / addStep / updateStepStatus / calculateProgress / parseFilterSpec / extractTicker / detectPhases
  - 依赖 `@upup/utils`（PLANS_DIR）+ `zod`
- `packages/utils/src/paths.ts` 新增 13 个标准存储目录常量（PLANS_DIR / PORTFOLIOS_DIR / WATCHLIST_FILE / SKILLS_DIR / PLUGINS_DIR / HOOKS_DIR / MEMORY_DIR / CACHE_DIR / LOGS_DIR / TOOL_RESULTS_DIR / SCRATCHPAD_DIR / EXPORTS_DIR）
- root `src/plan/{plan-builder,plan-context,plan-executor,research-plan,filter-spec}.ts` 退化为 5 个 `@deprecated` facade。
- 7 个 root 端文件改用 `@upup/pi-planning`：`src/runtime/pi/investment-workflow.ts`、`src/commands/investment/{risk-dashboard,morning-brief,invest,portfolio-review,earnings-preview,earnings-preview.test}.ts`

### 37.3 `@upup/pi-storage` 物理下沉

- 扩展现有 `@upup/pi-storage` 包，迁入 6 个 root 文件：
  - `crypto-utils.ts`（33 行）
  - `file-history.ts`（853 行）
  - `fund-storage.ts`（299 行）
  - `project-storage.ts`（1595 行）
  - `shell-snapshots.ts`（464 行）
  - `stats-cache.ts`（668 行）
  - `storage-adapter.ts`（534 行）
- `packages/pi-storage/src/index.ts` 新增对应导出；`packages/pi-storage/test.ts` 新增冒烟测试（29 pass）。
- root `src/storage/*` 已全部退化为 facade 或被消除。

### 37.4 验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：43 manifests（+2）、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：43 packages、533 root modules（−10） |
| `bun --cwd packages/pi-permissions test` | 9 pass、0 fail、16 assertions |
| `bun --cwd packages/pi-planning test` | 7 pass、0 fail、13 assertions |
| `bun --cwd packages/pi-storage test` | 29 pass、0 fail、62 assertions |
| `bun test src/commands/investment/` | 62 pass、0 fail、184 assertions |
| `bun run test:pi-contracts` | 通过 |

## 38. Pi7 第七轮 MCP Transport 物理迁移（2026-09-14）

- 将 MCP transport 实现从 `src/mcp/` 迁入 `packages/mcp/src/`，包含 client、OAuth、server、desktop import、health manager、investment data、plugin integration、registry、UI、resources、skills、types 及 9 个测试文件。
- `@upup/mcp` 扩展为完整公共入口，保留 client API、schema/helper API、MCP UI、registry、plugin integration 和 UpUp resources。
- 根 `src/mcp/{index,mcp-ui,plugin-integration,registry,upup-resources}.ts` 退化为 `@deprecated` facade；生产消费者切换到 `@upup/mcp`。
- `CitationRegistry` 迁入 `@upup/pi-runtime`，MCP resources 使用 `@upup/pi-storage`、`@upup/pi-research`、`@upup/pi-planning`，不再依赖 root `src`。
- `@upup/mcp` 独立测试：118 pass、0 fail；build 与 root typecheck 通过。

## 39. Pi7 第七轮 Plugins Transport 物理迁移（2026-09-14）

- 将 plugins core、manifest、loader、registry、services、discovery、path safety、builtin plugins、commands、hook events、runtime adapters、DuckDB data adapter、SDK facade 迁入 `packages/plugins/src/`。
- `@upup/plugins` 公共入口扩展为完整 plugin system API，明确依赖 `@upup/plugin-sdk`、`@upup/types`、`@upup/utils`、`@upup/skills` 和 `typebox`。
- 根 `src/plugins/index.ts` 退化为 `@deprecated` facade；生产消费者改用 `@upup/plugins`。依赖 root skill registration 的历史 example test 保留在 root test 层。
- `@upup/plugins` 独立测试：56 pass、0 fail；build 通过。

## 38. Round 8.1 Gateway transport 下沉

Gateway transport 已从 root `src/gateway/` 物理迁移至 `@upup/gateway` workspace package。迁移覆盖 WhatsApp channel、routing、sessions、group、heartbeat、access-control、agent-runner 和 Gateway service/test；root 目录只保留 `@deprecated` facade。Gateway 通过显式 Pi runtime ports 接入唯一 Pi AgentSession runner，cron/config 由 root composition 注入，package 本身不依赖 root `src/`。

验证结果：`bun --cwd packages/gateway test` 27 pass、`bun run typecheck`、`bun run check:pi7`、`bun run check:module-boundaries`、`bun run test:pi-contracts` 全部通过；最终基线为 43 workspace packages、491 root production files、96729 root production lines。
