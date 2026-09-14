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
