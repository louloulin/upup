---
archived-with: 2026-06-22-upup-as-core-engine-for-investment-workbench
status: final
---
# Plan (Revised): upup-as-core-engine-for-investment-workbench

## Context — 重新理解

之前的理解**有误**。通过深入探索代码，澄清了实际架构：

### 实际设计（基于现有代码）

| 层级 | 实际实现 | 备注 |
|------|----------|------|
| **投资工作台 UI** | `app/src/renderer/src/investment/` (7 面板 + useUpup hook) | ✅ 已实现 |
| **preload bridge** | `app/src/preload/upup-bridge.ts` (类型化包装 ipcRenderer) | ✅ 已实现 |
| **shared API** | `app/src/shared/upup-api.ts` (UpupApi 类型契约) | ✅ 已实现 |
| **设置 UI** | `app/src/renderer/src/components/settings-section-upup.tsx` | ✅ 已实现 |
| **AppShell 集成** | `app/src/renderer/src/AppShell.tsx` 已加"投资工作台" tab | ✅ 已实现 |
| **i18n** | `app/src/renderer/src/locales/{zh,en}/investment.json` | ✅ 已实现 |

### 任务 1.x 的真相（与原 plan 不同）

**关键发现**（在 `app/src/main/runtime/get-active-adapter.ts` 的注释）：

> 投资工作台：直接走 `app/src/main/upup/sdk-host.ts` 单例（不通过 adapter）
> 聊天工作台：通过本文件拿到当前活跃的 RuntimeAdapter（目前固定 kun）
>
> 历史：旧版同时支持 kun / upup 双 adapter。新方案下：
>   - 投资工作台 → @upup/sdk 单例
>   - 聊天工作台 → kun（保留向后兼容）
> 所以本文件只剩 kun 一条路径，函数签名保持稳定避免 main/index.ts 改动。

**结论**：任务 1.x 中描述的 `upupRuntimeAdapter` + HTTP 桥接 + 路由表 + event-bridge 翻译已**演化为简化方案**：
- **不需要** HTTP 桥接（@upup/sdk 在主进程 in-process 调用即可）
- **不需要** 路由表（IPC 直接 handler）
- **不需要** 复杂事件翻译（UpClient.stream 直接 async iterable）
- **不需要** `reclaimPort` / `stopAndWait`（无子进程）
- **只需要** 一个最小 `app/src/main/upup/sdk-host.ts`：
  - `UpClient` 单例（lazy 创建）
  - 7 个 IPC handler：`upup:health` / `list-tools` / `list-skills` / `list-sessions` / `query` / `stream` / `cancel`
  - 流事件通过 `webContents.send('upup:stream', ...)` 推送
  - 取消用 AbortController

### 当前阻塞

`app/src/main/index.ts:64` 引用了 `./upup`，但目录不存在 → `tsc --noEmit` 编译失败。

`app/src/main/index.ts` 第 1011 行调 `registerUpupIpcHandlers()`。

---

## Build Configuration（不变）

| 字段 | 值 |
|------|-----|
| `build_mode` | `subagent-driven-development` |
| `subagent_dispatch` | `confirmed` |
| `tdd_mode` | `direct`（桥接为主，重写测试 ROI 低） |
| `review_mode` | `standard` |
| `isolation` | `branch`（`codex/yu`） |
| `base-ref` | `a9ae5e5014155525b9a9c24ecde7e10a83021ba0` |

---

## Implementation Strategy — 修正版

### 阶段 A: 最小 upup 模块（关键阻塞 — 3 个文件）

**目标**：让 `from './upup'` 解析，并提供 7 个 IPC handler。

#### A1. `app/src/main/upup/sdk-host.ts` — UpClient 单例

```ts
class UpupSdkHost {
  private client: UpClient | null = null
  private startedAt = 0
  private starting: Promise<void> | null = null
  private currentSettings: AppSettingsV1 | undefined

  isRunning(): boolean
  uptime(): number
  getClient(): UpClient | null
  getVersion(): string  // 从 packages/sdk/package.json 读或 hardcode '0.2.1'

  async start(settings: AppSettingsV1): Promise<void>
    // 1. resolveUpupClientConfig(settings)
    // 2. createClient(config) → UpClient
    // 3. startedAt = Date.now()

  async stop(): Promise<void>
    // client.close() + reset state

  async restart(settings: AppSettingsV1): Promise<void>
    // stop + start
}

export const upupSdkHost = new UpupSdkHost()
```

