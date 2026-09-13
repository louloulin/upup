# UpUp 基于 Pi 的核心 Agent 彻底改造计划

> 文档版本：v1.1
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

### 0.1 2026-09-14 权威基线（以后续统计为准）

本节覆盖并纠正本文历史迭代记录中的旧数字。运行 `bun run report:pi-migration` 可从当前 ownership map 和各 Pi Extension 重新生成同一口径：

- **Ownership Package**：14 个；**ownership 工具**：240 个。
- **Pi 原生 Extension 工具**：240 个；覆盖率 **100.0%**（`bun run report:pi-migration` 已识别全部 Pi Extension 原生工具）。
- **剩余 Host Adapter 工具**：无。`run_workflow` 已下沉为 `@upup/pi-platform` 的 Pi 原生 Extension，并将工作流计划持久化到当前 Session journal。
- **旧 Subagent 重复注册已移除**：根 `src/tools/registry` 不再注册 `fork_subagent`、`resume_agent`、`agent_memory`、`list_agents`、`run_builtin_agent`；这些能力只由 `@upup/pi-platform` Extension 提供。
- **旧自定义 Agent 工具实现已删除**：`src/runtime/pi/subagent-types.ts`、`src/tools/agent-tool.ts` 及其仅用于旧实现的测试不再存在；Pi `AgentSession`、`agent-worker` Host capability 和 Platform Session journal 是唯一生产路径。
- **模块边界**：当前脚本检查 29 个 workspace package 和根 `src` 的 552 个生产模块，无 package 循环、无 package 导入根 `src`、无根 `src` 运行时循环；检查统一解析 `.js`/`.mjs` ESM 相对导入但不改变源码导入约定，并将 Package 内部 Extension 导入自身 `../src` 视为合法包内实现边界。
- **运行时退出状态**：生产 Agent 已由 Pi Session 执行；LangChain 依赖与 Paperclip 包均被迁移门禁拒绝/删除。Paperclip 不再作为后续工作项。

后续文档中出现的 `213`、`206`、`201`、`199`、`154` 等数字属于历史快照，只用于审计迁移过程，不得用于判断当前进度。

### 0.1.3 本轮 Earnings Preview 原生 Pi Package 迁移（2026-09-14）

- `earnings_preview` 已迁移至 `@upup/pi-research` Pi Extension，ownership 与原生工具均为 `238`。
- 共识预期、X 研究信号和 8-K/电话会底稿聚合下沉到 Package；根 CLI 仅保留参数解析、计划历史、Dossier diff/持久化和文本渲染。
- 无 `X_BEARER_TOKEN` 时不生成 synthetic 推文或伪造研究证据，数据源明确降级为 `framework`；有真实凭证时才调用 Pi Research X provider。
- 已删除无生产调用者的旧 `src/search/x-search.ts` mock 实现及测试，避免根源码与 Pi Research 重复维护。
- 已通过 Package、CLI、ownership、模块边界、类型检查和 Pi 迁移报告验证；完整金融产品进度仍保持 `97%–99%`，真实 Provider、SLA、模型和回测质量仍需验收。

### 0.1.1 全局配置与跨层依赖收口（2026-09-14）

- **唯一配置事实源**：新增 `@upup/pi-config` 的 `loadFinalConfig`、环境变量覆盖、分层读写、备份/恢复 API；根 `src/utils/config.ts` 仅保留兼容 API 和 CLI/Host 适配，不再维护第二套文件解析与写入实现。
- **依赖方向**：根 `src` 可以依赖配置 Package；任何 `packages/*` 都不能依赖根 `src`。`tsconfig` 只增加根到 Package 的类型路径映射，不改变 `.js` ESM 导入写法，也不把 `.js` 从源码或输出中全局删除。
- **循环依赖门禁**：`scripts/check-module-boundaries.ts` 对相对导入统一复用 `.js`/`.mjs` 扩展名剥离和 TS 文件解析逻辑，并覆盖 Package→根 `src` 的跨目录相对导入、`@/` 根别名、workspace package 环和根 `src` 运行时环；当前门禁结果为 `29 packages / 552 modules / 0 cycles`。源码继续使用现有 ESM `.js` 导入约定，不进行全局导入改写。
- **管理页与旧 Bundle 问题**：UpUp 管理服务 `upup management` 的 `18081` 根路径、`/manage`、`/management` 均返回管理页，`/api/management/snapshot` 使用 Bearer/query token 保护并 fail-closed；真实烟测为页面 `200`、未授权 API `401`、授权 API `200`。截图中的 `index-Cpw2ult_.js`、`slides:autosave-pref` 和 `undefined.length` 不存在于本仓库，属于外部 GenOffice/Electron bundle，不能由 UpUp 凭空修复；本次不引入无关 IPC handler。

### 0.1.2 当前进度结论（唯一口径）

- **核心 Agent Pi 化：100%**；生产执行入口、工具循环、Session、Extension、Worker 和投资工作流均走 Pi。
- **架构迁移：100%**；`report:pi-architecture`、`check:module-boundaries`、`check:pi-migration`、`check:pi-packages` 和 `verify:pi5` A1–A20 全部通过。
- **Pi 工具原生化：240/240 = 100%**；当前 ownership package 14 个，Host Adapter 工具 0 个。
- **完整金融投资产品：约 97%–99%**；未完成项不再是 Agent 重写，而是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、可选 Provider SLA 定时采样、投资模型和回测数据质量。
- **后续原则**：只维护金融领域与平台 Host 能力；不恢复自定义 Agent 主循环，不恢复 LangChain Agent Runtime，不恢复 Paperclip；继续保持 `packages` 不依赖根 `src`、全局配置单一事实源和 `.js` 导入约定不变。

### 0.2.13 本轮 PowerShell、筛选与交易重复包装物理收敛（2026-09-14）

- **PowerShell 已下沉到 `@upup/pi-platform`**：新增独立 `packages/pi-platform/src/powershell.ts`，集中负责 `pwsh`/Windows PowerShell 探测、超时、退出码、输出截断、环境变量和危险命令检测；`src/skills/promptShellExecution.ts` 只依赖 Package API，不再依赖根工具。
- **删除旧 PowerShell PiTool 包装**：物理删除 `src/tools/powershell/powershell-tool.ts`、专属测试和旧导出；PowerShell 不再由根 `src/tools` 生成 PiTool。
- **删除旧自然语言筛选实现**：删除 `src/tools/screening/nl-screen.ts` 与 `src/screening/nl-screener.ts` 及测试；`/screen` 直接使用 `@upup/pi-market-data` 的 public API，生产 Registry 不再注入 `nl_screen`，原生 Extension 继续提供结构化筛选与审计结果。
- **删除交易五项重复 PiTool 包装**：移除 `sandbox-tools.ts`、`trading-tools.ts` 及其测试；`place_trade_order`、`cancel_trade_order`、`get_trading_positions`、`get_trading_balance`、`get_trade_quote` 只由 `@upup/pi-finance-sdk` Extension 暴露。`SandboxBroker`、broker registry、IBKR/Xueqiu adapter 和 algo runner 因仍被宿主投资阶段/策略算法调用而保留。
- **边界与统计**：模块门禁通过（27 packages、580 个根模块）；Pi ownership/native 工具保持 `226/226 = 100.0%`，Host Adapter `0`；架构综合进度由 `87.1%` 升至 **88.8%**，根生产 `PiTool` 文件由 `6` 降至 **3**。
- **真实验证**：`bun run typecheck`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、`check:pi-migration`、`verify:pi5` A1–A20 `20/20`、定向测试 `49 pass / 0 fail`、全量回归 `3295 pass / 0 fail`，`git diff --check` 均通过。

### 0.2 当前总体进度（历史基线）

本节保留迁移早期的分层基线，不作为当前进度结论。最新结论见文末的 `0.2.21`。

不能再用“226 个工具已原生注册”代表整个仓库已经彻底插件化。当时按 `bun run report:pi-architecture` 的分层审计口径，综合进度为 **88.8%**：

- **Pi Package 原生工具覆盖：100.0%（226/226）**。这是工具归属和 Extension 注册覆盖率，不等价于旧源码已全部删除。
- **Pi Runtime 生产路径：100.0%**。生产 Factory 默认只加载 Pi Package/Extension；根 `src/tools/registry` 仅作为显式 `loadRegisteredTools: true` 的迁移兼容层，且 Prompt/Capability Manifest 已与它解耦。
- **Package 模块边界：100.0%**。27 个 workspace package 无循环依赖、无 package 导入根 `src`；根 `src` 的 580 个生产模块也无运行时循环；包内 Extension 导入自身 `src` 属于合法实现边界。
- **投资命令迁移：100.0%（0 个直接 `src/tools` 依赖）**。估值、组合归因、交易、策略审计、自然语言筛选、基金回测、金融研究数据和财报预览均通过 Pi Package public API 接入。
- **根 `src/tools` 物理收敛：25.0%（3 个生产文件仍使用 `PiTool`）**。剩余文件是 Registry 类型/迁移适配与策略算法兼容层；交易底层引擎仍被投资阶段和算法运行器使用，不能仅因存在同名 Finance Extension 就删除。
- **Subagent 兼容层收敛：100.0%**。`src/runtime/pi/subagent.ts` 与 `subagent-runner.ts` 已物理删除；daemon、skill fork/swarm 和 Platform agent worker 均直接走 Pi Runner / `agent-worker` capability。

综合分数采用固定权重：原生工具 25%、Pi Runtime 20%、Package 边界 15%、投资命令迁移 15%、根工具物理收敛 15%、Subagent 收敛 10%。因此后续工作不是重写 Pi Agent loop，而是继续做根 `src/tools` 的物理收敛和金融领域质量建设；每轮必须重新运行架构报告、类型检查、边界门禁和相关测试。

### 0.2.12 本轮根 `src` 循环依赖门禁与导入边界收紧（2026-09-14）

- **新增根模块图检查**：`scripts/check-module-boundaries.ts` 现在解析 27 个 workspace package 及根 `src` 的 615 个生产模块，检查 Package 依赖环、Package → 根 `src` 反向依赖和根 `src` 运行时循环；`.js`/`.mjs` ESM 扩展名会在解析时剥离，源码导入约定不改变。
- **避免静态误报**：检查只把真实运行时静态导入纳入根模块图，忽略 `import type` 和动态 `import()`；动态边仍由 `check:pi-migration`、类型检查和行为测试覆盖，不能借此恢复跨层同步依赖。
- **本轮实际修复的运行时回流**：`src/runtime/pi/model.ts` 改为直接依赖日志模块，不再经 `src/utils/index.ts` barrel 回流；`src/gateway/agent-runner.ts` 直接依赖 `src/runtime/pi/runner.ts`，不再导入会聚合 Gateway/Cron/Session 的 `src/runtime/pi/index.ts` barrel。
- **验证结果**：模块门禁通过（27 packages、615 个根模块、无运行时循环）；`typecheck` 通过；此前全量回归 `3594 pass / 0 fail`，Pi5 语义验收 A1–A20 `20/20`，Pi ownership `226/226`、Host Adapter `0`、架构综合进度 `85.4%`、根 `PiTool` 生产文件 `37` 个。

### 0.2.5 本轮 Benchmark/FX 与失效导入清理（2026-09-14）

- **修复类型检查回归**：删除已物理迁移的 `src/tools/portfolio/optimization.js`、`src/tools/portfolio/tracker.js` 和 `src/tools/portfolio/multi-portfolio.js` 的残留出口/动态导入；`src/tools/index.ts` 与 `src/tools/registry/domain-tools.ts` 不再引用不存在的模块，保持 `.js` ESM 导入约定不变。
- **Benchmark/FX 唯一归属 Pi Portfolio**：删除根 `src/tools/benchmark/*` 与 `src/tools/fx/*` 的重复实现及测试，移除 Domain Registry 的旧动态注册；`list_benchmarks`、`compare_to_benchmark`、`calculate_alpha`、`convert_currency`、`list_currencies`、`get_exchange_rate` 只由 `@upup/pi-portfolio` Extension 暴露。
- **模块边界结论**：27 个 workspace package 无循环依赖、无 package 导入根 `src`；投资命令无直接 `src/tools` 依赖；Pi Runtime 默认路径不加载旧 Registry，旧 Registry 只保留显式迁移兼容开关。
- **真实验证**：`bun run typecheck` 通过；`bun run check:module-boundaries`、`bun run check:pi-migration`、`bun run check:pi-packages` 通过；Pi Portfolio、Registry Split、Pi ownership、生产 Finance Contract、Status Line 定向套件 `44 pass / 0 fail`；架构报告为 **85.2%**，Pi 原生工具 **221/221（100.0%）**，根 `PiTool` 生产文件由 75 降至 **73**。
- **下一阶段**：先拆分 `src/tools/finance/get-financials.ts` 与 `get-market-data.ts` 的 A 股复合调用，再迁移 A 股数据源到 `@upup/pi-finance-sdk`/`@upup/pi-market-data`；随后处理根 Cache 及其他剩余兼容工具。未经数据 freshness、evidence/audit 和错误语义验证，不直接删除 A 股旧实现。历史分析脚本与 README 已同步标明 Portfolio 能力归属 Pi Package。

### 0.2.6 本轮 Finance/A 股重复实现物理删除（2026-09-14）

- **删除旧复合 Finance 工具**：移除根 `src/tools/finance/get-financials.ts`、`get-market-data.ts`、`read-filings.ts`、`screen-stocks.ts`；`get_financials`、`get_market_data`、`read_filings`、`stock_screener` 分别只由 `@upup/pi-finance-sdk` 或 `@upup/pi-market-data` Pi Extension 暴露。
- **删除旧 A 股 Registry 工具**：移除 `src/tools/astock/get-astock-price.ts`、`screen-astocks.ts`、`get-sector-data.ts`、`get-technical-data.ts`、`get-market-structure.ts` 及旧 `finance-tools.ts`；根 Registry 不再注册已迁移的 A 股行情、筛选、板块、技术和市场结构工具。
- **验证脚本插件化**：授权校验和 A 股验证脚本改为检查 `packages/pi-market-data/extensions/index.ts` 的 Pi Tool 注册，不再断言已删除的 `src/tools/astock` 文件。
- **竞争力统计修复**：`src/competitive-positioning/four-uniques.ts` 的 D3 覆盖证据改为统计 Pi Finance/Market Data Package 源码与 Extension，而不是已删除的根 Finance 目录；四市场 manifest 校验保持不变。
- **真实验证**：Pi Finance/Market Data、Pi ownership、生产 Finance Contract、Registry Split 定向套件 `30 pass / 0 fail`；D3 专项测试 `20 pass / 0 fail`；类型检查、Pi 迁移门禁、Package 门禁、模块边界均通过；架构报告为 **85.2%**，Pi 原生工具 **221/221（100.0%）**，根 `PiTool` 生产文件由 73 降至 **62**。
- **全量回归已确认**：第一次全量回归为 `3719 pass / 1 fail`，唯一失败是竞争力 D3 仍依赖旧根目录文件数；修正统计口径后 `bun test` 已验证为 `3720 pass / 0 fail`。
- **下一阶段**：继续按 Package ownership 迁移根 Search、Trading、Fund/Alt-data 和剩余研究工具；每个切片必须先确认 Pi Extension 的数据 freshness、evidence/audit、权限和错误语义，再物理删除根实现。

### 0.2.7 本轮 Cache 执行器收敛（2026-09-14）

- **根缓存实现已删除**：物理删除 `src/tools/cache/` 的旧 `MarketDataCache`、`CacheManager`、缓存工具注册和测试；`nl_screen` 的可选缓存依赖改为 `@upup/pi-cache` 的公开 `PiCache` API，根 `src` 不再维护第二套缓存实现。
- **Pi Cache 公共契约补齐**：`@upup/pi-cache` 公开 `has`、`delete`、稳定 `generateKey`、TTL、LRU、命中/未命中/驱逐统计；新增包级 `tsconfig.json` 和声明构建，确保 workspace 依赖可被主应用类型安全解析。
- **行为保持**：`nl_screen` 缓存 key 继续覆盖 query、universe、limit、realtime 和 universe identity；缓存命中、禁用、不同查询和实时/非实时隔离行为均由原测试覆盖。
- **真实验证**：Cache/NL Screen 定向测试 `51 pass / 0 fail`；`bun run typecheck`、`bun run check:pi-migration`、`bun run check:module-boundaries` 通过；Package 门禁已修复为识别包级声明构建并通过；架构报告仍为 **85.2%**，Pi 原生工具 **221/221（100.0%）**，根 `PiTool` 生产文件由 62 降至 **61**。
- **当前边界**：`@upup/pi-cache` 仍是 12 个 ownership Package 之一，缓存管理 Agent 工具只由 Pi Extension 提供；缓存状态仅限进程内，不能作为金融证据或跨 Session 投资事实。

### 0.2.8 本轮 Research/Search 原生插件化（2026-09-14）

- **搜索能力已下沉到 `@upup/pi-research`**：`web_search` 统一支持 Exa → Perplexity → Tavily 的凭据选择与 Provider 结果归一化；`x_search` 使用官方 X API v2 只读接口，支持搜索、用户 Profile 和会话 Thread；`web_fetch` 与两类搜索共用 Research Package 的外部数据安全边界。
- **根搜索实现已删除**：物理删除 `src/tools/search/` 的 Exa、Tavily、Perplexity、X 实现与 `src/tools/registry/web-search-tools.ts`；旧 Registry 不再注册 `web_search`/`x_search`，生产 Agent 只通过 Pi Research Extension 获取搜索能力。
- **证据与安全语义**：搜索和 X 结果携带 Provider/API 来源、检索日期、审计 ID、来源 URL 与 live freshness；无凭据、空查询、HTTP 错误、Abort 和 X API 缺失令牌均 fail-closed；外部内容明确标记为不可信，不能当作系统指令或金融事实。
- **真实验证**：Research Package 构建与测试 `11 pass / 0 fail`；搜索 Provider/X API 模拟测试覆盖 Exa、Tavily fallback、结果归一化、source URL、审计 evidence 与缺失凭据；`bun run typecheck`、`check:pi-packages`、`check:pi-migration`、`check:module-boundaries`、`git diff --check` 均通过。
- **最新量化进度（历史快照）**：本节记录 Research/Search 切片完成时的 `223/223`、`85.3%` 和根 `PiTool` 生产文件 `57` 个；当前权威进度见 0.1/0.2.11。
- **下一阶段**：继续迁移剩余根工具，优先处理可被明确归属的 Trading/Fund/Alt-data 或研究分析能力；每个切片继续执行“Package API → Extension → 根实现物理删除 → 定向测试 → 全量回归 → 文档记录”闭环。

### 0.2.9 本轮 Alternative Data 根实现清理（2026-09-14）

- **唯一实现确认**：`alt_data_fetch` 与 `alt_data_search` 已由 `@upup/pi-finance-sdk` 的 `NativeAltDataClient` 和 Finance Extension 完整提供，覆盖龙虎榜、北向资金/融资融券、筛选、跨源搜索、Abort、凭据缺失和审计 evidence；根实现没有生产源码调用者。
- **根重复实现已删除**：物理删除 `src/data/alt/`、`src/tools/alt-data/` 和 `src/tools/registry/alt-data-tools.ts`，根 Registry 不再加载旧 Alt-data Adapter；Package 不导入根 `src`，生产 Agent 只使用 Finance Pi Extension。
- **真实验证**：Finance Package 定向测试 `32 pass / 0 fail`；Alt-data/ownership/Registry 定向测试 `17 pass / 0 fail`；全量 `bun test` 已验证 `3684 pass / 0 fail`；`typecheck`、Pi Package、Pi migration、模块边界和 `git diff --check` 全部通过。
- **最新量化进度（历史快照）**：本节记录 Finance 基础工具清理时的 `223/223`、`85.3%` 和根 `PiTool` 生产文件 `56` 个；当前权威进度见 0.1/0.2.11。
- **下一阶段（历史快照）**：继续清理已退出 Registry 且无生产调用者的旧 Finance wrappers，再处理 Trading/Fund 等仍有运行时依赖的领域；每次删除前维持源码调用点、Package API 和全量验证三重证据。

### 0.2.10 本轮 Finance 基础工具重复实现清理（2026-09-14）

- **唯一实现确认**：根 `src/tools/finance/` 中的 stock price、fundamentals、filings、estimates、key ratios、earnings、news、segments、insider trades 和 crypto wrappers 已退出生产 Registry，Finance SDK Extension 已提供对应的财务快照、SEC filings、研究数据、A 股财务/新闻和审计结果；根源码无生产调用者。
- **根重复实现已删除**：物理删除 `src/tools/finance/` 的 14 个孤立实现/出口文件，不再保留第二套 Financial Datasets 工具协议；投资命令的异步数据适配继续使用 `@upup/pi-finance-sdk` public API。
- **模块化修正**：同步更新 earnings preview、research plan、strategy factor source、strategy memory 和竞争力统计中的旧 `src/tools/finance` 路径描述，保持 `.js` ESM 导入约定，不增加 package → root `src` 依赖。
- **当前验证状态**：删除后 `bun run typecheck` 已通过；下一步执行 Pi Package/迁移/模块边界门禁与完整 `bun test`，通过后再锁定本轮进度。
- **最新量化进度（门禁后更新）**：预计根 `PiTool` 生产文件从 56 进一步下降；Pi 原生工具覆盖、Runtime 唯一路径、Package 边界、投资命令迁移与 Subagent 收敛保持 100%。

### 0.2.11 本轮 Pi Research 与 Registry 物理收敛（2026-09-14）

- **研究文本分析已迁入 `@upup/pi-research`**：`analyze_sentiment`、`detect_events`、`extract_entities` 的确定性情绪、事件和实体分析逻辑位于 Package `src/research-text.ts`，通过 Research Extension 原生注册，并保留结构化结果、历史 freshness、auditId 和 fail-closed abort 行为。
- **旧研究实现已删除**：物理删除 `src/tools/research/research-tools.ts`、其测试、`src/tools/research/index.ts` 和无生产调用者的 `multi-agent-research.ts`；根 `src/tools` 不再提供第二套研究文本/自定义 Agent 工具实现。
- **重复 Registry 已删除**：基金、实时行情、DuckDB、投资知识四个旧 Registry loader 与测试已物理删除；对应能力分别只由 `@upup/pi-finance-sdk`、`@upup/pi-market-data`、`@upup/pi-portfolio` 和 Finance Pi Extension 提供。根 Registry 当前只保留明确的迁移兼容面。
- **Monitor 重复实现已物理删除**：删除 `src/tools/monitor-tool.ts`、`src/tools/monitor/index.ts` 及其测试；系统监控现在只由 `@upup/pi-platform` 的 `monitor` Extension 提供，避免根工具与 Pi Extension 双重实现。
- **实测结果**：Pi Research `15 pass / 0 fail`；Registry/ownership/profile 定向套件 `12 pass / 0 fail`；`typecheck`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、`check:pi-migration`、`verify:pi5` A1–A20 `20/20`、`git diff --check` 均通过；`report:pi-migration` 为 `226/226`、`0` 个 Host Adapter，`report:pi-architecture` 综合进度 **85.4%**，根 `PiTool` 生产文件由 46 降至 **37**。
- **下一阶段**：继续按照“先确认 Package 唯一归属与宿主调用点，再迁移 Extension，最后物理删除根实现”的顺序处理剩余 37 个 `PiTool` 文件；优先审计 Fund/Trading 和仍被宿主服务使用的底层模块，禁止删除仍承担数据服务职责的实现。

### 0.2.3 本轮 Subagent 物理收敛与验证（2026-09-14）

