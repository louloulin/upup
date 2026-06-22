# UpUp SDK 引擎集成指南

本文说明 UpUp（涨涨）GUI 应用如何通过 `@upup/sdk` 将 UpUp Agent 引擎集成到 Electron 桌面应用中。

## 概述

UpUp (涨涨) 是一个面向中文投资场景的 AI 智能体，根植于 [UpUp CLI](../CLAUDE.md) 项目。GUI 应用通过 `in-process` 方式把 `@upup/sdk` 集成进 Electron 主进程，让 7 个投资工作台面板可以直接复用 UpUp CLI 的 agent loop、工具、Skill 和工作流。

**核心要点：**

1. **集成方式**：in-process（主进程内持有 `UpClient` 单例），**不**是 HTTP 桥接
2. **传输层**：`@upup/sdk` 内部用 `StdioTransport` 拉起 `bun run src/index.tsx`（UpUp CLI Agent 子进程）
3. **API 暴露**：`preload` 用 `contextBridge` 把 7 个 IPC 通道包装成类型化 `UpupApi`
4. **设置入口**：`设置 → 智能体 → UpUp`（`settings-section-upup.tsx`）维护 `agents.upup` 配置段
5. **fallback**：`agents.upup` 缺失时回退到 `agents.kun`（聊天工作台用，向后兼容）
6. **投资工作台 100% 走 UpUp SDK**；聊天工作台仍走 Kun（保留向 Kun HTTP 边界）

## 架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Electron 桌面应用                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐   │
│  │  Renderer 渲染层      │     │         Main 主进程               │   │
│  │                      │     │                                  │   │
│  │  InvestmentLayout    │     │   upupSdkHost (UpClient 单例)     │   │
│  │  ┌────────────────┐  │     │   ┌──────────────────────────┐   │   │
│  │  │ 7 panels       │  │     │   │ UpClient (@upup/sdk)     │   │   │
│  │  │ useUpup() hooks├──┼─IPC─┼─▶│   - .query() / .stream() │   │   │
│  │  └────────────────┘  │     │   │   - .tools.getAll()      │   │   │
│  │         │            │     │   │   - .session             │   │   │
│  │  contextBridge       │     │   └──────────┬───────────────┘   │   │
│  │  window.dsGui.upup   │     │              │                   │   │
│  │  (UpupApi typed)     │     │      StdioTransport             │   │
│  │                      │     │              │                   │   │
│  └──────────────────────┘     │      bun run src/index.tsx      │   │
│                               │   (UpUp CLI Agent 子进程)         │   │
│                               └──────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

↑↑↑ in-process 集成：不走 HTTP/SSE，全部在主进程内完成 ↑↑↑
```

**关键决策**：

- 之前使用过的 `app/src/main/upup/host.ts`（HTTP server 方案）已**删除**。
- `app/src/main/upup/adapter.ts` / `event-bridge.ts` 也已**删除**——投资工作台不再走 adapter 模式，直接调用 UpUp SDK。
- 渲染层 `useRuntimeRequest` + `useAsync` + `useInterval` 组合被 `useUpup()` 6 个具名 hook 替代。

## 关键文件

```text
app/src/main/upup/
├── sdk-host.ts          # UpClient 单例（in-process 生命周期管理）
├── ipc.ts               # 7 个 IPC handler：health / list-tools / list-skills /
│                        #   list-sessions / query / stream / cancel
├── cancellation.ts      # AbortController 池（按 turnId 注册/取消）
├── settings-bridge.ts   # AppSettingsV1 → ClientConfig（含 agents.kun fallback）
└── index.ts             # barrel export

app/src/shared/
└── upup-api.ts          # UpupApi 接口 + 类型定义（渲染层/主进程共享契约）

app/src/preload/
└── upup-bridge.ts       # contextBridge：把 IPC invoke 包装为 UpupApi 实例

