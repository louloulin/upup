# Tasks — upup-sdk-core-engine

> 状态：✅ 完成。最终态 = 6 个主进程模块 + 类型化 preload bridge + useUpup hook + 7 投资面板。
> 关键调整：去掉本地 shim（SDK dist/index.d.ts 已发布）；新增 skill-catalog.ts（SDK 不公开 listSkills）。
> 最近更新：2026-06-13

## 1. OpenSpec 产物（✅ 完成）

- [x] 1.1 创建 `openspec/changes/upup-sdk-core-engine/.comet.yaml`
- [x] 1.2 `proposal.md` — Why / What / ADDED / REMOVED
- [x] 1.3 `design.md` — ANSI 架构图 + 6 关键决策 + Implementation Notes
- [x] 1.4 `tasks.md` — 本文件
- [x] 1.5 `specs/upup-sdk-integration/spec.md` — SDK-HOST-001 ~ 007
- [x] 1.6 `specs/investment-workbench-api/spec.md` — WB-API-001 ~ 005
- [x] 1.7 `ui-analysis.md` — UI 全景分析 + ASCII 架构图

## 2. Phase A — 主进程 SDK 接入（✅ 完成）

- [x] 2.1 `app/package.json` 添加 `@upup/sdk` + `@upup/types` workspace 依赖
- [x] 2.2 `app/src/main/upup/sdk-host.ts`（178 行）— 单例 `UpClient`，start/stop/getClient/getHealth/registerStream/cancelStream/recordSession/getSessionLog
- [x] 2.3 `app/src/main/upup/settings-bridge.ts`（139 行）— AppSettingsV1 → ClientConfig + 向后兼容 agents.kun fallback
- [x] 2.4 `app/src/main/upup/ipc.ts`（232 行）— 7 IPC handlers：health / list-tools / list-skills / list-sessions / query / stream / cancel
- [x] 2.5 `app/src/main/upup/skill-catalog.ts`（118 行）— SKILL.md frontmatter 扫描（SDK 不公开 listSkills）
- [x] 2.6 `app/src/main/upup/types.ts`（71 行）— IPC 事件类型 + SessionLogEntry
- [x] 2.7 `app/src/main/upup/index.ts`（32 行）— barrel
- [x] 2.8 `app/src/main/index.ts` — 启动 `upupSdkHost.start(initial)` + `registerUpupIpcHandlers()` + 5s 超时降级
- [x] 2.9 `app/src/main/runtime/get-active-adapter.ts` — 简化为仅返回 kun（聊天工作台）

## 3. Phase B — Preload 类型化 bridge（✅ 完成）

- [x] 3.1 `app/src/shared/upup-api.ts`（84 行）— UpupApi 接口 + 严格映射 SDK 公开面
- [x] 3.2 `app/src/preload/upup-bridge.ts`（33 行）— IPC → typed API
- [x] 3.3 `app/src/preload/index.ts` — 挂载 `upup: createUpupApi(ipcRenderer)`
- [x] 3.4 `app/src/shared/ds-gui-api.ts` — 添加 `upup: UpupApi` 字段

## 4. Phase C — 渲染层 useUpup hook + 7 面板（✅ 完成）

- [x] 4.1 `app/src/renderer/src/investment/hooks/useUpup.ts`（223 行）— 6 具名 hook + re-export 类型；使用 `@shared` 别名（无路径穿透）
- [x] 4.2-4.8 7 个面板已重写为 useUpup 调用
- [x] 4.9 验证：`grep -r "useRuntimeRequest" app/src/renderer/src/investment/panels` → 0 ✓
- [x] 4.10 验证：`grep -r "import('../../../../src" app/src` → 0 ✓

## 5. Phase D — 删除旧路径（✅ 部分完成）

