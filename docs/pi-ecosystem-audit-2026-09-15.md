# UpUp × Pi Ecosystem — 集成度审计与后续计划

> 日期：2026-09-15
> 范围：基于 `@earendil-works/pi-*` 0.85.1 全栈审视、DefaultPackageManager 接入、`~/.upup/agent` 优先级修复、TUI 硬编码治理、`upup openbuddy` + `upup plugin` 两条新命令落地
> 状态：**完整 Pi Native 投资助手定型**，后续重点是「微内核 + 插件化」让外部 Pi 生态插件可以零修改接入

---

## 一、Pi 生态覆盖矩阵（9 包 vs UpUp 现状）

| Pi 包 | 角色 | 接入状态 | 备注 |
|---|---|---|---|
| `@earendil-works/pi-ai` | LLM provider catalog + types | ✅ 深度 | `@upup/pi-runtime/model-registry.ts` 重导出 `builtinProviders()` + `getBuiltinModels()`；Ollama 通过 `custom-providers.ts` 注册 |
| `@earendil-works/pi-coding-agent` | Agent loop + `AgentSession` + `DefaultPackageManager` | ✅ 核心 API + ✅ 包装 install API | `@upup/pi-session/agent-session-factory.ts` 是唯一 factory；`@upup/pi-cli-bootstrap/src/plugin.ts` 包 `DefaultPackageManager` 暴露为 `upup plugin` |
| `@earendil-works/pi-agent-core` | AgentSession 实现 + 资源加载 | ✅ | 由 `agent-session-factory` 装配 |
| `@earendil-works/pi-tui` | TUI 原语（Editor/Container/Spacer/Loader） | ✅ | `packages/pi-tui-app/src/` 全面使用 |
| `@earendil-works/pi-protocol` | CBOR 传输协议 | ❌ | 后续 Phase D |
| `@earendil-works/pi-client` | CBOR 客户端 | ❌ | 后续 Phase D |
| `@earendil-works/pi-server` | 实验 server | ❌ | 后续 Phase D |
| `@earendil-works/pi-telemetry` | 遥测 | ❌ | 后续（可选） |
| `@earendil-works/chord` | Facet 插件框架 | ✅ **已接入** | `@upup/pi-resource-composition/chord-facet.ts` — Pi package ↔ chord Facet 桥 + `UpUpPluginRegistry` 服务 |

### 总结
- **核心运行时（pi-ai / pi-coding-agent / pi-agent-core / pi-tui）**：100% 复用
- **包管理（DefaultPackageManager）**：已通过 `upup plugin install/list/uninstall/update/reload` 暴露
- **传输协议（pi-protocol / pi-client / pi-server）**：未接入 — UpUp 当前只有 WebSocket bridge (`@upup/pi-bridge`) + JSON stdio (`@upup/pi-stdio`，已 ACP 兼容)，没有 CBOR
- **Facet（chord）**：✅ 已接入 — 每个 Pi package 映射成一个 chord Facet，`UpUpPluginRegistry` 本地服务暴露挂载清单，`UpUpFacetHost.reload()` 带 in-place / regeneration 两档语义

---

## 二、`agentDir` 解析优先级（修复后）

`packages/pi-resource-composition/src/agent-dir.ts`：

```
1. override                          (显式)
2. UPUP_AGENT_DIR                    (UpUp 风格)
3. UPUP_CODING_AGENT_DIR             (Pi ${APP_NAME}_CODING_AGENT_DIR 风格)
4. ~/.upup/agent                     (UpUp canonical home)  ← 新增
5. ~/.pi/agent                       (Pi canonical home)
6. <cwd>/.upup/agent                 (legacy per-cwd)
7. <cwd>                             (fallback)
```

变更理由：UpUp 是 primary application，Pi 是 embedded runtime。`~/.upup/agent` 比 `~/.pi/agent` 优先；想用 Pi 默认可显式设 `UPUP_CODING_AGENT_DIR=~/.pi/agent`。

测试：11 条 contract test 覆盖所有 7 层优先级 + override + `~` 展开 + 空字符串。

---

## 三、`upup openbuddy` — Pi 状态迁移命令

新命令族，将 Pi agent state（settings.json / themes / packages 配置）迁入 `~/.upup/agent`，让 Pi 与 UpUp 共享同一份根状态。

