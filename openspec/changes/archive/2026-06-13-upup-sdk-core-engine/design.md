# Design — 以 `@upup/sdk` 替换 Kun 作为 DeepSeek GUI 核心引擎

## Context

DeepSeek GUI（`app/`）当前通过两条独立链路接入引擎：
- **Kun 路径**：`app/kun/` 子项目 + `app/src/main/kun-process.ts` spawn 子进程 + `app/src/main/runtime/kun-adapter.ts` 生命周期 + `app/src/main/runtime-sse-ipc.ts` SSE 桥。
- **UpUp 路径（不彻底）**：`app/src/main/upup/host.ts` 在主进程内启动 Node http server（5300），通过 `import('../../../../src/agent/agent.js')` 路径穿透到仓库根源码，模拟 Kun 的 HTTP/SSE 契约让渲染层无需修改。

**问题**：UpUp 路径虽在，但（a）绕过了已经发布到 workspace 的 `@upup/sdk` 包；（b）路径穿透脆弱、HTTP 自造重；（c）双引擎并存维护成本翻倍。

仓库根 `@upup/sdk`（`packages/sdk`）已就绪：`UpClient` / `StdioTransport` / `HttpTransport` / `SessionManager` / `ToolRegistry` / `PermissionManager` / `HookExecutor` / `ProcessPool`。本 change 的目标 = **彻底用 SDK 替代两条旧路径**，单引擎，零路径穿透。

## 目标架构（ANSI 图）

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Renderer (React 19 + TypeScript + i18next)                                  ║
║  ┌────────────────────────────────────────────────────────────────────┐      ║
║  │  AppShell  →  TopNav(会话 | 投资工作台 | 设置)                     │      ║
║  │  investment/                                                       │      ║
║  │  ├── InvestmentLayout.tsx  (3 列网格 + 引擎徽章 + 错误态)           │      ║
║  │  ├── panels/                                                      │      ║
║  │  │   ├── MarketTicker.tsx        (指数+自选报价, 15s 轮询)        │      ║
║  │  │   ├── PortfolioSummary.tsx    (总资产/盈亏/Top5)               │      ║
║  │  │   ├── WatchlistPanel.tsx      (增删改查)                       │      ║
║  │  │   ├── RiskDashboard.tsx       (行业暴露/回撤/贝塔)              │      ║
║  │  │   ├── ResearchPanel.tsx       (研报速读)                       │      ║
║  │  │   ├── SkillLauncher.tsx       (50 SKILL 分组启动)              │      ║
║  │  │   └── WorkflowTracker.tsx     (5 阶段 /invest 进度)            │      ║
║  │  └── hooks/                                                        │      ║
║  │      └── useUpup.ts  (useListTools/useListSkills/useListSessions/  │      ║
║  │                       useQuery/useStream/useCancel)                │      ║
║  └─────────────────────────┬──────────────────────────────────────────┘      ║
║                            │ window.dsGui.upup.* (typed IPC)                  ║
╠════════════════════════════╪═════════════════════════════════════════════════╣
║  Electron Main (Node 20)   │                                                  ║
║  ┌─────────────────────────┴──────────────────────────────────────────┐      ║
║  │  main/upup/                                                        │      ║
║  │  ├── sdk-host.ts         → UpClient 生命周期                       │      ║
║  │  │                          createClient({ StdioTransport, ... })  │      ║
║  │  ├── settings-bridge.ts  → AppSettingsV1 → UpClientConfig         │      ║
║  │  ├── ipc.ts              → registerUpupIpcHandlers()               │      ║
║  │  └── types.ts            → Re-export @upup/sdk 关键类型             │      ║
║  │  main/index.ts           → 启动时 sdkHost.start() + 退出 stop()    │      ║
║  └─────────────────────────┬──────────────────────────────────────────┘      ║
║                            │ @upup/sdk  (workspace:* 依赖)                    ║
║  ┌─────────────────────────┴──────────────────────────────────────────┐      ║
║  │  UpClient                                                          │      ║
║  │  ├─ StdioTransport  ─────────→  bun run src/index.tsx (子进程)     │      ║
║  │  ├─ SessionManager                                                  │      ║
║  │  ├─ PermissionManager                                               │      ║
║  │  ├─ ToolRegistry                                                   │      ║
║  │  └─ HookExecutor                                                   │      ║
║  └────────────────────────────────────────────────────────────────────┘      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  UpUp CLI Subprocess (同仓, 工作目录 = repo root)                              ║
║  ┌────────────────────────────────────────────────────────────────────┐      ║
║  │  src/index.tsx        → CLI 入口 (REPL/agent loop)                  │      ║
║  │  src/agent/agent.ts   → Agent.run() (流式 + 工具调用)               │      ║
║  │  src/tools/registry/  → 240+ 工具 (finance/search/browser/...)      │      ║
║  │  src/skills/          → 50 SKILL.md (dcf/earnings/...)              │      ║
║  │  src/commands/investment/ → 5 阶段 /invest (dossier→strategy→...)   │      ║
║  │  src/llm/             → OpenAI/Anthropic/Google/DeepSeek/xAI       │      ║
║  │  src/memory/          → 跨会话记忆                                 │      ║
║  └────────────────────────────────────────────────────────────────────┘      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**对比旧架构的关键差异：**

