---
supersedes: upup-as-core-engine-for-investment-workbench
---

## Why

DeepSeek GUI（`app/`）当前的核心引擎是 `kun`（`app/kun/`），加上 **相对路径穿透** 的 UpUp 集成（`app/src/main/upup/host.ts` 用 `import('../../../../src/agent/agent.js')` 直达仓库根源码）。这导致四个结构性问题：

1. **绕过 SDK**：仓库根已有完整的 `@upup/sdk`（`packages/sdk`）工作区包（`UpClient` / `StdioTransport` / `HttpTransport` / `SessionManager` / `ToolRegistry` / `PermissionManager` / `HookExecutor` / `ProcessPool`），但 host.ts 没用到，全部自造 HTTP+SSE 桥接。
2. **双引擎冗余**：`kun-adapter` + `upup-host` + `get-active-adapter` 切换器并存；Kun 与 UpUp 各有独立 settings 桥、事件桥、端点常量，加倍维护成本。
3. **路径穿透脆弱**：`'../../../../src/agent/agent.js'` 一旦目录结构变化即崩；不能跟随 `src/agent/` 重构。
4. **渲染层数据通道长**：渲染层 → `window.dsGui.runtimeRequest` → IPC → main → HTTP `UpUpHost` → `src/agent/agent`，四层间接。直接用 SDK 只需两层（IPC + SDK in-process）。

**问题**：投研能力（50 SKILL.md / 240+ 工具 / 5 阶段 `/invest` 工作流 / A 股数据栈）被困在自造 HTTP 桥接里，与 `@upup/sdk` 的设计脱节，难以跟随上游升级。

## What Changes

### 引擎层（in-process + StdioTransport）

- **新增** `app/src/main/upup/sdk-host.ts`：在 Electron 主进程内持有 `@upup/sdk` 的 `UpClient`（`createClient`），通过 `StdioTransport` spawn `bun run src/index.tsx` 作为 upup CLI 子进程（仓库根 entry）。`UpClient.query / stream / listSkills / listTools / listSessions` 全部走 SDK 公开面。
- **新增** `app/src/main/upup/settings-bridge.ts`：把 `AppSettingsV1` 翻译为 `UpClientConfig`（`provider / model / apiKey / baseUrl / env`），缺 key 抛中文错误。
- **新增** `app/src/main/upup/ipc.ts`：注册 `ipcMain.handle('upup:list-tools' / 'upup:list-skills' / 'upup:list-sessions' / 'upup:query' / 'upup:stream' / 'upup:cancel')` —— 全部委托给 `UpClient` 实例。

### 预加载桥（typed IPC surface）

- **新增** `app/src/shared/upup-api.ts`：声明 `UpupApi` 接口（typed contract）。
- **新增** `app/src/preload/upup-bridge.ts`：`contextBridge.exposeInMainWorld('dsGui', { ..., upup: UpupApi })`。
- **修改** `app/src/preload/index.ts`：挂载 `upup-bridge`。

### 渲染层（类型化 SDK hook）

- **新增** `app/src/renderer/src/investment/hooks/useUpup.ts`：导出 `useUpup()` 上下文 + 类型化 wrapper（`useListTools / useListSkills / useListSessions / useQuery / useStream`），与 `useRuntimeRequest` 形态一致但带类型。
- **修改** 7 个投资面板（`MarketTicker / PortfolioSummary / WatchlistPanel / RiskDashboard / ResearchPanel / SkillLauncher / WorkflowTracker`）：把 `useRuntimeRequest` 替换为 `useUpup` 对应 hook。

### 删除（清理冗余）

- **删除** `app/src/main/upup/host.ts`：HTTP server + 路径穿透不再需要。
- **删除** `app/src/main/upup/adapter.ts`：单引擎，不需要 adapter 模式。
- **删除** `app/src/main/upup/event-bridge.ts`：不再做 Kun 兼容 SSE 翻译。
- **删除** `app/src/main/runtime/get-active-adapter.ts` / `kun-adapter.ts` / `managed-runtime-idle.ts`：单引擎。
- **删除** `app/src/main/kun-process.ts` / `kun-base-url.ts` / `kun-health.ts` / `resolve-kun-binary.ts` + 对应 `*.test.ts`：整个 Kun 子进程链路。
- **删除** `app/src/shared/kun-endpoints.ts` / `app-settings-kun.ts`。
- **删除** `app/src/renderer/src/investment/hooks/use-runtime.ts`：`useRuntimeRequest` 退役，被 `useUpup` 取代。
- **删除** `app/kun/` 整个目录。
- **归档** `openspec/changes/upup-as-core-engine-for-investment-workbench/`：在 `proposal.md` 顶部标注 superseded by `upup-sdk-core-engine`。

