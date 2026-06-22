# Spec — upup-sdk-integration

主进程通过 `@upup/sdk` 持有 UpUp 引擎的契约。

## Purpose

DeepSeek GUI 的核心引擎从 `kun`（已删除）迁移到 `@upup/sdk`（`packages/sdk` 工作区包）。
所有 IPC handler 必须委托给 `UpClient` 公开方法；禁止绕过 SDK 直接 import 仓库根源码。

## Requirements

### SDK-HOST-001 — 单例 UpClient (MUST)

主进程内必须有且仅有一个 `UpClient` 实例（由 `createClient()` 创建）。所有 IPC handler
复用此实例，不得在 handler 内部 new client。

**理由**：spawn 子进程的开销（1-2s）只能承担一次；UpClient 内部状态（session、cache、
permission）必须跨 IPC 调用持续。

**实现**：`app/src/main/upup/sdk-host.ts` 暴露 `upupSdkHost.getClient()`，
模块级单例，进程内共享。

### SDK-HOST-002 — StdioTransport (MUST)

`UpClient` 的 transport 必须是 `StdioTransport`（来自 `@upup/sdk`）。

- **开发模式** spawn 命令：`bun run src/index.tsx`，工作目录 = 仓库根
- **打包后** spawn 命令：`upup`（`process.resourcesPath/upup` 或 PATH 查找）
- **工作目录**：必须等于 `app.getAppPath()/../`（仓库根），让 upup CLI 能找到
  `src/skills/`、`src/tools/`、`src/data/` 等资产

**禁止**：
- ❌ `HttpTransport` 指向本地自建 HTTP server（v1 阶段妥协）
- ❌ `import('@upup/agent-core')` 进程内直接嵌入（绕过 SDK 公开面）
- ❌ `import('../../../../src/agent/agent.js')` 相对路径穿透

### SDK-HOST-003 — IPC 委托给 SDK 公开方法 (MUST)

所有 `ipcMain.handle('upup:*')` 必须委托给 `UpClient` 公开方法，不允许直接调
`src/agent/agent.ts` 的内部函数。

| IPC 通道 | 委托给 |
| --- | --- |
| `upup:list-tools` | `client.listTools()` |
| `upup:list-skills` | `client.listSkills()` |
| `upup:list-sessions` | `sessionManager.list()` 或 `client.listSessions()` |
| `upup:query` | `client.query(prompt, opts)` |
| `upup:stream` | `client.stream(prompt, { signal })` + `webContents.send('upup:stream', ...)` |
| `upup:cancel` | `controller.abort()` 透传到 SDK 的 `signal` |
| `upup:health` | `client` 是否 connected + version |

### SDK-HOST-004 — 中文错误信息 (MUST)

配置缺失（`apiKey` / `baseUrl` 缺失）或 SDK 调用失败时，错误信息必须是中文，且
前缀固定为 "投资工作台配置错误：" 或 "投资工作台运行错误："。

**实现**：`settings-bridge.ts` 的 `buildUpUpClientConfig` 抛出 `Error('投资工作台配置错误：未配置 API Key（请在设置中填写）')`。
`ipc.ts` 在 `try/catch` 中包装 SDK 抛出的英文错误，转换为中文。

### SDK-HOST-005 — 启动降级 (SHOULD)

`UpClient` 启动失败（spawn 失败 / 5s 内未 connected）时，必须降级为只读模式：

- `upup:health` 返回 `{ ok: false, engine: 'upup', error: '引擎未就绪' }`
- `upup:list-tools` / `upup:list-skills` 返回空数组
- `upup:query` / `upup:stream` 抛"投资工作台：引擎未就绪，请稍后重试"中文错误
- 渲染层 InvestmentLayout 显示"引擎未就绪"占位 + 重试按钮

**实现**：`sdk-host.start()` 内部 `Promise.race([connect(), timeout(5000)])`，
失败则标记 `connected = false`，handler 走降级分支。

### SDK-HOST-006 — 流式响应通过 webContents.send (MUST)

流式响应（`upup:stream`）必须通过 `event.sender.send('upup:stream', { turnId, event, data })`
推送到渲染层，**禁止**自建 SSE server。

- `turnId` 由 IPC 调用方生成（UUID），用于区分多次并发流
- `event` 是 SDK message 的 type 字段（`assistant` / `tool_use` / `tool_result` / `result` / `error`）
- `data` 是完整 SDK message 对象
- 流结束时 `event.sender.send('upup:stream', { turnId, event: 'done' })`
- 渲染层通过 `window.dsGui.upup.onStream(callback)` 订阅

**取消语义**：渲染层调 `window.dsGui.upup.cancel(turnId)` → main 进程 `AbortController.abort()` 透传到 `client.stream(prompt, { signal })`。

### SDK-HOST-007 — 进程退出时清理 (MUST)

`app.on('before-quit')` / `app.on('will-quit')` 钩子必须调用 `upupSdkHost.stop()`：

- 取消所有 active `AbortController`
- `client.close()` 关闭 transport
- 等待子进程退出（最多 3s 超时）
- 清理 module-level 单例

**实现**：`app/src/main/index.ts` 注册 `app.on('before-quit', async () => { await upupSdkHost.stop() })`。