| 维度 | 旧（Kun + UpUp 双轨） | 新（UpUp SDK 单轨） |
| --- | --- | --- |
| 引擎数量 | 2（kun 子进程 + upup host） | 1（upup CLI 子进程） |
| HTTP server | 5300 端口 in-process | 无 |
| 路径穿透 | `import('../../../../src/...')` | 0（通过 SDK 公开面） |
| 渲染层调用层数 | 4（renderer→IPC→HTTP→agent） | 2（renderer→IPC→SDK） |
| 适配器 | `kun-adapter` + `upup-adapter` + `get-active-adapter` | 0（单引擎） |
| 端点常量 | `KUN_*_PATH` + `ENGINE_*_PATH` | 0 |
| 设置桥 | 2 份（kun/upup 独立） | 1 份 |
| 事件桥 | `event-bridge.ts` Kun 兼容 | 0（走 SDK 原生事件） |

## Goals / Non-Goals

**Goals：**
1. **彻底用 `@upup/sdk` 替换 Kun**：单引擎，零路径穿透。
2. **保留 7 个投资面板**：UI 不变，只换数据通道（`useRuntimeRequest` → `useUpup`）。
3. **保留 SSE 流式体验**：用 `webContents.send('upup:stream', ...)` 替代旧 `runtime-sse-ipc.ts`。
4. **保留中文优先**：所有用户可见文案、日志、错误信息均为中文。
5. **不复制 UpUp 代码**：通过 `workspace:*` 依赖跟随上游。

**Non-Goals：**
- 不改 `@upup/sdk` 本身（只做消费方）。
- 不改 UpUp CLI（`src/index.tsx`）入口签名。
- 不引入 Tauri / 不重写 Electron。
- 不重写 7 个投资面板的视觉/交互（只改数据通道）。
- 不做"自动切换引擎"（单引擎没有切换必要）。
- 不删除 `app/docs/upup-engine-integration.md`（改写为新方案的说明）。

## Decisions

### 决策 1：进程内 UpClient + StdioTransport（不外置 HTTP server）

**选择**：在 Electron 主进程内持有 `UpClient`，底层 transport 是 `StdioTransport`（spawn `bun run src/index.tsx` 作为 upup CLI 子进程）。

**理由**：
- `@upup/sdk` 原生设计 = `Client` + `Transport` 抽象；StdioTransport 是其 Phase 5 的标准 transport。
- 进程内持有 client = 0 端口暴露，避免 5300 端口冲突问题。
- 子进程模式 = 隔离 runtime 错误、保留标准 stdio JSON-RPC 协议。
- 直接 follow 上游 SDK 演进：upstream dexter 的新版 transport 改进会自动惠及本 GUI。

**替代方案 A**（`HttpTransport` 指向本地 upup HTTP 服务）：需要先启动一个 upup HTTP server，再让 client 走 HTTP。**额外一层间接**，**违背**"基于 SDK"的最小化原则。

**替代方案 B**（直接 `import('@upup/agent-core')` in-process 嵌入）：**绕过 SDK 公开面**，破坏封装、无法跟随 SDK 演进；不是真正的"基于 SDK"。

### 决策 2：删除 Kun（不做"运行时切换"）

