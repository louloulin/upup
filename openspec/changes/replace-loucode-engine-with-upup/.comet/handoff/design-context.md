# Comet Design Handoff

- Change: replace-loucode-engine-with-upup
- Phase: design
- Mode: compact
- Context hash: 5e5c289d2e58ed9a38922c285bbab467c0d3ad6de29cd491e68dc2e24e3f1436

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/replace-loucode-engine-with-upup/proposal.md

- Source: openspec/changes/replace-loucode-engine-with-upup/proposal.md
- Lines: 1-124
- SHA256: f89620f64c6089649e6d9e145f5185d142cc0a573b9f084a4062d89b9331a033

[TRUNCATED]

```md
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
```

Full source: openspec/changes/replace-loucode-engine-with-upup/proposal.md

## openspec/changes/replace-loucode-engine-with-upup/design.md

- Source: openspec/changes/replace-loucode-engine-with-upup/design.md
- Lines: 1-281
- SHA256: e5a7eccffc66600c279fa1d3cf04f0a41d167b9b3adda0b03c2305d81aca7d32

[TRUNCATED]

```md
## 架构决策

### 决策 1：适配器模式 vs Fork 模式

**选择：适配器模式（Adapter Pattern）**

```
┌──────────────────────────────────────────────────────┐
│                  Loucode UI 层 (不变)                 │
│  main.tsx → FullscreenLayout → Messages → TextInput  │
│                   StatusLine → Stats                 │
├──────────────────────────────────────────────────────┤
│              引擎接口 (Engine Interface)              │
│  runQuery(query, config) → AsyncGenerator<Event>     │
├────────────────────────┬─────────────────────────────┤
│   ClaudeCodeEngine     │      UpUpEngine (新增)      │
│   (QueryEngine.ts)     │   src/upup/UpUpEngine.ts    │
│                        │                             │
│   query.ts             │   ┌─────────────────────┐   │
│   tools.ts             │   │  UpUp Agent (外部)   │   │
│   commands.ts          │   │  agent.ts            │   │
│                        │   │  tools/ (240+)       │   │
│                        │   │  skills/ (50)        │   │
│                        │   │  commands/investment/ │   │
│                        │   └─────────────────────┘   │
└────────────────────────┴─────────────────────────────┘
```

**理由**：
- Loucode 的 UI 层（Ink/React）和基础设施层（认证、MCP、文件系统）完全保留
- 只在引擎接口处插入适配器，改动最小
- 通过 feature flag 切换，零风险
- 两种引擎可以共存，方便对比和回退

**替代方案（Fork 模式）**：将 UpUp 的代码直接复制到 Loucode 中
- ❌ 代码重复，维护困难
- ❌ UpUp 更新时需手动同步
- ❌ 改动范围大，风险高

### 决策 2：引擎接口设计

**选择：统一为 `IQueryEngine` 接口**

```typescript
// src/upup/types.ts
interface IQueryEngine {
  runQuery(params: QueryParams): AsyncGenerator<EngineEvent>;
  abort(): void;
  getHistory(): Message[];
  getUsage(): TokenUsage;
}

interface QueryParams {
  query: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  signal?: AbortSignal;
  attachments?: Attachment[];
}

type EngineEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; id: string }
  | { type: 'tool_progress'; id: string; message: string }
  | { type: 'tool_end'; id: string; result: string; duration: number }
  | { type: 'tool_error'; id: string; error: string }
  | { type: 'tool_approval'; id: string; tool: string; args: Record<string, unknown> }
  | { type: 'done'; answer: string; usage: TokenUsage }
  | { type: 'error'; message: string }
```

**理由**：
- 与 Loucode 现有的 `StreamEvent` 类型兼容
- 与 UpUp 的 `AgentEvent` 类型兼容
- 事件驱动，支持流式渲染
- 类型安全，编译期检查

### 决策 3：事件适配器

```

Full source: openspec/changes/replace-loucode-engine-with-upup/design.md

## openspec/changes/replace-loucode-engine-with-upup/tasks.md