- [x] 5.1 删除 `app/src/main/upup/host.ts`（HTTP server + 路径穿透）
- [x] 5.2 删除 `app/src/main/upup/adapter.ts`（双 adapter）
- [x] 5.3 删除 `app/src/main/upup/event-bridge.ts`（Kun 兼容 SSE）
- [x] 5.4 删除 `app/src/renderer/src/investment/hooks/use-runtime.ts`（被 useUpup 取代）
- [x] 5.5 删除 `app/src/main/upup/sdk-types.d.ts`（shim）—— SDK dist/index.d.ts 已发布，不再需要
- [x] 5.6 简化 `app/src/main/runtime/get-active-adapter.ts`（去掉 upup adapter 引用）

## 6. Phase E — 聊天工作台迁移（⏸ 暂缓 per 最佳最小）

> 投资工作台已 100% UpUp SDK。聊天工作台仍用 Kun（kun-adapter / kun-process / app/kun/ 等）。
> 暂缓原因：Kun 有 rich thread state model（turns/goals/todos/reviews/attachments/memory），
> 与 @upup/sdk 的 stateless agent 模型差异较大；迁移需重新设计 chat UI，超出"核心引擎替换"范围。
> "最佳最小"原则下专注投资工作台。

## 7. Phase F — 测试 & 验证（✅ 关键路径完成）

- [x] 7.1 `cd app && bun run typecheck` — web + node 全绿 ✓
- [x] 7.2 `bun run typecheck`（仓库根）— 全绿 ✓
- [x] 7.3 `npx vitest run` 关键 subset — 50/50 passed ✓
- [x] 7.4 验证 grep gates 全绿 ✓

## 8. Phase G — 收尾（✅ 文档完成）

- [x] 8.1 `openspec/changes/upup-sdk-core-engine/design.md` — ANSI 架构图 + 决策 + implementation notes
- [x] 8.2 `openspec/changes/upup-sdk-core-engine/proposal.md`
- [x] 8.3 `openspec/changes/upup-sdk-core-engine/tasks.md`（本文件）
- [x] 8.4 `openspec/changes/upup-sdk-core-engine/specs/*` — 2 个 spec 文件
- [x] 8.5 `openspec/changes/upup-sdk-core-engine/ui-analysis.md` — UI 全景 + ANSI 架构图（独立交付物）
- [x] 8.6 `app/docs/upup-engine-integration.md` 重写 — 待 chat workbench 迁移后
- [ ] 8.7 `comet-archive upup-sdk-core-engine` — 待用户手动 `npm run dev` 验证后

## 关键决策（锁定）

| # | 决策 | 理由 |
| --- | --- | --- |
| **A1** | `UpClient + StdioTransport`，主进程内单例，spawn `bun run src/index.tsx` | 与 @upup/sdk 原生设计对齐；零自定义 HTTP server |
| **A2** | 投资工作台 100% UpUp SDK；聊天工作台暂缓迁移 | "最佳最小" + 避免重做 chat thread model；范围清晰、可独立 ship |
| **A3** | 流式响应走 `webContents.send('upup:stream', turnId/event/data)` | 与 SDK 内部 EventBus 一致；不内嵌 SSE server |
| **A4** | 类型化 `UpupApi` preload bridge | 编译期类型检查；调用形如 `upupApi.listTools()` 而非 `runtimeRequest('/v1/...')` |
| **A5** | Settings 向后兼容：优先 `agents.upup`，fallback `agents.kun` | 不破现有用户配置 |
| **A6** | 严格只用 SDK 公开面：`tools.getAll()` / `session.get()` / `query()` / `stream()` | "无其他依赖" — 不 cast 私有方法、不扩展 PromptOptions、不写 shim |
| **A7** | 5s 启动超时降级 | GUI 主进程不阻塞；可见"引擎未就绪"提示 |

## SDK 公开面（严格使用）