#### A2. `app/src/main/upup/settings-bridge.ts` — settings → ClientConfig

```ts
export function resolveUpupClientConfig(settings: AppSettingsV1): ClientConfig
  // provider: settings.agents.upup?.provider ?? 'deepseek'
  // model: defaults per provider (deepseek-v4-pro / claude-sonnet-4-6 / gpt-4o / gemini-2.0-flash)
  // apiKey: settings.agents.upup?.apiKey ?? '' (空时 throw 中文错误)
  // baseUrl: settings.agents.upup?.baseUrl
  // useUpupSession: true
```

#### A3. `app/src/main/upup/ipc.ts` — IPC handlers

7 个 handler（严格匹配 `app/src/preload/upup-bridge.ts` 和 `app/src/shared/upup-api.ts`）：

| Channel | 行为 |
|---------|------|
| `upup:health` | 返回 `UpupHealth`，无 client 时 `{ ok: false, error: 'UpUp 引擎未启动' }` |
| `upup:list-tools` | `client.tools.getAll().map(...)` → `UpupTool[]` |
| `upup:list-skills` | `discoverSkills()` (from `@upup/skills`) → `UpupSkill[]` |
| `upup:list-sessions` | 返回 `[]`（SDK 无 listAllSessions API，先返回空） |
| `upup:query` | `client.query(prompt, opts)` → `{ result, usage? }` |
| `upup:stream` | 立即返回 `{ turnId }`，异步推送事件到 `upup:stream` channel |
| `upup:cancel` | `cancelTurn(turnId)` → `{ ok }` |

辅助：
- `setMainWindow(win)` — 注入 BrowserWindow 用于 `webContents.send`
- `sendUpupStreamEvent(ev)` — 推送事件
- 内部 `Map<turnId, AbortController>` 管理取消

#### A4. `app/src/main/upup/index.ts` — barrel re-export

```ts
export { upupSdkHost } from './sdk-host'
export { registerUpupIpcHandlers, setMainWindow } from './ipc'
```

#### A5. `app/src/main/index.ts` 增量修改

在 `createWindow(...)` 之后调 `setMainWindow(win)`，让流事件能推送。

### 阶段 B: 引擎层单元测试（任务 2.x — 4 个文件）

- `settings-bridge.test.ts` — provider/model/apiKey 解析、缺 key 抛中文错、baseUrl 透传
- `sdk-host.test.ts` — start/stop/restart 生命周期、isRunning 标志、uptime
- `ipc.test.ts` — 7 个 handler 的返回值 + 错误包装 (mock ipcMain + upupSdkHost)
- `cancellation.test.ts` — AbortController 注册/取消/取消所有

### 阶段 C: 投资工作台面板测试（任务 5.x — 7 个文件）

每个面板一个测试文件，mock `useUpupQuery` / `useUpupStream` / `useUpupListSkills` 等：

| 测试文件 | 覆盖场景 |
|---------|---------|
| `MarketTicker.test.tsx` | 5 指数渲染、空状态、错误重试、千分位 |
| `PortfolioSummary.test.tsx` | 空持仓、Top 5 排序、中文千分位 |
| `WatchlistPanel.test.tsx` | 增删改、乐观更新、持久化 |
| `RiskDashboard.test.tsx` | 高贝塔、缺数据、中文风险标签 |
| `ResearchPanel.test.tsx` | 分页、详情抽屉 |
| `SkillLauncher.test.tsx` | 50 技能分组、启动跳转 |
| `WorkflowTracker.test.tsx` | 5 阶段状态机 |

**复用**: `app/src/renderer/src/components/Workbench.tsx` 中已有的 React Testing Library 模式 + `vitest` 配置。

### 阶段 D: 文档（任务 6.x — 1 个新建）

- **D1** `app/docs/upup-engine-integration.md` — **已存在** (git status M)，检查并补全
- **D2** `app/docs/investment-workbench.md` — **缺失**，新建中文投资工作台使用指南
- **D3** `app/README.md` — 增加"投资工作台"章节
- **D4** `app/README.en.md` — 同步英文版本

### 阶段 E: 收尾（任务 7.x）