### 子命令
- `upup openbuddy status` — 预览 source/target 文件清单
- `upup openbuddy migrate [--dry-run] [--force]` — 实际迁移
- `upup openbuddy verify` — 验证迁移结果
- `upup openbuddy help` — 用法

### 源解析
1. `$UPUP_MIGRATE_FROM`（显式覆盖）
2. `~/.pi/agent`（当存在）
3. `resolveAgentDir()` 结果（排除 cwd-fallback 与 home-upup-agent）

### 目标
恒为 `~/.upup/agent`，不存在则创建。

### 迁移内容
- `settings.json`（完整复制，含 packages 列表）
- `themes/*.json`
- `extensions/skills/prompts/*.md` 仅记录在 settings.json 的 `packages` 字段中，**不**直接复制 — 它们由 `upup plugin install <source>` 重新从 npm/git 拉取

### 测试
11 条 contract test 覆盖：status / migrate / dry-run / force / 跳过冲突 / UPUP_MIGRATE_FROM 覆盖 / verify / help / unknown subcommand。

---

## 四、`upup plugin` — DefaultPackageManager 包装

新命令族，让 UpUp 用户直接管理 Pi 包生态，无需切换工具。

### 子命令
- `upup plugin install <source> [--local]` — `DefaultPackageManager.installAndPersist`
- `upup plugin uninstall <source> [--local]` — `DefaultPackageManager.removeAndPersist`
- `upup plugin list` — `DefaultPackageManager.listConfiguredPackages`
- `upup plugin update [<source>]` — `DefaultPackageManager.update` 或 `update(source)`
- `upup plugin reload` — `DefaultResourceLoader.reload()`，无需重启即重新发现已装包（extensions/skills/prompts/themes 计数）
- `upup plugin help`

### 源格式（与 Pi 一致）
- `npm:pkg[@version]`
- `git:<url>[#ref]`
- `/abs/path` 或 `./rel/path` 或 `~/...`
- bare `pkg` → 自动加 `npm:` 前缀

### 与 `agentDir` 集成
每次执行都通过 `resolveAgentDir()` 计算当前 agentDir，保证 `upup plugin install` 与 UpUp runtime 看到的是同一份 `settings.json`。

### 测试
6 条 test 覆盖：help / install missing / uninstall missing / list empty / list creates agentDir / unknown subcommand。

---

## 五、TUI 问题清单与已修

| ID | 问题 | 状态 |
|---|---|---|
| P-TUI-1 | `in-memory-chat-history.ts` 用 `callLlm` 旁路生成 summary | 🟡 不修 — `callLlm` 是合理用法（Pi 没内置 `summarize_turn` 工具），保持 |
| P-TUI-2 | `agent-runner.ts:316` `TOOLS_REQUIRING_APPROVAL = ['write_file', 'edit_file', 'bash']` 硬编码 | ✅ **已修** — 提取为 `DEFAULT_APPROVED_TOOL_SEED` 模块常量 + constructor `additionalApprovedToolNames` 钩子 |
| P-TUI-4 | `prompt-runner.ts:62` `deepseek-v4-flash` 硬编码 | ⚪ **非缺陷** — 指向 `@upup/utils/model-defaults.ts` 的 `DEFAULT_MODEL` 单一常量，属预期默认值 |
| P-TUI-3 | `agent-runner-types.ts` 维护双份消息类型 | 🟡 不修 — `pi-ai.Message` 与本地 `HistoryItem` 语义不同（前者是 LLM 流，后者是 UI 流），强行复用会破坏渲染层 |
| P-TUI-5 | `agent-runner.ts` 608 行 | 🟡 不在本轮 scope；可在后续 Phase C 拆 4 个文件（runner / events / approval / tools） |
| P-TUI-6 | `editor.autocomplete` 全局注入 175 个 user skill | 🟡 与 `verifyPiResourceTrust` fail-closed 已守门；不强制 override |
| P-TUI-7 | `tui/in-memory-chat-history.ts` 1450 char 截断的 answer preview 不可调 | 🟡 不在本轮 scope |
| P-TUI-8 | `tui/agent-runner.ts` 异步消息队列 + `messageQueue.dequeueAll()` 时序 | 🟡 不在本轮 scope |