### 保持不变

- `app/src/renderer/src/investment/InvestmentLayout.tsx` 7 个面板文件结构（仅替换 hook）。
- `app/src/renderer/src/AppShell.tsx` 投资工作台 Tab。
- `app/src/renderer/src/locales/zh / en/investment.json`（已有中文文案保留）。

## Impact

- **Specs**：
  - 新增 `specs/upup-sdk-integration/spec.md`（主进程 SDK 集成契约）。
  - 新增 `specs/investment-workbench-api/spec.md`（渲染层 useUpup 契约）。
- **Code**：
  - 主进程：净减 ~1500 行（删 Kun 链路）+ 净增 ~250 行（sdk-host + ipc + settings-bridge）。
  - 渲染层：净增 ~150 行（useUpup）+ 净改 ~120 行（7 面板替换 hook）。
- **依赖**：
  - `app/package.json` 新增 `@upup/sdk` workspace 依赖；移除 `kun` 间接依赖。
- **风险**：
  - UpClient 启动耗时（spawn bun run src/index.tsx）：约 1-2s，需要在 `sdk-host.start()` 中预热并缓存。
  - Stream 取消语义：`AbortController` 需要从 IPC handler 穿透到 `UpClient.interrupt()`。
  - Settings key 迁移：原 `AppSettingsV1.agents.kun` 段需迁移到 `agents.upup` 段并保持向后读取。

## ADDED Requirements

### `specs/upup-sdk-integration/spec.md`

- **SDK-HOST-001 (MUST)**：主进程必须通过 `createClient()` 持有单一 `UpClient` 实例，进程内复用，不得每次 IPC 调用都 new client。
- **SDK-HOST-002 (MUST)**：`UpClient` 的 transport 必须是 `StdioTransport`，spawn 命令为 `bun run src/index.tsx`（开发模式）或 `upup`（打包后二进制）；工作目录必须等于仓库根。
- **SDK-HOST-003 (MUST)**：所有 IPC handler 必须委托给 `UpClient` 公开方法（`query / stream / interrupt / listTools / listSkills / listSessions`），不得绕过 SDK 直接调 `src/agent/agent.ts`。
- **SDK-HOST-004 (MUST)**：配置缺失（`apiKey` / `baseUrl`）必须抛中文错误，错误信息前缀为"投资工作台配置错误："。
- **SDK-HOST-005 (SHOULD)**：`UpClient` 启动失败时（spawn 失败 / 5s 内未 connected）必须降级为只读模式（`/health` 返回 ok 但 `listTools` 返回空数组），渲染层显示"引擎未就绪"占位。
- **SDK-HOST-006 (MUST)**：流式响应必须通过 `webContents.send('upup:stream', { turnId, event, data })` 推送到渲染层；`turnId` 由 IPC 调用方生成。

### `specs/investment-workbench-api/spec.md`

- **WB-API-001 (MUST)**：`window.dsGui.upup` 必须在 preload 阶段注入，类型化接口来自 `app/src/shared/upup-api.ts`，缺类型即渲染层编译失败。
- **WB-API-002 (MUST)**：`useUpup()` hook 必须返回 `{ listTools, listSkills, listSessions, query, stream, cancel }`，每个方法都带中文错误兜底。
- **WB-API-003 (SHOULD)**：7 个面板的 `useRuntimeRequest('GET', '/v1/...')` 调用必须全部替换为 `useUpup().listTools / listSkills / listSessions`；SSE 流调用替换为 `useUpup().stream()` + `cancel()`。
- **WB-API-004 (MUST)**：渲染层不得出现 `import('../../../../src/...')` 路径穿透；不得直接 `require('node:http')`。
- **WB-API-005 (MUST)**：投资工作台所有用户可见文案必须为中文（沿用 `i18n` namespace `investment`）。

## REMOVED Requirements

- **REM-KUN-001**：`AppSettingsV1.agents.kun` 字段、`kun-endpoints.ts` 端点常量、`kun-adapter` 切换器全部移除。
- **REM-KUN-002**：`app/kun/` 子项目（含 `package.json` / `src/` / `dist/`）整目录删除。
- **REM-HTTP-003**：`UpUpHost` in-process HTTP server（5300 端口）、`KUN_*_PATH` 路由表、SSE 翻译层全部移除。
- **REM-PATH-004**：`import('../../../../src/agent/agent.js')` 等相对路径穿透写法全部清除。
- **REM-API-005**：`window.dsGui.runtimeRequest` 通用 HTTP 调用方法移除，被 `window.dsGui.upup` 专用 SDK API 取代。