- E1: `npm run typecheck` + `npm test` + `npm run lint` 全过
- E2: 验证 `AppSettingsV1.engine = 'kun'` 仍可回退（`kunRuntimeAdapter` 已保留）
- E3: `openspec validate --strict`
- E4: `comet-archive`

---

## Critical Files

### 新建（5 个，阶段 A）
- `app/src/main/upup/sdk-host.ts` — UpClient 单例
- `app/src/main/upup/settings-bridge.ts` — settings 翻译
- `app/src/main/upup/ipc.ts` — 7 个 handler + 事件推送
- `app/src/main/upup/index.ts` — barrel re-export
- `app/src/main/upup/cancellation.ts` — AbortController 管理（可选，简化版可内联）

### 新建（测试 — 阶段 B + C，共 11 个）
- `app/src/main/upup/__tests__/{settings-bridge, sdk-host, ipc, cancellation}.test.ts`
- `app/src/renderer/src/investment/panels/__tests__/{MarketTicker, PortfolioSummary, WatchlistPanel, RiskDashboard, ResearchPanel, SkillLauncher, WorkflowTracker}.test.tsx`

### 新建（文档 — 阶段 D，1 个）
- `app/docs/investment-workbench.md`

### 修改（增量）
- `app/src/main/index.ts` — 加 `setMainWindow(win)` 调用
- `openspec/changes/upup-as-core-engine-for-investment-workbench/tasks.md` — 每完成勾选

### 不变（已存在）
- `app/src/renderer/src/investment/InvestmentLayout.tsx` + 7 panels + `useUpup.ts`
- `app/src/preload/upup-bridge.ts`
- `app/src/shared/upup-api.ts`
- `app/src/components/settings-section-upup.tsx`
- `app/src/main/runtime/get-active-adapter.ts`
- `app/src/renderer/src/AppShell.tsx` + i18n

---

## Existing Functions / Patterns to Reuse

| 复用对象 | 路径 | 说明 |
|----------|------|------|
| `kunRuntimeAdapter` 生命周期 | `app/src/main/runtime/kun-adapter.ts` | upupSdkHost 借鉴 start/stop/restart 模式 |
| UpupApi 类型契约 | `app/src/shared/upup-api.ts:61-80` | **必须**严格匹配 |
| `useUpup` hook 行为 | `app/src/renderer/src/investment/hooks/useUpup.ts` | 渲染层调用约定 |
| UpClient 真实 API | `packages/sdk/src/client/client.ts` | `tools.getAll()` / `query()` / `stream()` / `close()` |
| `discoverSkills()` | `packages/skills/src/registry.ts` | 列出 skill 元数据 |
| UpupRuntimeSettingsV1 | `app/src/shared/app-settings-types.ts:183-200` | provider/model/apiKey 字段 |

---

## Verification

### 1. 编译验证（关键）
```bash
cd app && npx tsc --noEmit -p tsconfig.node.json
# 必须 0 错误
```

### 2. 单元测试
```bash
cd app && npm test
# 必须全部通过
```

### 3. Lint
```bash
cd app && npm run lint
```

### 4. OpenSpec 校验
```bash
openspec validate upup-as-core-engine-for-investment-workbench --strict
```

### 5. Comet 守卫 + 归档
```bash
"$COMET_BASH" "$COMET_GUARD" upup-as-core-engine-for-investment-workbench build --apply
comet-archive upup-as-core-engine-for-investment-workbench
```

---

## Execution Plan (Subagent-Driven)

| Wave | Subagent 任务 | 依赖 |
|------|---------------|------|
| 1 | T1.1-T1.4: 创建 `app/src/main/upup/` 5 文件 + index.ts 集成 | - |
| 2 | T2.1-T2.4: 引擎层单元测试（4 文件） | Wave 1 |
| 3 | T3.1-T3.7: 7 个面板测试 | - (UI 已存在) |
| 4 | T4.1-T4.4: 文档补全 | Wave 1 |
| 5 | T5.1-T5.4: 收尾（typecheck/test/lint/validate/archive） | Wave 1-4 |

**关键协调点**:
- Wave 1 是阻塞点（编译失败），优先级最高
- Wave 2-4 可并行
- Wave 5 是顺序收尾
- 每个 subagent 完成后，主会话读 `openspec/changes/<name>/.comet/subagent-progress.md` 确认审查通过，再勾选 tasks.md + 提交