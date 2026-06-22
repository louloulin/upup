## Why

DeepSeek-GUI（`app/`）当前以 `kun` 作为唯一运行时（HTTP/SSE），整体仍是一个"通用代码/写作助手"工作台。但仓库根的 UpUp（涨涨）已经具备中文投研核心能力：

- 240+ 投资工具（A 股/港股/美股/估值/筛选/风控/研报/回测等），覆盖 50 个 `SKILL.md`
- 5 阶段投资工作流（`/invest`）
- A 股数据栈（Tushare/AKShare）
- 18 个 workspace package，含 `@upup/agent-core` 引擎 + `@upup/sdk`

**问题**：投研能力被困在 pi-tui CLI 中，无法被现有桌面应用复用。DeepSeek-GUI 的 Electron UI（已具备多会话、文件审批、写作、IM 接入、SDD 计划面板、移动端 Webhook 完整工作台）很强，但缺少一个真正"懂 A 股"的核心引擎。

**目标（最小改造 + 最大价值）**：
1. 把 `app/` 的核心引擎从 `kun` 替换为 `@upup/agent-core`（in-process 嵌入 + HTTP/SSE 桥接），保留 `app/src/shared/kun-endpoints.ts` 端点契约 → 渲染层零改动
2. 在现有渲染层之上，新增"投资助手工作台"UI（行情、持仓、自选、风险、研报、5 阶段工作流）→ 复用 UpUp 的 50 个 SKILL
3. 用 `app/src/renderer` 已有 React/i18n/状态管理能力承接 UpUp 的中文投研数据，全部使用中文
4. 不复制 UpUp 代码（不 fork），通过 workspace 依赖 + `link:../packages/sdk` 让 app 复用 UpUp 的资产

## What Changes

### 引擎替换（核心）

- **新增** `app/src/main/upup/adapter.ts`：`upupRuntimeAdapter`，与 `kunRuntimeAdapter` 同接口（`id/resolveExecutable/ensureRunning/stopAndWait/isChildRunning/getBaseUrl/reclaimPort`）
- **新增** `app/src/main/upup/host.ts`：在 Electron 主进程内启动 `@upup/agent-core` 的 HTTP/SSE 桥接服务（端口可配），复用 `KUN_*_PATH` 模板
- **新增** `app/src/main/upup/event-bridge.ts`：把 `@upup/agent-core` 的 `AgentEvent` 流（`tool_start/tool_end/thinking/done/...`）桥接到 Kun 兼容的 SSE 事件格式
- **新增** `app/src/main/upup/settings-bridge.ts`：把 `AppSettingsV1` 中 `kun.*` 段映射为 UpUp 的 provider/model/Tushare/ExaSearch/DeepSeek key 配置
- **修改** `app/src/main/index.ts`：根据 `DEEPSEEK_GUI_ENGINE=upup` 或 settings 默认引擎选择器，把 `kunRuntimeAdapter` 替换为 `upupRuntimeAdapter`
- **修改** `app/src/main/kun-process.ts` → `app/src/main/engine-process.ts`：抽出引擎生命周期通用层，让 `kun-process` 和 `upup-host` 共用
- **修改** `app/src/shared/kun-endpoints.ts` → `app/src/shared/engine-endpoints.ts`：路径常量保持兼容（`KUN_*_PATH` 仍然 export，避免渲染层/IPC 改动）
- **修改** `app/src/main/runtime-sse-ipc.ts`：保持 SSE 协议不变，URL 由 adapter 提供
- **保持不变**：`app/src/main/ipc/*`、`app/src/preload/*`、`app/src/renderer/**` 全部不变

### 投资工作台（UI 增值）

