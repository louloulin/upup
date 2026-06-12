## 为什么（Why）

### 背景

Loucode（`/Users/louloulin/Documents/linchong/claw/loucode`）是一个基于 Anthropic Claude Code 还原的 AI 编程助手，拥有完整的 Ink/React TUI 界面（~117 个组件文件）、丰富的 CLI 命令系统（~50+ 命令）、多通道支持（CLI/SSH/Remote/Assistant/Bridge）和成熟的工具系统（~100+ 工具）。

UpUp（涨涨）是一个从 dexter fork 的中文深度投研 AI Agent，拥有 50 个投资分析 SKILL.md、240+ 工具、5 阶段投资工作流、A 股数据栈、4 runtime 插件系统、EN+zh-CN i18n 等投研核心能力。

**当前问题**：UpUp 的核心引擎（Agent Loop、工具系统、技能系统、投资工作流）非常强大，但它绑定在 pi-tui 的 CLI 渲染层上。Loucode 的 Ink/React TUI 界面更成熟、更美观、更可扩展，但它的核心引擎是 Claude Code 的通用编程 Agent，不具备投研能力。

**目标**：将 Loucode 的 Ink/React TUI 界面层保留，把核心引擎（QueryEngine → query → tools）替换为 UpUp 的投研引擎，构建一个"投资助手工作台"。

### 核心洞察：最小改造路径

经过全面分析两套代码库的架构，发现：

```
Loucode 架构层次:
┌──────────────────────────────────────────┐
│  main.tsx (Ink/React TUI 入口)           │
│  ├─ FullscreenLayout.tsx (主布局)        │
│  ├─ Messages.tsx (消息列表)              │
│  ├─ TextInput.tsx (输入框)               │
│  ├─ StatusLine.tsx (状态栏)              │
│  └─ 117 个 UI 组件                       │
├──────────────────────────────────────────┤
│  QueryEngine.ts (核心引擎编排)           │  ← 替换点
│  ├─ query.ts (Agent Loop)                │  ← 替换点
│  ├─ tools.ts (工具注册)                  │  ← 替换点
│  └─ commands.ts (命令系统)               │  ← 部分替换
├──────────────────────────────────────────┤
│  services/ (API/认证/MCP/遥测等)         │  ← 保留
│  utils/ (文件系统/git/权限等)            │  ← 保留
└──────────────────────────────────────────┘

UpUp 架构层次:
┌──────────────────────────────────────────┐
│  src/cli.ts (pi-tui CLI 入口)            │
│  src/components/ (pi-tui 组件)           │
├──────────────────────────────────────────┤
│  src/agent/agent.ts (Agent Loop)         │  ← 核心引擎
│  src/tools/ (240+ 工具)                  │  ← 核心引擎
│  src/skills/ (50 SKILL.md)               │  ← 核心引擎
│  src/commands/investment/ (投资工作流)   │  ← 核心引擎
└──────────────────────────────────────────┘
```

**关键发现**：Loucode 的 `QueryEngine.ts` 和 UpUp 的 `agent.ts` 都是 Agent Loop 编排器，接口相似：
- 都接受 `query: string` 输入
- 都产生 `tool_start / tool_end / thinking / done` 事件流
- 都管理消息历史和上下文

**最小改造方案**：在 Loucode 中创建一个 `UpUpEngine` 适配器，实现与 `QueryEngine` 相同的接口，内部委托给 UpUp 的 Agent。这样 Loucode 的 UI 层完全不变，只替换引擎层。

### 范围

**本次 change 要做**：
1. 在 Loucode 中创建 `src/upup/` 目录，包含引擎适配器
2. 实现 `UpUpEngine` 类，接口兼容 `QueryEngine`
3. 适配 UpUp 的 Agent 事件流到 Loucode 的 Message 类型
4. 保留 Loucode 的 UI 层、认证、MCP、文件系统等基础设施
5. 集成 UpUp 的投资技能系统到 Loucode 的命令系统

**本次 change 不做**：
- 不修改 Loucode 的 UI 组件（Ink/React 层保持不变）
- 不修改 UpUp 的核心 Agent 逻辑
- 不处理 Loucode 的 SSH/Remote/Assistant 等高级通道
- 不迁移 Loucode 的 100+ 工具到 UpUp（UpUp 已有 240+ 工具）
- 不修改两边的构建系统

## 改什么（What Changes）

### A. 创建 UpUp 引擎适配器

- **A.1** 在 Loucode 中创建 `src/upup/UpUpEngine.ts` — 核心适配器
  - 实现与 `QueryEngine` 兼容的接口
  - 内部调用 UpUp 的 `Agent.create()` + `agent.run()`
  - 将 UpUp 的 `AgentEvent` 转换为 Loucode 的 `StreamEvent`
  
- **A.2** 创建 `src/upup/event-adapter.ts` — 事件类型转换
  - `tool_start` → Loucode 的 ToolUse 消息格式
  - `tool_end` → Loucode 的 ToolResult 消息格式
  - `thinking` → Loucode 的 Thinking 消息格式
  - `done` → Loucode 的 Assistant 消息格式

- **A.3** 创建 `src/upup/tool-bridge.ts` — 工具注册桥接
  - 将 UpUp 的工具注册表映射为 Loucode 的 Tool 类型
  - 处理工具输入/输出的 JSON Schema 转换

- **A.4** 创建 `src/upup/skill-commands.ts` — 技能命令映射
  - 将 UpUp 的 50 个投资 SKILL.md 注册为 Loucode 的 slash 命令
  - 如 `/dcf` → 调用 DCF 估值技能

### B. 修改 Loucode 入口

- **B.1** 修改 `src/main.tsx` — 添加引擎选择逻辑
  - 通过环境变量 `UPUP_MODE=1` 或 CLI flag `--upup` 切换引擎
  - 默认仍使用原有 Claude Code 引擎（向后兼容）

- **B.2** 修改 `src/dev-entry.ts` — 添加 `--upup` CLI 参数

### C. 创建投资工作台布局

- **C.1** 创建 `src/upup/InvestmentLayout.tsx` — 投资专用布局
  - 基于 Loucode 的 `FullscreenLayout` 扩展
  - 添加投资专用面板：持仓概览、市场行情、风险仪表盘

- **C.2** 创建 `src/upup/components/` — 投资专用 UI 组件
  - `MarketTicker.tsx` — 实时行情条
  - `PortfolioSummary.tsx` — 持仓摘要
  - `InvestmentStatusLine.tsx` — 投资状态栏

### D. 配置与依赖

- **D.1** 在 Loucode 的 `package.json` 中添加 UpUp 依赖
  - 通过 workspace 引用或 npm link
- **D.2** 创建 `src/upup/config.ts` — UpUp 配置管理
  - API keys、数据源配置、模型选择

## 影响范围（Impact）

- **Loucode 修改**：新增 `src/upup/` 目录（~10 个文件），修改 `src/main.tsx`、`src/dev-entry.ts`（各 ~20 行）
- **UpUp 修改**：无需修改（作为依赖被引用）
- **风险**：低。通过 feature flag 隔离，默认行为不变