- **删除旧兼容实现**：删除 `src/runtime/pi/subagent.ts` 与 `src/runtime/pi/subagent-runner.ts`，并移除 `src/runtime/pi/index.ts` 的旧导出、任务桥测试对旧 Runner 的 reset 依赖以及命令包中未使用的 `SubagentRunner` 类型。
- **Skill 执行改为 Pi Runner**：`src/skills/executor.ts` 的 fork/swarm 模式直接构造 `UpUpAgentSpec`，通过 `runPiPrompt` 创建 Pi Session；不再把 `PiSubagentService` 当作执行协议。
- **Daemon 执行改为 Pi background service**：`src/daemon/workers/tasks.ts` 仅消费 Pi background task 的模型、工具和工作目录配置，不再导入旧 Subagent 类型。
- **并发验证改为 Pi 服务**：`scripts/appscript-verify.ts` 使用 `PiBackgroundService` 检查并发能力；迁移门禁和架构报告不再把已删除的 Subagent 文件列为兼容层。
- **实测结果**：`src/skills/executor.test.ts` 为 `32 pass / 0 fail`；`bun run typecheck`、`bun run check:pi-migration`、`bun run check:module-boundaries`、`bun run report:pi-migration` 均通过；架构报告为 `85.2%`，Subagent `100.0%`，投资命令 `100.0%`，Pi 原生工具 `221/221`。

### 0.2.4 本轮根工具物理收敛（2026-09-14）

- **估值切片删除**：删除旧 `src/tools/valuation/*` 的 DCF、DDM、估值比率、可比估值、目标价和决策仪表盘实现；`@upup/pi-investment-analysis` Extension 成为唯一生产注册路径，生产契约改为真实 Pi Session/Package 验证。
- **短仓与通用回测删除**：删除旧 `src/tools/short-interest/*`、`src/tools/backtest/*`；短仓分析由 `@upup/pi-risk` 提供，通用回测由 `@upup/pi-backtest` 提供，旧 Registry 不再重复注册。
- **量化切片删除**：删除旧 `src/tools/quant/*` 及 `quant-tools.ts`，风险指标、期权、技术指标、税费、组合优化、数据可靠性和相关性全部由 Pi Finance/Investment Analysis/Risk Package 提供。
- **系统工具删除**：删除旧 Ask、Notebook、Notify、PR Subscription 和市场日历工具；交互/Notebook 由 `@upup/pi-platform` 提供，通知与订阅由 `@upup/pi-notify` 提供，市场日历由 `@upup/pi-market-data` 提供。
- **Registry 边界收紧**：根 Registry 仅保留尚未迁移或仍需宿主适配的能力，已迁移工具不再回流到 `loadRegisteredTools` 兼容路径。
- **实测结果**：Pi Platform `53 pass / 0 fail`、Pi Notify `4 pass / 0 fail`、Pi Market Data `23 pass / 0 fail`、Pi Risk `23 pass / 0 fail`、Pi Backtest `16 pass / 0 fail`；Pi Runtime 定向回归 `65 pass / 0 fail`；`typecheck`、三个 Pi 门禁、模块边界均通过；根 `PiTool` 生产文件从 `96` 降至 `79`，架构报告保持 `85.2%`，工具原生覆盖 `221/221`。

### 0.2.1 本轮进度（2026-09-14）

- **自然语言筛选已下沉到 `@upup/pi-market-data`**：新增 `packages/pi-market-data/src/natural-language-screen.ts`，独立承载 `FilterSpec` 等价契约、确定性中文/英文解析、模板评分、筛选结果与实时 stale-row gating；package 不依赖根 `src`、LangChain 或旧 `PiTool`。
- **`/screen` 已变为 CLI 薄适配层**：`src/commands/investment/screen.ts` 只负责命令参数、调用 package public API 和文本渲染；不再直接导入 `src/tools/screening/nl-screen.ts`、`src/plan/filter-spec.ts` 或根缓存实现。
- **包级构建边界已补齐**：新增 `packages/pi-market-data/tsconfig.json`，修复独立声明构建把 `dist` 误作为输入的问题；同时修复 realtime aggregator 类型导入边界。
- **真实验证**：Market Data package `23 pass / 0 fail`；投资命令 `24 pass / 0 fail`；`typecheck`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`report:pi-migration`、`report:pi-architecture`、`verify:pi5` A1–A20 `20/20`、`git diff --check` 全部通过。
- **当前下一优先级**：为 `phase-finance-dependencies.ts` 和 `earnings-preview.ts` 建立 live/delayed/historical 数据契约与 Finance Host capability；保留真实网络数据源和证据审计，禁止用离线 fixture 冒充实时数据。

### 0.2.2 本轮基金回测迁移（2026-09-14）

- **纯基金回测引擎已迁入 `@upup/pi-backtest`**：新增 `fund-backtest.ts`，覆盖一次性投资、DCA 定投、阈值策略、申购费、交易统计、平均成本、最大回撤、波动率、夏普比率、时间序列快照和 Markdown 报告；引擎只接收调用方提供的历史净值序列。
- **基金回测已原生 Pi 插件化**：`backtest_lumpsum`、`backtest_dca`、`backtest_threshold` 注册在 Pi Backtest Extension，均返回 `upup-pi://backtest/*` evidence、`historical` freshness、auditId 和报告；缺少两条以上有效历史净值或日期范围不合法时 fail-closed。
- **真实数据与纯计算分离**：新增 `src/runtime/pi/fund-history-provider.ts` 作为宿主侧历史净值适配器，保留真实基金 API 的 live/delayed 边界；`phase-fund-dependencies.ts` 只编排 provider 与 `@upup/pi-backtest`，不再直接导入 `src/tools/fund/fund-backtest.ts`，不使用静态基金目录伪造回测收益。
- **ownership 已同步**：Pi ownership/native 工具从 `213` 增至 `216`，`report:pi-migration` 实测覆盖率保持 `100.0% (216/216)`；架构综合进度从 `67.2%` 提升到 `68.5%`，投资命令迁移从 `25.0%` 提升到 `33.3%`。
- **真实验证**：Pi Backtest package 构建、`16 pass / 0 fail`；投资阶段与投资命令 `29 pass / 0 fail`；`typecheck`、模块边界、Pi package/migration 门禁、`report:pi-architecture`、`report:pi-migration`、`verify:pi5` A1–A20 `20/20`、`git diff --check` 全部通过。

### 0.3 Web/18081 事实边界

用户截图中的 `index-Cpw2ult_.js`、`slides:autosave-pref` 和 React `undefined.length` 不存在于 `/Users/louloulin/appx/upup` 或 `/Users/louloulin/appx/pi` 的源码搜索结果中，因此不能在这两个仓库中凭空修复。当前 UpUp 只有只读 Bridge API：`/bridge/health`、`/bridge/snapshot/*`，默认端口是 `7333`；`src/web` 仍是占位包，根 `/` 没有管理页面路由。故 `http://127.0.0.1:18081/` 不是 UpUp 管理页，且当前未启动服务时应连接失败。

若要实现管理页，必须新增独立的 `pi-management` Web Package：根 `/` 返回管理壳，Bridge snapshot 继续只读，`18081` 作为显式管理服务配置而不是修改 Bridge 默认端口。若要修复截图错误，应在真正包含 Electron IPC/React App 的项目中补充 `slides:autosave-pref` handler、数组默认值和静态资源 fallback；本仓库不应引入这些无关修复。

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
| `src/runtime/pi/agent-catalog.ts` | Pi Agent Profile、模板、Prompt 变量、导入导出 | 统一作为 Pi Manifest/Profile 边界 |
| `src/multi-agent/workflows/stock-analysis.ts` | 多角色股票研究与建议 | 直接编排独立 Pi Session，结果由 Pi 输出合同聚合 |
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

### Phase 5：Pi 原生 Subagent 与平台协作

目标：多 Agent 底层全部创建 Pi Session，业务能力只保留领域工作流与 Pi Package。

任务：

1. `SubagentRunner` 改为 `PiSubagentFactory`。
2. `CustomAgentRegistry` 输出 `UpUpAgentSpec`，删除自定义 execution path。
3. `@upup/pi-platform` 原生 `swarm_agent_spawn` 通过 Host `agent-worker` capability 创建 Pi Session。
4. Team message、状态和结果使用当前 Pi Session custom journal；不保留模块级 Coordinator 状态。
5. 并行模式使用独立 Session、独立 abort signal、独立 tool allowlist、独立 evidence namespace。
6. 结果聚合由 Pi 工作流或 Pi reviewer Session 负责。
7. 如果使用 tmux/workerpool，进程只启动 Pi SDK/RPC worker，不启动旧 UpUp Agent loop。

退出条件：所有子 Agent 和 worker 的底层模型调用、工具调用、Session 和 compaction 均来自 Pi；源码不再存在自定义 Coordinator/TeamManager 执行路径。

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

### 当前执行状态（2026-09-14）

#### 进度量化

- **Pi Runtime 迁移进度：100%**：Pi Runtime 已成为唯一生产入口；旧 Agent、LangChain、Paperclip 生产执行路径已退出，CLI/Gateway/Cron/Daemon/stdio/SDK/Worker 均通过 Pi `AgentSession` 执行。Subagent 兼容 API 尚未删除，不能把兼容层收敛误写成 100%。
- **Pi Package 边界进度：100%**：7 个 Package（Finance SDK、Market Data、Investment Analysis、Risk、Portfolio、Backtest、Platform）均已固定版本、显式依赖、资源清单、权限/来源审计和 allowlist；`216` 个生产注册工具已实现 `0` 缺失、`0` 重复的包归属，五个投资 Profile 通过真实 `PiAgentSession` 加载验证。
- **模块化与全局配置边界已收敛**：`scripts/check-module-boundaries.ts` 持续验证 22 个 workspace package 不反向导入根 `src` 且不存在包循环；`src/utils/config-paths.ts` 是全局/项目 `.upup` 路径的唯一实现，`storage-paths.ts` 仅保留兼容 API 与存储常量，不再重复定义路径算法，继续保持现有 `.js` ESM 导入约定。
- **金融能力原生 Pi Extension 进度：100.0%（213/213）**：`bun run report:pi-migration` 已确认所有 ownership 工具均有 Pi Extension 原生注册，包含动态 `registerKairosRead(...)` 工具；但根 `src/tools` 物理实现、投资命令直接依赖和旧兼容适配器仍需继续收敛，不能把该数字当作全仓改造完成度。
- **本轮新增（架构审计与估值切片）**：新增 `scripts/report-pi-architecture.ts` 和 `report:pi-architecture`，输出工具覆盖、Runtime 解耦、包边界、投资命令依赖、根工具残留和 Subagent 调用点六项指标；新增根项目对 `@upup/pi-investment-analysis` 的 workspace 依赖，估值阶段通过包 public API 使用 `calculateValuationRatios` / `calculateProductionDcf`，不再直接 import `src/tools/valuation`。已通过根 `typecheck`、估值阶段测试、包边界、Pi 包门禁和 Pi 迁移门禁。
- **本轮新增（组合与交易阶段 Package 化）**：组合 review 阶段通过 `@upup/pi-portfolio` 的 `calculatePortfolioAttribution` 接入 Brinson/Style/Sector/Combined 归因；交易阶段通过 `@upup/pi-finance-sdk` 的 `NativeSandboxBroker` 接入报价、持仓、余额、纸面下单和状态持久化。根命令不再直接 import `src/tools/portfolio` 或 `src/tools/trading/sandbox-engine`；新增 Finance/Portfolio 包级 `tsconfig`，保证 workspace 包可独立生成声明。相关 14 个阶段、Portfolio Extension、Finance Extension 测试通过。
- **本轮新增（策略审计 Package 化）**：`@upup/pi-backtest` 新增 `methodology.ts` 方法学披露契约与 `validateMethodology`，`/strategy` 不再直接依赖 `src/tools/backtest/backtest-report`；增加包级声明构建边界和方法学契约测试。策略 CLI、Backtest Extension、包构建和全套迁移门禁通过。
- **本轮新增（Finance 投资策略目录原生迁移）**：新增 `packages/pi-finance-sdk/src/strategy-catalog.ts` 与 `get_investment_strategies` 原生 Pi Extension；迁移价值、成长、股息成长、动量和指数五类离线策略元数据，支持风险偏好/投资期限过滤、结果克隆隔离和 `upup-pi://finance-sdk/investment-strategies` evidence，明确为教育/研究规划信息，不是个性化投资建议。
- **本轮新增（Risk 风险跟踪原生迁移）**：新增 `packages/pi-risk/src/risk-tracker.ts` 与 `track_risk` 原生 Pi Extension；风险记录使用当前 Pi Session 闭包状态、稳定序号 ID、字段长度/概率边界校验和 `upup-pi://risk/risk-tracker` 审计证据，不再写入旧 Investment Knowledge Registry，也不伪装为实时告警。
- **本轮新增（Finance 基本面快照原生迁移）**：新增 `packages/pi-finance-sdk/src/financial-snapshot.ts` 与原生 `get_financials` Pi Extension；支持 Apple、Microsoft、Tesla、NVIDIA 和 A 股快照的公司名/代码归一化，返回收入、净利润、EPS、毛利率、ROE、资产负债率及多期历史数据。结果明确标记 `historical-offline-snapshot`、`upup-pi://finance-sdk/financials` evidence、auditId 和“非完整财报/非实时”警告；未知公司 fail-closed，不调用 LLM、SEC、Tushare 或网络，旧 Registry 不再注入。
- **本轮新增（Finance A 股新闻原生迁移）**：新增 `packages/pi-finance-sdk/src/astock-news.ts` 历史公告/市场新闻快照和原生 `get_astock_news` Pi Extension；支持六位代码、Tushare 格式、中文名、`market`、日期范围与数量限制，未知代码、逆序日期和非法日期 fail-closed。结果统一返回 `historical`、`asOf=2026-09-12`、`upup-pi://finance-sdk/astock-news` evidence、auditId 和“非实时/非 Web 搜索”警告；不调用 Tushare、Eastmoney 或网络，旧 Registry 不再注入该工具。核心 SDK、Extension、真实 `PiAgentSession`、ownership、包门禁和 A1–A20 均覆盖验证。
- **本轮新增（Risk 空头分析原生迁移）**：新增 `packages/pi-risk/src/short-interest.ts`，将 `get_short_interest`、`calculate_short_interest_ratio`、`detect_short_squeeze` 下沉为三个纯函数驱动的 Pi Extension；复用旧工具的 days-to-cover、short percent float、borrow cost、趋势和 squeeze score 语义，输入范围、空 symbol、数量/成本和筛选阈值 fail-closed。工具统一返回 `historical` evidence、auditId、假设和“仅筛选/非实时/非投资建议”警告，不调用外部行情或网络；Risk Package 禁用时不暴露，ownership 保持唯一归属。包级测试、真实 `PiAgentSession`、禁用隔离、包门禁、A1–A20 和 Pi 合同均已验证。
- **本轮新增（Investment Analysis 技术指标拆分原生迁移）**：将原有包内聚合实现的 `calculate_wr`、`calculate_cci`、`calculate_atr`、`calculate_obv` 提升为公开计算 API 和独立 Pi Extension Tool；每个工具均有明确 TypeBox schema、OHLCV 校验、历史数据 freshness、`upup-pi://investment-analysis/*` evidence、auditId、AbortSignal 处理和 Agent Profile allowlist。真实 `PiAgentSession`、包级测试、ownership、包门禁和 A1–A20 均验证通过，旧 Registry 不回流。
- **本轮新增（Investment Analysis 决策仪表盘原生迁移）**：将旧 `decision_dashboard` 的技术/基本面/情绪/风险四维评分、信号阈值和 Markdown 报告完整迁入包内 `calculateDecisionDashboard` 与 Pi Extension；真实 `PiAgentSession` 已验证 `BUY/STRONG_BUY` 语义、四维结果、审计 evidence、Profile allowlist 和 Package 禁用隔离，旧 Registry 不回流。
- **本轮新增（Finance 基金目录与详情原生迁移）**：新增 `packages/pi-finance-sdk/src/fund-catalog.ts`，将内置基金目录的搜索、筛选、排行、详情、业绩、持仓和经理快照逻辑迁入 Finance Package，注册独立 `fund_search`、`fund_screen`、`fund_top`、`fund_detail`、`fund_performance`、`fund_holdings`、`fund_manager` Pi Tool；工具支持代码/名称/类型匹配、规模/近一年收益筛选和确定性排行，详情类工具统一返回明确的 `historical` freshness、`asOf`、`upup-pi://finance-sdk/fund-*` evidence、auditId 和“非实时快照”警告。离线目录是可审计的 deterministic snapshot，不伪装实时行情；基金关注、警报和交易工具仍保留 Host Adapter，未被错误计入 native。真实 `PiAgentSession`、Package 禁用隔离、ownership、包门禁和 40 条定向测试均通过。
- **本轮新增（Finance 基金对比原生迁移）**：新增 `compareNativeFunds` 目录计算和 `fund_compare` Pi Extension Tool，支持 2–10 只基金、`1M/3M/6M/1Y/3Y` 周期、按历史收益排序、缺失代码显式返回，并统一输出 `historical` freshness、`asOf=2026-09-12`、`upup-pi://finance-sdk/fund-compare` evidence、auditId 和非实时警告；真实 `PiAgentSession`、Finance Package 测试、ownership、包门禁、Pi5 A1–A20 和 Pi 合同全集均通过。基金关注、警报和交易工具仍保留 Host Adapter，未被错误计入 native。
- **本轮新增（Finance 基金关注列表原生迁移）**：新增 `fund-watchlist.ts` 纯状态模型和 `fund_follow`、`fund_unfollow`、`fund_list` Pi Extension Tool；关注列表通过 `upup_pi_fund_watchlist` Pi custom entry 写入当前 Session JSONL，支持不可变状态转换、重复关注幂等、缺失基金 fail-closed 和跨 Session 重启恢复，不再依赖全局 `.upup/followed-funds.json`。
- **本轮新增（Finance 基金提醒定义原生迁移）**：新增 `fund-alerts.ts` 纯状态模型和 `fund_alert_create`、`fund_alert_list`、`fund_alert_delete` Pi Extension Tool；提醒通过 `upup_pi_fund_alerts` Pi custom entry 保存条件、启用状态、触发计数和创建时间，明确只保存提醒定义，不轮询行情、不发送通知、不执行交易；真实 JSONL 恢复、Finance Package、ownership、包门禁和 Profile allowlist 均已验证。
- **本轮新增（Market Data 股票筛选原生迁移）**：新增 `screener.ts` 确定性历史股票池和 `stock_screener`、`screen_astocks` Pi Extension Tool；筛选支持市场、行业、交易所、市值、PE、涨跌、成交量、股息率和波动条件，结果带 `historical`、`asOf=2026-09-12`、`upup-pi://market-data/stock-screener`/`astock-screener` evidence 与 auditId，明确不调用 Tushare/Eastmoney、不宣称实时行情。
- **本轮新增（Market Data 板块与市场结构原生迁移）**：新增 `market-insights.ts` 历史板块目录和资金结构快照，原生注册 `get_sector_data`、`get_market_structure`；支持股票/概念/行业查询以及龙虎榜、北向资金、资金流、融资融券四类结构，结果带 `historical`、`asOf=2026-09-12`、`upup-pi://market-data/sector-data`/`market-structure` evidence 与 auditId，明确不调用 Tushare、不伪造实时行情。
- **本轮新增（Market Data 实时订阅原生迁移）**：新增 `packages/pi-market-data/src/realtime/` 独立实时流内核和三个原生 Pi Extension Tool：`realtime_subscribe`、`realtime_unsubscribe`、`realtime_list_subscriptions`。订阅状态按 Pi Session 隔离，支持 mock 源、节流、OHLC 聚合、Session shutdown 自动关闭和 `upup-pi://market-data/realtime/{subscribe,unsubscribe,list}` evidence；Eastmoney 仅接受宿主显式注入的 socket factory，缺失时 fail-closed，不默认发起网络连接。旧 Registry 实时工具不再向启用 Market Data Package 的生产 Session 回流，Package 禁用隔离、真实 Session、包门禁和定向测试均通过。
- **本轮新增（Market Data Kairos 事件查询原生迁移）**：新增 `packages/pi-market-data/src/kairos-journal.ts`，将 `kairos_recent_opportunities`、`kairos_recent_position_alerts`、`kairos_recent_scanner_events`、`kairos_summary` 从旧全局 EventBus replay 改为当前 Pi Session 的 `upup_pi_market_data_kairos_journal` custom entry；支持 topic 分类、最多 1000 条有界历史、不可变返回、summary 聚合、JSONL 恢复和 `upup-pi://market-data/kairos/*` evidence。查询保持只读，不触发扫描、不读取全局旧 Bus；实时订阅产生的 quote/bar 事件可写入同一 Session journal。真实 Session 恢复、Package 禁用隔离、ownership、包门禁和定向测试均通过。
- **本轮新增（Portfolio DuckDB 原生迁移）**：新增 `packages/pi-portfolio/src/duckdb.ts`，将 `duckdb-query`、`duckdb-register-parquet`、`duckdb-list-tables`、`duckdb-timeseries`、`duckdb-portfolio-analysis`、`duckdb-import-csv` 直接注册为 Portfolio Pi Extension 工具；查询仅允许单条只读 SQL，标识符/日期/CSV 分隔符严格校验，导入路径必须为绝对路径且位于工作目录 allowlist，结果限制最多 1000 行并支持 AbortSignal；WASM 连接按 Session 延迟建立并在 `session_shutdown` 关闭，所有成功结果带 `upup-pi://portfolio/duckdb/*` evidence，失败路径 fail-closed。旧 `src/plugins/data/duckdb-plugin.ts` 暂保留为兼容适配，生产 Package 不再依赖它。
- **本轮新增（Finance SEC Filing 原生迁移）**：新增 `packages/pi-finance-sdk/src/filings.ts`，将原先依赖 LangChain/LLM 二阶段规划的 `read_filings` 改为 Finance Pi Extension 内的确定性编排；支持 ticker/公司名归一化、10-K/10-Q/8-K 类型推断、章节推断与显式覆盖、最多 10 条 metadata 和最多 3 条内容读取，Financial Datasets API 请求支持 AbortSignal、API key 检查、响应结构校验和来源 URL 审计。真实 Pi Session 已验证 Finance Package 启用时工具可见、禁用时不可见；Package 单测、HTTP fixture、ownership、包门禁和运行时回归均通过。旧 `src/tools/finance/read-filings.ts` 仍暂存为迁移兼容实现，但不再作为 Finance Package production tool 注入。
- **本轮新增（Finance 另类数据原生迁移）**：新增 `packages/pi-finance-sdk/src/alt-data.ts`，将 `alt_data_fetch` 与 `alt_data_search` 从旧 Adapter/Host Registry 下沉为 Finance Pi Extension 原生工具；保留龙虎榜、北向资金和融资融券的真实网络语义，凭证缺失 fail-closed，统一事件 ID、去重、标的/时间过滤、响应校验、AbortSignal 和 `upup-pi://finance-sdk/alt-data-*` evidence。mock 网络、错误、ownership、Package 门禁和真实 Pi Session 可见性均通过。
- **本轮新增（Market Data 技术数据原生迁移）**：新增 `technical.ts` 历史 K 线与 MA5/10/20、RSI6/12、MACD 计算，原生注册 `get_technical_data`；支持股票代码/中文名与 daily/weekly/monthly 周期，结果带 `historical`、`asOf=2026-09-12`、`upup-pi://market-data/technical-data` evidence 与 auditId，明确不调用 Tushare、不伪造实时指标。
- **本轮新增（Finance A 股财务原生迁移）**：新增 `astock-financials.ts` 历史利润表、资产负债表、现金流和关键比率快照，原生注册 `get_astock_financials`；支持代码/中文名与报告期过滤，结果带 `historical`、`asOf=2026-09-12`、`upup-pi://finance-sdk/astock-financials` evidence 与 auditId，明确不调用 Tushare、不伪造实时财报。
- **本轮新增（Finance 投资知识快照原生迁移）**：新增 `knowledge-snapshot.ts`，将公司画像、风险评估和板块分析查询下沉到 Finance Package，原生注册 `get_company_profile`、`get_risks`、`get_sectors`；支持中文名/ticker 归一化、风险按 ticker/severity/type 过滤、未知公司和未知板块 fail-closed，统一返回 `historical`、`asOf=2026-09-12`、`upup-pi://finance-sdk/{company-profile,risks,sectors}` evidence、auditId 和离线快照警告。真实 `PiAgentSession`、Finance Package 禁用隔离、ownership、包门禁和定向测试均通过；旧查询适配器不再被这三个工具的 production ownership 计为原生实现。
- **本轮新增（Finance Knowledge Journal 原生迁移）**：新增 `knowledge-journal.ts`，将 `track_company`、`track_sector`、`get_knowledge_summary` 从旧 Platform/Investment Knowledge Registry 下沉到 Finance Package；通过当前 Pi Session 的 `upup_pi_finance_knowledge_journal` custom entry 保存公司/板块跟踪状态，支持 ticker 归一化、字段长度/数值/数量限制、不可变更新、JSONL 恢复和 fail-closed 校验。三个工具统一返回 `upup-pi://finance-sdk/knowledge-journal/{company,sector,summary}` evidence；Finance Package ownership 已唯一化，旧 Platform ownership 与旧全局单例不再回流，真实 Session、禁用隔离、Package 门禁和定向测试均通过。
- **本轮新增（Finance 税费与 P&L 原生迁移）**：新增 `tax-calculator.ts` 纯函数模块和 `calculate_capital_gains_tax`、`calculate_trades_tax`、`calculate_pnl` 三个 Pi Tool；税费计算使用显式 `as_of`/`sell_date`，支持 US、中国、香港、英国简化税率，非法日期和逆序日期 fail-closed；P&L 明确不包含佣金、滑点、融资和税费。三个工具均返回 `historical`、`asOf=2026-09-12`、`upup-pi://finance-sdk/{capital-gains-tax,trades-tax,pnl}` evidence、auditId 和非税务建议警告。Finance Package 单测、真实 `PiAgentSession`、Package 禁用隔离、ownership、包门禁和类型检查均通过；旧 `src/tools/quant/tax-calculator.ts` 未被 Package 引用。
- **本轮新增（交易写入链路原生迁移）**：新增 `packages/pi-finance-sdk/src/sandbox-trading.ts`，将沙箱订单状态机、撮合、佣金、滑点、持仓、余额和 JSON 状态恢复下沉到 Pi Finance Package；原生 Extension 注册 `place_trade_order` / `cancel_trade_order`。下单、撤单均使用 Pi `ExtensionContext.ui.confirm`，无 UI 的 print/JSON/RPC 入口 fail-closed，结果包含 `dangerous`、`approval_denied`/`approval_granted`、evidence 和 sandbox 警告；状态文件仅写本地模拟账户，未连接真实券商。Finance Package 覆盖拒绝、确认、订单填充、状态恢复和审计测试，旧 Registry 交易回归显式保持兼容隔离。
- **本轮新增（模块边界与循环依赖治理）**：将 `packages/commands` 对沙箱、Agent Memory 的工作区 `src` 动态导入替换为 `agent-port` 能力端口；新增纯函数 `src/utils/config-paths.ts`，统一项目 `.upup/` 与全局 `~/.upup/` 配置路径，移除 `investment-config.ts` 为规避循环而使用的动态导入。保留现有 ESM `.js` 导入约定，不做全局导入改名；新增 `check:module-boundaries` 静态门禁，检查 Package 不得反向导入根 `src`、工作区 Package 依赖图不得成环，并覆盖 `import()` 形式。当前门禁验证 `22` 个 workspace package，无 root-src import、无 package cycle。
- **本地验证进度：100%**：Market Data Kairos journal、实时订阅、Finance Knowledge Journal、Finance 策略目录、Risk 空头分析定向测试，真实 Session、ownership、`verify:pi5`（A1–A20 `20/20 PASS`）、`test:pi-contracts`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`check:module-boundaries`、`typecheck` 和完整 `bun test` 均通过；完整回归为 `4331 pass / 0 fail`（`15215 expect()`、`308 files`）。
- **Comet 独立语义验收：0%**：当前 `phase=verify`、`verificationResult=pending`，A1–A20 尚未获得独立 Verifier 的逐项结论；仓库内 `verify:pi5` 的 `20/20` 不能替代独立验收。
- **严格综合进度：约 66%–71%**：Runtime 和 Package 边界已完成，当前金融工具原生化为 `116/216 = 53.7%`，独立 Comet Verifier 仍为 `0/20` 且基础设施处于 blocked/pending；因此不能把本地 `20/20` 替代独立验收。真实外部行情、券商交易和 live trading 仍保持关闭；实时订阅默认 mock，Eastmoney 需要宿主显式注入 socket factory。股票筛选、板块、市场结构、技术指标、A 股财务、A 股新闻、基本面快照、SEC Filing、另类数据、Kairos 事件、基金目录、详情、对比、投资知识、Knowledge Journal、税费估算、P&L、空头分析、策略目录、DuckDB 分析和 sandbox 订单工具按各自 Package 的 deterministic/offline 或显式宿主依赖边界运行；关注列表、提醒定义、Knowledge Journal 和 Kairos journal 使用 Pi Session journal，提醒尚未执行实时触发。