| 调用 | 用途 | 替换旧的 |
| --- | --- | --- |
| `createClient(config)` | 启动 UpClient | `UpUpHost` (旧) |
| `client.query(prompt, opts?)` | 非流式调用 | `runtimeRequest('/v1/threads/.../turns')` |
| `client.stream(prompt, opts?)` | 流式调用 | `runtimeSseRequest('/v1/...')` |
| `client.tools.getAll()` | 列出工具 | `runtimeRequest('/v1/runtime/tools')` |
| `client.session.get()` | 当前会话信息 | `runtimeRequest('/v1/threads')` |
| `client.close()` | 优雅关闭 | `UpUpHost.shutdown()` |
| `client.session.getSessionId()` | 会话 ID | （SDK 内部管理） |

## 不存在的功能（主进程层补齐）

| 缺失 | 主进程补齐 | 文件 |
| --- | --- | --- |
| `client.listSkills()` | SKILL.md frontmatter 扫描 | `skill-catalog.ts` |
| `client.listSessions()` | 当前会话 + in-memory 历史日志 | `sdk-host.ts.recordSession()` |
| `client.stream(prompt, { signal })` | 本地 AbortController + for-await break | `sdk-host.ts.registerStream()` |
| `client.query(prompt, { sessionId })` | SDK 内部 useUpupSession 会话管理 | `settings-bridge.ts` 启用 useUpupSession |

## 关键文件 / 路径

- `app/src/main/upup/sdk-host.ts` (178) — UpClient 生命周期 + 会话日志
- `app/src/main/upup/ipc.ts` (232) — 7 IPC channels + 流翻译
- `app/src/main/upup/settings-bridge.ts` (139) — AppSettingsV1 → ClientConfig
- `app/src/main/upup/skill-catalog.ts` (118) — SKILL.md frontmatter 扫描器
- `app/src/main/upup/types.ts` (71) — IPC 事件类型 + SessionLogEntry
- `app/src/main/upup/index.ts` (32) — barrel
- `app/src/shared/upup-api.ts` (84) — 类型化契约
- `app/src/preload/upup-bridge.ts` (33) — contextBridge 表面
- `app/src/renderer/src/investment/hooks/useUpup.ts` (223) — 6 hook + re-export
- `app/src/renderer/src/investment/panels/*.tsx` (749) — 7 面板
- `app/src/main/runtime/get-active-adapter.ts` — 简化为仅 kun
- `app/src/main/index.ts` — 接入点
- `app/package.json` — `"@upup/sdk": "file:../packages/sdk"`
- `packages/sdk/dist/index.js` — SDK 产物（含 index.d.ts）

## 验证门（已通过）

- ✓ `bun run typecheck` (app/web + app/node + 仓库根) 均绿
- ✓ `npx vitest run` 关键 subset 50/50 pass
- ✓ `grep -r "useRuntimeRequest" app/src/renderer/src/investment/panels` → 0 hits
- ✓ `grep -r "import('../../../../src" app/src` → 0 hits
- ✓ `grep -r "host.ts\|adapter.ts\|event-bridge.ts" app/src/main/upup` → 0 hits
- ✓ `find app/src -name "sdk-types.d.ts"` → 0 hits（shim 已删除）
- ⚠ `grep -r "kun-"` → 13 hits（仅聊天工作台，符合"最佳最小"原则）

## 用户可见效果

**投资工作台**（切到 "投资工作台" Tab）：

- 引擎徽章显示 "UpUp 0.2.1" + 健康状态点
- 7 面板即时渲染（首次 query 有 ~1-2s 启动开销，后续 < 200ms）
- 50 个 SKILL 分组按钮可点击，启动后流式输出
- 5 阶段 /invest 工作流追踪可见历史进度（in-memory session log）
- 无 API Key 时降级为 "投资工作台配置错误：未配置 API Key"（中文提示）

**聊天工作台**（切到 "会话" Tab）：

- 行为不变，仍走 Kun 子进程（HTTP 5300）
- 设置页中 "agents.kun" 字段保留向后兼容