**本轮修复**：P-TUI-2 已落地，文件变更可见 git diff；typecheck 0 errors；pi-tui-app 232 tests 全部通过。

---

## 六、ACP / pi-protocol 兼容性

### 现状
UpUp 当前有 3 种 transport：
- `@upup/pi-tui-app` — Ink TUI（同进程）
- `@upup/pi-bridge` — WebSocket bridge（token + audit log）
- `@upup/pi-stdio` — JSON-RPC over stdio（`upup --stdio`）

均**非 CBOR**，与 `@earendil-works/pi-protocol`（CBOR 编码 + length-prefixed framing）不兼容。

### 兼容路径
1. **Phase D-1**：导入 `@earendil-works/pi-protocol` + `@earendil-works/pi-client`，把 `@upup/pi-bridge` 的 WS 协议升级为 CBOR envelope（保持 WS 传输）
2. **Phase D-2**：用 `@earendil-works/pi-server` 暴露 `upup --mode rpc`，让外部 Pi client 可连
3. **Phase E**：把 UpUp 自己的 JSON-RPC method 名映射到 ACP（`session/create` → `session/new` 等）

### ✅ ACP 适配层已落地（`@upup/pi-stdio/src/acp.ts`，280 行）

不再只是「差 method 名映射」——完整的双向翻译表现在已经就位：

| 能力 | 实现 |
|---|---|
| method 映射 | `ACP_TO_UPUP_METHOD`：`session/new`→`session/create`、`session/load`→`session/resume`、`session/prompt`→`stream`、`session/cancel`→`cancel` |
| 自动检测 | `isAcpExclusiveMethod()` — ACP 独有 method 名触发 ACP 模式；`initialize` **故意排除**（两协议同名不同形，否则会劫持 UpUp-native 会话） |
| 事件翻译 | `mapUpupEventToAcpUpdate()`：`thinking`→`agent_thought_chunk`、`stream_progress`→`agent_message_chunk`、`tool_start`→`tool_call`、`tool_progress`/`tool_end`/`tool_error`→`tool_call_update`、`done`→`agent_message_chunk` |
| tool kind 分类 | `classifyToolKind()`：read/edit/execute/search/fetch/think/other |
| 能力协商 | `buildAcpInitializeResult()`：`protocolVersion` + `agentCapabilities.loadSession` + `promptCapabilities{image,audio,embeddedContext}` + `authMethods` |
| prompt 解析 | `translateAcpPromptParams()`：string 或 ContentBlock[] → 单 string |
| 结束原因 | `resolveAcpStopReason()`：`end_turn` / `cancelled` / `max_turn_requests` |

### 服务器接线

- `createStdioServer(runtime, { acp: true })` 显式 ACP 模式
- CLI：`upup --acp`（等价 `--stdio` + ACP 能力声明）
- 无 flag 时从首个 ACP 独有 method 名自动切换
- ACP 模式下 `session/prompt` 不立即应答，等 turn 结束回 `{ stopReason }`；中间输出全部走 `session/update` notification
- ACP 模式下 UpUp-native 的 `event` notification 不再泄漏

### 验证

- 21 条纯函数 contract test（`acp.test.ts`）
- 6 条端到端 server 集成 test（`acp-server.test.ts`，内存 PassThrough 驱动真实 readline 循环）
- 覆盖：ACP initialize / prompt 流 / 无 event 泄漏 / session/new 形状 / 自动检测 / UpUp-native 回归

### 与 CBOR（`@earendil-works/pi-protocol`）的关系
ACP 是 JSON-RPC 风格，与 CBOR 互补（ACP 在协议层，CBOR 在编码层）。UpUp 当前的 stdio JSON-RPC 现在已经是 ACP 兼容的；CBOR 是独立的 Phase D 工作。

---

## 七、微内核 + 插件化架构（目标态）

### 当前瓶颈
- 48 个 workspace package 都是 UpUp internal — 没有公开 plugin contract
- Pi 包可以通过 `DefaultPackageManager` 安装到 `~/.upup/agent/{extensions,skills,...}/`，但 UpUp 的 runtime 必须重启才能识别
- 无 facet host，所有 Pi package 都通过 `@upup/pi-app/default` 静态装配