**选择**：彻底删除 `app/kun/`、`kun-adapter`、`kun-process`、`kun-endpoints`、`app-settings-kun`，移除 `get-active-adapter` 切换器。

**理由**：
- "最佳最小"=单引擎最简，运行时切换是 v1 阶段的妥协；v2 应做减法。
- Kun 与 UpUp 能力重叠（都是 Claude Code 风格 agent loop），Kun 没有不可替代的独有能力。
- 维护成本：双 settings 桥 + 双事件桥 + 双端点常量 = 3 倍冗余。

**风险**：
- 若有外部用户绑定到 `window.dsGui.runtimeRequest('/v1/...')` 旧 API，会 break。**缓解**：`useRuntimeRequest` 只在 `app/src/renderer/src/investment/hooks/` 使用，重写此 hook 即可，没有外部用户。

### 决策 3：流式响应 = `webContents.send`（不内嵌 SSE server）

**选择**：删除 `app/src/main/runtime-sse-ipc.ts` 的 SSE 桥。流式改用 `webContents.send('upup:stream', { turnId, event, data })` 把 SDK 事件推到渲染层；渲染层订阅 IPC 事件。

**理由**：
- SDK 公开面 `client.stream(prompt)` 返回 AsyncGenerator<SDKMessage>，直接 `for await` + `webContents.send` 比自造 SSE 简洁。
- Electron 的 IPC `send` 是高频、零额外端口暴露。
- 与 `@upup/sdk` 内部 `EventBus` 模式一致。

**API 形态**：
```ts
// main/upup/ipc.ts
ipcMain.handle('upup:stream', async (event, { turnId, prompt, sessionId }) => {
  const controller = new AbortController()
  activeStreams.set(turnId, controller)
  try {
    for await (const msg of client.stream(prompt, { sessionId, signal: controller.signal })) {
      event.sender.send('upup:stream', { turnId, event: msg.type, data: msg })
    }
  } finally {
    activeStreams.delete(turnId)
    event.sender.send('upup:stream', { turnId, event: 'done', data: {} })
  }
})
ipcMain.handle('upup:cancel', (_e, { turnId }) => activeStreams.get(turnId)?.abort())
```

### 决策 4：preload typed bridge 取代通用 `runtimeRequest`

**选择**：`app/src/shared/upup-api.ts` 定义 `UpupApi` 接口，`app/src/preload/upup-bridge.ts` 用 `contextBridge.exposeInMainWorld('dsGui', { ..., upup: UpupApi })` 暴露。**删除** `runtimeRequest` 通用方法。

```ts
// app/src/shared/upup-api.ts
export interface UpupApi {
  listTools(): Promise<{ name: string; description: string }[]>
  listSkills(): Promise<{ name: string; description: string; category: string }[]>
  listSessions(): Promise<{ id: string; title: string; updatedAt: number }[]>
  query(prompt: string, opts?: { sessionId?: string }): Promise<{ result: string; usage?: TokenUsage }>
  stream(prompt: string, opts?: { sessionId?: string }): Promise<{ turnId: string }>
  cancel(turnId: string): Promise<void>
  health(): Promise<{ ok: boolean; engine: 'upup'; version: string }>
}
```

**理由**：
- 类型化 IPC 表面 = 渲染层编译期发现错误。
- 7 个面板调用形如 `upupApi.listTools()` 而非 `runtimeRequest('/v1/runtime/tools', 'GET')` —— 语义清晰、无字符串路径。
- 与 `@upup/sdk` 的 `UpClient` 公开方法一一对应。

### 决策 5：useUpup hook = useRuntimeRequest 的类型化替代

**选择**：`useUpup()` 上下文 + 6 个具名 hook（`useListTools / useListSkills / useListSessions / useQuery / useStream / useCancel`），与旧 `useRuntimeRequest + useAsync + useInterval` 形态一致。

```ts
// app/src/renderer/src/investment/hooks/useUpup.ts
export function useUpup(): UpupApi {
  const api = window.dsGui?.upup
  if (!api) throw new Error('投资工作台：dsGui.upup 未注入（请确认在 Electron 中运行）')
  return api
}

export function useListTools(): AsyncState<Tool[]>
export function useListSkills(): AsyncState<Skill[]>
export function useListSessions(): AsyncState<Session[]>
export function useQuery(): (prompt: string, opts?: QueryOpts) => Promise<Result>
export function useStream(): { turnId: string | null; events: StreamEvent[]; start(p): void; cancel(): void }
```