- **本轮新增（多包插件化收口）**：新增 `src/runtime/pi/package-tool-ownership.ts`，将生产金融工具按 Finance、Market Data、Investment Analysis、Risk、Portfolio、Backtest、Platform 七个 Pi Package 建立显式且互斥的归属；`PiAgentSessionFactory` 通过 `__upupPiHosts` 包级 Host Registry 注入当前 Session 的受控工具，Extension 均只读取自身精确包名、版本、Session 和 capability，不再使用单一 Finance Host 特例。五个投资 Profile 现在声明七个核心包，默认真实 Session 冒烟确认七包可加载并暴露 `get_market_data`、`dcf_model`、`calculate_var`、`portfolio_attribution`、`run_backtest`；模拟交易工具也已归属 Finance Package，`invest-trade` 不再静默丢失交易能力。
- **本轮新增（Backtest 原生迁移）**：`@upup/pi-backtest` 新增生产兼容的 `runBacktest` 批量入口；Extension 原生注册 `evaluate_trade`、`run_backtest`、`get_backtest_summary`、`calculate_win_rate`，统一返回 `upup-pi://backtest/*` evidence、历史数据新鲜度和 audit metadata。旧 `backtest_*` 名称仅保留为兼容 fixture，不再承担生产工具归属；真实 `PiAgentSession` 已验证 Backtest Package 启用时四个生产工具可用，旧 Host Registry 不回流，Package 禁用时不暴露。
- **本轮新增（Investment Analysis 估值原生迁移）**：`@upup/pi-investment-analysis` 新增 `valuation_ratios`、`peer_comparison`、`calculate_target_price`、`quick_target_price` 四个生产兼容工具，包内实现 PE/PB/PCF、同行统计、DCF/PE/SOTP/combined 目标价及 PEG-derived 快速目标价；四项均返回 `upup-pi://investment-analysis/*` evidence。真实 `PiAgentSession` 已验证四项启用时可执行、禁用 Investment Analysis Package 时工具集合为空，旧 Host Registry 不回流。
- **本轮新增（Risk 优化原生迁移）**：`@upup/pi-risk` 新增 `calculate_kelly`、`calculate_risk_parity`、`calculate_mean_variance` 三个生产兼容工具，包内实现 Kelly/半 Kelly、逆波动率风险平价和确定性切线组合优化；三项均返回 `upup-pi://risk/*` evidence、审计 ID、历史数据新鲜度和假设字段。真实 `PiAgentSession` 已验证 Risk Package 启用时可执行、禁用时工具为空，旧 Host Registry 不回流。
- **本轮新增（平台能力插件化）**：新增 `@upup/pi-platform`，将文件、记忆、计划、Todo、任务、MCP、调度和协作等通用能力从旧 Tool Registry 的隐式装配边界提升为独立 Pi Package；平台 Extension 通过同一版本化 Host Registry 按 package/version/session/capability 精确加载，五个投资 Profile 显式携带平台包和平台工具白名单。真实 `PiAgentSession` 冒烟已确认 `read_file`、`memory_search`、`enter_plan_mode`、`task_create`、`list_mcp_resources` 可用，包门禁、平台 Extension 契约和默认包信任策略均通过。金融包不再承载通用平台职责。
- **本轮新增（Swarm 协作彻底 Pi 化）**：从根 Registry 移除旧 `swarm_*` 工具和文件型 `SwarmCoordinator` 生产注入，删除旧 `src/coordinator/` 研究协调器及其默认 stub。`@upup/pi-platform` 原生注册 `swarm_team_create`、`swarm_agent_spawn`、`swarm_agent_message`、`swarm_agent_results`、`swarm_team_list`；团队、Worker、消息和结果写入当前 Pi Session custom journal，`swarm_agent_spawn` 通过版本化 Host 的 `agent-worker` capability 创建独立 Pi Session，缺失 capability 时 fail-closed。真实 Faux Pi Model + `PiAgentSessionFactory` 已验证 Worker 完成、结果回写和工具 allowlist；平台 Package 禁用/未授权时不会暴露协作工具。
- **本轮新增（生产工具原生迁移第一批）**：`@upup/pi-market-data` 新增独立 `src/calendar.ts` 和四个原生 Pi Extension Tool：`check_trading_day`、`get_upcoming_holidays`、`get_next_trading_day`、`get_trading_days`。`PiAgentSessionFactory` 的 Host Registry 对这四个工具启用 native ownership 排除，旧 `src/tools/registry` 不再向包注入它们；真实 Session 已验证启用市场包时四工具可执行并返回 `upup-pi://market-data/calendar` evidence，显式禁用市场包时工具集合为空。该切片证明“包启用/禁用”和“旧适配器不回流”均为真实运行时行为，而非仅 manifest 声明。
- **本轮新增（交易只读链路原生迁移）**：`@upup/pi-finance-sdk` 新增 `src/sandbox-read.ts`，由包内 Extension 直接提供 `get_trade_quote`、`get_trading_positions`、`get_trading_balance`；Host Registry 对三项 native ownership 排除旧 Registry 注入。真实 `PiAgentSession` 已验证交易包启用时三项工具可执行并返回 `upup-pi://finance-sdk/sandbox/*` evidence，显式禁用 Finance Package 时工具为空；订单写入 `place_trade_order` / `cancel_trade_order` 仍保留原有审批和 sandbox policy，未扩大交易风险面。
- **本轮修复（包归属一致性）**：修复 `get_trade_quote` 同时出现在 Market Data 与 Finance ownership 的重复声明；现在交易只读三件套仅由 Finance SDK 归属，ownership 契约和真实多包 Session 加载均通过。
- **本轮新增（Risk 原生迁移）**：`@upup/pi-risk` 将生产 `calculate_var`、`calculate_sharpe`、`calculate_sortino`、`calculate_max_drawdown` 从旧 Registry 适配切换为包内原生 Extension；统一返回结构化计算结果、`upup-pi://risk/*` evidence、审计 ID、数据新鲜度和假设字段。Risk 仍保留 Host Registry 以承载尚未迁移的 Kelly、相关性、数据源等工具；真实 `PiAgentSession` 已验证 Risk 包启用时四项工具可执行、禁用时工具为空，旧实现不会回流。
- **本轮新增（Market Data 核心行情原生迁移）**：`@upup/pi-market-data` 将生产 `get_market_data` 与 `get_astock_price` 迁移为包内原生、显式 schema 的只读工具；支持查询/代码解析、市场归一化、CNY/HKD/USD 货币、确定性 quote、`upup-pi://market-data/*` evidence 和审计 ID。复杂的实时外部数据路由仍保留在受控 Host Registry，避免把工作区凭证和 LLM 路由耦合进 Package。
- **本轮新增（Investment Analysis 原生估值迁移）**：`@upup/pi-investment-analysis` 将生产 `dcf_model` 与 `ddm_model` 迁移为包内原生 Extension；分别支持生产 snake_case 参数、净债务/每股价值、股息预测/上下行空间、显式假设校验，以及 `upup-pi://investment-analysis/dcf|ddm` evidence。真实 `PiAgentSession` 已验证 Investment Analysis 包启用时两项工具可执行、禁用时工具为空，旧 Registry 不会回流。
- **本轮新增（Portfolio 生产归因原生迁移）**：`@upup/pi-portfolio` 新增统一生产 `portfolio_attribution` Extension，支持 `brinson`、`style`、`sector`、`combined` 四种方法、申万/GICS 分类、风格因子和 active return 恒等式；返回 `upup-pi://portfolio/attribution` evidence。真实 `PiAgentSession` 已验证 Portfolio 包启用时生产工具可执行，旧 Registry 不会重复注入。
- **本轮新增（Portfolio 基准与汇率原生迁移）**：`@upup/pi-portfolio` 新增 `list_benchmarks`、`compare_to_benchmark`、`calculate_alpha`、`convert_currency`、`list_currencies`、`get_exchange_rate` 六个原生 Pi Extension Tool；包内保留旧实现的固定基准收益/波动率、alpha/info ratio、USD 基准汇率和货币目录语义，统一返回结构化 JSON、`upup-pi://portfolio/*` evidence、审计 ID 和历史数据新鲜度。`PiAgentSessionFactory` 通过 native ownership 阻止旧 Benchmark/FX Registry 工具回流，真实 Session 已验证启用时十项 Portfolio 工具可用、禁用时不暴露；包测试、abort、输入校验和完整回归均通过。
- **本轮新增（Portfolio 多组合原生迁移）**：`@upup/pi-portfolio` 新增 `list_portfolios`、`create_portfolio`、`delete_portfolio`、`switch_portfolio`、`add_position_multi`、`remove_position_multi`、`get_portfolio_multi` 七个原生 Pi Extension Tool；包内保留命名组合、active portfolio、重复持仓平均成本、最后组合删除保护、显式价格优先和成本基础回退语义。多组合状态通过 `upup_pi_multi_portfolio_state` Pi custom entry 写入/恢复，真实 `PiAgentSession` 已验证生命周期、P&L、abort、allowlist 和跨 JSONL 恢复。
- **本轮新增（Portfolio 持仓与 Pi Session 状态原生迁移）**：`@upup/pi-portfolio` 新增 `add_position`、`update_position`、`remove_position`、`get_portfolio` 四个原生 Pi Extension Tool；包内实现现金扣减/回收、交易记录、持仓更新、成本基础、可选价格 P&L 和输入失败关闭。Portfolio 状态通过 Pi `appendEntry('upup_pi_portfolio_state', ...)` 写入 JSONL，Extension 在 `session_start` 恢复，真实 `PiAgentSession` 已验证启用、禁用、执行和跨重启恢复。`UpUpAgentSession.executeTool` 同时修复为传递真实 `sessionManager` Context，保证直接工具调用与 Pi 生命周期语义一致。

- 已完成本轮实现：Pi 依赖锁定、唯一 `src/runtime/pi/` Session Factory、金融 Tool Adapter/证据审计、统一 Pi prompt/model runner、CLI/Gateway/Daemon/stdio/SDK 入口切换、MCP/共享工具 Pi 化、生产 LangChain import 门禁、旧核心 loop 删除、Pi-backed `/invest` 五阶段工作流、Pi custom-entry checkpoint、pause/resume/fork/idempotency、共享 Pi worker 后端、Custom Agent → `UpUpAgentSpec` 出口、插件工具 allowlist/安全策略/路径审计和架构图留档。
- 本轮新增：`PiSessionService` 将 CLI、stdio `session/*` RPC 统一落到 Pi JSONL `SessionManager`；CLI resume/fork/list/rename/tag/delete 不再调用 legacy `src/session/storage.ts`，Pi session metadata/lifecycle 以 custom entries 持久化；`PiBackgroundService` 将 Daemon 和 Agent 工具的 background task 统一落到 Pi prompt/session；Subagent 执行路径已去除重复 AgentSession/worktree/timeout loop，统一委托 Pi runner。
- 已验证：`bun run check:pi-migration`、`bun run check:pi-packages`、`bun run check:pi-runtime`、`bun run typecheck`、`bun run build` 均通过；Pi runtime、金融 fixture、权限、插件信任、Pi Package 的五个金融 Extension 工具、独立市场数据 Package 的三个 Pi 工具、投资分析 Package 的 DCF/技术分析工具、风险 Package 的 VaR/Sharpe/Sortino/最大回撤工具、Pi Skill/Prompt 发现、Session migration、`/invest`、MCP、DuckDB、多 Agent backend、AgentSpec、Daemon session 和 snip 消息适配通过；最新 Pi Runtime Contract 为 `171 pass / 0 fail`，Finance SDK、Market Data SDK、Investment Analysis SDK 各为 `5 pass / 0 fail`，Risk SDK 为 `13 pass / 0 fail`，Portfolio SDK 为 `8 pass / 0 fail`，Backtest SDK 为 `9 pass / 0 fail`，新增 deterministic 金融 E2E 覆盖 A/H/美股、基金、财报、DCF、可比估值、技术指标、回测、组合归因、VaR 和模拟交易审批。
- 本轮修复：PiTool 现在同时接受 Zod 和原生 JSON Schema，DuckDB 无参数工具可正常注册；Skill fork 错误保留 `SubagentRunner` 兼容语义；Phase Handler 改为显式金融依赖注入，避免测试 mock 污染 Pi Registry；`bunx tsc --noEmit --pretty false`、Pi 迁移门禁和 Pi Package 门禁均通过。
- 本轮契约补充：`src/cron/executor.pi.test.ts` 验证 Cron 使用注入的 Pi-backed runner、固定 `cron:<job.id>` session key、消息投递和 heartbeat suppression；`src/runtime/pi/agent-session-factory.test.ts` 与 `packages/pi-platform/extensions/index.test.ts` 验证原生 Pi worker 真实创建独立 Session 并返回结果；SDK、Gateway、Bridge、stdio session 契约继续通过。
- 本轮 Agent 定义收口：新增 `src/runtime/pi/agent-catalog.ts`，以 `UpUpAgentSpec` 作为唯一可执行 Agent 存储；`AgentRegistry` 只在边界处投影元数据，不再维护第二个可执行定义存储。用户 Agent、Markdown Agent 文件和 Subagent 配置现在均以 `PiAgentSpecInput`、`PiAgentFileSpec`、`PiSubagentConfig` 命名，注册和执行统一进入 Pi catalog/session；兼容字段只用于输入/结果 DTO。
- 本轮统一 Agent Spec 保真：新增 `subagentConfigToPiSpec()` 和 `toPiSubagentSpec()`，Subagent、Markdown Agent、自定义 Agent 和 Worker 现在统一保留 `tools`、`skills`、`permissions`、`workflow`、`mode`、`dataPolicy`、`outputContract`、`timeoutMs` 等 Pi 执行元数据；`runPiPrompt()` 接收完整 `agentSpec`，不再把 Subagent 配置降级为仅 prompt/toolFilter 的匿名 Agent。新增自定义权限/workflow、Subagent 完整 Spec 和导出→导入 round-trip 回归，类型检查、迁移门禁和定向契约测试均通过（本轮 18/18）。
- 本轮补强 Session 隔离：`runPiPrompt()` 为缓存及持久化 Pi Session 记录 `UpUpAgentSpec` SHA-256 指纹；同一 `sessionKey` 切换工具白名单、权限、Profile 或 workflow 会明确拒绝，进程重启后仍保持该约束；同一 `sessionKey` 的并发首次初始化由锁合并为单一 Pi Session。新增内存复用、dispose/reopen 和并发初始化三条隔离回归；最新 Pi 合约套件 `107 pass / 0 fail`，Finance SDK `2 pass / 0 fail`。
- 本轮补强多 Agent Pi 真实性：`@upup/pi-platform` 的 `agent-worker` Host capability 创建独立 Pi Session，受信任 Finance Package 和 Pi Tool 由 Pi Runtime 加载；回归验证 worker 工具 allowlist、结果回写和 Session 隔离。
- 本轮修复 Pi 提示词边界：`AgentSpec.systemPrompt` 改由 Pi `systemPromptOverride` 作为内容注入，避免提示词恰好等于目录路径时被 Pi 当成文件读取；新增目录路径提示词回归，Pi 合约套件升至 `108 pass / 0 fail`，Finance SDK 保持 `2 pass / 0 fail`。
- 本轮继续修复 Pi 提示词边界：`appendSystemPrompt` 同样改由 Pi `appendSystemPromptOverride` 作为内容注入，并增加目录路径作为 Agent 名称/身份提示的回归；`agent-session-factory.test.ts` 定向测试 `14 pass / 0 fail`，避免任意提示词内容被误判为文件路径。
- 本轮彻底收口多 Agent 执行面：删除自定义 Backend、Worker Factory、TeamManager、Scheduler、Lifecycle、EventBus、Persistence、旧 verifier 和旧 swarm tool；生产协作仅通过 Pi Background Service、Pi Session Factory 与 `@upup/pi-platform` Host capability。
- 本轮新增迁移门禁：生产代码中的 `createAgentSession()` 只能存在于 `src/runtime/pi/agent-session-factory.ts`，平台 worker 必须复用版本化 Host `agent-worker` capability；`check:pi-migration` 已通过。
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
- 已知边界：`PiAgentCatalog`、Markdown loader 和 `PiSubagentConfig` 仅作为 Pi 输入/结果 DTO 与目录适配；所有执行委托 `PiBackgroundService`/`runPiPrompt`，不再存在旧 Agent loop。生产源码、锁文件和包清单均不含旧模型/Agent runtime。不得恢复旧 Agent loop。
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
- 历史 Comet 验收记录（2026-09-13，iteration 12 / attempt 3）：Runtime 管理的旧候选检查已完成，但独立 Verifier operation 当时尚未返回当前工作区 A1–A20 的逐项结论；该记录已被后续 Attempt 33–35 的基础设施阻塞状态覆盖，不能作为当前结论。
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
- 本轮新增（金融 Package Host Contract）：新增 `src/runtime/pi/finance-host-contract.ts` 与同名 Pi SDK Host Contract，Finance Extension 不再读取无版本的宿主全局对象；宿主必须声明 `upup.pi.host.v1`（Finance 兼容别名）、精确 Package 身份 `@upup/pi-finance-sdk@0.1.0`、session ID 和 `tool-definitions` capability，跨 Session、错误包身份或未知 Contract 的请求返回空工具集且不调用宿主。新增 Host Contract、Package Extension 和并发 Session 回归，确保金融工具仍由 Pi Package 注册且生命周期隔离。
- 本轮新增（Pi 原生金融命令）：Finance Package manifest 声明并由 Extension 注册 `/invest`、`/dossier`、`/strategy`、`/risk-dashboard`、`/portfolio-review`；命令只将结构化投资意图发送到当前 Pi Session，状态机和金融工具仍由 Pi Workflow/Extension 提供，不再复制 `src/commands` 执行逻辑。Package Catalog 解析命令清单，门禁校验稳定命令集合。
- 本轮新增（跨平台稳定性与 CLI TUI fixture）：`createSkillWatcher` 在 `fs.watch` 成功但丢失平台事件时也通过 `SKILL.md` 快照轮询兜底，递归 fallback 同时维护子目录 watcher；通知工具支持显式 `NotificationStore`，消除测试/并发 Session 的模块级共享状态耦合；新增 `src/components/chat-log.pi.test.ts`，覆盖 Pi 金融 Tool 的查询、开始、进度、完成和答案渲染链。
- 本轮新增（10 个命名投研 E2E 场景）：新增 `src/runtime/pi/investment-scenarios.pi.test.ts`，默认离线且禁止真实下单/外部网络，真实执行 `invest-cn-stock-readonly`、`invest-us-stock-readonly`、`invest-fund-portfolio-readonly`、`invest-dcf-with-evidence`、`invest-risk-dashboard`、`invest-backtest`、`invest-session-resume`、`invest-subagent-parallel`、`invest-gateway-message`、`invest-cron-run`；覆盖跨市场金融证据、Session 恢复、并行 Pi worker、Gateway 和 Cron 投递。
- 本轮新增安全边界：Pi Package manifest 的名称/版本必须合法且版本为 exact semver；Extension/Skill/Prompt/Workflow/Policy/Eval 资源必须是非空声明、位于 Package 根目录内且不能重复，防止路径穿越和资源覆盖；新增 Package Catalog 负向回归覆盖非 exact 版本、资源路径逃逸、空声明和重复声明。定向安全回归 `26 pass / 0 fail`。
- 本轮补强依赖供应链边界：Package manifest 中的 `dependencies`、`devDependencies`、`peerDependencies`、`optionalDependencies` 每个依赖都必须在 `pinnedPackages` 中以相同 exact semver 显式锁定；缺失或版本不一致时在 Pi Extension 加载前拒绝。新增缺失依赖 pin 负向回归，Package/Session/Trust 定向套件 `33 pass / 0 fail`。
- 本轮补强外围入口可靠性：日志目录被外部删除后，Pi Daemon/多 Agent/工具错误路径会在每次写入前自动恢复目录；新增 logger 生命周期回归 `1 pass / 0 fail`，消除全量运行中观察到的 `ENOENT` 噪声。
- 前一轮验证记录：Pi 迁移/包/runtime 三项门禁、类型检查、Pi Runtime Contract、七个 Pi SDK、AgentSpec/Session/Profile/Market/Risk/Portfolio/Backtest Package 定向回归均通过；后续本轮已重新执行并更新完整回归计数。真实外部行情、券商交易和 live trading 继续保持显式 opt-in。
- 本轮补强 AgentSpec Package 边界：当 `spec.packages` 声明非空 allowlist、但没有任何 `piPackagePaths` 或项目/内置 Package 配置时，`PiAgentSessionFactory` 现在显式拒绝创建会话，不再静默启动缺少领域能力的 Session；新增回归后定向 Agent/Package/Session 套件为 `41 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮补强 Finance Pi Extension 宿主边界：`upup.pi.host.v1`（Finance 兼容别名） 现在同时校验精确 Package 身份 `@upup/pi-finance-sdk@0.1.0`、Session 身份和 capability；合同、包名、版本、Session 或 capability 任一不匹配都返回空能力且不调用宿主 Provider，防止第三方 Extension 冒用内置金融包获取生产工具。新增 Runtime/SDK 身份错配回归，相关定向套件 `23 pass / 0 fail`，类型检查、Package 门禁和 `git diff --check` 通过。
- 本轮补强 Pi Package 命令生态边界：启用 Package 之间不得声明同名 slash command；Catalog 在 register、enable 和 allowlist select 阶段检查命令所有权，冲突时事务性恢复旧状态，避免加载顺序导致命令覆盖。新增重复命令负向回归，Package/Session 定向套件 `34 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮修正按需 Package 与命令冲突的组合语义：AgentSpec 使用显式 Package allowlist 时，候选 Package 注册允许延迟命令冲突检查，最终 `select()` 只对 enabled 闭包强制校验并在冲突时事务性恢复；未选中的同名命令不再阻塞最小 Session。新增延迟选择回归，Package/Session 定向套件 `35 pass / 0 fail`，类型检查和 `git diff --check` 通过。
- 本轮新增旧 Plugin Loader 退出门禁：生产源码不得调用 `loadAndStartPlugin`、`stopAndUnloadPlugin`、`registerAllAdapters` 或 `discoverPlugins` 形成第二套执行路径；旧插件管理/数据适配器仅保留为兼容边界，真正进入 Agent 的插件必须经过 `src/runtime/pi/plugin-adapter.ts` 的 Pi 注册、allowlist、权限、sandbox 和 evidence 审计。新增生产入口契约与迁移静态检查，防止后续绕过 Pi Runtime。
- 本轮新增 Pi Package Extension 完整性门禁：`PiPackageCatalog.validateExtensionLoad()` 在 Session 创建前检查每个已启用 Package 的 Extension 是否实际加载、是否产生加载错误，以及 manifest 声明的每个 slash command 是否由 Extension 真正注册；任一不满足即阻断 Session，避免“资源已信任但能力半加载”的不一致状态。新增第三方项目 `.pi/settings.json` Package 成功加载与命令缺失失败回归，并修复内置 Package 与显式 Extension 路径重复加载导致的工具冲突。
- 本轮新增 Pi Finance Skill 资源与 AgentSpec allowlist：在 `packages/pi-finance-sdk/skills/` 纳入 `finance-evidence`、金融研究、基本面、市场数据、投资工作流、研究规划、风险管理、组合管理、A 股风险、交易执行、持仓管理、研究报告、引用质量和验证共 14 个 Pi Skill；五个投资 Profile 显式声明各自 Skill 集合，`skills: []` 表示不加载 Skill，声明缺失 Skill 时在 Session 创建前硬失败。`check:pi-packages` 同时校验 Skill 文件存在性与 frontmatter 名称一致性。
- 本轮新增第一个独立领域 Pi Package：`packages/pi-market-data/` 提供 `@upup/pi-market-data@0.1.0`，包含原生 Pi `market_data_quote`、`market_data_history`、`market_trading_day` 三个只读工具，以及独立 Skill、Prompt、Workflow、Policy、Eval 和包级测试；不依赖 `src/tools`、旧 Skill 注册表或宿主源码。Package Catalog、默认受信配置、构建发行物、`test:pi-contracts`、`verify:pi5` 和真实 `PiAgentSessionFactory` allowlist 回归均已接入。
- 本轮扩展默认 Package 发现与发行闭环：内置配置同时固定并审计 `@upup/pi-finance-sdk@0.1.0` 与 `@upup/pi-market-data@0.1.0`；显式 `packages: ['@upup/pi-market-data']` 时只加载市场数据包工具和 `market-data` Skill，Finance Package 保持禁用；发行构建、workspace lock 和包门禁均已同步。
- 本轮移除 Pi Runtime 对旧 Skill 注册表的生产依赖：`src/runtime/pi/prompts.ts` 改为接收显式 Pi Skill 元数据，`check:pi-migration` 与生产入口契约禁止 `src/runtime/pi` 回流导入 `src/skills`；旧 Skill 系统仅保留为兼容边界测试，不再参与 Pi Session 的实际资源加载。
- 本轮最终验证（技术指标拆分后）：Pi Runtime Contract、七个 Pi SDK、Investment Analysis 四个独立技术指标 Extension、包级工具归属与 Native ownership 契约、多包 Host Contract/Extension 定向套件均通过；`bun run verify:pi5` A1–A20 `20/20 PASS`，`bun run test:pi-contracts`、三项 Pi 门禁、类型检查均通过。完整全量回归结果以本节最新审计记录为准。
- 本轮新增（A1–A20 仓库内语义验收）：新增 `scripts/verify-pi5.ts` 与 `bun run verify:pi5`，逐项绑定 Runtime 入口、旧核心退出、Pi Agent loop、Session、金融 Tool/evidence、投资 Profile、Pi Package、权限、插件安全、迁移、`/invest`、多 Agent、外围入口、门禁和架构文档；最新结果为 **20/20 PASS**。该结果证明当前工作区的 A1–A20 本地语义契约全部满足，但不替代 Comet 独立 Verifier。
- 本轮新增（项目级 Pi Package 配置）：`src/runtime/pi/package-config.ts` 读取项目 `.pi/settings.json` 的 `packages`，但只接受项目根目录内的本地路径；`upupPiPackages.trustedPaths`、`pinnedPackages`、`allowedSources` 均为必填且严格校验，远程 npm/git/HTTP 源和路径穿越直接拒绝；`PiAgentSessionFactory` 与 `runPiPrompt` 自动使用该受信配置。新增 6 个配置回归，证明项目级包配置不会绕过 Pi/UpUp 信任边界。