- Source: openspec/changes/replace-loucode-engine-with-upup/tasks.md
- Lines: 1-112
- SHA256: a33c330892caf4d8ba604ecef4d9801984856533f01135dd8826d215396f456c

[TRUNCATED]

```md
## 阶段 1：基础设施搭建（引擎适配器核心）

- [ ] **1.1** 创建 `src/upup/` 目录结构
  - 在 Loucode 项目根目录创建 `src/upup/` 目录
  - 创建 `types.ts`、`config.ts`、`index.ts` 入口文件

- [ ] **1.2** 实现 `src/upup/types.ts` — 类型定义
  - 定义 `IQueryEngine` 接口
  - 定义 `EngineEvent` 联合类型
  - 定义 `QueryParams`、`EngineConfig` 类型

- [ ] **1.3** 实现 `src/upup/config.ts` — 配置管理
  - UpUp API keys 读取（兼容 Loucode 的 `.env`）
  - 模型选择配置
  - 数据源配置（Tushare/AKShare）

- [ ] **1.4** 实现 `src/upup/event-adapter.ts` — 事件适配器
  - `adaptUpUpEvent()` 函数：UpUp AgentEvent → EngineEvent
  - 处理所有事件类型：tool_start/end/error、thinking、done、approval
  - 单元测试

- [ ] **1.5** 实现 `src/upup/UpUpEngine.ts` — 核心引擎适配器
  - 实现 `IQueryEngine` 接口
  - `runQuery()` 方法：创建 UpUp Agent，运行查询，yield 事件
  - `abort()` 方法：取消正在运行的查询
  - `getHistory()` / `getUsage()` 方法

## 阶段 2：工具与技能集成

- [ ] **2.1** 实现 `src/upup/tool-bridge.ts` — 工具注册桥接
  - `bridgeUpUpTools()` 函数：将 UpUp 工具转换为 Loucode Tool 格式
  - JSON Schema 格式转换
  - 工具执行结果格式适配

- [ ] **2.2** 实现 `src/upup/skill-commands.ts` — 技能命令映射
  - `registerUpUpSkillCommands()` 函数：SKILL.md → Loucode Command
  - 自动发现 UpUp 的 50 个技能
  - 命令执行委托给 UpUp Agent

- [ ] **2.3** 实现 `src/upup/investment-prompts.ts` — 投资专用提示词
  - 中文投研系统提示词
  - 投资工作流提示词（5 阶段）
  - 风险提示和安全边界

## 阶段 3：UI 集成

- [ ] **3.1** 修改 `src/main.tsx` — 引擎选择逻辑
  - 添加 `--upup` CLI flag 解析
  - 添加 `UPUP_MODE` 环境变量检测
  - 条件创建 `UpUpEngine` 或原有 `QueryEngine`

- [ ] **3.2** 修改 `src/dev-entry.ts` — CLI 参数
  - 添加 `--upup` option 到 Commander

- [ ] **3.3** 创建 `src/upup/InvestmentLayout.tsx` — 投资工作台布局
  - 基于 `FullscreenLayout` 扩展
  - 右侧投资面板（可折叠）
  - 响应式布局适配

- [ ] **3.4** 创建 `src/upup/components/MarketTicker.tsx` — 行情条
  - 显示上证/深证/创业板指数
  - 自选股实时价格
  - 颜色编码（红涨绿跌）

- [ ] **3.5** 创建 `src/upup/components/PortfolioSummary.tsx` — 持仓摘要
  - 持仓列表 + 涨跌幅
  - 总资产/当日盈亏
  - 数据来自 UpUp 的 portfolio 工具

- [ ] **3.6** 创建 `src/upup/components/InvestmentStatusLine.tsx` — 状态栏
  - 当前模型/数据源
  - 投资工作流阶段
  - 快捷键提示

## 阶段 4：测试与验证

- [ ] **4.1** 编写 `src/upup/__tests__/event-adapter.test.ts`
  - 覆盖所有事件类型转换
  - 边界情况：空结果、错误、超时

```

Full source: openspec/changes/replace-loucode-engine-with-upup/tasks.md