**理由**：
- 与旧 hook 形态一致 = 7 面板改写成本最低（找/替即可）。
- 具名 hook 优于通用 hook = 调用方更明确、错误更可读。
- `useStream` 内置 `start / cancel` = 渲染层不需要自己持有 `AbortController`。

### 决策 6：配置翻译最小化

**选择**：`AppSettingsV1` → `UpClientConfig` 翻译只覆盖必要字段（`provider / model / apiKey / baseUrl`），其余字段（`approvalPolicy / dataDir / Tushare / ExaSearch`）走 SDK 默认值。

**理由**：
- 旧 `settings-bridge.ts` 翻译了 18 个字段，其中 12 个是 host.ts 模拟 Kun API 的伪字段；新方案只需要 4 个真实字段。
- 翻译表 = 单一函数 + 单一验证，< 50 行。

```ts
// app/src/main/upup/settings-bridge.ts
export function buildUpUpClientConfig(settings: AppSettingsV1): UpClientConfig {
  const provider = (settings.agents.upup?.provider ?? 'deepseek') as UpClientConfig['provider']
  const apiKey = settings.agents.upup?.apiKey ?? process.env[`${provider.toUpperCase()}_API_KEY`]
  if (!apiKey) throw new Error('投资工作台配置错误：未配置 API Key')
  return { provider, model: settings.agents.upup?.model ?? 'gpt-5.4', apiKey, baseUrl: settings.agents.upup?.baseUrl }
}
```

## Risks & Mitigations

| 风险 | 缓解 |
| --- | --- |
| `bun run src/index.tsx` spawn 失败 / 启动慢 | `sdk-host.start()` 阶段预热 + 5s 超时降级（spec SDK-HOST-005） |
| Stream `AbortController` 透传不到 SDK | 用 `client.stream(prompt, { signal })` 模式，IPC 端 `controller.abort()` 直接穿透 |
| 旧 `AppSettingsV1.agents.kun` 字段用户配置丢失 | 启动时一次性迁移到 `agents.upup`，写回 settings.json（兼容读） |
| 7 面板改写漏改 | 自动化测试：`grep -r "useRuntimeRequest" app/src/renderer/src/investment/panels` 返回 0 |
| 路径穿透 `import('../../../../src/...')` 漏删 | 同上 grep + ESLint 自定义规则禁止 `import('.*src/agent')` 跨仓 |
| `package.json` workspace 依赖 link 失败 | 跑 `bun install` 后用 `bun pm ls @upup/sdk` 验证 |
| SDK 方法签名与预期不符 | 直接 `import { createClient } from '@upup/sdk'` + TypeScript 编译期检查 |

## Migration Plan

1. **Phase A — SDK 接入**（1 个 commit）
   - 加 `@upup/sdk` workspace 依赖
   - 写 `sdk-host.ts` + `settings-bridge.ts` + `ipc.ts`
   - 写 `shared/upup-api.ts` + `preload/upup-bridge.ts`
   - 在 `main/index.ts` 启动时调用 `sdkHost.start()`，但**保留**旧 Kun / 旧 host 路径

2. **Phase B — 渲染层切换**（1 个 commit）
   - 写 `useUpup.ts` hook
   - 7 面板改写
   - 自动化测试确认 `useRuntimeRequest` 引用清零

3. **Phase C — 删除旧路径**（1 个 commit）
   - 删 `app/src/main/upup/host.ts` / `adapter.ts` / `event-bridge.ts`
   - 删 `app/src/main/runtime/*`（kun-adapter / get-active-adapter / managed-runtime-idle）
   - 删 `app/src/main/kun-*`（kun-process / kun-base-url / kun-health / resolve-kun-binary） + 对应测试
   - 删 `app/src/main/runtime-sse-ipc.ts`
   - 删 `app/src/shared/kun-endpoints.ts` / `app-settings-kun.ts`
   - 删 `app/kun/` 整目录
   - 删 `app/src/main/preload/runtimeRequest` 相关
   - 归档 `openspec/changes/upup-as-core-engine-for-investment-workbench/`