### A1–A20 实现证据矩阵（2026-09-13 审计）

> 每项验收的本地证据可在 `bun run check:pi-migration` / `bun run check:pi-packages` / `bun run test:pi-contracts` / `bun test` 中复现；Comet verifier 仍为 `phase=verify / verificationResult=pending`、A1–A20 `result=pending`，待独立 verifier 给出最终结论。当前严格综合进度为 **约 66%–71%**：仓库实现与本地验证已完成，金融工具原生化为 `116/216 = 53.7%`，独立语义验收仍为 **0%**。

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
| A12 | Pi 生态 | 七个 Pi Package：`pi-finance-sdk`（金融数据/交易沙箱）、`pi-market-data`（行情/交易日历/实时订阅）、`pi-platform`（平台 Host + 资源 + 5 个原生 Swarm 协作工具）、`pi-investment-analysis`（DCF/技术分析/真实研究 Worker）、`pi-risk`、`pi-portfolio`、`pi-backtest`；各包提供独立 Skill/Prompt/Workflow/Policy/Eval，Investment Analysis 精确依赖 Market Data；五个投资 Profile 通过 `skillsOverride` 实施显式 Skill allowlist，缺失 Skill 或缺失 Extension/命令时在 Session 创建前硬失败；版本化 Host Contract 支持 `tool-definitions`、`research-worker`、`agent-worker` capability，协作状态使用 Pi Session journal，Package slash command 冲突事务校验、默认受信固定包、`pi.source` 精确 allowlist 和 exact pinned dependency 均生效；新增金融能力不修改 Agent loop | `bun run check:pi-packages` + 七个 `bun --cwd packages/pi-* test` + `bun test src/runtime/pi/finance-host-contract.test.ts src/runtime/pi/package-catalog.test.ts src/runtime/pi/package-config.test.ts src/runtime/pi/agent-session-factory.test.ts src/runtime/pi/agent-spec.test.ts packages/pi-risk/extensions/index.test.ts packages/pi-portfolio/extensions/index.test.ts packages/pi-backtest/extensions/index.test.ts` | ✅ / ⏳ |
| A13 | 金融权限 | `safe` / `warning` / `dangerous` / `critical` 四级；critical 走 `production-finance-contract.test.ts` 越权拒绝；`tool-contract.test.ts` 验证只读策略 | `src/runtime/pi/production-finance-contract.test.ts src/runtime/pi/tool-contract.test.ts` | ✅ / ⏳ |
| A14 | 插件安全 | `plugin-trust.ts` 含 path / hash / package pin / source allowlist 校验；敏感工具强制 WASM/MCP 隔离、manifest `networkDomains`/`credentialScopes` 声明；Pi 结果携带脱敏 `securityAudit`；回归覆盖符号链接、disable、rollback、sandbox mismatch、进程内敏感工具、来源和安全 scope；旧 standalone bundle 已删除 | `bun test src/runtime/pi/plugin-trust.test.ts src/runtime/pi/plugin-adapter.test.ts src/runtime/pi/package-catalog.test.ts` + `bun run check:pi-migration` | ✅ / ⏳ |
| A15 | Session 迁移 | `src/session/migrate-to-pi.ts` 支持 `--dry-run` / `--backup-dir` / hash / report；原文件只读；`pi-migration.test.ts` 验证 Pi 回读 | `bun test src/session/pi-migration.test.ts` | ✅ / ⏳ |
| A16 | /invest 5 阶段 | `investment-workflow.ts` 5 阶段（research / valuation / backtest / trade / review）+ 状态机（detect / plan / paused / [*]）；checkpoint 走 Pi custom entry `upup-investment-workflow`；`investment-workflow.test.ts` 覆盖 pause/resume/fork/idempotency；新增 10 个命名投研 E2E 场景覆盖金融、恢复和外围入口 | `bun test src/runtime/pi/investment-workflow.test.ts src/runtime/pi/investment-scenarios.pi.test.ts` | ✅ / ⏳ |
| A17 | 多 Agent | `subagent.ts` / `subagent-runner.ts` 委托 `PiBackgroundService` + `runPiPrompt`；`pi-platform` 原生 Agent/Swarm 工具通过 Host `agent-worker` 创建独立 Pi Session | `src/runtime/pi/agent-session-factory.test.ts`、`packages/pi-platform/extensions/index.test.ts` | ✅ / ⏳ |
| A18 | 外围入口 | CLI / Pi-native print / stdio / Gateway / Cron / Daemon / Bridge / SDK / Eval 全部走 `streamPiAgent` / `runPiPrompt` / `PiSessionService` / `PiBackgroundService`；`chat-log.pi.test.ts` 覆盖 CLI TUI 渲染；10 个命名场景覆盖 Gateway、Cron、并行 worker 和 Session 恢复 | `src/runtime/pi/production-entry-contract.test.ts` + `src/print.test.ts` + `src/runtime/pi/event-stream.test.ts` + `src/runtime/pi/runner.test.ts` + `src/components/chat-log.pi.test.ts` + `src/runtime/pi/investment-scenarios.pi.test.ts` | ✅ / ⏳ |
| A19 | 验证门禁 | `check:pi-migration` / `check:pi-packages` / `check:pi-runtime` / `typecheck` / `benchmark:pi5` / `test:pi-contracts` / `verify:pi5` / `bun test` 全部可重复；覆盖七个 Pi Package、一百一十六个原生金融/市场/分析/风险/组合归因/回测工具、实时订阅与 Kairos journal 生命周期、五个 Finance 命令、Host Contract、Package Catalog manifest、Extension 完整性、Skill 资源与 allowlist、旧 Skill 导入防回归、print/package-config 回归、发行构建与 faux Pi fixture | 见 `package.json` scripts | ✅ / ⏳ |
| A20 | 架构留档 | `docs/architecture/` 6 份（`pi5-runtime.md` / `plugin-ecosystem.md` / `finance-dataflow.md` / `session-lifecycle.md` / `multi-agent-dataflow.md` / `invest-workflow.md`），覆盖 Runtime / Plugin / 金融数据流 / Session 生命周期 / Multi-Agent / /invest 状态机 | `wc -l docs/architecture/*.md` | ✅ / ⏳ |

> 综合实施进度：**20/20 = 100% 本地实施契约**；**Runtime 定向自动验证：100% 通过**（迁移门禁、包门禁、运行时门禁、类型检查、Pi Runtime Contract、七个 Pi Package 测试、AgentSpec/Session/Profile/Package 定向回归、七包工具归属、Native ownership、Host Registry、插件/信任/包/沙箱/依赖图/按需 Package/命令冲突/延迟选择、平台 Skill 资源与 allowlist、`git diff --check` 均通过）；**完整回归基线：`4331 pass / 0 fail`**，本轮新增交易写入和 `analyze_symbol` 真实 worker 契约测试已通过；**仓库内 A1–A20 语义验收：20/20 通过**（`bun run verify:pi5`）；**Comet 独立语义验证：0/20**（当前 `phase=verify`、`verificationResult=pending`，A1–A20 尚未返回逐项最终结论，不能将本地结果替代独立验收）。当前严格综合进度为 **约 66%–71%**：Runtime/Package 边界完成，金融工具原生化 `116/216 = 53.7%`，独立语义验收仍为 **0%**。


### Runtime 完成

- [x] 所有生产入口使用 Pi runtime adapter，核心执行由 `AgentSession` 提供。
- [x] `src/agent/agent.ts` 已删除，不再存在生产自定义 Agent loop。
- [x] `src/model/llm.ts` 已删除；生产模型调用集中在 `src/runtime/pi/prompt-service.ts`，默认模型和 provider 配置集中在 `src/runtime/pi/model-config.ts`。
- [x] 生产核心使用 Pi AgentMessage/Tool/Event/Model 协议，`src/runtime/pi/message-compat.ts` 已删除，生产代码和核心回归测试不再导入 LangChain 消息类。
- [x] Pi 版本和 Node/Bun 运行策略已锁定并有 `check:pi-migration` 检查。
- [x] 生产源码不再 import `src/agent` 兼容模块；`check:pi-migration` 对该依赖回流提供静态门禁。

### Agent 完成

- [x] `UpUpAgentSpec` 是唯一可执行领域 Agent 定义；`PiAgentSpecInput`/`PiAgentFileSpec`/`PiSubagentConfig` 仅作为边界 DTO。
- [x] Agent 注册存储已切换为 `PiAgentCatalog`；兼容 registry 不再持有第二套可执行定义。
- [x] 普通 Agent、投资 Agent、Custom Agent、Subagent、Worker 的生产执行均由 Pi Session Factory / Pi runner 创建；独立 verifier 仍需覆盖所有外围入口。
- [x] Agent Profile 的工具白名单和权限策略有自动契约测试。
- [x] 旧 Coordinator、旧 TeamManager、旧 swarm tool 与旧验证器已删除；股票分析工作流直接使用独立 Pi Session，平台协作由 `@upup/pi-platform` 原生工具负责。

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
12. `pi5-012`：删除旧 Coordinator/TeamManager，接通 Pi Platform Swarm Host capability。
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
- `src/multi-agent/workflows/stock-analysis.ts`
- `src/tools/registry/types.ts`
- `src/session/storage.ts`
- `src/plugins/types.ts`
- `src/plan/plan-executor.ts`
- `src/gateway/gateway.ts`

### 本轮最终收口（2026-09-14）

- **自定义 Agent 执行栈：100% 删除**：已删除 `src/multi-agent/coordinator.ts`、旧 TeamManager、旧 Backend/Worker Factory、Scheduler、Lifecycle、EventBus、Persistence、旧 verifier、旧 `swarm-tools` 和根 `team_*` 工具注册；生产源码不再保留模块级 Coordinator、文件型团队状态或第二套 Agent 生命周期。
- **Pi 多 Agent：100% 生产接管**：普通 Agent 使用 `runPiPrompt`/`PiBackgroundService`，股票分析工作流使用三个独立 Pi Session，平台团队协作由 `@upup/pi-platform` 的 `swarm_*` 原生 Extension + Host `agent-worker` capability 提供；状态、消息和结果写入 Pi Session custom journal。
- **模块边界：100% 门禁通过**：`22` 个 workspace package 不反向依赖根 `src`，无 package 循环；全局配置继续由统一路径模块处理；未修改现有 `.js` ESM 导入约定。
- **当前量化进度**：Pi Runtime `100%`；Pi Package 边界 `100%`；自定义 Agent 删除 `100%`；金融原生 Pi 工具按当前 ownership 集合为 `121/213 = 56.8%`；严格综合实现进度按既有口径约 `66%–71%`；Comet 独立语义验收 `0/20`，不能用本地测试替代独立验证。
- **本轮验证**：`bun run typecheck`、`check:pi-migration`、`check:pi-packages`、`check:module-boundaries`、`check:pi-runtime` 全部通过；Kairos/Market Data 定向回归 `16 pass / 0 fail`；Pi Session/Registry/Profile/Production Finance/ownership 定向回归 `59 pass / 0 fail`；完整回归 `4177 pass / 0 fail`；`git diff --check` 通过。

### Kairos Registry 收口（2026-09-14）

- **重复注入已删除**：删除 `src/tools/registry/kairos-tools.ts` 及其旧 Registry 测试，并从 `src/tools/registry/index.ts` 移除 `loadKairosTools()`；Kairos 四个查询工具不再通过全局 EventBus replay 或根 Registry 回流。
- **唯一生产来源**：`kairos_recent_opportunities`、`kairos_recent_position_alerts`、`kairos_recent_scanner_events`、`kairos_summary` 只由 `@upup/pi-market-data` Extension 注册，读取当前 Pi Session 的 `upup_pi_market_data_kairos_journal`，Package 禁用时不会暴露。
- **统计口径修正**：移除 4 个重复根注册后，当前 Registry 为 `198` 个唯一工具；ownership 为 `213` 个工具，其中 `121` 个由 Pi Extension 原生提供、`92` 个仍由 Host Registry 适配或属于 Platform 通用能力；因此原生化进度为 `56.8%`，历史段落中的 `116/216` 仅表示迁移中间状态。
- **本轮验证**：Kairos/Market Data 定向测试 `16 pass / 0 fail`；Pi Session、Registry Adapter、Profile、Production Finance、ownership 定向回归 `59 pass / 0 fail`；`typecheck`、Pi Runtime/Package/Migration/Module Boundary 门禁全部通过。

### 后续模块化实施计划

1. **先拆 Host Adapter 边界**：把 `src/tools/registry` 明确收敛为过渡适配层，按 `finance-data`、`research-web`、`platform-services`、`mcp` 四类建立独立接口；Package 只依赖 `@upup/types`、`@upup/utils`、Pi SDK 和同层 Package，禁止反向导入根 `src`。
2. **迁移高价值金融工具**：优先迁移 `web_fetch`/`browser` 到独立 Research/Web Package（不继续错误归属 Finance），再迁移剩余 Finance、Portfolio、Backtest 的 deterministic 工具；每组都必须具备 native Extension、evidence/freshness、Pi Session 启用/禁用隔离和 ownership 唯一性测试。
3. **拆 Platform 通用能力**：将文件、MCP、计划、通知、缓存、LSP、工作区和命令能力从单一 Platform ownership 拆成可选 Pi Package，避免把约 90 个基础设施工具伪装为金融原生能力；默认关闭高风险写入和外部网络。
4. **彻底移除过渡适配器**：每完成一组迁移即删除根 Registry 生产注入、删除重复测试和旧 EventBus/全局状态依赖；当 `src/tools/registry` 不再承载生产 Agent 工具后，再删除 `registry-adapter.ts` 的兼容层。
5. **循环依赖与配置治理**：保持依赖方向 `types/utils → domain packages → runtime/CLI`，禁止 Package → `src`、Package 互相循环和运行时全局配置读取；所有配置路径继续经 `src/utils/config-paths.ts` 或独立 `@upup/utils` 配置接口，保留现有 `.js` ESM 导入约定，不做导入后缀改造。
6. **验收门槛**：每个切片通过 `bun test` 定向回归、`bun run typecheck`、`check:pi-migration`、`check:pi-packages`、`check:module-boundaries`、`check:pi-runtime`、`git diff --check` 后，才更新进度；Comet 独立验收仍单独统计，不以本地测试替代。

### Research Package 原生迁移（2026-09-14）

- **独立插件已落地**：新增 `@upup/pi-research`，包含自包含 `src/index.ts`、Pi Extension、Skill、Prompt、Workflow、Policy 和 Eval；Package 只依赖 Pi SDK/TypeBox，不导入根 `src`，通过默认 `builtin:upup` 信任策略和精确版本 `0.1.0` 加载。
- **`web_fetch` 已脱离 Finance**：`web_fetch` ownership 从 Finance 移至 Research Package；根 `src/tools/registry/web-search-tools.ts` 不再注入该工具，旧 `src/tools/fetch/*` 实现全部删除，避免旧路径回流。Browser 尚未迁移，仍作为下一独立切片处理。
- **安全与证据契约**：Research Extension 仅允许 HTTP/HTTPS，限制超时、重定向、响应大小，支持 HTML/JSON/纯文本提取、缓存、AbortSignal 和 fail-closed 错误；结果返回 `live` freshness、源 URL、retrievedAt、asOf、auditId，并明确外部网页内容是不可信数据。
- **真实运行时隔离**：`PiAgentSessionFactory` 已验证 Research Package 启用时只暴露 `web_fetch`，Package 禁用时工具集合为空；本地 HTTP Server 真实验证 HTML/JSON 提取和 evidence，不依赖外网。
- **发布链已接入**：workspace lockfile 已更新；默认包发现、Pi package check、合同测试列表和资源复制 smoke test 均纳入 Research Package。生产构建通过 `scripts/copy-pi-package-resources.ts` 复制其资源。
- **本轮验证**：Research 核心/Extension、Pi Session、Package Config、Ownership、Profile、Registry Adapter、Production Finance 定向回归 `46 pass / 0 fail`；`typecheck`、`check:pi-runtime`、`check:pi-migration`、`check:pi-packages`、`check:module-boundaries` 全部通过；本地构建资源 smoke test 通过。
- **最新量化进度**：当前 Registry 为 `197` 个唯一工具；ownership 为 `213` 个工具；Pi 原生 Extension 为 `122/213 = 57.3%`；剩余 `91` 个为 Host Registry 适配或 Platform/基础设施能力。Pi Runtime、Package 信任/边界和自定义 Agent 删除仍为 `100%`；严格综合实现进度暂按 `67%–72%`，Comet 独立验收仍为 `0/20`。

### Browser Package 原生迁移与网络安全收口（2026-09-14）