### 目标架构
```
┌────────────────────────────────────────────────────────────┐
│ @upup/pi-app — Microkernel                                  │
│   ├── getPiNativeApp() — 唯一装配入口（保持）                │
│   ├── createFacetHost(chord) — 动态 facet 注册              │
│   └── reloadPackages() — 热加载 Pi package 变更             │
└────────────────────────────────────────────────────────────┘
                    │ ↑ ↓
┌────────────────────────────────────────────────────────────┐
│ @upup/pi-resource-composition                               │
│   ├── agent-dir.ts          — 7 层优先级（已修）            │
│   ├── package-manager-adapter.ts — DefaultPackageManager     │
│   ├── resource-loader-bridge.ts   — DefaultResourceLoader    │
│   └── package-isolation-contract.ts — piPackagePaths 守门   │
└────────────────────────────────────────────────────────────┘
                    │ ↑ ↓
┌────────────────────────────────────────────────────────────┐
│ Pi 生态（外部插件，零修改接入）                              │
│   ├── Pi package via npm/git/local — upup plugin install    │
│   ├── InlineExtension via Pi registerExtension               │
│   ├── chord facet via @earendil-works/chord (Phase B)        │
│   └── CBOR client via @earendil-works/pi-client (Phase D)    │
└────────────────────────────────────────────────────────────┘
```

### 关键交付（按优先级）
1. **M1 — 插件即装即用**（已落地 90%）：`upup plugin install <pkg>` 写 settings.json + 拉取 npm/git；下次启动 `DefaultResourceLoader.resolve()` 自动加载
2. **M2 — 热加载**：runtime `reloadPackages()` API，监听 settings.json change → 重新 resolve + dispose old facet host
3. **M3 — chord facet 双桥**（Phase B）：`defineFacet(facet)` ↔ `InlineExtension(extensionApi)` 双向转换，让 chord 插件也能跑
4. **M4 — CBOR transport**（Phase D）：把 bridge / stdio 升级到 CBOR
5. **M5 — ACP method 映射**（Phase E）：method name adapter

---

## 八、本轮提交清单

### 新增
- `packages/pi-cli-bootstrap/src/openbuddy.ts`（324 行）— openbuddy migrate 核心
- `packages/pi-cli-bootstrap/src/openbuddy.test.ts`（123 行，11 tests）
- `packages/pi-cli-bootstrap/src/plugin.ts`（约 280 行）— DefaultPackageManager 包装 + reload
- `packages/pi-cli-bootstrap/src/plugin.test.ts`（约 75 行，8 tests）
- `packages/pi-stdio/src/acp.ts`（280 行）— ACP 双向翻译层
- `packages/pi-stdio/src/acp.test.ts`（约 200 行，37 tests）
- `packages/pi-stdio/src/acp-server.test.ts`（约 170 行，6 tests）— 端到端 server ACP 集成
- `packages/pi-resource-composition/src/chord-facet.ts`（约 260 行）— Pi package ↔ chord Facet 桥
- `packages/pi-resource-composition/src/chord-facet.test.ts`（约 200 行，15 tests）

### 修改
- `packages/pi-resource-composition/src/agent-dir.ts` — 新增 `home-upup-agent` 优先级
- `packages/pi-resource-composition/src/agent-dir.test.ts` — 11 条 test（+2）
- `packages/pi-cli-bootstrap/src/index.ts` — 导出 `runOpenBuddyCommand` + `runPluginCommand`
- `packages/pi-app/src/entry.ts` — wire `openbuddy` / `plugin` / `--acp` 到 CLI
- `packages/pi-tui-app/src/tui/agent-runner.ts` — 提取 `DEFAULT_APPROVED_TOOL_SEED`，constructor 增加 `additionalApprovedToolNames` 钩子
- `packages/pi-stdio/src/server.ts` — ACP 模式接线（method 翻译 + session/update 通知 + stopReason 响应）
- `packages/pi-stdio/src/index.ts` — 导出 `./acp`
- `packages/pi-resource-composition/src/index.ts` — 导出 `./chord-facet`
- `package.json` — 显式 pin `@earendil-works/chord@0.85.1`；新增 `verify:pi-plugin-e2e` / `verify:pi-acp`
- `docs/pi-ecosystem-audit-2026-09-15.md` — 本文档

### 新增验证入口
- `bun run verify:pi-plugin-e2e` — 插件生命周期端到端（install → reload → list → uninstall）+ chord facet host 集成（7 tests）
- `bun run verify:pi-acp` — ACP 翻译层 + server 集成（43 tests）