- **新增** `app/src/renderer/src/investment/` 目录
  - `InvestmentLayout.tsx`：基于 `AppShell` 的"投资工作台"布局，右侧侧栏可折叠
  - `panels/MarketTicker.tsx`：上证/深证/创业板/恒生/纳斯达克指数 + 自选股实时报价（红涨绿跌、中文标签）
  - `panels/PortfolioSummary.tsx`：组合摘要（总资产、当日盈亏、持仓权重 Top 5）
  - `panels/WatchlistPanel.tsx`：自选股增删改查，编辑后立即拉取报价
  - `panels/RiskDashboard.tsx`：行业暴露、个股最大回撤、贝塔
  - `panels/ResearchPanel.tsx`：研报速读列表（来自 UpUp 的 filings 工具）
  - `panels/SkillLauncher.tsx`：50 个 SKILL 的中文分组快捷启动（dcf/earnings-preview/morning-brief/...）
  - `panels/WorkflowTracker.tsx`：5 阶段 `/invest` 工作流进度（dossier → strategy → earnings-preview → morning-brief → portfolio-review）
- **新增** `app/src/renderer/src/investment/hooks/`：封装对 UpUp 工具的 fetch 调用（`useQuotes`、`usePortfolio`、`useWatchlist`、`useRisk`）
- **修改** `app/src/renderer/src/AppShell.tsx`：在顶部 Tab 栏加入"投资"入口（中文"投资工作台"）
- **新增** `app/src/renderer/src/locales/zh-CN/investment.json`（中文文案）；`en` 同步
- **修改** `app/src/renderer/src/i18n.ts`：注册新 namespace

### 文档（中文）

- **新增** `app/docs/upup-engine-integration.md`（中文）：集成方式、运行时切换、调试方法
- **新增** `app/docs/investment-workbench.md`（中文）：投资工作台使用指南
- **修改** `app/README.md` 和 `app/README.en.md`：增加"投资工作台"章节（中英双语）

## Capabilities

### New Capabilities
- `upup-core-engine-adapter`：把 `@upup/agent-core` 嵌入 Electron 主进程，对外提供与 Kun 兼容的 HTTP/SSE API
- `engine-http-bridge`：通用 HTTP/SSE 桥接层，把 UpUp 的 `AgentEvent` 转译为 Kun 事件流
- `investment-workbench-ui`：基于 UpUp 数据栈的投资工作台 UI（行情/持仓/自选/风险/研报/工作流）
- `investment-skills-integration`：把 UpUp 50 个 SKILL.md 注册为投资工作台的可视化快捷入口

### Modified Capabilities
无（保留所有现有 spec，端点常量加 alias 兼容旧名）。

## Impact

**新增模块**：
- `app/src/main/upup/`（adapter、host、event-bridge、settings-bridge、index），约 5 个文件 / ~600 行
- `app/src/renderer/src/investment/`（layout + 6 panels + 4 hooks），约 12 个文件 / ~1200 行
- `app/docs/upup-engine-integration.md`、`app/docs/investment-workbench.md`

**修改模块**：
- `app/src/main/index.ts`：引擎选择分支（~30 行）
- `app/src/shared/kun-endpoints.ts`：保持路径常量，添加 `ENGINE_*_PATH` 别名
- `app/src/main/runtime-sse-ipc.ts`：URL 通过 adapter 注入
- `app/src/renderer/src/AppShell.tsx`：增加 Tab 入口
- `app/src/renderer/src/i18n.ts`：注册新 namespace
- `app/package.json`：把 `@upup/agent-core`、`@upup/sdk`、`@upup/skills` 加入 dependencies（workspace link）

**保留不变**：
- 所有 IPC、preload、renderer 现有功能、Code/Write/SDD/IM/手机连接
- `app/src/main/kun-process.ts`、`app/src/main/runtime/kun-adapter.ts`：保留作为 fallback（通过 settings 切换）

**风险**：
- **中**：`@upup/agent-core` 当前导出与 Kun HTTP 契约不完全一致 → 桥接层需做事件/工具 schema 适配
- **低**：workspace 依赖在 Electron 构建中需要正确 external → 沿用现有 `electron-vite` 配置
- **低**：UpUp 工具依赖 Tushare/AKShare 等额外环境变量 → settings 桥接层处理