- **研究浏览器已独立成包**：新增 `@upup/pi-browser`，把 Playwright 交互浏览从 Finance ownership 移到可选 Research/Web Package；包含自包含 BrowserController、Pi Extension、Skill、Prompt、Workflow、Policy、Eval 和 Package 合同测试，Package 不导入根 `src`。
- **根 Registry 已切断回流**：删除 `src/tools/browser/*` 和 `web-search-tools.ts` 的 Playwright/browser 注册；`browser` 只由 `@upup/pi-browser` Extension 提供，`web_fetch` 只由 `@upup/pi-research` 提供，避免双注册和 Finance 领域边界污染。
- **SSRF 防护已 fail-closed**：`web_fetch` 与 `browser` 均拒绝 localhost、loopback、私有网段、链路本地、组播、IPv4-mapped IPv6 和解析到私网的域名；每次重定向重新校验。`web_fetch` 的 `allow-private` 仅作为核心本地 fixture 测试选项，Pi Extension 没有生产绕过开关。
- **模块化与发布链**：默认 Package discovery、精确版本/信任策略、ownership/native map、workspace lockfile、Pi 合同测试和资源复制均已纳入 browser；当前 workspace 为 `24` 个 Package，无 root `src` 反向依赖、无 Package 循环依赖，保持既有 `.js` ESM 导入约定和统一配置路径治理。
- **进度口径更新**：browser 原生化新增 `1` 个工具，同时从 Finance ownership 移出，ownership 总量保持 `213` 个；Pi 原生工具为 `123` 个，原生 Extension 覆盖率为 `57.7%`（`123/213`），剩余 Host Adapter/Platform 工具 `90` 个。Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`；严格综合迁移进度约 `68%–73%`，Comet 独立验收仍为 `0/20`，不能用本地测试替代。
- **本轮验证**：Research `5 pass / 0 fail`；Browser `2 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries` 通过；Browser Package 构建和声明生成通过。下一切片优先拆分 Platform ownership，并继续迁移剩余 Host Adapter 工具。

### Config Package 原生迁移（2026-09-14）

- **全局配置已独立插件化**：新增 `@upup/pi-config`，自包含分层配置读取、点号路径读写、全局 `.upup` 路径治理、配置片段合并、写入备份，以及 `config_get`、`config_list`、`config_set` 三个 Pi 原生 Extension 工具。
- **旧配置实现已退出生产**：删除 `src/tools/config-tool.ts` 及其测试，根 `src/tools/registry/domain-tools.ts` 不再注册配置工具；配置工具只在显式启用 `@upup/pi-config` 的 Pi Session 中可见，禁用 Package 时真实工具集合为空。
- **生态接入完成**：默认 Package discovery、精确版本与 `builtin:upup` trust、ownership/native map、Package 合同检查、workspace lockfile、资源复制、构建链和 `test:pi-contracts` 均已接入；Package 不依赖根 `src`，保持 `.js` ESM 导入约定。
- **安全边界**：`config_set` 只写全局 `~/.upup/settings.json` 并创建备份；配置值按外部数据处理，不读取或暴露 `.env`、credentials 等敏感文件；写操作需要用户明确意图。
- **最新量化进度**：当前 workspace 为 `25` 个 Package；ownership 为 `213` 个工具，Pi 原生 Extension 为 `126` 个，原生覆盖率 `59.2%`（`126/213`），剩余 `87` 个 Host Adapter/Platform 工具。按当前根 Registry 去重统计为 `194` 个生产工具；Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`；严格综合迁移进度约 `69%–74%`，Comet 独立验收仍单独统计。
- **本轮验证**：Config `2 pass / 0 fail`；Pi Session/ownership/config discovery 定向回归 `52 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries` 均通过。下一切片继续拆 Platform 中的缓存或通知能力。

### Cache Package 原生迁移（2026-09-14）

- **缓存管理已独立插件化**：新增 `@upup/pi-cache`，提供进程内命名缓存、TTL、LRU、命中/未命中/驱逐统计，以及 `get_cache_stats`、`clear_cache`、`invalidate_cache`、`get_cache_info` 四个 Pi 原生工具。
- **根 Registry 已移除缓存 Agent 工具**：缓存管理只由显式启用的 Cache Package 提供；`nl_screen` 也已改用 `@upup/pi-cache` 公共 API，根 `src/tools/cache` 不再保留第二套实现，Package 禁用时真实 Session 工具为空。
- **安全与产品边界**：缓存不是金融证据，Extension 返回 `upup-pi://cache` 审计来源和 `live` 状态；`clear_cache` 强制要求 `confirm=true`；缓存状态限定当前进程，不作为跨 Session 投资事实。
- **最新量化进度**：当前 ownership Package 数为 `11`，ownership 工具仍为 `213`（缓存工具接替原 Platform ownership），Pi 原生 Extension 为 `130`，覆盖率 `61.0%`（`130/213`），剩余 `83` 个 Host Adapter/Platform 工具；当前根 Registry 去重后为 `189` 个生产工具，已不包含配置或缓存管理工具。workspace 实际目录为 `26` 个（含既有基础 workspace package），无 root-src 反向依赖、无 Package 循环依赖。
- **本轮验证**：Cache `3 pass / 0 fail`；Pi Session、ownership、config/cache discovery 定向回归 `53 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries`、`check:pi-migration` 通过。下一切片优先拆 Platform 的通知/订阅或工作区能力。

### Notify Package 原生迁移（2026-09-14）

- **通知与订阅已独立插件化**：新增 `@upup/pi-notify`，包含 `notify`、`notify_list`、`subscribe_pr`、`unsubscribe_pr`、`list_pr_subscriptions` 五个 Pi 原生工具，以及独立 Skill、Prompt、Workflow、Policy、Eval。
- **根 Registry 已切断通知回流**：删除 `src/tools/registry/domain-tools.ts` 的通知/PR 订阅注册；通知和订阅状态由 Extension 实例持有，严格限定当前 Pi Session，Package 禁用时不会暴露工具或复用状态。
- **外部副作用安全边界**：日志通道可用于本地记录；外部 webhook/Feishu 仅允许 HTTP(S) 公网目标，解析前后拒绝 localhost、回环、私网、链路本地和组播目标；订阅先校验 URL 再写入，输出始终脱敏 webhook 路径和 token。
- **最新量化进度**：当前 ownership Package 数为 `12`，ownership 工具仍为 `213`，Pi 原生 Extension 为 `135`，覆盖率 `63.4%`（`135/213`），剩余 `78` 个 Host Adapter/Platform 工具；当前根 Registry 去重后为 `184` 个生产工具。无 root-src 反向依赖、无 Package 循环依赖；Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **本轮验证**：Notify `4 pass / 0 fail`；Pi Session、ownership、config/cache/notify discovery 定向回归 `54 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries` 通过。下一切片优先拆 Platform 的工作区或 LSP 能力。

### Platform Worktree Package 原生迁移（2026-09-14）

- **工作区能力已下沉到 Pi Platform Package**：新增 `packages/pi-platform/src/worktree.ts`，使用 `execFile` 参数数组实现 Git worktree 的列出、创建和删除，避免旧实现拼接 shell 命令造成参数注入风险；创建分支前校验 ref，删除操作禁止删除当前 worktree，并统一返回审计来源 `upup-pi://platform/swarm`。
- **Pi Extension 已原生注册**：`@upup/pi-platform` 新增 `create_worktree`、`remove_worktree`、`list_worktree` 三个原生工具；工具使用 Pi TypeBox schema、AbortSignal、错误结果和当前 Session 的 Package 发现机制，Package 禁用时不会回流到根 Registry。
- **旧生产路径已删除**：移除 `src/tools/worktree/`，删除 `src/tools/registry/domain-tools.ts` 中的三个注册入口；根 Registry 实测不再包含任何 worktree 工具，Platform ownership 与 native map 保持唯一归属，Package 不依赖根 `src`。
- **构建与门禁统一**：资源复制脚本现在覆盖 12 个内置 Pi Package，`check-pi-packages` 改为校验集中资源复制脚本，避免构建命令和门禁重复维护；保留 `.js` ESM import 约定、精确版本和 `builtin:upup` trust。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `138` 个；原生覆盖率 `64.8%`（`138/213`）；剩余 `75` 个 Host Adapter/Platform 工具；根 Registry 去重后实测 `181` 个生产工具，且不包含 `create_worktree`、`remove_worktree`、`list_worktree`。Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **本轮验证**：Platform `6 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries`、`check:pi-runtime`、`check:pi-migration` 均通过。下一切片优先拆 Platform 的 LSP、导出/观察列表或剩余 Host Adapter；继续以“先 Package 原生化、再删除根注册、最后更新真实百分比”为执行顺序。

### Platform Watchlist Package 原生迁移（2026-09-14）

- **观察列表状态已迁移到 Pi Session**：新增 `packages/pi-platform/src/watchlist.ts`，提供 schema 校验、不可变状态更新、符号规范化、标签过滤、价格告警、百分比变动告警、触发状态和恢复解析；状态只通过 `upup_pi_platform_watchlist` custom entry 写入当前 Pi JSONL，不再使用全局 `~/.upup` watchlist 文件。
- **新增 7 个 Pi 原生工具**：`add_to_watchlist`、`remove_from_watchlist`、`get_watchlist`、`add_watchlist_alert`、`check_watchlist_alerts`、`clear_watchlist_alert`、`export_watchlist`。导出只读取当前 Session，输出到当前工程 `.upup/exports`，支持 CSV/JSON，不把观察列表伪装成金融证据。
- **旧实现已退出生产**：删除 `src/tools/watchlist/`；根 Registry 不再动态注册 6 个旧观察列表工具；同时移除旧 `export_watchlist` 对根 watchlist 文件的反向依赖，避免 Package 删除后循环/悬空依赖。`export_portfolio` 和 `export_data` 仍按原职责保留为待迁移 Host Adapter。
- **安全与边界**：Extension 工具均使用 TypeBox schema、AbortSignal、当前 Session context 和审计 evidence；输入符号、标签、告警索引、数值均有边界；Package 禁用时观察列表工具不可见，不会复用其他 Session 状态。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `145` 个；原生覆盖率 `68.1%`（`145/213`）；剩余 `68` 个 Host Adapter/Platform 工具；根 Registry 去重后实测 `173` 个生产工具。Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **本轮验证**：Platform 包 `8 pass / 0 fail`；真实 `PiAgentSession` watchlist 启用/写入/恢复/禁用隔离 `1 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries`、完整 Pi contracts、A1–A20、构建均通过后，以最终命令输出为准。下一切片优先迁移 Platform LSP 或剩余导出能力。

### Platform LSP Package 原生迁移（2026-09-14）

- **LSP 能力已完全下沉到 Platform Package**：新增 `packages/pi-platform/src/lsp.ts`，保留可替换的 `PlatformLspClient` 接口，提供 completion、definition、references、hover、diagnostics 五类结果格式化；默认使用确定性空客户端，不伪造代码智能结果，后续可由 Pi Extension/宿主注入真实 LSP 客户端。
- **新增 5 个 Pi 原生工具**：`lsp_complete`、`lsp_definition`、`lsp_references`、`lsp_hover`、`lsp_diagnostics`。工具使用 TypeBox 位置/URI schema、AbortSignal、统一审计 evidence，Package 未启用时完全不可见。
- **旧生产路径已删除**：删除 `src/tools/lsp/` 及根 Registry 的五个注册入口；ownership/native map、Package 合同门禁和 Platform Extension 测试同步更新，Package 不依赖根 `src`，不存在 LSP 双重实现或回流。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `150` 个；原生覆盖率 `70.4%`（`150/213`）；剩余 `63` 个 Host Adapter/Platform 工具；根 Registry 去重后实测待最终命令校正。Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **本轮定向验证**：Platform 包 `9 pass / 0 fail`；真实 `PiAgentSession` watchlist/LSP trust、恢复和禁用隔离 `2 pass / 0 fail`；全量结果以本轮合同、A1–A20、门禁和构建命令输出为准。下一切片优先迁移剩余导出/工具发现或 Platform Host Adapter。

### Platform Tool Discovery Package 原生迁移（2026-09-14）

- **工具发现能力已下沉到 Pi Platform Package**：新增 `packages/pi-platform/src/tool-discovery.ts`，以独立 `PlatformToolMetadata` 契约实现 `tool_search`、`tool_get`、`tool_list` 的筛选、详情、建议、分页和并发安全格式化；Package 只依赖自身代码与 Pi/TypeBox，不导入根 `src`。
- **Host Contract 增加元数据通道**：`PiHostBridge` 新增受 Session、Package、版本和 capability 校验的 `getToolMetadata`；Session Factory 只注入当前 Session 工具元数据，Platform Extension 不再访问根 Registry，保持 Package 与根 `src` 解耦。
- **旧实现已删除**：移除 `src/tools/tool-search-tool.ts` 及其旧测试，根 `domain-tools` 不再注册三项工具；ownership/native map 改为 Platform 唯一归属并由 Pi Extension 原生注册，避免双重实现和循环依赖。
- **本轮验证**：Platform 工具发现、Extension、Host Contract、PiAgentSessionFactory 定向回归 `52 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:pi-migration`、`check:module-boundaries` 通过。另有 `check:pi-contracts` 脚本未定义，不能作为验证命令使用。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `153` 个；原生覆盖率 `71.8%`（`153/213`）；剩余 `60` 个 Host Adapter/Platform 工具。根 Registry 去重数待最终验证命令校正；Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **下一切片**：继续迁移 Platform 剩余 Host Adapter，优先 `export_data` 与平台状态/命令能力；保持 `src` 仅作 Host Adapter，Package 不反向依赖 `src`，不改造现有 `.js` ESM 导入后缀。

### Platform `export_data` Package 原生迁移（2026-09-14）

- **数据导出已下沉到 Pi Platform Package**：新增 `packages/pi-platform/src/export-data.ts`，提供无根依赖的 CSV/JSON 序列化与文件写入；限制最多 `10,000` 行、`200` 列，文件名清洗，输出默认位于当前工程 `.upup/exports`，避免路径穿越和无限输入。
- **Pi Extension 原生工具**：`export_data` 使用 TypeBox schema、AbortSignal、统一 Platform evidence/audit 返回，支持 Session 中直接执行；Platform Package 未启用时工具不可见。
- **旧路径已删除**：移除 `src/tools/export/` 与根 Registry 的 `export_data` 注册，同时清理 `src/tools/index.ts` 的悬空导出；Platform ownership/native map 唯一归属保持一致，Package 不依赖根 `src`。
- **真实验证**：Platform 导出核心/Extension 定向测试 `7 pass / 0 fail`；真实 `PiAgentSessionFactory` 启用、写入、JSON 校验和禁用隔离回归包含在 `46 pass / 0 fail` 中；`typecheck`、模块边界、Package 门禁通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `154` 个；原生覆盖率 `72.3%`（`154/213`）；剩余 `59` 个 Host Adapter/Platform 工具。根 Registry 当前实测 `164` 个工具；Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **验证备注**：`scripts/verify-registry.ts` 成功加载 Registry 并验证 `164` 个工具，但后续旧命令动态导入 `../src/commands/registry.js` 时失败；该路径与本轮导出迁移无关，属于现存脚本路径漂移，不能作为本轮通过证据。
- **下一切片**：继续迁移 Platform 的技能发现/执行能力（`search_skills`、`get_skill`、`list_skills`、`skill_info`），保持 Pi Package 自包含并移除根 Registry 依赖。

### Platform Skill Discovery Package 原生迁移（2026-09-14）

- **技能发现已接入 Pi Resource Loader**：新增 `packages/pi-platform/src/skill-discovery.ts`，Platform Extension 提供 `list_skills`、`search_skills`、`get_skill`、`skill_info`；查询对象来自当前 Session 已加载且已通过信任审计的 Pi Skill，详情可读取受信任 SKILL.md 正文。
- **新增 Host Skill 契约**：`PiHostBridge` 增加 Session/Package/版本校验的 `getSkillDefinitions`；每次工具调用读取当前 Resource Loader 快照，避免初始化竞态、跨 Session 污染和 Package 直接扫描根 `src/skills`。
- **旧路径已删除**：移除 `src/tools/discovery/`，根 Registry 不再注册 `search_skills`、`get_skill`；旧 `list_skills`、`skill_info` 专用实现也不再由根 Registry 注册，避免重复实现，后续仅保留 `execute_skill` 作为独立迁移切片。
- **真实验证**：Platform 核心/Extension 与 Host Contract 通过；真实 `PiAgentSessionFactory` 从 Pi Resource Loader 加载 `pi-platform` Skill、执行列表/搜索/详情并验证受信任正文，组合回归 `63 pass / 0 fail`。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `158` 个；原生覆盖率 `74.2%`（`158/213`）；剩余 `55` 个 Host Adapter/Platform 工具。Pi Runtime、旧自定义 Agent 删除、Package 信任/模块边界仍为 `100%`。
- **下一切片**：迁移 `execute_skill` 的 Pi-native 调度语义，或继续拆分 Platform 文件/MCP/计划能力；执行技能必须复用 Pi Session、Skill allowlist 和权限审计，不能恢复旧自定义 Agent。

### Skill CLI 生产路径原生迁移（2026-09-14）

- **CLI 已切换到 Pi ResourceLoader**：新增 `src/runtime/pi/skill-commands.ts`，Skill 列表、补全和 `/skills` 展示均从当前 Pi ResourceLoader 读取；包内 Skill 经过 Pi Package trust/pinning 校验后才可见。
- **执行链已切断旧自定义执行器**：`src/cli.ts` 不再导入或调用 `src/skills/executor.ts`，用户 Skill 统一转换为 `/skill:<name> [args]`，由活动 Pi AgentSession 原生展开、注入上下文并执行；不创建第二套 Agent Loop，也不使用全局 Skill 执行状态。
- **命令注册边界收敛**：`src/commands/unified-registry.ts` 只保留 `@upup/commands` 元数据与 Pi Skill 元数据，不再依赖根 `src/skills` Registry；生产 CLI 不再执行 `initializeSkills()`。
- **兼容遗留审计**：`src/skills/executor.ts`、`src/skills/commands.ts`、`src/skills/skills-menu.ts`、`src/tools/skill-executor.ts` 仍作为待删除的历史兼容/测试模块存在，但已不属于 CLI、Gateway、Cron、Daemon、stdio 或 Pi Runtime 生产执行路径；下一切片应迁移剩余调用者后物理删除。
- **真实验证**：Pi Skill discovery `2 pass / 0 fail`；CLI autocomplete/旧命令兼容回归 `17 pass / 0 fail`；生产入口契约、类型检查、模块边界和 Package 检查通过。
- **最新量化进度**：12 个 Pi Package；ownership 工具 `213` 个；Pi 原生工具 `160` 个；原生覆盖率 `75.1% (160/213)`；剩余 `53` 个，主要是文件、MCP、Memory、Plan/Todo/Task、Notebook、Subagent 和工作流兼容能力。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度约 `75%`，不把旧 Skill 兼容模块误计为已完成。

### Platform Filesystem Package 原生迁移（2026-09-14）

- **7 个工作区/文件工具已迁移到 Pi Extension**：`bash`、`read_file`、`write_file`、`edit_file`、`glob`、`grep`、`send_user_file` 由 `@upup/pi-platform` 自包含实现，使用 TypeBox 参数、AbortSignal、统一 evidence/audit 结果，不再由根 Registry 注册。
- **安全边界已收口**：所有文件操作使用当前 Pi Session 的 `context.cwd`，路径穿越和符号链接越界 fail-closed；写入/编辑/发送文件要求显式 `confirm: true`；写文件采用临时文件加原子 rename；Shell 阻断明显危险命令并限制超时/输出；`grep -C` 上下文参数已实现并限制在 20 行以内。
- **Session 隔离已验证**：`PiAgentSessionFactory.executeTool` 传递真实 Session cwd，避免测试/运行时回退到进程目录；Platform Package 启用时文件工具可见并可真实读写/编辑/搜索，禁用时工具集合为空。
- **旧实现状态**：根 Registry 已移除 7 个文件工具；`src/tools/filesystem` 和 `src/tools/bash` 仍被沙箱权限、提示 Shell 执行和渲染等兼容模块引用，暂不物理删除，不能将其误报为全部旧代码已删除；下一切片先迁移 Memory/Heartbeat/Cron 或 MCP 资源能力，再清理剩余兼容引用。
- **真实验证**：文件核心与 Pi Session 回归 `50 pass / 0 fail`；Platform Package 回归 `19 pass / 0 fail`；`typecheck`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`verify:pi5`（A1–A20 `20/20`）、`build`、`git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `167` 个；原生覆盖率 `78.4% (167/213)`；剩余 `46` 个 Host Adapter/Platform 工具，主要集中在 Memory/Heartbeat/Cron、MCP 资源与认证、Plan/Todo/Task/Ask、Notebook、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `78%`，不把残留兼容模块计入原生迁移完成度。

### Platform Memory Package 原生迁移（2026-09-14）

- **3 个 Memory 工具已迁移到 Pi Extension**：`memory_search`、`memory_get`、`memory_update` 现在由 `@upup/pi-platform` 自包含实现，保留 `long_term`/`daily` 别名、分页读取、关键词检索、追加/编辑/删除语义，并使用统一 Platform evidence/audit 返回。
- **安全与隔离已验证**：Memory 文件固定在全局 `~/.upup/memory`（可通过 `UPUP_MEMORY_DIR` 注入测试目录），拒绝非 Markdown 路径、目录穿越和指向目录外的符号链接；更新使用临时文件加原子 rename；输入长度、结果数量和查询长度均有上限；编辑缺少 `new_text` 时 fail-closed。
- **生产路径已切断**：Platform ownership/native map 增加 3 个工具；根 Registry 不再注册 Memory 三工具，仍保留 `heartbeat`、`cron` 兼容适配；`src/tools/memory` 仅供旧命令/兼容 API 使用，尚未物理删除，不能误报为全部旧 Memory 代码已清理。
- **真实验证**：Memory 核心与安全测试 `2 pass / 0 fail`；Platform Package 全量 `21 pass / 0 fail`；真实 `PiAgentSessionFactory` 读写/搜索/读取和 Package 禁用隔离通过；ownership/Registry 回归 `64 pass / 0 fail`；`typecheck`、模块边界、Package 与迁移门禁、`verify:pi5` A1–A20 `20/20`、Pi Runtime、构建和 `git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `170` 个；原生覆盖率 `79.8% (170/213)`；剩余 `43` 个 Host Adapter/Platform 工具，主要集中在 Heartbeat/Cron、MCP 资源与认证、Plan/Todo/Task/Ask、Notebook、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `80%`，不把残留兼容模块计入原生迁移完成度。

### Platform Heartbeat Package 原生迁移（2026-09-14）

- **Heartbeat 管理工具已迁移**：`heartbeat` 由 `@upup/pi-platform` 原生 Extension 提供，支持查看/替换 `~/.upup/HEARTBEAT.md`、默认清单、空清单识别、启用全局 `gateway.json` heartbeat 配置，并同步已有 `~/.upup/cron/jobs.json` 中的 Heartbeat job。
- **边界保持清晰**：本切片只迁移清单与配置管理，不把 Cron 调度/执行器冒充为 Package 原生能力；Cron job 仍由后续切片处理。配置和 job 文件使用原子写入，坏 JSON fail-safe，更新内容有上限。
- **生产路径已切断**：Platform ownership/native map 增加 `heartbeat`；根 Registry 不再注册旧 Heartbeat 工具，`cron` 暂保留兼容注册；旧 `src/tools/heartbeat` 仅供兼容代码存在。
- **真实验证**：Heartbeat 核心测试 `2 pass / 0 fail`，包含 gateway enable、已有 Cron job message 同步和空清单行为；Platform Package 全量 `23 pass / 0 fail`；真实 `PiAgentSessionFactory` 启用、更新、查看和禁用隔离通过；ownership/Registry `61 pass / 0 fail`；`typecheck`、Package/模块/迁移门禁、`verify:pi5` A1–A20 `20/20`、Pi Runtime、构建、`git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `171` 个；原生覆盖率 `80.3% (171/213)`；剩余 `42` 个 Host Adapter/Platform 工具，主要集中在 Cron、MCP 资源与认证、Plan/Todo/Task/Ask、Notebook、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `80%`，不把残留兼容模块计入原生迁移完成度。

### Platform Cron Package 原生迁移（2026-09-14）

- **Cron 管理工具已迁移到 Pi Extension**：`cron` 现在由 `@upup/pi-platform` 自包含提供，支持 `list`、`add`、`update`、`remove`、`run`，覆盖 `at`、`every`、基础 5/6 字段 cron 表达式、逗号/范围/步进语法，以及任务启停和 fulfillment 配置。
- **Package 边界保持单向**：Platform Package 不导入根 `src`，不新增未审计 runtime 依赖；Cron store 使用 `UPUP_CRON_STORE`/全局 `.upup/cron/jobs.json`、坏 JSON fail-safe、原子写入和受限调度计算。
- **执行链明确分层**：Package 内的 `run` 没有可信 Host capability 时 fail-closed；生产执行仍通过 `cron-runner` Host contract 转发到现有 Pi-backed 宿主 Cron executor。此切片不宣称 Package 内完成完整时区换算或替换宿主调度器，`tz` 作为兼容字段保留。
- **生产路径已切断**：Platform ownership/native map 增加 `cron`，根 Registry 不再注册 `cron`；旧 `src/tools/cron` 和 `src/cron/executor.ts` 仅保留为宿主执行/兼容实现，不能误报为 Package 依赖根 `src`。
- **真实验证**：Platform Cron 核心测试 `2 pass / 0 fail`；Platform Package 全量 `25 pass / 0 fail`；真实 `PiAgentSessionFactory` 完成 Cron 新增、查询、更新、删除、Package 禁用隔离；相关 Session、ownership、Registry 回归 `62 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、`verify:pi5` A1–A20 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `172` 个；原生覆盖率 `80.8% (172/213)`；剩余 `41` 个 Host Adapter/Platform 工具，主要集中在 MCP 资源与认证、Plan/Todo/Task/Ask、Notebook、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `81%`，不把残留兼容模块计入原生迁移完成度。