4. **Phase D — 验证**（1 个 commit）
   - `bun run typecheck` + `bun test` 通过
   - `npm run dev`（在 app 目录）+ 切到投资工作台 + 7 面板可见
   - 跑 OpenSpec strict 校验

## Implementation Notes（实际落地补充）

### 备注 1：SDK 严格只调用公开面（无 shim、无扩展）

**实际**：落地时严格只用 `@upup/sdk` 公开 API，无本地 shim、无 PromptOptions 扩展、无私有 cast。
调用面：

| SDK 公开 API | 用途 |
| --- | --- |
| `createClient(config)` | 启动 UpClient |
| `client.query(prompt, opts?)` | 非流式 query |
| `client.stream(prompt, opts?)` | 流式 query |
| `client.tools.getAll()` | 列出工具（注意：不是 `list()`） |
| `client.session.get()` | 当前会话（注意：无 `list()`） |
| `client.session.getSessionId()` | 当前 sessionId |
| `client.close()` | 优雅关闭 |

**SDK dist/index.d.ts 已发布**（来自 `packages/sdk` `bun run types`）：
`upup/sdk/dist/index.d.ts` 包含 `UpClient / ClientConfig / SDKMessage / Result / PromptOptions / Tool` 等完整类型。
无需本地 shim。

**SDK 不存在的功能 → 主进程补齐**：
- `listSkills()` → `app/src/main/upup/skill-catalog.ts`（118 行）扫描 `src/skills/**\/SKILL.md` frontmatter
- `listSessions()` → `sdk-host.ts.recordSession()` + `getSessionLog()`（in-memory 50 条最近历史）
- `stream(prompt, { signal })` → 本地 `AbortController` + for-await break 检查
- `query(prompt, { sessionId })` → SDK 内部 `useUpupSession: true` 会话管理（无需外部传）

### 备注 2：`get-active-adapter.ts` 简化

**实际**：Phase C 期间删除了 `app/src/main/upup/adapter.ts`，但 `get-active-adapter.ts`
仍然 `import { upupRuntimeAdapter } from '../upup/adapter'`（路径穿透旧版）。

**解决**：
- `get-active-adapter.ts` 重写：只保留 kun 路径，`getActiveRuntimeAdapter()` 恒返回
  `kunRuntimeAdapter`（聊天工作台使用）。
- 投资工作台不再走 adapter 抽象，直接通过 `upupSdkHost` 单例访问 `@upup/sdk`。
- `app/src/main/index.ts` 调用 4 处不变（无需改调用方）。

### 备注 3：依赖安装路径差异

**实际**：`bun install` 不解析 `file:../packages/sdk` 这类相对路径 workspace 依赖，
只把 `@upup/sdk` 当作外部包名（找不到）。

**解决**：`cd app && npm install`（npm 支持 `file:` workspace 协议），bun 仍可用于
开发/构建/测试。`package.json` 保留 `"@upup/sdk": "file:../packages/sdk"` 写法。

### 备注 4：流式响应形态

设计阶段约定走 `webContents.send('upup:stream', ...)`；实际落地：
- IPC handler 立即返回 `{ turnId }` 给 renderer
- 流事件通过 `event.sender.send('upup:stream', { turnId, event, data })` 推送
- 渲染层 `useUpupStream` 内置 `start / cancel`，`cancel` 调 IPC `upup:cancel` →
  `upupSdkHost.cancelStream(turnId)` → `controller.abort()` → SDK `signal` 透传
- 流终止时发送 `{ turnId, event: 'done', data: {} }` 兜底
- 翻译层把 SDK 原生 `assistant / tool_use / tool_result / result / error / message`
  6 种消息折叠为统一 IPC 事件载荷（`UpupStreamEvent`）

### 备注 5：会话历史（in-memory session log）

**问题**：SDK `client.session.get()` 只返回当前会话信息，没有 list。
`WorkflowTracker` 面板需要看到历史 /invest 阶段进度。

**解决**：主进程内维护 `sessionLog: SessionLogEntry[]`（最近 50 条）：
- 每次 `query` / `stream` 完成时 `recordSession(prompt)` 追加一条
- `listSessions` IPC 返回当前会话（live）+ 历史日志（recorded）合并
- 不持久化（进程重启清空）；后续可改为 SQLite 持久化

