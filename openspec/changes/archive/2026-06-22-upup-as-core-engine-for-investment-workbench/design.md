## Context

DeepSeek-GUI 当前的运行时是 `app/kun/`（Kun HTTP/SSE 服务），由 `app/src/main/kun-process.ts` 作为子进程启动，`app/src/main/runtime/kun-adapter.ts` 负责生命周期与 baseUrl 管理，`app/src/shared/kun-endpoints.ts` 集中声明所有 HTTP 路径契约。渲染层（`app/src/renderer/`）通过 IPC + SSE 与 Kun 通信，已经具备多会话、文件审批、写作、IM 接入、SDD 计划面板、移动端 Webhook 等完整工作台能力。但 Kun 本身是"通用 Claude Code 风格"运行时，不具备投研能力。

UpUp 仓库根的 `@upup/agent-core`（`packages/agent-core`）已经是一个成熟的 in-process Agent Loop，配 240+ 工具 + 50 个 SKILL.md + 5 阶段 `/invest` 工作流，并已发布为 workspace package `@upup/agent-core`、`@upup/sdk`、`@upup/skills`。

**约束**：
- 不复制 UpUp 代码（不 fork），通过 workspace 依赖复用
- 不破坏现有渲染层/IPC/移动端/IM/SSE 协议 → 端点路径常量保持兼容
- "最佳最小方式"：仅新增 5 个主进程文件 + 12 个渲染层文件 + 2 份中文文档
- 全部使用中文文案

## Goals / Non-Goals

**Goals：**
1. 用 `@upup/agent-core` 替换 `app/kun` 作为 DeepSeek-GUI 的核心引擎
2. 保留 Kun 的 HTTP/SSE 端点契约，渲染层与 IPC 零改动
3. 新增"投资工作台"Tab（行情 / 持仓 / 自选 / 风险 / 研报 / 技能启动器 / 工作流追踪）
4. 通过 `link:../../packages/sdk` 等 workspace 依赖复用 UpUp 资产
5. 全部中文文档 + 中文 UI 文案

**Non-Goals：**
- 不重写渲染层 React 组件、不改 i18n 框架
- 不修改 UpUp 核心代码（只做依赖消费方）
- 不迁移 Kun 的旧 240 个工具（UpUp 已有 240+ 工具集）
- 不做"自动切换引擎"——仅按 settings 显式选择，避免运行时二选一混乱
- 不引入 Tauri / 重写 Electron（保留 Electron-vite）

## Decisions

### 决策 1：in-process 桥接 vs 独立子进程
**选择 in-process。** 在 Electron 主进程内启动 `@upup/agent-core` 的 HTTP/SSE 桥接服务（Node `http.createServer`），端口可配（默认 5300），不再像 Kun 那样 fork 子进程。

**理由**：
- 启动更快（无 IPC 启动开销、无 stdout 解析）
- 错误栈可追踪，调试方便
- workspace 依赖 in-process 加载天然支持 TypeScript 源码
- Electron 主进程本就 Node 环境，无兼容问题

**替代方案**：`child_process.fork` 独立子进程。❌ 增加 IPC 复杂度、与 workspace 依赖不友好、与"Kun 风格"无差异。

### 决策 2：保留 KUN 端点常量 + 引入 ENGINE 别名
**选择**：`app/src/shared/kun-endpoints.ts` 不删，所有 `KUN_*_PATH` 继续 export；同时新增 `ENGINE_*_PATH` 别名指向同一字符串。新代码使用 `ENGINE_*_PATH`；旧 IPC/渲染继续用 `KUN_*_PATH`，互不干扰。

**理由**：
- 渲染层零改动（IPC 仍调用 `KUN_*_PATH`）
- 后续可统一迁移到 `ENGINE_*_PATH`，但本 change 范围内不强制