### 测试基线
- 修改前：2154 pass / 0 fail
- 修改后：2241 pass / 0 fail（净 +87）
- `bun run typecheck` → 0 errors
- `bun run check:pi7` → 48 manifests / one factory / no global registries
- `bun run check:module-boundaries` → 48 packages / 2 root src modules / no cycles

---

## 九、后续计划（按杠杆排序）

### ✅ Phase 0.1a — 手动热加载（已完成）
`upup plugin reload` 已落地：调用 Pi `DefaultResourceLoader.reload()` 重新发现
extensions/skills/prompts/themes，并打印计数。无需重启即可看到新装包。
覆盖：`packages/pi-cli-bootstrap/src/plugin.test.ts` 2 条 test。

### ✅ Phase 0.1b — 端到端插件生命周期验证（已完成）
`scripts/verify-pi-plugin-e2e.test.ts`（5 tests）+ `bun run verify:pi-plugin-e2e`：
- 真实 Pi package（manifest 带 `pi` 块声明 extensions + skills）→ `upup plugin install` → settings.json 写入
- `upup plugin reload` → **extensions 计数 ≥ 1**（证明插件声明的 extension 真的被加载）
- `upup plugin list` → 解析出 installedPath
- 重复 install 幂等（packages 仍为 1 条）
- `upup plugin uninstall` → settings.json 清空

**这是「外部工具集成 Pi 无需修改 UpUp」的可执行证据**：测试里的 package 只声明 Pi 标准
manifest 字段，UpUp 侧零改动即完成安装 + 发现 + 卸载。

### 🔴 Phase 0.1c — 自动热加载（剩余，1 周）
手动 reload 已可用；下一步是免手动：
- `packages/pi-resource-composition/src/package-reloader.ts` — 监听 agentDir settings.json 变化
- `@upup/pi-app` 暴露 `getPiNativeApp().reloadPackages()` API
- `@upup/pi-bridge` 暴露 `bridge/notify-reload` 事件
- TUI 收到 reload 信号后自动刷新 system prompt + tools 列表

### ✅ Phase 0.2 — M3 chord facet 桥（已完成）
`packages/pi-resource-composition/src/chord-facet.ts`（约 260 行）+ `chord-facet.test.ts`（15 tests）：

| 能力 | 实现 |
|---|---|
| Facet 映射 | `piPackageToFacet()` — 一个 Pi package → 一个 chord `Facet`，id `pi-package:<manifest.name>` |
| 服务契约 | `UPUP_PLUGIN_REGISTRY`（`local: true`，永不远程发布）暴露挂载清单 |
| 写侧隔离 | `MutablePluginRegistry.mount()/unmount()/unmountIfCurrent()/replaceAll()` **不**进入服务契约 — chord 会把 `provide()` 的值包成成员受限 handle，写侧只由 adapter 闭包持有 |
| Reload 双档 | `in-place`（id 集不变 → chord 原生 `host.reload()`，消费者 handle 不断开）/ `regeneration`（增删包 → 新 generation，旧 generation dispose） |
| 关键坑 | chord 的 in-place reload **先激活新 facet 再 dispose 旧的**；无条件 `unmount(id)` 会让退休的那一代删掉自己的替代者 → 用 `unmountIfCurrent(id, expected)` 做实例比较 |
| 契约校验 | chord 要求同一 generation 内 facet id 唯一且 service requirements/provisions 不变；适配层按 id 去重（后者胜出，与 settings.json 语义一致） |

**为什么需要双档**：chord 的 `reload()` 是纯 replace-in-place（要求每个 id 已激活且 service 形状不变），它**不能**表达增删包。UpUp 因此在其上补一层 generation 管理，既不放弃 chord 的原子性保证，又能表达安装/卸载。

**验证**：
- `chord-facet.test.ts` 15 条 contract test（id 命名空间 / 计数投影 / 去重 / in-place vs regeneration / activate+own 清理 / 注入 registry）
- `verify-pi-plugin-e2e.test.ts` 用**真实 `PiPackageCatalog` 产出的 record**（不是合成对象）跑通 facet host + in-place reload

**生产接线**：`upup plugin reload` 现在在资源计数之后追加 facet 层报告 —