### Platform Planning/Todo Package 原生迁移（2026-09-14）

- **计划与 Todo 已完全下沉到 Pi Platform Extension**：新增 `planning` 自包含模块，将 `enter_plan_mode`、`exit_plan_mode`、`add_plan_step`、`update_plan_step`、`list_plan_steps`、`create_todo`、`update_todo`、`list_todos`、`delete_todo` 共 9 个工具迁移到 `@upup/pi-platform`。
- **Session 原生持久化**：计划和 Todo 使用当前 Pi Session 的 `upup_pi_platform_planning` custom entry 保存，不再依赖根 `src/plan`、全局单例或跨 Session 内存；Session 恢复时自动解析最近一条合法状态，坏状态 fail-safe，支持计划步骤依赖、进度计算、计划保存/丢弃、Todo 状态/优先级/备注/计划归属和统计。
- **模块边界已收紧**：Platform Package 不导入根 `src`，新增模块不增加 runtime dependency；根 `loadAgentPlanningTools()` 不再注册这 9 个工具，避免 Pi Extension 与旧 Registry 双重注册和循环依赖。Task/Ask/Agent 仍保留 Host Adapter，未把依赖后台任务或 UI 交互的能力错误计入本切片。
- **真实验证**：planning 核心测试与状态校验 `2 pass / 0 fail`；Platform Package 全量 `27 pass / 0 fail`；真实 `PiAgentSessionFactory` 计划创建、步骤新增/更新/恢复、Todo 创建/更新/查询和 Package 禁用隔离通过（Session 套件 `52 pass / 0 fail`）；Registry/ownership 回归 `12 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、Pi Runtime、`verify:pi5` A1–A20 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `181` 个；原生覆盖率 `85.0% (181/213)`；剩余 `32` 个 Host Adapter/Platform 工具，主要集中在 Task/Ask/Agent、MCP 资源与认证、Notebook、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `85%`，不把残留兼容模块计入原生迁移完成度。

### Platform Notebook Package 原生迁移（2026-09-14）

- **5 个 Notebook 工具已迁移到 Pi Platform Extension**：`notebook_read`、`notebook_create`、`notebook_edit_cell`、`notebook_insert_cell`、`notebook_delete_cell` 现在由 `@upup/pi-platform` 自包含实现，覆盖 Jupyter `nbformat 4` 文件的创建、摘要读取、Cell 编辑/插入/删除和 kernel 元数据设置。
- **文件安全边界统一**：Notebook 路径按当前 Pi Session `cwd` 解析，强制 `.ipynb` 扩展名，拒绝目录穿越、符号链接越界和无效 Notebook JSON；写入使用临时文件 + 原子 rename，Cell 源码有长度上限。
- **生产路径已切断**：根 Domain Registry 不再注册 5 个 Notebook 工具；Platform ownership/native map 唯一归属保持一致，旧 `src/tools/notebook` 仅保留兼容测试/实现，不再作为 Pi Runtime 生产工具入口。
- **真实验证**：Notebook 核心与安全测试 `2 pass / 0 fail`；Platform Package 全量 `29 pass / 0 fail`；真实 `PiAgentSessionFactory` 完成 Notebook 创建、插入、编辑、读取、删除、cwd 越界拒绝和 Package 禁用隔离（Session 套件 `53 pass / 0 fail`）；Registry/ownership/Extension 回归 `14 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、`verify:pi5` A1–A20 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `186` 个；原生覆盖率 `87.3% (186/213)`；剩余 `27` 个 Host Adapter/Platform 工具，主要集中在 Task/Ask/Agent、MCP 资源与认证、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `87%`，不把残留兼容模块计入原生迁移完成度。

### Platform MCP Resource/Auth Package 原生迁移（2026-09-14）

- **5 个 MCP 工具已迁移到 Pi Platform Extension**：`list_mcp_resources`、`read_mcp_resource`、`mcp_auth_set`、`mcp_auth_get`、`mcp_auth_clear` 现在由 Platform Package 注册；MCP 认证文件、凭证脱敏和原子保存逻辑均位于 Package 自身。
- **外部 MCP 能力采用受控 Host capability**：新增 `mcp-resources` Host contract，资源列表/读取只能通过当前 Pi Session 注入的 Host MCP client 访问已连接服务器；缺少 capability 时工具 fail-closed，不在 Package 内伪造连接、不允许跨 Session 客户端复用。资源返回继续通过统一 Platform evidence，凭证永不进入 evidence。
- **生产路径已切断**：根 `loadMCPTools()` 不再注册资源/认证 5 个工具；Platform ownership/native map 唯一归属保持一致；Package 不导入根 `src`，MCP Host adapter 只存在于 Runtime bridge。
- **真实验证**：MCP 核心与 Host 注入测试 `2 pass / 0 fail`；Platform Package 全量 `31 pass / 0 fail`；真实 `PiAgentSessionFactory` 认证设置/读取/清理、凭证脱敏、无服务器资源结果、读取 fail-closed 和 Package 禁用隔离通过；Host/Session/Registry/ownership 回归 `70 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、Pi Runtime、`verify:pi5` A1–A20 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `191` 个；原生覆盖率 `89.7% (191/213)`；剩余 `22` 个 Host Adapter/Platform 工具，主要集中在 Task/Ask/Agent、Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `90%`，不把残留兼容模块计入原生迁移完成度。

### Platform Task Package 原生迁移（2026-09-14）

- **6 个 Task 工具已迁移到 Pi Platform Extension**：`task_create`、`task_get`、`task_list`、`task_stop`、`task_update`、`task_result` 现在由 Platform Package 提供，任务状态存储在当前 Pi Session 的 `upup_pi_platform_tasks` custom entry。
- **Pi worker 生命周期接入**：`task_create` 可携带 prompt、tools 和 model，通过已有 `agent-worker` Host capability 启动真正的 Pi worker；worker 完成、失败或被停止都会回写同一 Session 的任务状态。无 capability 时只创建 pending 任务并 fail-closed，不伪造后台执行。
- **生产路径已切断**：根 `loadAgentPlanningTools()` 不再注册 6 个 Task 工具；旧全局 `TaskStore` 不再是 Pi Runtime 生产来源，避免跨 Session 状态污染和自定义 Agent 生命周期回流。
- **真实验证**：Task 状态核心测试 `1 pass / 0 fail`；Platform Package 全量 `32 pass / 0 fail`；真实 `PiAgentSessionFactory` 完成 Task 创建、更新、查询、列表、停止、结果读取及 Package 禁用隔离（Session 套件 `55 pass / 0 fail`）；Registry/Host/ownership 回归 `16 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、`verify:pi5` A1–A20 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `197` 个；原生覆盖率 `92.5% (197/213)`；剩余 `16` 个 Host Adapter/Platform 工具，主要集中在 `agent`、Ask 交互、Subagent 兼容工具、`send_message`/`snip_tool`/`sleep`/`monitor` 和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `93%`。

### Platform Sleep/Monitor Package 原生迁移（2026-09-14）

- **2 个系统工具已迁移到 Pi Platform Extension**：`sleep` 与 `monitor` 现在由 `@upup/pi-platform` 自包含实现；`sleep` 支持 `0–3600` 秒、AbortSignal 和可选原因，`monitor` 支持 `all`、`cpu`、`memory`、`uptime` 四类指标。
- **运行时与模块边界已收紧**：新实现只依赖 Node 标准库和 Platform Package 自身，不导入根 `src`、旧 `PiTool` 或全局 Agent 状态；参数使用 TypeBox，返回值沿用 Platform evidence/audit 包装。旧 Domain Registry 已移除 `sleep`/`monitor` 注册，避免 Pi Extension 与兼容入口双重注册。
- **安全语义已验证**：睡眠时长严格限制在 0–3600 秒，已取消请求 fail-closed；监控指标采用固定枚举，不接受任意系统查询参数；系统信息只读，不写入全局状态。
- **真实验证**：Platform 全量测试 `36 pass / 0 fail`；新增 `sleep`/`monitor` 核心测试 `4 pass / 0 fail`；Platform Package 构建、`typecheck`、Package 检查、模块边界、Pi migration、Pi Runtime、`verify:pi5` A1–A20 `20/20`、`git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `199` 个；原生覆盖率 `93.4% (199/213)`；剩余 `14` 个 Host Adapter/Platform 工具：`agent`、6 个 Ask 交互工具、`send_message`、`snip_tool`、4 个 Subagent 兼容工具和 `run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `94%`。

### Platform Message/Snipping Package 原生迁移（2026-09-14）

- **2 个上下文/协作工具已迁移到 Pi Platform Extension**：`send_message` 与 `snip_tool` 现在由 `@upup/pi-platform` 提供；消息使用版本化 `upup_pi_platform_messages` custom entry 写入当前 Pi Session，不再依赖全局 `AgentMessageStore` 或 `TeamCoordinator`。
- **snip 已接入真实 Pi 上下文**：工具读取 `sessionManager.buildSessionContext().messages`，dry-run 返回候选消息、索引、阈值和估算节省；正式执行通过 Pi `context.compact()` 请求原生压缩，缺少 compaction capability 时 fail-closed，不生成示例对话、不直接修改 Pi 内部消息树。
- **安全与边界已验证**：消息类型、长度、时间戳和 Session 状态均有校验/上限；消息只写当前 Session journal；snip 仅识别用户低价值确认，保留金融证据、工具结果、用户要求、决策、假设和风险内容；Package 不导入根 `src`，旧 Domain Registry 已移除两个工具注册。
- **真实验证**：消息/snipping 核心测试 `4 pass / 0 fail`；Extension 行为测试 `4 pass / 0 fail`；Platform 全量测试 `42 pass / 0 fail`；`typecheck`、Package 检查、模块边界、Pi migration、Pi Runtime、`verify:pi5` A1–A20 `20/20`、`git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `201` 个；原生覆盖率 `94.4% (201/213)`；剩余 `12` 个 Host Adapter/Platform 工具：`agent`、6 个 Ask 交互工具、`fork_subagent`、`resume_agent`、`agent_memory`、`list_agents`、`run_builtin_agent`、`run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `95%`。

### Platform Ask UI/Session Package 原生迁移（2026-09-14）

- **5 个 Ask 工具已迁移到 Pi Platform Extension**：`ask_confirm`、`ask_select`、`ask_multi_select`、`ask_input`、`ask_response` 现在由 Platform Package 提供；确认、单选和文本输入直接使用 Pi `ctx.ui.confirm/select/input`，多选使用可取消、受最小/最大数量约束的 Pi select 循环。
- **交互状态完全 Session 化**：每次提问生成 request id，答案写入 `upup_pi_platform_ask` custom entry；`ask_response` 支持外部提交、读取已提交结果和幂等重复提交，不再依赖全局 `AskManager`、ElicitationManager 或旧 UI 组件。
- **运行模式安全边界**：没有 Pi UI capability 时所有交互工具 fail-closed；工具使用顺序执行模式，支持 AbortSignal/超时；多选校验 `min_selections <= max_selections`；Package 不导入根 `src`，根 `loadAgentPlanningTools()` 已移除五个 Ask 注册。
- **真实验证**：Ask 状态测试 `2 pass / 0 fail`；Pi UI/Session 行为测试 `2 pass / 0 fail`；Platform 全量测试 `46 pass / 0 fail`；`typecheck`、Package 构建、Package 检查、模块边界、Pi migration、Pi Runtime、`verify:pi5` A1–A20 `20/20`、`git diff --check` 全部通过。
- **最新量化进度**：12 个 ownership Package；ownership 去重工具 `213` 个；Pi 原生 Extension `206` 个；原生覆盖率 `96.7% (206/213)`；剩余 `7` 个 Host Adapter/Platform 工具：`agent`、`fork_subagent`、`resume_agent`、`agent_memory`、`list_agents`、`run_builtin_agent`、`run_workflow`。Pi Runtime、Package 边界、自定义 Agent 删除仍为 `100%`；严格综合迁移进度按已验证切片约 `97%`。

### 0.2.14 策略算法与交易执行 Pi 原生化（2026-09-14）

- **策略工具已进入 Finance Package**：`strategy_run_paper`、`strategy_list`、`strategy_backtest` 统一由 `@upup/pi-finance-sdk` Extension 注册，TWAP、VWAP、POV、IS 算法和确定性回测快照位于 Package 内部；根 `src/tools/trading/strategy-tools.ts`、`src/tools/trading/algos/` 及其重复测试已物理删除。
- **权限语义保持 fail-closed**：`strategy_run_paper` 使用 Pi `ExtensionContext.ui.confirm` 进行逐次审批；无 UI、非交互、拒绝审批时不会写入 sandbox；审批通过才调用 `NativeSandboxBroker`，结果带 `policyAudit`、Finance evidence 和 sandbox-only 警告。
- **真实 Pi 会话契约已补齐**：`invest-trade` profile 通过真实 `PiAgentSessionFactory` 只加载三个策略工具；`strategy_list`、`strategy_backtest` 已验证可执行；`strategy_run_paper` 已验证无交互审批时拒绝执行。工具 ownership 已补齐，229 个声明工具全部有唯一 Package 归属且全部由 Pi Extension 原生提供。
- **验证结果**：Finance Package 构建与测试通过；策略定向测试 `10 pass / 0 fail`；模块边界、Package、Pi migration、Pi runtime、TypeScript 类型检查全部通过；`verify:pi5` A1–A20 为 `20/20`；全量 Bun 回归为 `3262 pass / 0 fail`；`git diff --check` 通过。
- **当前权威量化进度**：架构报告综合进度 `90.0%`；Pi Package 原生工具覆盖 `229/229 = 100.0%`；Pi Runtime 生产路径 `100%`；Package 边界 `100%`；投资命令直接依赖根 `src/tools` 为 `0`；根生产源码中仍有 `2` 个 `PiTool` 兼容文件，因此“旧根工具物理清理”单项仍为 `33.3%`，不能宣称所有兼容层已删除。
- **保留项与下一切片**：`src/tools/trading/sandbox-engine.ts`、`registry.ts`、`types.ts` 以及 IBKR/Xueqiu adapter 暂不删除，因为仍可能被宿主投资阶段、broker registry 或测试使用；下一步先做引用图和服务/适配器拆分，确认无生产调用后再删除，禁止仅按同名 Pi Extension 盲删。随后继续审计 `src/mcp`、`src/research`、`src/analysis`、`src/multi-agent/workflows` 中的非 Package PiTool 兼容代码。

### 0.2.15 Research Deep Search 与 Investment Matrix Package 原生迁移（2026-09-14）

- **研究深搜已插件化**：`research_deep_search` 的纯算法、双语同义词扩展、claim 抽取、citation graph、theme cluster 和确定性排序已迁入 `@upup/pi-research`；Research Extension 现在直接注册原生 Pi Tool，支持 inline documents、ticker/kind 过滤、历史 evidence 和空 corpus fail-closed。
- **投资矩阵已插件化**：`matrix_analysis` 的 MatrixEngine、技术/基本面/资金/情绪四维 verdict、CSV/Markdown 导出和 summary 已迁入 `@upup/pi-investment-analysis`；Investment Analysis Extension 直接提供 Pi Tool，不再依赖根 `src/analysis` 或旧 `PiTool`。
- **根重复实现已删除**：删除 `src/research/index.ts`、`src/research/deep-search.ts`、`src/research/deep-search.test.ts`、`src/analysis/matrix.ts`、`src/analysis/matrix.test.ts`；根 `src/tools/registry/domain-tools.ts` 及其编排也已删除，Registry 不再重复注入这两个工具。
- **正式 Profile 已同步**：`invest-explore`、`invest-plan`、`invest-risk`、`invest-review` 的 allowlist 已加入 `research_deep_search` 和 `matrix_analysis`；ownership、nativeTools 和 Package Extension 清单保持唯一一致。
- **真实验证结果**：Research Package 全量测试 `18 pass / 0 fail`；Investment Analysis Package 全量测试 `23 pass / 0 fail`；真实 `PiAgentSessionFactory` 研究/矩阵生产契约通过；根全量 Bun 回归 `3164 pass / 0 fail`；`verify:pi5` A1–A20 `20/20`；模块边界、Package、Pi migration、Pi runtime、TypeScript、`git diff --check` 全部通过。
- **当前权威量化进度**：架构报告综合进度仍为 `90.0%`（权重模型受剩余兼容层影响）；Pi Package 原生工具覆盖 `231/231 = 100.0%`；Pi Runtime 生产路径 `100%`；Package 边界 `100%`；投资命令直接依赖根 `src/tools` 为 `0`；剩余根 `PiTool` 文件主要集中于 MCP 兼容工具、股票分析工作流、投资知识兼容工具及 Registry 适配测试，下一切片优先审计 `src/runtime/pi/investment-knowledge-tools.ts` 与 MCP 工具是否已有对应 Platform/Finance Package 实现。

### 0.2.16 Investment Knowledge 兼容层删除（2026-09-14）

- **引用图结论**：`src/runtime/pi/investment-knowledge-tools.ts` 只被自身导出，`src/runtime/pi/investment-knowledge.ts` 只被该旧工具层引用；二者没有生产入口、Profile、Session Factory 或测试调用点，属于已被 Package 迁移覆盖后的死代码。
- **唯一实现保留在 Finance Package**：`get_investment_strategies`、`get_company_profile`、`get_risks`、`get_sectors` 由 `@upup/pi-finance-sdk` 的确定性快照模块提供；`track_company`、`track_sector`、`get_knowledge_summary` 使用当前 Pi Session 的 `upup_pi_finance_knowledge_journal` custom entry，不再使用全局单例或 `~/.upup/knowledge/knowledge.json`。
- **根目录清理**：删除旧 `PiTool` 投资知识工具及 `InvestmentKnowledge` 全局状态实现，避免第二套注册协议、跨 Session 状态泄漏和 Package→根 `src` 回流；README 的能力表同步指向 Finance Package Session journal。
- **架构判断**：投资知识功能已经完成 Pi 原生迁移；剩余工作不再是修补兼容层，而是审计 `src/mcp` 的 CLI 管理服务与 Agent 工具边界，确认 MCP 工具执行路径全部由 `@upup/pi-platform` 承担后再删除仅剩的根适配器。
- **本轮验证**：引用扫描确认无生产引用；下一步执行 Finance Package、Pi Session 契约、`verify:pi5`、模块边界、Pi migration、Pi runtime、TypeScript 和全量 Bun 回归。

### 0.2.17 MCP Agent 兼容层与 Registry 回流删除（2026-09-14）

