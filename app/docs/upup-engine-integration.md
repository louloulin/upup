# UpUp 引擎集成指南

本文说明如何把 UpUp（涨涨）的 agent-core 作为 DeepSeek GUI 的核心引擎使用，并保留 Kun 作为回滚 fallback。

## 目标

GUI 不直接嵌 agent loop，也不再只信任单个外部 CLI 进程，而是：

1. 在 Electron 主进程内启动一个 in-process Node http server（`UpUpHost`），承载 KUN 兼容的 HTTP/SSE 契约；
2. 通过 `RuntimeAdapter` 工厂选择当前激活的引擎（Kun / UpUp），渲染层 / IPC / preload 全部不感知差异；
3. UI 上方新增"投资工作台"路由，把 50 个 SKILL.md、A 股行情、自选、组合、风险、研报、5 阶段 `/invest` 工作流串成一个工作台。

## 关键文件

```text
app/src/main/
├── upup/
│   ├── settings-bridge.ts    # AppSettingsV1 → UpUp engine 配置翻译
│   ├── event-bridge.ts       # AgentEvent → Kun 兼容 SSE 事件
│   ├── host.ts               # in-process Node http server
│   ├── adapter.ts            # 镜像 kunRuntimeAdapter 接口
│   └── index.ts              # 模块导出
└── runtime/
    ├── kun-adapter.ts        # 原 Kun 适配器
    └── get-active-adapter.ts # factory（env > settings > kun 默认）

app/src/renderer/src/
├── investment/
│   ├── InvestmentLayout.tsx  # 3 列布局 + 引擎徽章 + 错误态
│   ├── hooks/use-runtime.ts  # useRuntimeRequest / useAsync / useInterval
│   ├── panels/               # MarketTicker / Portfolio / Watchlist / Risk / Research / SkillLauncher / WorkflowTracker
│   └── locales/{zh,en}/investment.json
└── AppShell.tsx              # TopNav 加"投资工作台"按钮
```

## 引擎选择优先级

```ts
// app/src/main/runtime/get-active-adapter.ts
1. process.env.DEEPSEEK_GUI_ENGINE ∈ {'upup', 'kun'}   ← 最高
2. AppSettingsV1.engine 字段
3. 默认 'kun'                                          ← 向后兼容
```

## 切换到 UpUp

### 命令行（推荐用于开发）

```bash
cd app
DEEPSEEK_GUI_ENGINE=upup npm run dev
```

### 配置文件

```json
// ~/.deepseek-gui/settings.json
{
  "engine": "upup"
}
```

### 回滚

把 `engine` 改回 `kun`，或去掉 `DEEPSEEK_GUI_ENGINE` 环境变量即可。

## HTTP/SSE 契约

`UpUpHost` 注册的端点与 `KUN_*_PATH` 完全一致，渲染层无感切换：

| 路径 | 说明 |
| --- | --- |
| `GET  /health` | 健康检查 |
| `GET  /v1/runtime/info` | 运行时元信息（含引擎 ID / 模型 / skills） |
| `GET  /v1/runtime/tools` | 当前可用工具清单 |
| `GET  /v1/skills` | 当前可调用的 SKILL.md 列表 |
| `POST /v1/threads` | 创建新会话 |
| `GET  /v1/threads` | 列出会话 |
| `GET  /v1/threads/:id` | 获取会话详情 |
| `POST /v1/threads/:id/turns` | 发起一轮对话（SSE 响应） |
| `POST /v1/threads/:id/fork` | 派生新会话 |
| `POST /v1/threads/:id/compact` | 上下文压缩 |
| `POST /v1/threads/:id/review` | 触发 review |
| `POST /v1/threads/:id/goal` | 设置会话目标 |
| `POST /v1/threads/:id/todos` | 同步 todo 列表 |
| `POST /v1/threads/:id/approvals/:approvalId` | 决策 tool approval |
| `GET  /v1/memory` | 记忆读取 |
| `POST /v1/attachments` | 上传附件 |

默认端口 `5300`，仅监听 `127.0.0.1`，由 `UpUpHost.start()` 启动时自动绑定。

## 事件名映射（Kun 兼容）

`event-bridge.ts` 把 `src/agent/agent.ts` 的 `AgentEvent` 翻译为 Kun SSE 事件名，渲染层消费 `thread.message.delta / thread.tool.start / thread.tool.end / thread.approval.requested / thread.done` 等，不需要任何改动。

```ts
// 摘录
case 'message':
  return { event: 'thread.message.delta', data: { delta: ev.text } }
case 'tool_call':
  return { event: 'thread.tool.start', data: { id, tool, args } }
case 'done':
  return { event: 'thread.done', data: { answer: asString(ev.answer) } }
```

类型漂移风险点已在 `event-bridge.ts` 注释里说明（`DoneEvent.answer` vs `AgentEvent.result`、`ApprovalDecision` 形状差异），全部用 `Record<string, unknown>` 解耦。

## 设置翻译

`settings-bridge.ts` 把 GUI 的 `AppSettingsV1` 翻译成 UpUp 的 engine config：

- provider：openai / anthropic / google / xai / deepseek / ollama / openrouter
- model：默认 `gpt-5.4`，支持 `claude-` 前缀路由
- apiKey：从 AppSettingsV1 取出，缺失时抛**中文错误信息**
- baseUrl：ollama 默认 `http://127.0.0.1:11434`，其他 provider 走标准 endpoint

校验函数 `validateUpUpConfig` 在 `UpUpHost.start()` 之前调用，缺 key 时直接以中文错误冒泡到 GUI 错误态。

## 调试

### 看引擎是否生效

```ts
// 在 DevTools Console
window.dsGui.runtimeRequest('/v1/runtime/info', 'GET').then(console.log)
// { engine: 'upup', label: 'upup-agent-core', ... }
```

### 看引擎适配器被谁选中

主进程日志：

```
[engine] active=upup (from env DEEPSEEK_GUI_ENGINE=upup)
[upup-host] listening on http://127.0.0.1:5300
```

### 跑单独的引擎自检

```bash
curl http://127.0.0.1:5300/health
# {"ok":true,"engine":"upup"}
```

## 关键约束

1. **不复制 UpUp 代码**：`UpUpHost` 通过相对路径 `'../../../../src/agent/agent.js'` 直接引用源码，跟随 UpUp 演进。
2. **Kun 引擎必须可回滚**：所有调用都经过 `getActiveRuntimeAdapter(settings)`，settings 改了立刻生效。
3. **KUN_*_PATH 端点常量保留**：`app/src/shared/kun-endpoints.ts` 末尾追加 `ENGINE_*_PATH` 别名，渲染层零改动。
4. **中文优先**：所有用户可见的日志、错误、文案都使用中文。

## 故障排查

| 症状 | 排查 |
| --- | --- |
| GUI 卡在"等待运行时…" | 看主进程日志有无 `[upup-host] EADDRINUSE`；5300 端口被占用 |
| 投资工作台空白 | DevTools Console 看 `window.dsGui.runtimeRequest('/v1/runtime/info')` 返回 |
| SKILL 按钮点了没反应 | 渲染层日志看 `thread.message.delta` 是否到达；`src/skills/registry.ts` 启动时是否扫描成功 |
| `DEEPSEEK_GUI_ENGINE=upup` 不生效 | 检查环境变量是否在 npm run dev 之前 export；PowerShell 用 `$env:DEEPSEEK_GUI_ENGINE='upup'` |
| 切换引擎后 GUI 报错 | `~/.deepseek-gui/settings.json` 删除 `engine` 字段，恢复默认 |