```
✓ reload complete
  extensions: 1
  skills:     20
✓ chord facets mounted: 1
  facet pi-package:@upup-e2e/ext-plugin v0.0.1 [session]
```

trust policy 的 `pinnedPackages` / `allowedSources` 由**磁盘上的 package.json** 推导（磁盘上的版本就是安装 pin），manifest 读不出来的包按 `facet skipped: <理由>` 降级报告，不影响资源 reload 结果。

### 🟢 Phase 0.2b — chord 服务化（剩余）
- 把 UpUp 的 TUI/agent services 暴露为 chord `defineService()` 契约
- 让第三方 chord facet 能消费 UpUp 能力（而不只是被挂载）
- TUI 集成 `SlashCommands` / `PresentationUI` / `AgentController` services

### 🟡 Phase 0.3 — M4 CBOR transport（2 周）
- 引入 `@earendil-works/pi-protocol` + `pi-client` + `pi-server`
- `@upup/pi-bridge` 升级 WS 协议为 CBOR envelope
- UpUp 暴露 CBOR server（等价 `pi --mode rpc`）
- UpUp 能用 Pi client 连外部 Pi server

### ✅ Phase 0.4 — M5 ACP method 映射（已完成，见第六节）
- `@upup/pi-stdio/src/acp.ts` 完整翻译层 + 6 条端到端 server 集成 test
- `upup --acp` CLI flag + 无 flag 自动检测

### 🟢 Phase 0.5 — TUI 内部整理（1 周）
- 拆 `agent-runner.ts` 608 行 → 4 文件
- 修 `prompt-runner.ts:62` `deepseek-v4-flash` 硬编码
- 解决 `editor.autocomplete` 全局 175 skill 注入

### 🟢 Phase 0.6 — 投资 skill 包治理（1 周）
- 整理 `~/.agents/skills` 与 Pi package `pi.skills` 优先级
- `spec.skills` 白名单机制（已部分实现）
- `verifyPiResourceTrust` 扩到覆盖 `.agents/skills` 自动发现

---

## 十、增量补丁 (2026-09-16)

本轮把上一轮留下的高优先级清理项一次性收口：

### A. `UPUP_HOME` 全栈统一（修复 13 处散写）

之前 `~/.upup` 的解析散在 13 个包：`utils/env.ts`、`hooks/index.ts`、`sdk/transport/stdio-transport.ts`、`pi-cli-bootstrap/{onboarding,doctor}.ts`、`pi-tui-app/utils/config-validation.ts`、`pi-finance-sdk/sandbox-{trading,read}.ts`、`pi-observability/recorder.ts`、`pi-platform/trading/sandbox-engine.ts`、`pi-platform/memory.ts`、`pi-session/migrate.ts`、`pi-app/entry.ts`、`scripts/migrate-storage.ts`。其中三处有真实泄漏：

- `packages/utils/src/env.ts:8` 把 `GLOBAL_CONFIG_DIR` 在 import 时硬编码为 `~/.upup`，dotenv 启动时就锁了真实路径——这意味着 `bun test` 在 preload 之前触发的副作用会污染 `~/.upup/.env`。
- `packages/pi-platform/src/memory.ts:38` 的 `stateFile` 默认 `~/.upup/sandbox-state.json` 走 `UPUP_MEMORY_DIR` 但 fallback 不接 `UPUP_HOME`，与同包的 `mcp.ts` / `heartbeat.ts` / `cron.ts` 不一致。
- `packages/pi-config/src/index.ts:34` 的 `defaultUpupRoot()` 是早期 inline 写法，与 `utils/paths.ts#getUpupHomeRoot` 双定义。

修复方案：

- `packages/utils/src/paths.ts` 已经导出 `getUpupHomeRoot()` 与 `UPUP_HOME_ENV`。所有 utils 用户（`pi-tui-app`、`pi-cli-bootstrap`、`pi-session`、`pi-platform` 的 sandbox-engine）改成调用 `globalUpupPath()` / `getUpupHomeRoot()`；非 utils 用户（`hooks`、`pi-finance-sdk`、`pi-observability`、`sdk`、`pi-app`、`utils/env.ts`）改用仓库既有的 inline 模式 `process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup')`，与 `pi-platform/mcp.ts` 同款。
- `pi-config/src/index.ts` 收敛到单表达式 `resolve(process.env[UPUP_HOME_ENV]?.trim() || join(...))`，消除「helper 多定义」。
- `pi-platform/memory.ts:38` 的 fallback 加上 `UPUP_HOME` 接管，与同包对齐。

