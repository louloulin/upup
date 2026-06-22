# Spec — investment-workbench-api

渲染层访问 `@upup/sdk` 的类型化 API 表面（preload bridge + useUpup hook）。

## Purpose

DeepSeek GUI 投资工作台（7 个面板）通过 preload typed bridge + `useUpup` hook 调用
`@upup/sdk`，不再使用旧的通用 `window.dsGui.runtimeRequest` HTTP 调用方法。

## Requirements

### WB-API-001 — preload 阶段注入 UpupApi (MUST)

`window.dsGui.upup` 必须在 preload 阶段通过 `contextBridge.exposeInMainWorld` 注入。
类型化接口来自 `app/src/shared/upup-api.ts` 的 `UpupApi` interface。

```ts
// app/src/shared/upup-api.ts
export interface UpupApi {
  health(): Promise<{ ok: boolean; engine: 'upup'; version: string; error?: string }>
  listTools(): Promise<Array<{ name: string; description: string }>>
  listSkills(): Promise<Array<{ name: string; description: string; category: string }>>
  listSessions(): Promise<Array<{ id: string; title: string; updatedAt: number }>>
  query(prompt: string, opts?: { sessionId?: string }): Promise<{
    result: string
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  }>
  stream(prompt: string, opts?: { sessionId?: string }): Promise<{ turnId: string }>
  cancel(turnId: string): Promise<void>
  onStream(handler: (msg: { turnId: string; event: string; data: unknown }) => void): () => void
}
```

**编译期门禁**：`app/src/renderer/src/global.d.ts` 必须 `declare global { interface Window { dsGui: { ..., upup: UpupApi } } }`，
缺类型 = 渲染层 `tsc` 失败。

### WB-API-002 — useUpup() hook 上下文 (MUST)

`app/src/renderer/src/investment/hooks/useUpup.ts` 导出：

```ts
export function useUpup(): UpupApi   // 上下文访问器
export function useListTools(): AsyncState<Tool[]>
export function useListSkills(): AsyncState<Skill[]>
export function useListSessions(): AsyncState<Session[]>
export function useQuery(): (prompt: string, opts?: QueryOpts) => Promise<Result>
export function useStream(): { turnId: string | null; events: StreamEvent[]; start(p): void; cancel(): void }
export function useCancel(): (turnId: string) => Promise<void>
```

每个具名 hook 内部必须 try/catch 把 SDK 抛出的错误包装为中文：
- `'投资工作台调用失败：' + err.message`

`useUpup()` 在 `window.dsGui.upup` 不存在时抛错（提示用户检查是否在 Electron 中运行）。

### WB-API-003 — 7 面板迁移 (SHOULD)

7 个投资面板（`MarketTicker / PortfolioSummary / WatchlistPanel / RiskDashboard / ResearchPanel / SkillLauncher / WorkflowTracker`）
的 `useRuntimeRequest('GET/POST', '/v1/...')` 调用必须全部替换为 `useUpup` 对应 hook。

| 面板 | 旧调用 | 新调用 |
| --- | --- | --- |
| InvestmentLayout | `useRuntimeRequest('/health')` | `useUpup().health()` |
| MarketTicker | `useRuntimeRequest('/v1/runtime/tools/quote')` | `useListTools()` + `useStream('查询指数报价')` |
| PortfolioSummary | `useRuntimeRequest('/v1/threads/:id/turns')` | `useQuery('查询当前组合')` |
| WatchlistPanel | `useRuntimeRequest('/v1/threads/:id/turns')` (CRUD) | `useQuery('更新自选股 ...')` |
| RiskDashboard | `useRuntimeRequest('/v1/threads/:id/turns')` | `useQuery('分析风险敞口')` |
| ResearchPanel | `useRuntimeRequest('/v1/threads/:id/turns')` | `useQuery('查询最新研报')` |
| SkillLauncher | `useRuntimeRequest('/v1/skills')` | `useListSkills()` + 启动按钮调 `useStream('运行 <skill>')` |
| WorkflowTracker | `useRuntimeRequest('/v1/threads')` | `useListSessions()` + `useStream('运行 /invest')` |

**门禁**：`grep -r "useRuntimeRequest" app/src/renderer/src/investment/panels` 返回 0 行。

### WB-API-004 — 禁止路径穿透 + 禁止 node:http (MUST)

渲染层代码（`app/src/renderer/src/**`）禁止出现：

- ❌ `import('...src/agent/...')` 任何形式的相对路径穿透
- ❌ `require('node:http')` / `require('node:net')` 直接调 Node API
- ❌ `fetch('http://127.0.0.1:5300/...')` 直接调本地 HTTP 端点
- ❌ `window.dsGui.runtimeRequest` 通用方法（旧 API 移除）

**理由**：违反 = 绕过 IPC sandbox，破坏 Electron 安全模型。

**ESLint 自定义规则**（建议）：`no-restricted-imports` 禁止 `../../../../src/*`，
`no-restricted-syntax` 禁止 `runtimeRequest` 调用。

### WB-API-005 — 中文文案 (MUST)

投资工作台所有用户可见文案必须为中文：

- 加载占位：'投资工作台加载中…'
- 错误占位：'投资工作台不可用' + '请检查设置中的 API Key'
- 引擎徽章：'UpUp SDK · v{version}'
- 7 面板标题：使用 `i18n` namespace `investment`，**禁止** inline 硬编码

**实现**：复用 `app/src/renderer/src/locales/zh/investment.json` + `en/investment.json`，
新增字段时同时更新两个文件 + i18n key 完整性测试。