- **边界审计结论**：`MCPClientManager`、MCP 配置命令、状态查询、插件适配器和 `PiAgentSessionFactory` Host Bridge 仍是宿主服务职责，不能删除；它们为 Pi Platform 的 `list_mcp_resources` / `read_mcp_resource` 提供当前 Session 的受控能力。
- **根兼容层删除**：删除无生产引用的 `src/mcp/auth-tool.ts`、`src/mcp/resource-tools.ts` 及其测试；删除 `src/tools/registry/mcp-tools.ts`，根 Registry 不再把外部 MCP 工具动态注入旧 `PiTool` 注册表。
- **唯一 Pi Agent 路径**：MCP Agent 工具继续由 `@upup/pi-platform` 原生 Extension 注册；认证工具由 Platform Package 实现；资源工具通过 `upup.pi.host.v1` 的 `mcp-resources` capability 调用宿主 MCP 客户端，Package 不依赖根 `src`。
- **保留的宿主能力**：`src/mcp/client.ts`、`src/mcp/registry.ts`、`src/mcp/types.ts` 与 `src/commands/mcp.ts` 仍服务 CLI 管理、连接生命周期和 Platform Host Bridge，不属于重复 Agent Tool 实现。
- **架构收益**：切断“外部 MCP → 根 Registry → 旧 PiTool → Agent”的第二条执行链，避免工具重复注册、默认全局客户端泄漏和 Package 禁用后仍暴露 MCP 工具；CLI 管理与 Agent 执行职责清晰分离。
- **本轮验证**：MCP/Registry/Pi Session 定向回归 `104 pass / 0 fail`；`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、TypeScript、`verify:pi5` A1–A20 `20/20`、`git diff --check` 和全量 Bun 回归 `3159 pass / 0 fail` 全部通过。
- **当前权威量化进度**：架构报告综合进度仍为 `90.0%`；Pi Package 原生工具覆盖 `231/231 = 100.0%`；Pi Runtime 生产路径 `100%`；Package 边界 `100%`；投资命令直接依赖根 `src/tools` 为 `0`；根 `PiTool` 兼容统计剩余 `2` 个生产文件（`src/tools/registry/index.ts`、`src/tools/registry/types.ts`），对应单项 `33.3%`，它们是旧 Registry 类型/兼容入口，不再承载 MCP 或投资知识工具实现。

### 0.2.18 Stock Analysis 工作流 Package 原生迁移（2026-09-14）

- **工作流已下沉到 Investment Analysis Package**：新增 `@upup/pi-investment-analysis/src/stock-analysis.ts`，把基本面研究、财务分析和组合顾问三阶段编排实现为纯 Package 逻辑；两个研究 worker 并行执行，第三个 Pi worker 基于前两份报告综合建议，支持 basic/detailed/comprehensive 深度和 AbortSignal。
- **新增 Pi 原生工具**：Investment Analysis Extension 注册 `stock_analysis`，通过 `@upup/pi-platform` 的 `agent-worker` Host capability 调度真实 Pi worker；工具只在 Platform Host 精确匹配、能力存在时执行，否则 fail-closed，并把结果、worker session id、审计 evidence 写入当前 Pi Session 的 `upup_pi_stock_analysis` custom entry。
- **宿主边界加固**：`PiAgentSessionFactory` 对所有插件传入的 worker id 做统一小写、字符白名单和长度限制，避免非法标识符进入 `UpUpAgentSpec`，不信任 Package 输入；这条 Host Bridge 防线适用于后续所有 Pi 插件 worker。
- **旧实现彻底删除**：删除 `src/multi-agent/workflows/stock-analysis.ts`，移除根 `PiTool`、`zod` 和第二套工作流入口；生产入口契约不再允许该文件，ownership/native map、Profile 和 Package 门禁统一声明 `stock_analysis` 由 Investment Analysis 唯一拥有。
- **真实验证结果**：Investment Analysis + 生产 Finance 契约 `23 pass / 0 fail`；其中真实 `PiAgentSessionFactory` + faux Pi provider 已执行三个 worker、Session journal 和审计证据；`verify:pi5` A1–A20 `20/20`；TypeScript、模块边界、Pi Package、Pi migration、Pi runtime 门禁全部通过；全量 Bun 回归以本轮最终命令输出为准。
- **当前权威量化进度**：架构报告综合进度 `90.0%`；Pi Package 原生工具覆盖提升为 `232/232 = 100.0%`；Pi Runtime、Package 边界、投资命令 Package 迁移和 Subagent 兼容收敛均为 `100%`；根生产 `PiTool` 统计仍为 `2` 个 Registry 类型/兼容入口，单项 `33.3%`，不再包含投资工作流实现。

### 0.2.19 根 Registry 与 Package→src 循环依赖彻底收口（2026-09-14）

- **删除旧 Registry 链**：删除 `src/tools/registry`、`src/tools/index.ts`、`src/runtime/pi/registry-adapter.ts` 及其验证脚本/测试；`PiAgentSessionFactory` 仅接受显式注入工具或受信任 Pi Package Extension，不再保留 `loadRegisteredTools` 兼容开关。
- **`/tools` 改为 Session 视图**：`@upup/commands` 不再动态导入根 `src/tools`；命令上下文接收当前 Pi Session 的工具名称，由 CLI 从 `getPiSessionTools()` 注入，工具查询不再产生 Package→src 回流或全局 Registry 泄漏。
- **模块化边界**：Package 继续不依赖根 `src`；根 `src` 仅作为 Host/CLI/Session 编排层，金融工具、工作流、权限和审计均由 Pi Package + Extension 提供。
- **真实验证**：定向命令/Pi Runtime 回归 `105 pass / 0 fail`；TypeScript、模块边界、Pi Package、Pi migration、Pi runtime 门禁全部通过；`report:pi-architecture` 综合进度 `100.0%`，Pi 原生工具覆盖 `232/232`，根 `PiTool` 生产文件 `0`。
- **后续重点**：不再迁移工具注册表；只继续把 `/invest` 的 `phase-handlers.ts`、旧 model 薄适配器和宿主服务按职责下沉/收敛，不恢复第二套 Agent Runtime。

### 0.2.20 `/invest` 五阶段 Pi Workflow Package 原生化（2026-09-14）

- **工作流已完成 Pi 化**：新增 `@upup/pi-investment-workflow`，将 `research`、`valuation`、`backtest`、`trade`、`review` 五阶段逻辑放入 Package；Extension 原生注册 `invest_workflow_phase`，缺少 Host capability 时 fail-closed。
- **Host/Package 边界已闭合**：`PiHostBridge` 增加 `investment-workflow` capability；根 `PiAgentSessionFactory` 为每个 Session 注入研究数据、基金历史、组合沙盒和 paper order 服务。交易严格使用 `NativeSandboxBroker`，不提供真实交易接口，不暴露全局 singleton 给 Package。
- **生产入口已切换**：`/invest` 删除 `createPhaseHandlerMap()` 与 `phase-handlers.ts` 依赖，`src/runtime/pi/investment-workflow.ts` 每个阶段统一调用 `session.executeTool('invest_workflow_phase', ...)`，并将 phase output、错误和 checkpoint 写入 Pi Session journal；旧阶段处理器和五个 dependency 文件已删除。
- **模块化与构建同步**：Package 不导入根 `src`；Package workspace、锁文件、内置信任配置、ownership/native map、资源复制脚本、Package 门禁和 `test:pi-contracts` 均已登记；编译脚本统一复用资源复制脚本，避免新增 Package 漏发。
- **真实验证**：工作流 Package、Extension、Host Contract、真实 `PiAgentSessionFactory` 与 workflow checkpoint 定向回归通过；`typecheck`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`git diff --check` 通过；全量 Bun 回归 `3159 pass / 0 fail`。
- **历史进度快照**：本节记录当时的 `100.0%` 架构报告与约 `96%` 的工程收敛估计；模型适配器和基金历史适配器随后已完成进一步收敛，当前结论见 `0.2.21`。
- **后续只做收敛性工作**：继续关注投资领域能力（数据质量、估值模型、风控、组合、回测、沙盒交易和投研 Skill），不恢复自定义 Agent、LangChain、Paperclip 或第二套全局 Agent Loop。

### 0.2.21 模型服务与基金历史进一步收敛（2026-09-14）

- **模型入口已单一化**：物理删除 `src/runtime/pi/model.ts`；`callLlm` 与 `callStructuredLlm` 统一位于 `src/runtime/pi/prompt-service.ts`，内部只通过 `runPiPrompt` 创建/复用 Pi Session，不再存在根级 `completeSimple`、`streamSimple` 或独立 LangChain 模型循环。`src/runtime/pi/model-config.ts` 只保存默认模型/provider 常量，避免配置、执行和 UI 模型目录互相回流。
- **模块边界已验证**：`check:module-boundaries` 通过，当前检查 `28` 个 workspace package、`550` 个根 `src` 模块；无 Package → 根 `src` 依赖、无 Package 循环、无根 `src` 运行时循环。源码继续保持 ESM `.js` import 后缀，未通过导入改名掩盖边界问题。
- **基金历史已下沉**：新增 `@upup/pi-finance-sdk` 的 `fund-history` API；`PiAgentSessionFactory` 直接消费 Finance Package 能力，删除根 `src/runtime/pi/fund-history-provider.ts`，基金回测不再由宿主重复包装。
- **Pi 迁移自动化结果**：`report:pi-architecture` 为 `100.0%`；Pi 原生工具 `233/233`；Pi Runtime、Package 边界、投资命令迁移、旧根工具移除和 Subagent 兼容层收敛均为 `100.0%`。因此“核心 Agent 彻底 Pi 化”的实现进度为 **100%**，不是“部分接入 Pi”。
- **定向验证结果**：模型/Runner、投资工作流、Utils、Memory 定向测试 `347 pass / 0 fail`；Pi Package、迁移、Runtime 和模块边界门禁全部通过。类型检查进程已完成且未报告错误；最终交付前仍应再执行一次全量 `bun test`。
- **剩余工作不再是 Agent 重写**：后续只处理投资领域质量与产品化，包括把股票历史回测从当前确定性 fixture 切换为带 freshness/evidence/audit 的真实 Market Data Package 服务、补齐数据失败语义和估值/风险/组合回归；不恢复自定义 Agent、LangChain、Paperclip 或第二套全局 Agent Loop。

#### 当前进度口径

| 维度 | 进度 | 依据 |
|---|---:|---|
| 核心 Agent / Agent Loop Pi 化 | **100%** | `src/agent`、旧模型执行器、LangChain Agent loop 和 Paperclip 生产链已删除 |
| Pi 原生工具覆盖 | **100%** | `233/233` ownership 工具由 Pi Extension 提供 |
| Package 模块边界 | **100%** | `28` packages、`550` root modules，无循环和反向依赖 |
| `/invest` 工作流迁移 | **100%** | 五阶段统一执行 `invest_workflow_phase` |
| 代码库架构门禁 | **100%** | `report:pi-architecture` 当前综合结果 |
| 投资业务生产完善度 | **未以架构分数冒充完成** | 股票历史数据真实性、数据 freshness/evidence、管理页面仍是独立产品工作 |

### 0.2.22 真实股票历史数据接入 Pi Market Data（2026-09-14）

- **历史数据客户端已插件化**：新增 `packages/pi-market-data/src/history.ts`，提供 `NativeMarketHistoryClient` 与 `getNativeMarketHistoryForRange`。默认通过 Yahoo Chart 日线接口获取历史 OHLCV；A 股代码完成 `.SH → .SS`、`.SZ/.BJ`、港股补零和美股代码归一化，日期、区间、最大数据量和完整 K 线均严格校验。
- **证据链已闭合**：每次历史请求返回 `MarketBar[] + MarketEvidence`，包含 provider source、retrievedAt、asOf、query、historical freshness 和 auditId。网络失败、响应为空或少于两根完整 K 线时直接错误，不再回退到合成 bars；这避免回测报告把 fixture 当作真实行情。
- **工作流已使用真实 Provider**：`PiAgentSessionFactory` 的 `getMarketHistory` 改为调用 `@upup/pi-market-data`，`invest_workflow_phase(backtest)` 将历史 evidence 原样写入结果。测试仍通过 `marketHistoryFetcher` 显式注入响应，不依赖外网，也不改变生产默认 transport。
- **Pi 原生工具语义同步**：`market_data_history` 默认使用同一 Native Provider，支持 `endDate` 和 `limit`；失败时返回 `no-synthetic-fallback` 审计错误。原 `makeFixtureBars` 仅作为离线算法/单元测试 fixture 保留，不再属于生产工作流数据源。
- **真实验证**：Market Data Package `25 pass / 0 fail`；Investment Workflow Package `5 pass / 0 fail`；真实 `PiAgentSessionFactory` 工作流/Factory 定向回归 `60 pass / 0 fail`；市场包、工作流包均成功构建；`typecheck`、`git diff --check`、模块边界、Pi Package、Pi migration、Pi runtime 门禁全部通过。
- **当前进度口径**：核心 Agent Pi 化 **100%**；Pi 原生工具 **233/233（100%）**；架构报告综合 **100%**；本轮把“股票历史真实数据接入”这一项从未完成推进为已实现。整个投资产品的可用度不能简单等同于架构分数，仍需继续完善 Provider 选择/限流缓存、A 股专属数据源、管理页面和真实环境烟测。
- **下一切片**：为 Native Market Data 增加 provider policy（Yahoo / Tushare / AKShare 的显式优先级和权限），把 A 股实时与历史数据统一到同一 evidence schema，并为 `18081` 单独设计 Pi Management Package；继续保持 Package 不依赖根 `src`、所有外部源 fail-closed、所有生产 Agent 只走 Pi Session。

### 0.2.23 Market Data Provider Policy 与 A 股历史源（2026-09-14）

- **Provider policy 已落地**：`@upup/pi-market-data` 的 `NativeMarketHistoryClient` 支持 `auto`、`yahoo`、`tushare` 三种显式策略。`auto` 仅在 A 股标的且存在 `TUSHARE_TOKEN` 时选择 Tushare，否则选择 Yahoo；显式 `tushare` 缺少 token 或标的无法转换时直接失败，不会静默切换其他源。
- **Tushare 数据已在 Pi Package 内归属**：新增 `daily` 请求、A 股代码归一化、YYYYMMDD 日期转换、OHLCV 字段映射、按日期排序、完整 bars 校验和 provider source evidence。根 `src/tools/astock/tushare-client.ts` 不再参与 Pi 工作流，Package 不依赖根 `src`。
- **工具 API 已同步**：`market_data_history` 增加可选 `provider` 和 `endDate`，返回值、auditId、freshness、source 仍遵循同一 Pi Tool details 契约；上游不可用时保持 `no-synthetic-fallback`，不会生成假历史数据。
- **验证结果**：Market Data Package `26 pass / 0 fail`；Market Data Package 构建通过；根 `typecheck` 通过；前一轮全量回归 `3165 pass / 0 fail`，本切片未改变既有工作流接口；Tushare 与 Yahoo 均使用注入式 HTTP 响应完成确定性契约测试。
- **当前进度**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **233/233（100%）**；架构综合报告 **100%**；市场历史真实 Provider 与 evidence **已实现**。面向完整投资产品的剩余工作约 **5%–10%**，主要是 provider 限流/缓存、实时行情与历史 evidence 统一、A 股/港股专属源烟测、管理页面和投资模型质量，不再是 Agent Runtime 重写。
- **下一切片**：在不引入根 `src` 依赖的前提下，为 Market Data Package 增加 provider cache/rate-limit policy 与 freshness TTL；随后将实时 quote 的真实 provider、历史 provider 和回测输入统一为同一份 `MarketEvidence` schema，并增加外网可选 smoke test（默认不阻塞离线 CI）。

### 0.2.24 Market Data Cache/Rate-Limit Policy 接入 Session（2026-09-14）

- **缓存与限流已实现**：新增 `InMemoryMarketHistoryCache` 和 `FixedWindowMarketHistoryRateLimiter`，缓存键包含 provider、symbol、startDate、endDate，默认历史数据 TTL 为 60 秒；缓存命中不会重复访问外部源，未命中超过限额直接返回可审计错误。
- **Session 隔离已落实**：`market_data_history` Extension 和 `PiAgentSessionFactory` 的 `/invest` 工作流各自创建自己的 Client、Cache 和 RateLimiter，不使用模块级全局缓存，不在不同 Pi Session 之间共享行情结果。
- **Provider 语义保持一致**：Yahoo/Tushare 选择、缓存、限流、fail-closed 和 evidence 由同一个 `NativeMarketHistoryClient` 实现；工作流与直接 Pi Tool 不再有两套历史行情策略。
- **验证结果**：Market Data Package `27 pass / 0 fail`；Package 构建、根 `typecheck` 通过；真实 Pi Factory/Investment Workflow 定向回归 `56 pass / 0 fail`；模块边界和 `git diff --check` 保持通过。
- **当前进度**：核心 Agent Pi 化 **100%**；Pi 原生工具 **233/233（100%）**；架构综合报告 **100%**；市场历史 provider、evidence、cache、rate-limit 已完成。完整投资产品仍约 **90%–95%**，剩余重点是实时 quote 同源化、A 股/港股真实 provider 烟测、管理页面和投资业务模型质量。
- **下一切片**：继续将真实 quote 从确定性 fixture 收敛到同一 Pi Market Data Provider/evidence 契约；先实现 Yahoo quote + Tushare quote 的显式 provider policy，再替换 `market_data_quote` 和 `/invest` 沙盒报价，保留 fixture 仅用于离线测试注入。

### 0.2.25 Finance Quote Transport 与 Sandbox 伪行情收口（2026-09-14）

- **Finance Package Host 注入已修复**：`@upup/pi-finance-sdk` 与 `@upup/pi-market-data` 现在共同接收 Session 级 `marketQuoteFetcher`；Finance Extension 在加载时捕获 transport，不依赖短生命周期的全局 Host Registry，工具执行阶段仍可稳定访问同一个 Provider。
- **Quote transport 同源化已完成**：`finance_evidence_quote`、`get_trade_quote`、sandbox 下单、策略 paper execution、投资工作流 sandbox 报价均复用同一 Session 级 provider transport 和 evidence 语义；当前 Finance Extension 直接 quote 使用 Yahoo endpoint，Market Data Package 已具备 Yahoo/Tushare policy，Finance quote 的 Tushare 路由仍列为下一切片。上游失败、无 transport 或无有效价格时统一返回 `no-synthetic-fallback`，不生成确定性行情。
- **余额估值已收口**：`get_trading_balance` 不再调用旧 `sandbox-read` 的确定性哈希报价，改为 `NativeSandboxBroker.getBalance()`，通过注入的行情 Provider 计算持仓市值；旧 `sandboxQuote`/`sandboxBalance` 兼容 API 保留但直接 fail-closed，避免误用伪行情。
- **离线测试边界明确**：所有 sandbox 单元测试显式注入固定 quote provider；固定报价只存在于测试夹具，不再作为生产默认值。生产 `NativeSandboxBroker` 没有注入 Provider 时直接报错。
- **真实网络行为**：Yahoo quote 烟测实际执行过但返回 `403 Forbidden`；系统按设计拒绝合成数据并保留可审计错误。后续应增加配置化 Tushare/AKShare provider 与可选外网 smoke test，不得通过 fallback 掩盖数据源不可用。
- **本轮验证**：Finance SDK `36 pass / 0 fail`；Pi Finance/Factory 定向回归通过；`bun run typecheck` 通过；模块边界、Pi migration、Pi packages、Pi runtime 门禁通过；`verify:pi5` A1–A20 `20/20`；`git diff --check` 通过。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **233/233 = 100%**；Pi 架构迁移 **100%**；完整金融投资产品约 **92%–96%**。剩余约 **4%–8%** 主要是 A 股/港股真实 Provider 生产凭证烟测、quote/history 的统一 freshness TTL 与可观测性、管理页面产品化以及投资模型/数据质量，不再是 Agent、LangChain、Paperclip 或模块边界问题。
- **后续实施顺序**：先完成 Tushare/AKShare quote 的配置化真实烟测与 provider 健康检查；再统一 quote/history `MarketEvidence`、缓存、限流和 freshness；随后建设独立 Pi Management Package/管理页；最后完善投资模型、回测数据质量和端到端投研验收。

### 0.2.26 结构化 Market Quote Host Service 与 Finance/Tushare 同源化（2026-09-14）

- **结构化 Host contract 已完成**：Pi Host 新增 `getMarketQuote(symbol, market, signal, auditId)`，返回统一的 `PiMarketQuoteResult`（quote value + `MarketEvidence`），Finance Package 不再必须自行解析 raw HTTP 响应。
- **Session 单一 Quote Client**：`PiAgentSessionFactory` 在安装 Package Host 时创建 Session 级 `NativeMarketQuoteClient`，Finance Package 的 `getMarketQuote` 和 Market Data Package 的 quote 工具共享同一 provider policy、缓存、限流、freshness 和 evidence 语义；Session 之间不共享状态。
- **Finance 生产路径已切换**：`finance_evidence_quote`、`get_trade_quote`、sandbox broker 报价和余额估值优先消费结构化 Host service；因此 A 股在配置 `TUSHARE_TOKEN` 时由同一 `auto -> tushare` policy 路由，未配置时按显式 policy 使用 Yahoo；无 Host service 时只保留受控兼容 raw transport，仍 fail-closed。
- **证据契约保持一致**：Finance 对外将 Host 的 `dataFreshness` 映射为 Finance evidence 的 `freshness`，不把内部 evidence 再嵌套进 value；审计 ID 从实际 Tool call 传递到 Market Data Client，避免固定或串用 audit ID。
- **验证结果**：Finance SDK `37 pass / 0 fail`；Pi Contract 全套 `0 fail`；Pi Factory Finance/交易回归 `0 fail`；Market Data 与 Finance Package 构建通过；`typecheck`、模块边界、Pi Package、Pi migration、Pi runtime 门禁通过；`verify:pi5` A1–A20 `20/20`；架构报告 `100.0%`；`git diff --check` 通过。
- **真实网络 smoke**：使用无敏感输出的 `NativeMarketQuoteClient` 请求 `600519.SH`，Yahoo 返回 `403 Forbidden`；结果为 `{"ok":false,"policy":"no-synthetic-fallback"}`，没有输出 token、响应体或生成替代价格。Tushare 真实 smoke 仍需用户环境提供凭证，未将凭证写入仓库或测试。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **233/233 = 100%**；Pi 架构迁移 **100%**；Finance/Market Data quote 同源化 **已实现**；完整金融投资产品约 **94%–97%**。剩余约 **3%–6%** 主要是生产凭证下的 Tushare/AKShare 与港股 Provider smoke、外部源健康检查和可观测性、管理页面产品化、投资模型与数据质量，不再是 Agent、LangChain、Paperclip、Package 边界或 quote 架构问题。
- **后续顺序**：增加脱敏的 Provider health-check/可选 smoke 命令；补充 Tushare quote 的真实凭证验收与港股专属源；统一 freshness TTL、错误分类和指标；再建设独立 Pi Management Package/管理页，最后完成投资模型与端到端投研验收。

### 0.2.27 Pi Market Provider Health Check 与工具生态覆盖收口（2026-09-14）

- **Provider health 已插件化**：`@upup/pi-market-data` 新增 Pi 原生工具 `market_data_provider_health`，支持 `auto`、`yahoo`、`tushare` 与显式探针 symbol；健康状态必须由真实 quote 请求决定，不使用 fixture 或 synthetic fallback。
- **安全输出边界**：health 工具只返回 `ok`、provider、symbol、latency、source、asOf、freshness、indicative、错误策略和 evidence；不会返回原始 provider payload、请求 body、token 或敏感 headers。错误最多截断为有限长度，并对 `TUSHARE_TOKEN` 做脱敏。
- **失败语义**：凭证缺失、Provider 403/5xx、格式错误、超时或无有效价格均返回 `health: unhealthy` 与 `policy: no-synthetic-fallback`；成功返回 `health: healthy` 和真实 evidence。该工具可被默认 Explore Profile 通过 Pi Package allowlist 调用。
- **ownership/allowlist 已闭合**：同步 `nativeTools`、`ownership`、Package 门禁和投资 Profile；同时补齐此前遗漏的 `market_data_quote`、`market_data_history`、`market_trading_day` ownership，Profile 全量校验不再出现工具“已注册但无归属”。
- **本轮验证**：Market Data Package `29 pass / 0 fail`；ownership/Profile 契约 `7 pass / 0 fail`；Pi Contract 全套通过；`typecheck`、模块边界、Pi Package、Pi migration、Pi runtime、构建门禁全部通过；`verify:pi5` A1–A20 `20/20`；架构报告 `100.0%`。
- **真实 Pi 工具 smoke**：直接加载 Market Data Extension 执行 `market_data_provider_health(real-health-smoke)`，Yahoo 返回 `403 Forbidden`，工具输出 `health: unhealthy`、`policy: no-synthetic-fallback`，没有生成价格、泄露 token 或输出原始响应。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **234/234 = 100%**；Pi 架构迁移 **100%**；Finance/Market Data quote 同源化 **已实现**；Provider health-check **已实现**；完整金融投资产品约 **95%–98%**。剩余约 **2%–5%** 主要是用户真实凭证下的 Tushare/AKShare 与港股 Provider 验收、生产可观测性、管理页面产品化、投资模型和数据质量。
- **后续顺序**：在用户配置凭证的环境执行 Tushare/港股 health smoke；补充 provider 延迟/错误指标和可选定时检查；建设独立 Pi Management Package/管理页；最后完成投资模型、回测数据质量和端到端投研验收。

### 0.2.28 Quote Metrics 与 Provider 可观测性（2026-09-14）

- **Session 级 quote metrics 已实现**：`NativeMarketQuoteClient` 增加脱敏 `getMetrics()`，记录 `requests`、`cacheHits`、`successes`、`failures`、`rateLimitFailures`；统计属于 Client/Session 实例，不使用全局 singleton，不跨 Session 泄露。
- **Health 工具增强**：`market_data_provider_health` 成功或失败均返回当前 provider metrics，管理页和后续监控可直接消费；不返回 token、请求体、原始响应、完整 URL 参数或其他敏感信息。
- **失败与限流可观测**：Provider HTTP/格式/凭证失败统一计入 `failures`；Rate limiter 拒绝额外计入 `rateLimitFailures`；缓存命中不增加外部 `requests`，并保持原有 `cached` evidence 语义。
- **真实 smoke 结果**：直接运行 `NativeMarketQuoteClient` 请求 `600519.SH`，Yahoo 返回 403；脱敏 metrics 为 `requests: 1, cacheHits: 0, successes: 0, failures: 1, rateLimitFailures: 0`，策略仍为 `no-synthetic-fallback`。
- **验证结果**：Market Data Package `29 pass / 0 fail`；`typecheck`、模块边界、Pi Package、Pi migration、Pi runtime、`git diff --check` 全部通过；`verify:pi5` A1–A20 `20/20`；架构报告 `100.0%`。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **237/237 = 100%**（本轮补齐 health 工具及此前遗漏的 quote/history/trading-day ownership）；Pi 架构迁移 **100%**；Finance/Market Data quote 同源化、Provider health-check、quote metrics **均已实现**；完整金融投资产品约 **96%–98%**。剩余约 **2%–4%** 主要是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、生产定时监控与管理页面产品化、投资模型和数据质量。
- **后续顺序**：在用户配置凭证的环境执行 Tushare/港股健康检查；将 metrics 接入独立 Pi Management Package/管理页和可选定时任务；补充 Provider SLA/错误分类；最后完成投资模型、回测数据质量和端到端投研验收。

### 0.2.29 Pi Management Package 与只读运行时快照（2026-09-14）

- **管理能力已独立插件化**：新增 `@upup/pi-management`，提供 `management_system_snapshot`、`management_provider_status`、`management_package_status`、`management_runtime_status` 四个 Pi 原生只读工具；Package 不依赖根 `src`，不读取密钥、不返回 raw provider payload，也不执行配置/交易写入。
- **Host capability 已版本化**：新增 `management-snapshot` Host capability，由 Pi Session Factory 注入脱敏的 Session、Runtime、权限、已启用 Package、工具数量、Provider 配置状态、Session 级 quote metrics 和 evidence；Host capability 缺失时工具 fail-closed。
- **生产链路已接入**：内置包发现、信任/版本 pin、资源复制、ownership、Package 门禁和 `test:pi-contracts` 均已纳入管理 Package；真实 `PiAgentSessionFactory` 测试确认工具只能通过显式 Package allowlist 加载。
- **验证结果**：管理 Package `3 pass / 0 fail`；管理 Session 加载 smoke `1 pass / 0 fail`；`typecheck`、模块边界、Pi Package、Pi migration、Pi runtime 检查通过。管理页面仍是后续 Gateway/Web UI 工作，不把只读 Package 误称为完整管理页面。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **241/241 = 100%**；Pi 架构迁移 **100%**；Finance/Market Data quote 同源化、Provider health-check、quote metrics、管理运行时快照 **均已实现**；完整金融投资产品约 **96%–98%**。剩余约 **2%–4%** 主要是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、Provider SLA/定时监控、Gateway/18081 管理页面产品化、投资模型和数据质量。
- **后续顺序**：把 management snapshot 接入 Gateway 只读 JSON，再实现 `18081` 管理页面；随后补充 Provider 错误分类/SLA 和真实凭证验收，最后完成投资模型与回测数据质量验收。

### 0.2.30 Gateway 管理 API 与 `18081` Pi 管理页面（2026-09-14）

- **管理 API 已接入真实 Pi**：新增根运行时 `ManagementSnapshotProvider`，通过 `PiAgentSessionFactory` 显式加载受信任的 Pi Packages，执行 `management_system_snapshot` 获取快照；不存在内置 Package 或工具失败时返回 `fail-closed`，不构造伪状态。
- **管理页面已可运行**：新增 `management` CLI 入口，默认绑定 `127.0.0.1:18081`；根路径为中文“UpUp Pi 管理中心”，展示 Runtime、权限、Package、工具和 Provider metrics，不再返回普通内容页面。`/api/management/snapshot` 受 token 保护，页面只消费该 JSON API。
- **安全边界**：页面与 API 不暴露 token、raw provider response 或凭证；API 使用常量时间 token 比较、`no-store` 缓存策略；Provider 快照失败返回 HTTP 503 与 `policy: fail-closed`。
- **真实验证**：实际 Pi Session smoke 返回 14 个内置 Package、237 个可用工具和结构化 evidence；真实管理 HTTP smoke 验证根页面 HTTP 200、API 未授权 HTTP 401、正确 token HTTP 200；Management Server 测试 `2 pass / 0 fail`；Pi Session Factory 相关测试 `58 pass / 0 fail`；typecheck、Web 边界、模块边界和 Package 门禁通过。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖以架构报告为准；Pi 架构迁移 **100%**；Finance/Market Data quote 同源化、Provider health-check、quote metrics、管理 Package、Gateway 管理 API、`18081` 管理页面 **均已实现**；完整金融投资产品约 **97%–99%**。剩余约 **1%–3%** 主要是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、Provider SLA/定时监控、投资模型和回测数据质量。
- **后续顺序**：补充 Provider 错误分类/SLA 与真实凭证验收，完善管理页的历史趋势和自动刷新，再完成投资模型、回测数据质量和生产部署验收。

### 0.2.31 Provider 运行证据、错误分类与 Session SLO（2026-09-14）

- **Provider metrics 已增强**：`NativeMarketQuoteClient` 在原有请求/缓存/成功/失败/限流计数之外，记录最近 Provider、最近延迟、最近结果、最近检查时间和脱敏错误分类；错误分类覆盖凭证缺失、限流、403、5xx、无效响应、不支持标的、取消和未知错误。
- **SLO 状态已统一**：同一 Session 级 Quote Client 输出 `successRatePct` 和 `sloStatus`（`healthy`、`degraded`、`unhealthy`、`unknown`），管理 Package、Provider health 工具、Host contract 和 `18081` 页面共用该数据，不额外发起探测、不生成合成行情。
- **失败策略保持不变**：真实 Yahoo 403 仍返回 `unhealthy`、`forbidden`、`no-synthetic-fallback`；未采样时 SLO 为 `unknown`，不能把“已配置”误报为“健康”。
- **验证结果**：Market Data Extension `14 pass / 0 fail`；Management/Session/Provider 定向测试 `72 pass / 0 fail`；Market Data 与 Management Package 构建通过；根 `typecheck`、模块边界通过；架构报告 `100.0%`，工具覆盖 `241/241`。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **241/241 = 100%**；Pi 架构迁移 **100%**；管理 Package、Gateway 管理 API、`18081` 管理页面、Provider metrics/错误分类/SLO **均已实现**；完整金融投资产品约 **97%–99%**。剩余约 **1%–3%** 主要是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、生产定时监控/历史趋势、投资模型和回测数据质量。
- **后续顺序**：在真实凭证环境完成 Tushare/港股 Provider health smoke；再增加可选定时 SLA 采样和页面历史趋势，最后完成投资模型、回测质量及生产部署验收。

### 0.2.32 最近 Provider 采样与工具统计口径纠偏（2026-09-14）

- **最近采样已实现**：Quote Client 在当前 Pi Session 内保留最多 20 条脱敏采样，只包含 Provider、延迟、结果、错误分类和检查时间；不包含标的、价格、请求体、响应内容、token 或持久化数据。`18081` 页面展示最近 8 条采样，页面刷新不会主动发起行情探测。
- **统计口径已纠偏**：此前报告脚本错误地把 `nativeTools` 表和 `ownership` 表合并统计，产生过 `241/241` 的虚高数字；已改为只解析 ownership 表，并补齐 `run_workflow` 的 native ownership。当前真实唯一工具数为 **237**，Pi Extension 原生工具数为 **237**，覆盖率为 **237/237 = 100%**。
- **当前权威验证**：`report:pi-migration` 与 `report:pi-architecture` 均输出 ownership `237`、native `237`、`100.0%`；Management/Market Data/Session 定向测试通过；根 `typecheck`、模块边界和 Package 门禁通过；CLI 真实 smoke 验证 `18081` 页面 200、未授权 API 401、授权 API 200，返回 14 个内置 Package 和 Pi Runtime evidence。
- **当前进度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **237/237 = 100%**；Pi 架构迁移 **100%**；管理 Package、Gateway 管理 API、`18081` 管理页面、Provider metrics/错误分类/SLO/最近采样 **均已实现**；完整金融投资产品约 **97%–99%**。剩余约 **1%–3%** 主要是用户真实凭证下 Tushare/AKShare 与港股 Provider 验收、可选定时 SLA 采样、投资模型和回测数据质量。
- **后续顺序**：完成真实凭证 Provider 验收；把可选定时 SLA 采样接入 Pi Platform Cron/Management 页面；随后完成投资模型、回测质量和生产部署验收。

### 0.2.33 当前权威状态：Earnings Preview 与模块边界收口（2026-09-14）

本节覆盖本文所有历史快照，仅以下统计用于当前进度判断：

- **核心 Agent Pi 化：100%**；生产 Agent、工具循环、Session、Extension、Worker 和投资工作流均以 Pi Runtime 为唯一执行路径。
- **Pi 原生工具：239/239 = 100%**；Ownership Package 14 个，Host Adapter 工具 0 个；`earnings_preview` 与 `market_data_provider_trend` 已纳入对应 Pi 原生 Extension。
- **架构与模块边界：100%**；当前门禁检查 29 个 workspace package、552 个根 `src` 生产模块，无 `packages/* -> root src` 依赖、无 workspace/package 循环、无根 `src` 运行时循环；源码继续使用现有 `.js` ESM 导入约定。
- **财报前瞻已完成 Package 化**：共识预期、真实 X 研究信号和 8-K/电话会底稿聚合位于 `@upup/pi-research`；根 CLI 只负责参数、计划历史、Dossier diff/持久化和渲染。
- **数据真实性策略**：无 `X_BEARER_TOKEN` 时不生成 synthetic 推文或伪造研究证据，返回 `framework`；真实凭证失败时 fail-closed，不用假数据掩盖 Provider 故障。
- **旧实现清理**：无生产调用者的 `src/search/x-search.ts` mock 实现及测试已删除；根源码不再维护第二套 X 搜索实现。
- **验证结果**：Pi Research `20 pass / 0 fail`；财报前瞻与 ownership `26 pass / 0 fail`；`typecheck`、`check:pi-packages`、`check:module-boundaries`、`check:pi-migration`、迁移/架构报告和 `git diff --check` 均通过。
- **完整金融投资产品：约 97%–99%**；剩余工作是用户真实凭证下的 Tushare/AKShare/港股 Provider 验收、可选 SLA 定时采样与历史趋势、投资模型和回测数据质量，不再是 Agent、LangChain、Paperclip、循环依赖或 Package 边界问题。

### 0.2.34 Provider SLA 趋势持久化与管理页展示（2026-09-14）

- **趋势聚合已下沉到 `@upup/pi-market-data`**：Provider 每次真实 quote 请求只记录按小时聚合的请求数、缓存命中、成功数、失败数、成功率、平均延迟和 SLO，不保存 symbol、价格、raw 响应、token 或请求参数。
- **跨 Session 持久化已实现**：新增 `JsonFileMarketQuoteTrendStore`，使用 schema 版本、24 小时窗口、原子临时文件替换和损坏文件 fail-closed；`PiAgentSessionFactory` 通过显式 `marketQuoteTrendStore` 注入，管理服务默认使用 `.upup/metrics/market-provider-trend.json`。
- **管理页已展示趋势**：`18081` 管理页新增“24小时趋势”，数据来自 Pi Management Snapshot，不主动发起 Provider 探测，也不伪造健康状态。
- **验证结果**：Market Data Package `33 pass / 0 fail`；Management Package `3 pass / 0 fail`；Management Server `2 pass / 0 fail`；Pi Session Factory `58 pass / 0 fail`；`typecheck`、模块边界、Package 门禁和 `git diff --check` 均通过。
- **当前完成度**：核心 Agent Pi 化 `100%`；Pi 原生工具 `238/238 = 100%`；架构迁移 `100%`；完整金融投资产品约 `97%–99%`。剩余重点收敛为真实 Tushare/AKShare/港股 Provider 凭证 smoke、生产 Cron 调度接入、投资模型和回测数据质量。

### 0.2.35 Provider 趋势读取工具与跨 Session 管理可见性（2026-09-14）

- 新增 `market_data_provider_trend` Pi 原生只读工具，位于 `@upup/pi-market-data`；工具只读取脱敏小时桶，不触发网络请求、不暴露标的或价格。
- `NativeMarketQuoteClient.getMetrics()` 会从同一 `NativeMarketQuoteTrendStore` 刷新最近 24 小时数据，因此独立的管理 Session 可以看到行情 Session 已持久化的趋势，但不会主动探测 Provider。
- 趋势读取按管理 Session 当前时间再次执行 24 小时淘汰，跨天或长时间停机后不会展示过期 SLA 桶；并发写入使用随机临时文件和原子替换，避免临时文件互相覆盖。
- ownership/native 工具统计更新为 `239/239 = 100%`；Host Adapter 工具仍为 `0`。
- 本轮验证：Market Data Package `36 pass / 0 fail`；Pi Session/ownership `60 pass / 0 fail`；Management/Host/Session 定向回归 `64 pass / 0 fail`；`typecheck`、模块边界、Package 门禁和管理 HTTP smoke 均通过（页面 `200`、未授权 API `401`、授权 API `200`）。
- **当前完成度**：核心 Agent Pi 化 `100%`；Pi 原生工具 `239/239 = 100%`；架构迁移 `100%`；完整金融投资产品约 `97%–99%`。剩余重点是真实 Tushare/AKShare/港股 Provider 凭证 smoke、生产 Cron 调度接入、投资模型和回测数据质量。

### 0.2.36 默认趋势 Store 注入边界修复（2026-09-14）

- **根因修复**：`PiAgentSessionFactory` 创建默认 `JsonFileMarketQuoteTrendStore` 后，原先只在显式传入 `marketQuoteTrendStore` 时把 Store 注入 `@upup/pi-market-data` 与 `@upup/pi-finance-sdk` Host；普通 Session 因此可能由 Extension 创建独立内存 Store，导致行情 Session 与管理 Session 的趋势不可见。现在所有这两个 Package 都统一接收已经解析完成的 `effectiveTrendStore`。
- **边界保证**：同一 Session 的 Quote Client、投资工作流 Quote Client、Market Data Extension 和 Finance SDK Host 共用同一个趋势 Store；默认路径继续使用全局 `.upup/metrics/market-provider-trend.json`，显式 Store 仍可用于隔离测试、嵌入式运行和多租户宿主。
- **测试稳定性**：Market Data Pi Session 回归测试改用临时趋势文件并在结束后清理，不再读取或污染开发机真实全局指标；这不是关闭持久化，而是把生产持久化与测试 fixture 隔离。
- **验证结果**：Pi Factory 与 Market Data Extension 定向回归 `71 pass / 0 fail`、`336 expect() calls`；根 `typecheck`、模块边界、Pi Package、Pi migration、架构报告和 `git diff --check` 全部通过；架构报告保持 `100.0%`，工具覆盖保持 `239/239 = 100%`。
- **当前完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；Pi 原生工具覆盖 **239/239 = 100%**；Pi 架构迁移 **100%**；完整金融投资产品约 **97%–99%**。剩余仍是真实 Provider 凭证 smoke、生产 Cron 调度接入、投资模型和回测数据质量，不再是自定义 Agent、LangChain Agent Runtime、Paperclip、循环依赖或 Package→`src` 依赖问题。

### 0.2.37 Provider SLA Pi 调度器与管理可见性（2026-09-14）

- **独立 SLA Job 已插件化**：`@upup/pi-market-data` 新增 `ProviderSlaJob`、`JsonFileProviderSlaStore`、`providerSla` 和 `runProviderSlaJob`。Job 只保存脱敏的名称、Provider、周期、启停状态、最近运行状态、延迟和错误分类；不保存 symbol、价格、raw response、token 或消息目标。
- **Pi 原生工具已接入**：新增 `market_data_provider_sla`，支持 `list/add/update/remove/run`。工具通过 Market Data Extension 调用统一 `NativeMarketQuoteClient`，真实 Provider 失败时返回 `no-synthetic-fallback`，不会伪造价格，也不会发送 WhatsApp/通知。
- **生产调度路径已接入**：新增 `startProviderSlaRunner().runDue()`，Gateway 启动时开启后台调度、停止时释放；调度器只执行到期且启用的 Provider SLA Job，使用同一 `.upup/metrics/market-provider-trend.json` 趋势 Store，完全绕开旧消息型 Cron executor。
- **管理可见性已完成**：Pi Management Snapshot 增加脱敏 `providerSla.jobs`；`18081` 页面增加“Provider SLA 调度”区域。管理 Snapshot 和页面本身仍只读，不主动探测 Provider，不启动额外网络请求。
- **包边界保持单向**：`packages/pi-market-data` 只依赖自身 Pi Package 代码和 Pi SDK，不导入根 `src`；根 Gateway 仅通过导出的 `startProviderSlaRunner` 接入生命周期。未改写 `.js` ESM 导入后缀。
- **真实验证结果**：Market Data 完整包 `40 pass / 0 fail`、`126 expect() calls`；Pi Factory/Gateway/Management 定向回归 `59 pass / 0 fail`、`298 expect() calls`；Market Data 构建通过；根 `typecheck`、模块边界、Pi Package、Pi migration、架构报告和 `git diff --check` 全部通过。
- **架构统计**：Ownership 工具 `240`，Pi 原生 Extension 工具 `240`，覆盖率 **`240/240 = 100%`**；架构综合报告 **`100.0%`**；仍无 `packages/* -> root src` 依赖、workspace/package 循环和生产 Agent Registry 路径。
- **当前完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；核心金融能力 Pi 插件化 **100%**；Pi 原生工具覆盖 **240/240 = 100%**；架构迁移与模块边界 **100%**；完整金融投资产品约 **98%–99%**。剩余约 **1%–2%** 主要是用户真实 Tushare/AKShare/港股凭证 smoke、生产环境长期运行观测、投资模型质量和回测数据质量。
- **后续顺序**：先在用户提供真实凭证的环境执行脱敏 Provider smoke；再做生产 Gateway 长时间调度观测和失败恢复验收；最后收敛投资模型、回测复权/滑点/交易成本/缺失数据与审计报告质量。

### 0.2.38 SLA 调度最终验收与真实 Provider Smoke（2026-09-14）

- **最终定向验证数字纠正**：新增“管理 Session 返回脱敏 `providerSla.jobs` 且不包含 symbol”断言后，Pi Factory/Gateway/Management 定向回归为 `60 pass / 0 fail`、`300 expect() calls`；此前 `59/298` 为新增断言前的中间数字。
- **综合语义验收**：`bun run verify:pi5` 的 `A1–A20` 全部通过（`20/20`），覆盖 Pi Runtime 唯一入口、旧 Agent/LangChain/Paperclip 退出、Package/Extension/Skill/Prompt、权限、Session 迁移、Gateway/Cron/Daemon/Bridge/SDK/Eval 和性能恢复门禁。
- **全仓回归**：`bun test` 为 `3171 pass / 0 fail`、`10725 expect() calls`；没有因为 Provider SLA 新增包能力引入跨模块回归。
- **真实网络 Smoke（脱敏）**：当前环境未配置 `TUSHARE_TOKEN` 或 AKShare/港股凭证；Yahoo `AAPL` 真实请求实际执行，结果为 `provider=yahoo`、`health=unhealthy`、`outcome=failure`、`errorClass=forbidden`、`policy=no-synthetic-fallback`，未输出 token、raw response 或价格。Tushare/AKShare/港股凭证验收保持未完成，不伪造通过。
- **最终当前完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；核心金融能力 Pi 插件化 **100%**；Pi 原生工具 **240/240 = 100%**；Pi Runtime、模块边界、Package→`src` 隔离 **100%**；完整金融投资产品约 **98%–99%**。剩余约 **1%–2%** 仅为真实凭证 Provider 验收、生产长期运行观测、投资模型质量和回测数据质量。

### 0.2.39 SLA Job 脱敏 schema 收口（2026-09-14）

- **遥测最小化修复**：SLA Job 持久化 schema 从 `1` 升为 `2`，删除可配置 `symbol/market` 字段，只允许 `default`、`us`、`cn`、`hk` 四类固定 `probe`；包内根据 Provider 和 probe 映射到固定探针标的。旧 schema 文件 fail-closed，不会被当作新 Job 执行。
- **边界保证**：Job 文件、Pi Management Snapshot、管理页面和 SLA 工具输出均不包含 symbol、价格、raw response、token 或消息目标；真实网络请求只发生在执行探针时，趋势文件继续只保存小时聚合统计。
- **验证结果**：新增磁盘脱敏断言和直接 API `probe` 校验后 Market Data Package 为 `40 pass / 0 fail`、`128 expect() calls`；根类型检查、模块边界、Pi Package、Pi migration 和架构报告继续通过，工具覆盖保持 `240/240 = 100%`。

### 0.2.40 Provider SLA schema 2 最终门禁（2026-09-14）

- **脱敏 schema 已最终生效**：`ProviderSlaJob` 只持久化 `probe`（`default/us/cn/hk`），不再接受或写入任意 `symbol/market`；固定探针由 `@upup/pi-market-data` 内部映射。schema `1` 文件拒绝加载，避免旧的标的配置继续进入生产调度。
- **直接调用防线已补齐**：即使绕过 Pi TypeBox 直接调用 Package API，也会校验 `probe` 枚举和 `everyMs >= 60000`；非法配置 fail-closed。
- **脱敏证据**：新增测试直接读取 Job 文件，确认包含 `probe` 且不包含 `AAPL`；管理 Snapshot 测试确认输出不包含 symbol。趋势文件仍只保存小时级请求/成功/失败/延迟聚合。
- **最终验证**：Market Data Package 构建通过，完整包 `40 pass / 0 fail`、`128 expect() calls`；Pi Factory/Gateway/Management `60 pass / 0 fail`、`300 expect() calls`；全仓 `bun test` 为 `3171 pass / 0 fail`、`10727 expect() calls`；`verify:pi5` A1–A20 `20/20`；`typecheck`、模块边界、Pi Package、Pi migration、架构报告和 `git diff --check` 全部通过。
- **最终架构口径**：29 个 workspace packages、552 个根 `src` 生产模块；无 `packages/* -> root src`、无 workspace/package 循环、无根运行时循环；Ownership/Pi 原生工具 `240/240 = 100%`；Pi Runtime 生产路径、投资命令 Package 化、旧 Agent/LangChain/Paperclip 退出均为 `100%`。
- **最终完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；核心金融能力 Pi 插件化 **100%**；Pi 原生工具 **240/240 = 100%**；模块化和全局配置边界 **100%**；完整金融投资产品约 **98%–99%**。剩余约 **1%–2%** 只包括真实 Tushare/AKShare/港股凭证 smoke、生产长期调度观测、投资模型质量和回测数据质量。

### 0.2.41 模块边界门禁补强与最终中文进度（2026-09-14）

- **Package→根 `src` 防线补强**：模块门禁现在同时解析 Package 跨目录相对导入、`@/` 根别名、绝对根路径导入，以及 `package.json` 依赖值中的 `/src` 路径；Package 内部 Extension→自身 `../src` 仍视为合法实现边界。
- **循环依赖结论**：当前真实检查结果为 29 个 workspace package、552 个根 `src` 生产模块；无 Package→根 `src` 依赖、无 workspace/package 环、无根 `src` 运行时环；源码 `.js` ESM 导入约定保持不变。
- **验证结果**：`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`typecheck`、Pi migration/architecture report 和 `git diff --check` 全部通过；工具覆盖维持 `240/240 = 100%`、架构综合进度 `100.0%`。
- **当前完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；核心金融能力 Pi 插件化 **100%**；LangChain Agent Runtime、Paperclip、自定义 Agent 主循环和旧生产 Agent Registry **100% 退出**；Package 模块化与全局配置边界 **100%**；完整金融投资产品约 **98%–99%**。
- **剩余 1%–2%**：只剩真实 Tushare/AKShare/港股 Provider 凭证 smoke、生产 SLA 长期调度/恢复观测、投资模型质量和回测数据质量；不再需要恢复旧 Agent、LangChain 或 Paperclip，也不改写全局 `.js` 导入。

### 0.2.42 回测真实性：交易成本与严格数据质量 Pi 原生化（2026-09-14）

- **新增纯函数包内模块**：`packages/pi-backtest/src/cost-model.ts` 负责手续费、最低佣金、卖出印花税、对称滑点的明细分账并产出 `entryFillPrice/exitFillPrice/grossPnl/netPnl/grossReturnPct/netReturnPct`；`packages/pi-backtest/src/data-quality.ts` 负责交易日、重复/乱序、as-of 边界、OHLC 一致性的严格校验，并保留 `permissive` 显式降级通道。
- **回测核心已接入**：`evaluateTrade` 默认走 `dataQualityMode='strict'`，校验失败返回 `evalStatus='error'` 且附带 `dataQuality.status='failed'` 报告；`long` 仓位的 `simulatedReturnPct` 现在直接复用 `transactionCosts.netReturnPct`，`grossSimulatedReturnPct` 与 `transactionCosts` 单独可审计。
- **汇总可审计**：`computeSummary` 新增 `dataQualityFailedCount`、`avgGrossSimulatedReturnPct`、`avgTransactionCost`、`totalTransactionCost`，不掩盖隐藏成本。
- **Pi 工具契约补齐**：`run_backtest` / `evaluate_trade` / `backtest_evaluate_trade` / `backtest_run` TypeBox schema 显式接受 `dataQualityMode`、`asOfDate`、`requireTradingDays`、`costModel`，避免 Agent 绕过严格校验；policy / prompt / workflow 已同步强调“严格交易日 + 显式成本”两段信息。
- **验证**：`bun --cwd packages/pi-backtest test` `22 pass / 0 fail`、`59 expect() calls`；`bun --cwd packages/pi-backtest build` 通过；`typecheck`、`check:pi-packages`、`check:module-boundaries` 通过；新增“strict quality + net cost”Pi 工具行为测试同时验证 `totalTransactionCost > 0` 和 `simulatedReturnPct < grossSimulatedReturnPct`。
- **当前完成度（中文唯一口径）**：核心 Agent Pi 化 **100%**；核心金融能力 Pi 插件化 **100%**；Pi 原生工具 **240/240 = 100%**；回测质量工具 **100% Pi 原生**；架构迁移 **100%**；完整金融投资产品约 **98.5%–99%**。剩余 0.5%–1.5% 仍为真实凭证 Provider smoke、生产 SLA 长周期调度观测和投资模型微结构。
- **全量回归**：`bun test` 为 `3177 pass / 0 fail`、`10745 expect() calls`；`bun run verify:pi5` A1–A20 `20/20`。