### 决策 3：HTTP 桥接实现 = 直接组装路由表
**选择**：在 `app/src/main/upup/host.ts` 中显式注册路由（参考 `app/kun/src/server/router.ts`），把每个 Kun 端点翻译为对 `@upup/agent-core` SDK 函数的调用。

```ts
// host.ts (示意)
const routes: Route[] = [
  { method: 'GET',  path: KUN_HEALTH_PATH,         handler: health },
  { method: 'GET',  path: KUN_RUNTIME_INFO_PATH,    handler: runtimeInfo },
  { method: 'GET',  path: KUN_RUNTIME_TOOLS_PATH,   handler: listTools },
  { method: 'GET',  path: KUN_SKILLS_PATH,          handler: listSkills },
  { method: 'GET',  path: KUN_THREADS_PATH,         handler: listThreads },
  { method: 'POST', path: KUN_THREADS_PATH,         handler: createThread },
  { method: 'GET',  path: KUN_THREAD_TURNS_TEMPLATE,handler: listTurns },
  { method: 'POST', path: KUN_THREAD_TURNS_TEMPLATE,handler: startTurn }, // SSE 流
  { method: 'POST', path: KUN_THREAD_REVIEW_TEMPLATE,handler: reviewThread },
  { method: 'POST', path: KUN_THREAD_COMPACT_TEMPLATE,handler: compactThread },
];
```

**理由**：
- 显式路由表 + 复用现有 `http-server.ts` 风格 → 风险最低
- SSE 端点用 `EventBus` 模式（参考 `app/kun/src/server/sse.ts`）
- 单文件 < 400 行，易于审查

### 决策 4：事件流转译集中在一个文件
**选择**：`app/src/main/upup/event-bridge.ts` 内做 `AgentEvent` → Kun SSE 事件的全部翻译。集中在一个文件，便于对照 + 单元测试。

```ts
// event-bridge.ts (示意)
export function* adaptAgentEvent(ev: AgentEvent): Iterable<KunSseEvent> {
  switch (ev.type) {
    case 'tool_start': yield { event: 'thread.tool.start', data: ev };
    case 'tool_end':   yield { event: 'thread.tool.end',   data: ev };
    case 'thinking':   yield { event: 'thread.thinking',   data: ev };
    case 'token':      yield { event: 'thread.message.delta', data: ev };
    case 'done':       yield { event: 'thread.done',       data: ev };
    case 'error':      yield { event: 'thread.error',      data: ev };
    case 'approval':   yield { event: 'thread.approval',   data: ev };
  }
}
```

### 决策 5：投资工作台 UI 独立目录 + 复用 AppShell
**选择**：在 `app/src/renderer/src/investment/` 新增独立目录，`InvestmentLayout` 复用 `AppShell` 的 chrome（顶部 Tab、左侧导航），中间区域为面板网格（CSS Grid），右侧可选侧栏放工作流追踪。

**布局**：
```
┌──────────────────────────────────────────────────────┐
│  AppShell (Top Tabs: Code/Write/SDD/IM/投资工作台)   │
├──────────────────────────────────────────────────────┤
│  MarketTicker  ┌──────┐ ┌──────────────────┐         │
│                │Portfolio│ │ResearchPanel    │        │
│  Watchlist     │Summary │ │(研报速读)        │         │
│                └──────┘ └──────────────────┘         │
│  RiskDashboard ┌──────────────────────────┐          │
│                │SkillLauncher (50 技能)   │          │
│                └──────────────────────────┘          │
│  WorkflowTracker (5 阶段)                             │
└──────────────────────────────────────────────────────┘
```

**理由**：
- 网格布局让所有面板一次性可见，符合投资分析师"信息密度高"的工作习惯
- 复用 AppShell → 主题、字体、快捷键统一
- 单一新目录 → 易于切换"开关"

### 决策 6：i18n 新增 investment namespace
**选择**：`app/src/renderer/src/locales/zh-CN/investment.json` + `en/investment.json`，在 `i18n.ts` 中注册 `investment` namespace。所有面板 import `useTranslation('investment')`。