### B. `check:upup-home` 静态门禁

新增 `scripts/check-upup-home.ts`（60 行 + 4 个 unit test）+ `scripts/check-upup-home.test.ts` 守门：

- 扫描 `packages/*/src/**/*.ts` 与 `src/**/*.ts`
- 行内同时出现 `homedir()` 与 `'.upup'` 且未提及 `UPUP_HOME` / `getUpupHomeRoot()` / `UPUP_HOME_ENV` → 失败
- 白名单：`src/utils/test-home-isolation.contract.test.ts`、`src/utils/paths.test.ts`（这俩是故意比较 sandbox 与真 home）

CI 矩阵新增 `upup-home` task。当前 0 违例。

### C. `bun test` 沙箱隔离（preload）

之前的 bug：`src/utils/config-sources.test.ts:22` 在 `beforeEach` 里 `rmSync(join(homedir(), '.upup'))`——`bun test` 跑一次删一次用户真实配置。修复：

- `bunfig.toml [test] preload = ["./scripts/test-preload.ts"]`：preload 把 `UPUP_HOME` 指向 `mkdtempSync(tmpdir()/upup-test-home-XXX)/.upup`，并在 `process.on('exit')` 时 rm。`@upup/utils` / `@upup/pi-config` / `@upup/hooks` / `@upup/sdk` / `@upup/pi-bridge` / `@upup/pi-finance-sdk` / `@upup/pi-observability` 等模块级常量都在 preload 之后才求值，自动落到沙箱。
- `src/utils/test-home-isolation.contract.test.ts` 新合同（3 cases）守门：`UPUP_HOME` 必设、必在 `tmpdir()` 下、`SETTINGS_FILE` / `MEMORY_DIR` / `SESSIONS_DIR` / `getConfigPaths().globalFile` 全部落在沙箱内。
- `src/utils/paths.test.ts`、`packages/pi-cli-bootstrap/src/config.test.ts` 把 scratch 目录从 `~/.upup-test-commands` 改成 `tmpdir()`，避免用户 home 残留。
- `packages/gateway/src/gateway-sla-runner.test.ts:61` 之前的 `delete process.env.UPUP_HOME` 会让 preload 失效——改成 capture/restore。
- `packages/pi-bridge/src/server.ts:95` 默认 sessions dir 改用 `UPUP_HOME || HOME || homedir()`，bridge 测试不再写真实 `~/.upup/sessions/<id>.json`。

验证：`bun test` 跑完后 `find ~/.upup -type f | shasum` 与跑前对比，逐字节相同。

### D. `upup openbuddy` 新增 `~/.openbuddy/agent` legacy 源

`upup openbuddy` 命令与原 OpenBuddy 桌面应用同源，但 source resolution 之前只看 `~/.pi/agent` 与 `resolveAgentDir()`，把同名 legacy 目录 `~/.openbuddy/agent` 漏了。修复：

- `pickSourceDir()` 在 `~/.pi/agent` 之后、`resolveAgentDir()` 之前加 `~/.openbuddy/agent`（line 90-92）。
- `printHelp()` 的源优先级列表与 `runStatus()` 的错误提示同步更新。
- 2 条新 contract test：`status` 在 `~/.pi/agent` 不存在时挑选 `~/.openbuddy/agent`；`migrate` 把 legacy `defaultProvider: "openbuddy-legacy"` 正确复制到 `~/.upup/agent/settings.json`。

### E. Pi 插件作者指南（`docs/pi-plugin-authoring.md`）

新增 222 行作者指南，覆盖四种插件形态（manifest / inline / chord / hybrid）、`pi.*` 字段契约、ACP 兼容性、生命周期验证 5 项 gate、第三方工具无修改接入 UpUp 的两条路径（wrapper / ACP bridge），以及 UpUp 自带的 6 个参考插件清单。

### 验证基线 (2026-09-16)