app/src/renderer/src/investment/
├── hooks/useUpup.ts     # 6 个具名 hook：useUpupHealth / useUpupListTools /
│                        #   useUpupListSkills / useUpupListSessions /
│                        #   useUpupQuery / useUpupStream
└── panels/*.tsx         # 7 个投资面板（全部走 useUpup hooks）

app/src/renderer/src/components/
└── settings-section-upup.tsx  # 设置 → 智能体 → UpUp 面板
```

## 启动流程

```text
1. app/src/main/index.ts 启动
   │
   ├─ upupSdkHost.start(initial)            ←── 启动 UpClient 单例
   │   │
   │   ├─ resolveUpupClientConfig(settings)  ── 优先 agents.upup，fallback agents.kun
   │   │
   │   ├─ createClient(config)               ── 来自 @upup/sdk
   │   │   │
   │   │   ├─ StdioTransport.connect()
   │   │   │   └─ spawn: bun run src/index.tsx  (UpUp CLI Agent 子进程)
   │   │   │
   │   │   └─ new UpClient(transport, config)
   │   │
   │   └─ startedAt = Date.now()             ── 后续 health() 报 uptime
   │
   ├─ registerUpupIpcHandlers()              ←── 注册 7 个 ipcMain.handle()
   │
   ├─ setMainWindow(...)                     ─── 注入主窗口用于 webContents.send
   │                                         ─── 推送 'upup:stream' 事件
   │
   └─ createWindow({ ... })                  ←── 启动 Electron 窗口
```

引擎启动失败是**非致命**的：主进程在 `app.whenReady()` 中用 `void upupSdkHost.start(...).catch(...)` 包住。失败时 `upup:health` 仍返回 `{ ok: false, error: 'UpUp 引擎未启动' }`，前端 InvestmentLayout 渲染"引擎未就绪"占位，**不会**让整个 GUI 崩溃。

设置变更后 `applySettingsPatch` 会调用 `syncUpupSdkHost(saved)`，先 `stop()` 再 `start()`，确保 7 个面板下次查询拿到的是新配置。

## 设置（设置 → 智能体 → UpUp）

`settings-section-upup.tsx` 维护 `agents.upup` 段配置；修改后由 `settings-bridge.ts` 翻译成 `@upup/sdk` 的 `ClientConfig`。

| 字段 | 必填 | 说明 |
|------|------|------|
| **provider** | 是 | `deepseek` / `openai` / `anthropic` / `google` / `xai` / `openrouter` / `ollama`。前 4 个原生支持；`xai` / `openrouter` / `ollama` 自动映射为 `openai` 兼容路径。 |
| **model** | 是 | 取决于 provider（详见设置面板下拉）。留空时 `settings-bridge` 给默认值（deepseek→`deepseek-v4-pro`，anthropic→`claude-sonnet-4-6`，openai→`gpt-4o`，google→`gemini-2.0-flash`）。 |
| **apiKey** | 是 | 模型 API Key。**优先**用 `agents.upup.apiKey`；为空时回退到 `getActiveAgentApiKey(settings)`（Kun 通用 key）。两者都为空时抛 `UpupApiKeyMissingError`。 |
| **baseUrl** | 否 | OpenAI 兼容自定义端点（如本地 Ollama 填 `http://127.0.0.1:11434`）。 |
| **enableTushare** | 否 | A 股数据开关（启用后 SDK 拉取 A 股实时数据）。 |
| **tushareToken** | 条件 | 启用 Tushare 时必填。 |
| **enableExaSearch** | 否 | Exa 搜索开关（中文研报检索）。 |
| **exaSearchKey** | 条件 | 启用 Exa 搜索时必填。 |

**获取 API Key：**

- DeepSeek: <https://platform.deepseek.com/api_keys>
- Anthropic: <https://console.anthropic.com/>
- OpenAI: <https://platform.openai.com/api-keys>
- Google AI: <https://aistudio.google.com/app/apikey>
- Tushare Pro (A 股): <https://tushare.pro/register>

修改后无需手动重启——`applySettingsPatch` 会自动调用 `syncUpupSdkHost` 重启 UpClient。

## SDK 公开面（严格使用）

| SDK 方法 | 用途 | 主进程文件 |
|----------|------|-----------|
| `createClient(config)` | 启动 UpClient + StdioTransport | `sdk-host.ts` |
| `client.query(prompt, opts?)` | 非流式调用 | `ipc.ts` → `upup:query` |
| `client.stream(prompt, opts?)` | 流式调用 | `ipc.ts` → `upup:stream` |
| `client.tools.getAll()` | 列出工具 | `ipc.ts` → `upup:list-tools` |
| `client.close()` | 优雅关闭 | `sdk-host.ts.stop()` |

`@upup/skills` 的 `discoverSkills()` 用于列出 SKILL.md（@upup/sdk 自身不暴露 `listSkills`）。

## 不存在的功能（主进程层补齐）

| SDK 缺失 | 主进程补齐方案 | 文件 |
|----------|---------------|------|
| 无 `listSkills()` | `discoverSkills()` 扫描 SKILL.md frontmatter | `ipc.ts` |
| 无 `listSessions()` | 返回 `[]`（预留，等 SDK 提供 listAllSessions 后接上） | `ipc.ts` |
| `stream()` 不接受 `signal` | 本地 `AbortController` + `for-await break` | `cancellation.ts` + `ipc.ts` |

## IPC 通道

| Channel | 方向 | 说明 |
|---------|------|------|
| `upup:health` | Renderer → Main | 引擎健康检查（不抛错；返回 `{ ok, version, uptime, error? }`） |
| `upup:list-tools` | Renderer → Main | 已注册工具列表 |
| `upup:list-skills` | Renderer → Main | SKILL.md 列表（`UpupSkill` 含 `category`） |
| `upup:list-sessions` | Renderer → Main | 会话历史（暂时返回 `[]`） |
| `upup:query` | Renderer → Main | 非流式 query；返回 `{ result, usage?, duration_ms? }` |
| `upup:stream` | Renderer → Main | 流式 query；立即返回 `turnId`，事件通过 `upup:stream` 推送 |
| `upup:cancel` | Renderer → Main | 取消指定 `turnId` 的流 |
| `upup:stream` | Main → Renderer | 流事件推送（`assistant` / `tool_use` / `tool_result` / `result` / `done` / `error`） |

## 渲染层使用

```tsx
// 在投资面板中
import {
  useUpupHealth,
  useUpupListTools,
  useUpupListSkills,
  useUpupStream,
} from '../hooks/useUpup'

function MyPanel() {
  const { data: health, loading, error } = useUpupHealth()
  const { data: tools } = useUpupListTools()
  const { data: skills } = useUpupListSkills()
  const stream = useUpupStream()

  return (
    <Box>
      <Text>引擎: {health?.label} {health?.ok ? '🟢' : '🔴'}</Text>
      <Text>工具数: {tools?.length ?? 0}</Text>
      <Text>技能数: {skills?.length ?? 0}</Text>
    </Box>
  )
}
```

`useUpup()` 自身就是 `window.dsGui.upup` 的访问器；缺失时抛中文错误（防止在非 Electron 环境运行）。

## 设置翻译

`settings-bridge.ts` 把 GUI 的 `AppSettingsV1` 翻译成 `@upup/sdk` 的 `ClientConfig`：

- **provider/model**：`agents.upup.provider` / `agents.upup.model`，默认 `deepseek` / `deepseek-v4-pro`
- **向后兼容**：`agents.upup` 不存在时 fallback 到 `agents.kun`
- **apiKey**：从 `agents.upup.apiKey` 取出，缺失时抛 `UpupApiKeyMissingError`（中文消息）
- **useUpupSession**：启用 SDK 内部会话管理（`useUpupSession: true`）
- **baseUrl**：可选，透传（用于 OpenAI 兼容服务）

## 已删除的旧路径

以下文件在 SDK 架构切换后已删除（**不再使用** HTTP server / adapter / event-bridge 方案）：

| 旧文件 | 替代方案 |
|--------|---------|
| `app/src/main/upup/host.ts` | `sdk-host.ts`（UpClient 单例） |
| `app/src/main/upup/adapter.ts` | **不再需要**（聊天工作台仍走 Kun adapter） |
| `app/src/main/upup/event-bridge.ts` | IPC stream 事件翻译在 `ipc.ts` 内联 |
| `app/src/renderer/src/investment/hooks/use-runtime.ts` | `useUpup.ts`（6 个具名 hook） |
| `app/src/main/upup/sdk-types.d.ts` (shim) | `@upup/sdk` dist/index.d.ts |
| `app/src/main/upup/skill-catalog.ts` | `@upup/skills.discoverSkills()` |

## 双引擎策略

| 引擎 | 工作台 | 传输方式 | 状态 |
|------|--------|---------|------|
| **UpUp SDK** | 投资工作台 | StdioTransport（bun subprocess） | **活跃** |
| Kun | 聊天工作台 | HTTP（port 5300） | 保留（向后兼容） |

`get-active-adapter.ts` 已简化，仅返回 Kun adapter。投资工作台**不**走 adapter 模式，直接通过 `upupSdkHost.getClient()` 拿 UpClient。

## 调试方法

### 1. 主进程日志

应用以 `bun run dev` 或生产模式启动后，主进程控制台会输出：

- **`[upup-sdk] host restarted after settings change`** — 设置变更重启引擎
- **`[upup-sdk] host:started`** — 启动成功
- **`[upup-ipc] list-skills failed: ...`** — 列出 skills 出错
- **`[deepseek-gui] upup-sdk host start failed: ...`** — 引擎启动失败（API key 缺失、provider 不识别等）

把日志写到本地文件：

```bash
# 主进程日志位置（macOS）
~/Library/Logs/DeepSeek GUI/main.log

# 或通过设置页"打开日志目录"
```

启用 GUI 内的日志：`设置 → 通用 → 日志` 打开 → 重启应用。日志按 `retentionDays` 自动清理。

### 2. 渲染层调试

打开 DevTools（`View → Toggle Developer Tools` 或 `Ctrl+Shift+I`）：

```js
// 查看引擎健康状态
await window.dsGui.upup.health()
// → { ok: true, engine: 'upup', version: '0.2.1', label: 'upup-sdk', uptime: 12345 }

// 列工具
await window.dsGui.upup.listTools()
// → [{ name: 'bash', description: '...' }, ...]

// 列 skills
await window.dsGui.upup.listSkills()
// → [{ name: 'dcf', description: '...', category: 'builtin' }, ...]

// 非流式 query
await window.dsGui.upup.query('分析 600519 茅台近 5 年 ROE')

// 流式 query
const { turnId } = await window.dsGui.upup.stream('贵州茅台 2026Q1 业绩前瞻')
// 监听 window.dsGui.upup.onStream(...) 收事件
```

### 3. 引擎健康徽章

InvestmentLayout 顶部的 `upup-sdk · v0.2.1` 徽章显示当前版本和状态：

- **🟢** 引擎就绪
- **🔴** 引擎未启动 / 启动失败（鼠标 hover 看错误详情）

## 故障排查

| 症状 | 排查 |
|------|------|
| **投资工作台显示"引擎未就绪"** | 检查 `设置 → 智能体 → UpUp` 是否填了 API Key；查看主进程日志 `[upup-sdk]` |
| **API key 错误 / 401 Unauthorized** | API Key 拼写错误或失效；回 `设置 → 智能体 → UpUp` 重新填入 |
| **upup:health 报 "UpUp 引擎未启动"** | `upupSdkHost.start()` 失败；可能 `agents.upup` 与 `agents.kun` 都没 API Key；查看主进程日志 |
| **技能按钮无响应** | 7 个面板通过 `useUpupListSkills()` 拉技能；查看 `upup:list-skills` 是否返回；日志搜 `[upup-ipc] list-skills failed` |
| **流式输出中断** | `useUpupStream` 的 `cancel()` 触发或 `upup:cancel` 主动取消；日志搜 `[upup-cancel]` |
| **`upup:stream` 报 "UpUp 引擎未就绪"** | `upupSdkHost.getClient()` 返回 null；通常是设置变更后 restart 失败；回设置页确认配置 |
| **typecheck 报错** | 确认 `packages/sdk/dist/index.js` 和 `index.d.ts` 已构建：`cd packages/sdk && bun run build` |
| **`createClient` 卡死** | bun 未安装；安装 Bun 后重试：`curl -fsSL https://bun.sh/install \| bash` |
| **更改 provider 后没生效** | 设置变更会自动 `syncUpupSdkHost`；查看主进程日志是否输出 `host restarted after settings change` |

## 验证门

每次改主进程/渲染层 SDK 接入代码至少跑：

```bash
# 主仓库 typecheck
npm run typecheck        # 同时跑 app/web + app/node + 仓库根

# 投资工作台相关单元测试
npx vitest run app/src/main/upup app/src/renderer/src/investment

# 关键 subset 手动 grep（应返回 0）
grep -r "useRuntimeRequest" app/src/renderer/src/investment/panels
grep -r "host.ts\|adapter.ts\|event-bridge.ts" app/src/main/upup
find app/src -name "sdk-types.d.ts"
```

## 相关文档

- `app/docs/investment-workbench.md` — 投资工作台使用指南（7 个面板详解）
- `app/docs/kun-architecture.md` — Kun 单运行时方案（聊天工作台架构基线）
- `app/docs/kun-cache-optimization.md` — 缓存优化与 Token ROI
- `packages/sdk/README.md` — `@upup/sdk` 公开 API
- `packages/sdk/src/client/client.ts` — `UpClient` / `createClient` 实现
- `packages/sdk/src/transport/stdio-transport.ts` — StdioTransport 实现