**理由**：
- 符合现有 i18n 规范（参考 `app/src/renderer/src/locales/zh-CN/`）
- 缺失 key 测试（参考 slash-command-autocomplete spec）继续生效

### 决策 7：依赖链接
**选择**：`app/package.json` 增加：
```json
"dependencies": {
  "@upup/agent-core": "link:../../packages/agent-core",
  "@upup/sdk":        "link:../../packages/sdk",
  "@upup/skills":     "link:../../packages/skills"
}
```
`electron-vite.config.ts` 的 `external` 段保持不变（workspace 包默认 external）。

**理由**：
- `link:` 在 pnpm workspace 之外不完全可靠，但 app 已有 `pnpm-workspace.yaml` → 直接用相对路径
- 不影响 electron-builder：默认会把 node_modules 整个打进 asar

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `@upup/agent-core` 当前导出与 Kun HTTP 契约不完全一致 | 中 | 桥接层逐端点翻译，spec 已要求 Zod schema 校验通过 |
| Electron 主进程加载 workspace 依赖增加包大小 | 低 | workspace 包不打包重复代码；`packages/agent-core` 仅导出 ESM 主入口 |
| SSE 事件流背压（agent-core → bridge → IPC → renderer） | 低 | 桥接层使用 Node Transform Stream 批量 yield；renderer 端已有节流 |
| i18n 新 namespace 缺失 key | 中 | 沿用现有 `i18n.test.ts` 的 "missing key 启动失败" 约束 |
| 替换引擎后旧的 Kun 子进程残留 | 中 | `stopAndWait()` 在主进程 quit 事件钩子里强制 await；增加 `reclaimPort` 兜底 |
| 投资工作台同时拉取 5+ 数据源（行情/持仓/风险/研报/技能）导致启动慢 | 中 | 每个面板独立懒加载；首屏只显示 MarketTicker；其余用 IntersectionObserver 触发 |
| `app/src/main/runtime/kun-adapter.ts` 残留引用 | 低 | spec 明确 `kunRuntimeAdapter` 保留作为 fallback；新增 `getActiveAdapter()` 工厂函数 |

## Migration Plan

1. **阶段 0**（开发期，可在 settings 切换引擎）：保留 `kunRuntimeAdapter`，新增 `upupRuntimeAdapter`
2. **阶段 1**（自测）：开发者在 `AppSettingsV1` 中把 `engine: 'upup'`，启动 app，所有原有功能正常
3. **阶段 2**（投资工作台）：renderer 端增加 `InvestmentLayout`，跑通"行情/持仓/自选/风险/研报/技能"六面板
4. **阶段 3**（CI）：在 `app/scripts/` 增加 `verify-upup-engine.sh`，跑通 5 阶段 `/invest` + 1 次 dcf 估值 + 1 次 stock-screen
5. **阶段 4**（文档与发布）：合并 README 更新；归档 openspec change

**回滚**：`AppSettingsV1.engine = 'kun'` 即退回 Kun 运行时。`upupRuntimeAdapter` 与 `upupInvestmentLayout` 都不被加载。

## Open Questions

1. `@upup/agent-core` 当前的 `turn` 事件 schema 与 Kun 的 `thread.turn.*` 是否完全等价？需要 review 后确认是否需要再写一层 `turn-adapter.ts`。**默认假设**：等价；不一致时再补丁。
2. `app/kun` 子进程未来是删除、归档还是继续维护？本 change 不动它，留作 open question。
3. 是否需要"投资工作台"独立打包为 `DeepSeek GUI Investment` SKU？**默认假设**：不，与 DeepSeek GUI 同包分发，通过 settings/launcher flag 切换。
4. 行情数据源选 Tushare 还是 AKShare？UpUp 内部已抽象 `finance` 工具 → renderer 直接调用 `getStockQuote` 即可，**不**直接绑死数据源。