```
bun test                          → 2251 pass / 0 fail / 240 files / 32.52s
real ~/.upup 字节对比              → diff 为空（运行前后 hash 完全一致）
bun run typecheck                 → 0 errors
bun run check:pi7                 → 48 manifests / one factory
bun run check:module-boundaries   → 48 packages / 2 root src / no cycles
bun run check:pi-packages         → all pinned / side-effects ok
bun run check:pi-deletion-audit   → passed (strict)
bun run check:pi-package-audit    → passed (strict)
bun run check:js-suffix           → 1034 TS/TSX / 0 internal .js imports
bun run check:upup-home           → 0 违例（NEW 门禁）
bun run lint:scc                  → SCC + Layer 全部通过
```

`bun.lock`：`@upup/pi-runtime` 从 `packages/utils` 的 `devDependencies` 移到 `dependencies`（lockfile drift 修正，仓库本来就该是 dependencies）。

### F. `upup plugin install|uninstall|update` 自动 reload (Phase 0.1c 部分)

之前 lifecycle 命令装完包不通知 runtime，用户必须再 `upup plugin reload`。修复：

- 新增 `reloadAndReport(opts)` helper（22 行）：解析 agentDir、`ensureAgentDir`、建 `DefaultResourceLoader`、`await loader.reload()`，打印 extensions/skills/prompts/themes 计数。
- `runInstall` / `runUninstall` / `runUpdate` 在成功 path 末尾调用 `reloadAndReport(opts)`（除非传 `--no-reload`）。
- 帮助文本补 `--no-reload` 描述。
- 2 条新 test：`install` 默认 inline 输出 extensions/skills 计数；`install --no-reload` 抑制计数。

剩余 Phase 0.1c 部分（settings.json watcher + bridge notify-reload event）需要 runtime 协作，留到下一轮。

### G. Phase 0.5 TUI 拆分（agent-runner.ts 626 → 544 行 + 2 个新文件）

`packages/pi-tui-app/src/tui/agent-runner.ts` 之前 626 行混杂三件事：Pi canonical event → UiEvent 翻译、port 接口定义、`AgentRunnerController` 类。拆成 4 个文件：

| 文件 | 行数 | 职责 |
|---|---|---|
| `agent-runner-types.ts` | 71 | 类型定义（AgentConfig / UiEvent / DisplayEvent / HistoryItem / WorkingState）— 已存在 |
| `agent-runner-ports.ts` | 76 | 6 个 port 接口 + `ChangeListener` / `RenderableMessage` / `HistoryMessageListener` — **NEW** |
| `agent-runner-event-bridge.ts` | 75 | `toUiEvent` + `DEFAULT_APPROVED_TOOL_SEED` — **NEW** |
| `agent-runner.ts` | 544 | `AgentRunnerController` 类 + `TurnStats` / `RunQueryResult` |

新文件用 `import type` 导出纯类型，确保 `index.ts` 重导出时不带运行时副作用（修了 doctor.test.ts 报 `export 'AgentRunnerFileHistory' not found` 的语法错误）。`agent-runner.ts` 通过 `export type { … } from './agent-runner-ports'` 保持对外 API 兼容——`@upup/pi-tui-app`、`packages/pi-tui-app/src/cli.ts` 等下游 consumer 无需改。

新增 10 条 lockdown test（`agent-runner-event-bridge.test.ts`）锁死 `toUiEvent` 的 switch 全部分支：`thinking` / `text_delta`（含空 delta 丢弃）/ `tool_start` / `tool_end`（成功 vs 错误）/ `compaction_start`/`compaction_end` / `run_end` / 未知事件类型。

剩余 Phase 0.5 项：TUI 主编辑器全局 175 skill 注入通过 `spec.skills` 白名单机制收敛（已部分实现，留待 Phase 0.6 一并治理）。

### 验证基线 (2026-09-16 累计)

```
bun test                          → 2263 pass / 0 fail / 241 files / 29.93s
real ~/.upup 字节对比              → diff 为空
bun run typecheck                 → 0 errors
check:pi7                         → 48 manifests / one factory
check:module-boundaries           → 48 packages / 2 root src / no cycles
check:pi-packages                 → all pinned / side-effects ok
check:pi-deletion-audit           → passed (strict)
check:pi-package-audit            → passed (strict)
check:js-suffix                   → 1037 TS/TSX / 0 internal .js imports
check:upup-home                   → 0 违例
lint:scc                          → SCC + Layer 全部通过
```
