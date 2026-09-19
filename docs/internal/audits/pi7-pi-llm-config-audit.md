# UpUp Pi 化充分性审计与 LLM 配置使用方案

> 日期：2026-09-15
> 范围：`bun run dev` 启动验证、Pi 0.85.1 复用度审计、isError 桥接修复、typecheck 全量归零、LLM 配置面与 SettingsManager / agentDir 审计
> 基线：`main @ 14ddd20`，152 处 `M` + 1 处 `??` 工作区改动（已在本次任务中收敛）
> 上游：`@earendil-works/pi-{agent-core,ai,coding-agent,tui}` 0.85.1

---

## 一、`bun run dev` 启动验证

```text
$ bun run src/index.tsx --version
UpUp v2026.6.12

$ bun --watch run src/index.tsx  （TUI 渲染验证）
Select provider
  1. OpenAI  2. Anthropic  3. Google  4. xAI
  5. Moonshot AI  6. DeepSeek  7. OpenRouter  8. Ollama
Welcome to UpUp v0.1.0
Your AI assistant for deep financial research.
Model: DeepSeek V4 Pro
Starting setup wizard...               ← 见 §四 "Pi LLM 配置未被使用"
```

TUI 启动正常、Provider 选择器、Welcome banner、setup wizard 链路完整。无 crash。

### 静态门禁与回归

| 检查 | 结果 |
|---|---|
| `bun run typecheck` | **0 errors** |
| `bun test` | **2129/2129 pass / 0 fail**（229 files，7353 expects，32.5s） |
| `bun run check:pi7` | 48 manifests、1 factory、no global registries |
| `bun run check:pi-packages` + `check:pi-side-effects` | 27 tool declarations，覆盖率 100% |
| `bun run verify:pi7-final` | 22/22 contracts passed（C15 skipped：凭证未到位） |
| `bun run report:pi7` | 48 workspace · 2 root production files · 19 piNative · 538 declared tools · 217 skills（47 repo + 170 external）· progress 80% |

---

## 二、本次任务修复的真 P0/P1 问题

### 2.1 isError 语义桥接（最严重正确性缺陷）

**症状**：UpUp 的扩展工具写成 `return { content, isError: true, details }`，但 Pi 的 agent loop 仅从「`execute()` throw」或 `afterToolCall` / `tool_result` hook 返回 `{isError:true}` 这两条路径上读取 `isError`。UpUp 的 inline `{isError:true}` 被静默丢弃——所有 `place_trade_order`、approval-denied、policy-denied 路径都"对模型显示为成功调用"，是最严重的合规错误。

**根因**：Pi 的 `agent-loop.js:477` `return { result, isError: false }` 是丢点；`ToolDefinition.execute` 5 参签名 `(toolCallId, params, signal, _onUpdate, _ctx)`；`ToolResultEventResult.isError?` 在 `extensions/types.d.ts:835`。

**修复**：
1. 新建 `packages/pi-runtime/src/tool-result.ts`：
   - 暴露 `PI_TOOL_ERROR_MARKER = '__upupPiToolError'`、`PiToolResult<TDetails = unknown> = AgentToolResult<T> & { isError? }`、`wrapPiExtensionToolResults(base)`（在 `extensionsOverride` 上把 `isError:true` 重写为 `details[marker]=true`）、`createPiToolErrorBridgeExtension()`（订阅 `tool_result` hook 还原 `isError:true` 并剥掉 marker）。
   - 子路径 `./tool-result` 已加进 `packages/pi-runtime/package.json` exports/build 脚本。
2. 在 `packages/pi-session/src/agent-session-factory.ts` 把 `createPiToolErrorBridgeExtension()` 接到 `extensionFactories` 首位、`wrapPiExtensionToolResults` 接到 `extensionsOverride`。
3. 在 `packages/pi-session/src/session-adapter.ts#executeTool` 里把 marker 反解回 `isError:true`（直接 caller 绕过 hook）。
4. 新增合同测试 `src/runtime/pi/tool-error-bridge.contract.test.ts`（3 通过）：分别验证 a）extensionsOverride 把 failing 结果打上 marker；b）`tool_result` hook 还原 isError 并剥离 marker；c）healthy 结果 passthrough 不受影响。
5. **`createPiToolErrorBridgeExtension` 返回类型**：`ExtensionFactory`（不再是 `InlineExtension` 联合——直接调用会 TS2349）。本任务顺手收敛。

### 2.2 Platform 工具 ReferenceError / 静默降级

- `packages/pi-platform/extensions/index.ts#listPlatformWorktrees` 缺 import，运行 `list_worktree` 直接 ReferenceError。已修。
- `packages/pi-platform` 的 `buildSessionContext` 之前在 `sessionManager.buildSessionContext()` 缺席时静默回退到 `[]`——长会话恢复会丢上下文。已重写为优先用 `sessionManager.buildSessionContext()`，否则 `buildSessionContext(entries, leafId)`。

### 2.3 Finance-SDK 6 处 TS1117 合规 bug

`packages/pi-finance-sdk/extensions/index.ts` 的 `{details: {...real}, isError: true, details: undefined}`——同一对象字面量中 `details` 出现两次，JS last-wins 让 `policyAudit` / `evidence` 被丢弃，财务工具的合规审计直接被静默吞掉。已修 6 处。

### 2.4 Typecheck 153 → 0

- `packages/pi-capability-registry/src/index.ts`：补 `PiCapabilityHostShape`（contract/packageVersion 可选、`capabilities` 必填）；放宽泛型约束；callback host 用 `providers: Record<string, any>` 解 TS18046。
- 批量对齐 143 处 `execute` 签名为 Pi 的 5 参形状 `(toolCallId, params, signal, _onUpdate, _ctx)`。
- `signal: AbortSignal` → `signal?: AbortSignal | undefined`（~50 处），并相应调整 `signal?.aborted` / `signal?.addEventListener`。
- `packages/pi-finance-sdk/src/alt-data.ts`、`pi-research`（deep-search 改名为 `DeepSearchResult` 消除 barrel 冲突）、`pi-platform/src/mcp.ts`、`pi-investment-analysis` 等的本地类型校正。
- `packages/pi-notify/src/index.ts:45` + `sdk/src/transport/http-transport.ts:112` 的 `signal: AbortSignal.timeout(...)`（被正则误改）已还原。

---

## 三、本次新发现的 P1 级 "未充分 Pi 化" 问题

下列问题在本次任务中**未直接修改**（原因见 §五修复决策），证据已落实在 §四，可作为下一步 PR 基础。

### 3.1 agentDir = cwd 与 Pi 的 `.pi/agent` 契约不一致

`packages/pi-session/src/agent-session-factory.ts:402` 写死 `agentDir: cwd`，但 Pi 的 `getAgentDir()` 默认是 `~/.pi/agent`（受 `PI_CODING_AGENT_DIR` 覆盖）。这条值同时影响：

| 维度 | `agentDir: cwd`（现状） | Pi 契约 `agentDir: ~/.pi/agent` |
|---|---|---|
| user-scope skills/prompts/themes/extensions | 从 `<cwd>/skills` 等读取（仓库无该目录 → 0 加载） | 从 `~/.pi/agent/skills` 等加载（实测 +5 唯一 skills：`wren-*`） |
| `SYSTEM.md` / `APPEND_SYSTEM.md` | 从 `<cwd>/SYSTEM.md` 读取 | 从 `~/.pi/agent/SYSTEM.md` 读取 |
| `settingsManager` 协同 | （单独由 inMemory 决定，详见 §3.2） | 与 file-backed SettingsManager 协同 |
| auth / models | 默认正确（`createAgentSession` 未传 agentDir → fallback 到 `getAgentDir()`，实测 OK） | 同左 |

经验证：仅 skills 一项就有 5 个用户的 `~/.pi/agent/skills/wren-*` skills 缺失；其余都是潜在的 SYSTEM.md / prompts / extensions 缺口。

### 3.2 `SettingsManager.inMemory()` 丢弃用户 Pi settings.json

`packages/pi-session/src/agent-session-factory.ts:358` 用 `SettingsManager.inMemory()` 显式替换——意味着 `~/.pi/agent/settings.json` 的 `defaultProvider` / `defaultModel` / `defaultThinkingLevel` / `compaction` / `theme` / `providerRetrySettings` 等所有项被静默忽略，且 `session.setModel(persist:true)` / `/model` 持久化写到一个空 in-memory store。

实测对比（以本机 `~/.pi/agent/settings.json` 为真值）：

| Setting | inMemory（现状） | file-backed（真值） |
|---|---|---|
| defaultProvider | `undefined` | `lumos` |
| defaultModel | `undefined` | `gpt-5.6-luna` |
| compaction.enabled | `true` | `false` |
| theme | `undefined` | `dark` |
| providerRetry.timeoutMs | `undefined` | `3000000`（50 分钟，研究型会话必需） |
| providerRetry.maxRetries | `undefined` | `0` |
| defaultThinkingLevel | `undefined` | `off` |

**用户可见影响**：`bun run dev` 启动时显示 "Configuration incomplete - No AI provider configured / No model configured"，直接走 setup wizard——尽管 Pi 的 `~/.pi/agent/settings.json` + `auth.json` 已完整配置 `lumos/gpt-5.6-luna` + 凭证。这 100% 是"未充分使用 Pi LLM 配置"的症状。

### 3.3 模型  selector 与 Pi 40 provider catalog 错位

`packages/pi-tui-app/src/utils/model.ts:55-60` 的 `PROVIDERS` 从 `packages/utils/src/providers.ts` 的硬编码 8 项（openai/anthropic/google/xai/moonshot/deepseek/openrouter/ollama）派生。`getModelsForProvider` 只扫这个 8 元素表。

而 Pi 的 `builtinProviders()` 实测 **40 个**：`amazon-bedrock, ant-ling, anthropic, azure-openai-responses, baseten, cerebras, cloudflare-ai-gateway, cloudflare-workers-ai, deepseek, fireworks, github-copilot, google, google-vertex, groq, huggingface, kimi-coding, minimax, minimax-cn, mistral, moonshotai, moonshotai-cn, nvidia, openai, openai-codex, opencode, opencode-go, openrouter, qwen-token-plan, qwen-token-plan-cn, qwen-token-plan-individual, radius, together, vercel-ai-gateway, xai, xiaomi, xiaomi-token-plan-ams, xiaomi-token-plan-cn, xiaomi-token-plan-sgp, zai, zai-coding-cn`。

结合 `~/.pi/agent/models.json` 自定义 provider（实测：`minimax`、`custom_anthropic`），UpUp 的 selector / onboarding 完全看不到它们。这是"未充分使用 Pi 配置"的具体形态。

### 3.4 resolvePiModel 静默 fallback

`packages/pi-event-adapter/src/pi-model-bridge.ts#lookupPiModel` 只查 `getBuiltinModel` + ollama；用户配置 `minimax:MiniMax-M3` 时返回 `undefined`，Pi agent 静默走 `findInitialModel` 的 provider default，用户看到的 `/model` 没生效。

### 3.5 直接绕开 Pi 的 LLM 调用点

| 位置 | 调用 | 是否走 Pi provider |
|---|---|---|
| `packages/memory/src/embeddings.ts:86,97` | `https://api.openai.com/v1/embeddings`、`generativelanguage.googleapis.com/v1beta/models/{m}:batchEmbedContents` | **否**（raw fetch） |
| `packages/pi-research/src/search.ts:129` | `https://api.perplexity.ai/chat/completions`（sonar chat completion） | **否**（raw fetch + 自签鉴权） |

`pi-research` 的 perplexity 路径是一个真 LLM 推理，绕开了 `pi.registerProvider` + `ModelRuntime`，用户 `~/.pi/agent/auth.json` 的 perplexity 凭证 / 模型 catalog 完全不可见。

### 3.6 其它结构性发现（plan items）

- `bun run dev` 报告 `skills.total = 217`（`auto/project: 19, auto/user: 175`）——170 个外部 skills 从 `~/.agents/skills` 全量加载进每个会话的 system prompt，token 成本 / 误激活风险高。
- `packages/memory/src/embeddings.ts` 不在 `pi` manifest 路径里却仍在调用外部 LLM。
- 24/48 个 package 的 `pi` block 没有声明 `tools` / `nativeTools` / `resources` / `capabilities`（基础设施类包常见，可接受但应记录）。
- `~/.upup/settings.json`（测试键占位）与 `~/.pi/agent/settings.json`（真配置）双轨持久化；`packages/utils/src/config.ts` `getSetting`/`setSetting` 只读写前者。
- 仓库根有 6 个遗留 probe 文件（`probe.ts` / `probe2.ts` / `probe3.ts` / `probe-bridge.ts` / `probe-ctx.ts` / `probe-tmp.ts`），仅做调试用，被错误地以 `14ddd20 chore: 批量添加Bun运行时支持并修复代码问题` 提交到 main。本次任务已删除。
- repo root 有 421 个 `session-*.jsonl`、`.upup/` 644 个条目（含残留 `pkg` block 引用已删除路径），缺少 `bin` 字段、缺少模块边界自检时统一 allowlist。

---

## 四、充分使用 Pi LLM 配置 —— 实施指南

> 目标：让 UpUp 与 Pi 0.85.1 的 provider / model / auth / settings 平面打通。
> 关键包：`@earendil-works/pi-coding-agent`（`createAgentSession`、`SettingsManager`、`DefaultResourceLoader`）、`@earendil-works/pi-ai`（catalog）、`@upup/pi-runtime`（`model-registry.ts`、`custom-providers.ts`）。

### 4.1 模型目录（catalog）是唯一真值

- `@upup/pi-runtime/src/model-registry.ts` 已经封装：
  - `listPiProviderIds()`、`isPiProvider(providerId)`、`canonicalPiProviderId()`（处理 `gemini` → `google` / `kimi` → `moonshotai` / `grok` → `xai` / `moonshot` → `moonshotai`）。
  - `listPiModels(provider)`、`getPiModelInfo(provider, id)`、`findPiModelAcrossProviders(id)`。
  - `piProviderEnvKeys(provider)` 用 Proxy 录制 Pi 实际读的 env 名（认证、onboarding、doctor 用同一份）。
  - `hasPiProviderApiKey(provider)`：env key 存在且不是 `your-...` 占位。
- 全部从 `builtinProviders()` / `getBuiltinModels()` 读，不维护第二份表。**禁止在 `@upup/utils` 之外再维护 `PROVIDERS` 之类的硬编码表**（`packages/utils/src/providers.ts` 是历史遗留；保留但通过 `providers.test.ts` 锁表防漂移）。

### 4.2 Provider 注册（Ollama 之外的扩展点）

- `pi.registerProvider(id, config)`（在 inline extension factory 内部）由 `DefaultResourceLoader` 收集到 `extensionsResult.runtime.pendingProviderRegistrations`，在 `extensions/runner.js:190` 绑定时被 `modelRegistry.registerProvider(id, config)` flush。
- `pi.registerNativeProvider(provider)` 走 `pendingNativeProviderRegistrations`，flush 时直接 `modelRegistry.registerProvider(provider)`。
- 已有实现：`packages/pi-runtime/src/custom-providers.ts`
  - `createOllamaProviderExtension()`（`OLLAMA_PROVIDER_ID = 'ollama'`，默认 base url `http://127.0.0.1:11434`，context 128k，max-tokens 32k）
  - `OLLAMA_MODEL_COMPAT` 自动归一化 `llama3.2:3b` 之类
  - `fetchOllamaModels()` 拉 `OLLAMA_BASE_URL/api/tags`
  - `createOllamaProviderConfig(options)` 返回 Pi-compatible config
- 触发位置：`agent-session-factory.ts:407` 仅在 `isPiCustomProviderSpec(spec.model ?? DEFAULT_MODEL)` 为 true（即用户选了 ollama 模型）时注入。**新增自定义 provider 的正确姿势**：写一个 `createMyProviderExtension()` 工厂，依同样的条件加入 `extensionFactories`，并在 `custom-providers.ts` 集中管理。

### 4.3 API 凭证解析（顺序很重要）

```
checkApiKeyExistsForProvider(providerId)   ← packages/utils/src/env.ts
  → getApiKeyNamesForProvider(providerId)   → getProviderApiKeyEnvVars(providerId)
                                              （Pi canonical 名在前，UpUp 旧名兜底）
  → 优先级：process.env → ~/.upup/settings.json.apiKey (legacy 单 key) → 返回 boolean
```

- Pi 自己的 `~/.pi/agent/auth.json` 通过 `RuntimeCredentials(DefaultAuthStorage.create(authPath))` 加载；其中 `authPath` 在 `createAgentSession` 不传 `agentDir` 时 fallback 到 `join(getAgentDir(), 'auth.json')` → 即 `~/.pi/agent/auth.json`。
- Provider prefix 解析：`detectPiProvider('claude-*') → anthropic`、`gpt-* → openai`、`gemini-* → google`、`grok-* → xai`、`kimi-* → moonshotai`、`*/name → openrouter`，否则 deepseek。`canonicalPiProviderId` 再把 `gemini → google`、`moonshot → moonshotai` 规整。

### 4.4 /model 命令与 model picker

- 真正的 model 选择 UI 由 `ModelSelectionController`（`packages/pi-tui-app/src/tui/model-selection.ts`）接管 TUI overlay；`packages/commands/src/commands/model/model-impl.ts` 是 ts-nocheck 占位 stub，仅做 `context.model` 打印，**主入口是 `modelSelection.startSelection()`**（在 `cli.ts:446`、`:659` 触发）。
- 持久化：ModelSelectionController 调 `setSetting('provider'|'modelId', value)` 写入 `~/.upup/settings.json`（`packages/utils/src/config.ts`）。
- 重启读取：`getSetting('provider', DEFAULT_PROVIDER)`、`getSetting('modelId', null) ?? getDefaultModelForProvider(provider) ?? DEFAULT_MODEL`。
- 改进路径：用 `modelRuntime.getProviderModels()` / `getProviders()` 取代硬编码 8 项 `PROVIDERS`，把 Pi `models.json` 自定义 provider 也展示出来（解决 §3.3）。

### 4.5 Settings：把 Pi `settings.json` 接进来（重点：解决 setup wizard 误报）

最直接的接入点是 `packages/pi-session/src/agent-session-factory.ts:358`：

```ts
// 现状
const settingsManager = SettingsManager.inMemory();
```

要让它真正使用 Pi 的配置，且**不破坏 §3.6 中的"package isolation"合同**（`packages/pi-session/src/.../test.ts` 显式要求 `packages:[]` 时不加载第三方 Pi 包），正确做法是给 `SettingsManager.create(cwd, getAgentDir())` 之上叠加一个 `disablePackages: true` 的策略、或读 Pi 自己的 settings 然后只投影 `compaction` / `providerRetrySettings` / `theme` 等安全字段到 in-memory。最简形态：

```ts
const piAgentDir = getAgentDir();    // 受 PI_CODING_AGENT_DIR 控制
const settingsManager = SettingsManager.create(cwd, piAgentDir);
// 之后 createAgentSession 也传 agentDir: piAgentDir，确保 auth/models/settings 来自同一根。
```

**已实测的失败形态**：直接使用文件-backed `SettingsManager` 会让 `DefaultPackageManager.resolve()` 把 `~/.pi/agent/settings.json` 的 `packages: [npm:pi-web-access, npm:pi-mcp-adapter, npm:pi-subagents, ...]` 解析进来，导致 `packages:[]` 的 contract test 漏出 `memory_search` 等工具。本次任务临时 revert（仅文档化），未推进这个改动——它需要先加 `packageLoaded?: false` 的契约式覆盖。

### 4.6 模型解析（`resolvePiModel` + `resolvePiModelWithRuntime`）

`packages/pi-event-adapter/src/pi-model-bridge.ts#lookupPiModel` 仅查 catalog。**未** 查 `modelRuntime`：

- `modelRuntime.getModel('custom_anthropic', 'MiniMax-M3')` 在 `ModelRuntime.create({ modelsPath: ~/.pi/agent/models.json })` 后**可用**（已实测，provider list 出现 `custom_anthropic`）。
- 修复方案（plan 候选）：在 `PiAgentSessionFactory.createSession` 中**提前**构造一个 `ModelRuntime.create()`（默认路径同 `createAgentSession` 内部行为，不引入额外 IO），把它当 `modelRuntime` 传给 `createAgentSession`，同时把 `model: resolvePiModelWithRuntime({ spec, modelRuntime })` 作为唯一解析点。这样 `~/.pi/agent/models.json` 自定义 provider 与 `pi.registerProvider` 注入的 provider 都能被解析，零静默 fallback。

### 4.7 端到端验证清单（建议每次改动跑一遍）

```
bun run typecheck                          # 0 errors
bun test                                    # 2129/2129
bun run check:pi7                           # 1 factory · 48 manifests · 0 global registry
bun run check:pi-packages check:pi-side-effects
bun run check:module-boundaries
bun run verify:pi7-final                    # 22/22（C15 凭证到位后激活）
bun run dev                                 # provider selector + welcome + setup wizard
```

---

## 五、修复决策与后续计划

### 5.1 本次任务已修复（commit 候选）

| ID | 改动 | 验证 |
|---|---|---|
| F1 | 新建 `packages/pi-runtime/src/tool-result.ts` + 接线 `createPiToolErrorBridgeExtension` / `wrapPiExtensionToolResults` | 3 通过的合同测试 |
| F2 | `session-adapter.executeTool` 反解 marker | 同上 |
| F3 | `pi-platform` `listPlatformWorktrees` 补 import | typecheck 0 |
| F4 | `pi-platform` `buildSessionContext` 修静默 `[]` 退化 | typecheck 0 |
| F5 | `pi-finance-sdk/extensions/index.ts` 6 处重复 `details` 字面量 | typecheck 0 + 单元测试 |
| F6 | `pi-capability-registry` 放宽约束 | typecheck 0 |
| F7 | 143 处 `execute` 5 参签名对齐 | typecheck 0 + bun test |
| F8 | ~50 处 `signal?: AbortSignal` 放宽 | typecheck 0 + bun test |
| F9 | `pi-research` `DeepSearchResult` 重命名消除 barrel 冲突 | typecheck 0 |
| F10 | `pi-notify:45` + `http-transport.ts:112` 误改恢复 | typecheck 0 |
| F11 | `createPiToolErrorBridgeExtension` 返回 `ExtensionFactory`（本任务发现） | typecheck 0 |
| F12 | 删除 6 个 repo root `probe*.ts` 残留文件 | git status 干净化 |

### 5.2 下一步计划（按价值/风险排）

#### P1（高价值、需设计，本次未推）

| ID | 内容 | 设计要点 |
|---|---|---|
| P1-A | SettingsManager 与 agentDir 接入 Pi `.pi/agent` | 新增 `resolvePiAgentDir()`、`createPiSettingsManager()` 集中策略；用 `packageLoaded?:false` 覆盖 DefaultPackageManager 的 settings-driven package resolve，保留 Pi 的 compaction/retry/theme/auth/models；本机测试已出现"package isolation"破坏形态，必须先补 contract 再合入。 |
| P1-B | `resolvePiModelWithRuntime` + 工厂提前构造 ModelRuntime | 修 §3.4 静默 fallback；新增合同测试覆盖 `models.json` 自定义 provider。 |
| P1-C | `packages/pi-tui-app/src/utils/model.ts` 用 `modelRuntime.getProviderModels()` 取代 8 项硬编码表 | 改 onboarding / `PROVIDERS` 列表；同时把 onboarding 的 provider 列表同步换成 catalog 派生。 |
| P1-D | `packages/memory/src/embeddings.ts` 走 `pi.registerProvider('openai-embeddings' \| 'google-embeddings')` | 把 raw fetch 收编到 Pi provider catalog；用户凭证统一进 `~/.pi/agent/auth.json`。 |
| P1-E | `packages/pi-research/src/search.ts#searchPerplexity` 改 `pi.registerNativeProvider(perplexityProvider)` | sonar chat completion 走 Pi 推理 + token counting。 |

#### P2（中等价值，常规 PR）

| ID | 内容 |
|---|---|
| P2-A | skill scope tightening：默认只加载仓库 `.agents/skills` + 48 个包内 skills，`~/.agents/skills` 175 项需用户在 `~/.upup/settings.json` 显式开启（`"skills.global": true`）。新增 `report:pi-skill-scope` 守门。 |
| P2-B | 删除 repo root `session-*.jsonl`、`pkg` block 引用已删除路径（`src/evals`、`src/components`、`src/plugins`）；补 `bin` 字段；`scripts/clean-checkpoints.ts` 自动清理。 |
| P2-C | 24 个"无内容" `pi` block package：要么声明它们的 `commands` / `nativeTools` / `resources`，要么从 package.json 移除 `pi` key（避免与 AGENTS.md "manifest coverage 100%" 口径混淆）。 |
| P2-D | `packages/utils/src/providers.ts` 加 deprecation 注释，并迁移到 `@upup/pi-runtime/model-registry` 派生。 |
| P2-E | `~/.upup/settings.json` 与 `~/.pi/agent/settings.json` 双轨持久化：保留 UpUp 的 provider/modelId override，但新增 `~/.upup/settings.json` 投影层，把对 Pi 有意义的字段（compaction / retry / theme）回写到 Pi 的 settings.json。 |

#### P3（低优先级）

- 仓库 `.upup/` 644 条目历史回放裁剪；doctor 输出"会话数 N，清理候选 M"提示。
- `~/.pi/agent/SYSTEM.md` 项目级 vs 用户级冲突时的优先级提示。
- Pi 包与上层 0.85.1 锁定测试目前覆盖 5 包；扩展到全部 7 个 `@earendil-works/*` 子包。
- `upup docs` 子命令（基于 `env.example` 与本审计）输出"Pi LLM 配置使用手册"中文版。

### 5.3 风险与注意

- 任何动 `SettingsManager` / `agentDir` 的 PR 必须先加 contract test（`spec.packages:[]` 必须 0 工具），否则会破坏 Pi package isolation 合同（已在 §5.1-P1-A 阶段实测）。
- 不要从 `packages/utils` 之外维护 provider 元数据表——`@upup/pi-runtime/model-registry` 是唯一真值。
- `~/.pi/agent/auth.json` 的 `chmod 600` 由 Pi 自己负责；`saveApiKeyForProvider` 写到 `~/.upup/settings.json` 的路径未 chmod 600，本次未改，列为安全 follow-up（不改是因为用户启用了 Pi 原生凭证时这条路径不生效，但路径仍存在）。
- 不要 `git commit` / `git push` 除非用户确认。本次任务全程未触碰版本控制写入。

---


## 七、Provider Registry Pi-化收尾（2026-09-15 续）

### 7.1 目标
彻底删除 `@upup/utils/src/providers.ts` 中的手写 `PROVIDERS` 表，让 UpUp 的 provider 列表完全由 `@earendil-works/pi-ai` 的 `builtinProviders()` 提供。UpUp 只保留：
- 顶层 curated ordering（`PREFERRED_ORDER` 数组，10 个常用 provider 优先显示）
- Ollama（UpUp 通过 `pi.registerProvider` 注入，Pi catalog 不含）
- 兼容旧 `.env` 的 alias（如 `GOOGLE_API_KEY` → `GEMINI_API_KEY`）

### 7.2 改动落点
- `packages/utils/src/providers.ts` 重写为 142 行：调用 `listPiProviderIds()` / `getPiProviderInfo()` / `listPiModels()` / `piProviderEnvKeys()` 生成 `PROVIDERS`，`pickFastModel` 用 `(flash|mini|haiku|nano|lite|fast|small)` 正则启发式从 Pi catalog 挑 fast model，fallback 第一个 model。
- `packages/utils/src/providers.ts#resolveProvider` 改用 `@upup/pi-runtime/model-registry` 的 `detectPiProvider`（取代原手写 prefix scan）。
- `packages/utils/src/providers.ts#getProviderById` 通过 `canonicalPiProviderId` 解析 legacy alias（`moonshot`/`kimi`/`gemini`/`grok`），让旧 `.upup/settings.json` 继续生效。
- `packages/pi-runtime/src/model-registry.ts` 新增 `detectPiProvider(modelId)`，作为 model id → canonical Pi provider id 的唯一启发式（含 `MiniMax-` 前缀识别，覆盖 minimax / minimax-cn）。
- `packages/pi-event-adapter/src/pi-model-bridge.ts` 将原 `detectPiProvider` 实现改为从 `@upup/pi-runtime/model-registry` 再导出，保证旧 import path 不破。
- `packages/utils/src/providers.test.ts` 更新断言：旧 `moonshot → moonshotai`/`kimi → moonshotai` 等 legacy alias 现在都解析到 canonical id；新增 `MiniMax-M3` 解析为 `minimax` 的覆盖测试；filter Ollama 出 catalog-shape 断言。
- `env.example` 新增 `MINIMAX_API_KEY` 和 `MINIMAX_CN_API_KEY`。

### 7.3 验证结果（2026-09-15 22:16）
- `bun run typecheck` — 0 错误
- `bun test` — 2133 / 2133 通过
- `bun test packages/utils/src/providers.test.ts` — 9 / 9 通过（其中 3 个新增 alias / MiniMax 覆盖）
- `bun run check:module-boundaries` — 通过（48 packages / 2 root src）
- `bun run check:pi7` — 通过（单 factory、零生产 global registry）
- `bun run verify:pi7-final` — 22 / 22 通过
- `bun run dev` — `/provider` 选择器渲染 41 个 provider（Pi catalog 40 + Ollama），MiniMax / MiniMax CN 都在前 10 优先位，TUI 无行宽溢出
- `bun run report:pi7` — workspace 数、root src 行数、单 factory 校验无回归

### 7.4 剩余未推 P1（保持与 §五一致）
- `agentDir=cwd` 与 `.pi/agent` 契约不一致 → 由 §五 P1 持续跟踪
- `SettingsManager.inMemory()` 仍丢弃 Pi settings.json → §五 P1 持续跟踪
- `resolvePiModel` 在未知 provider / 未知 model 时仍返回 undefined 而不报警 → §五 P2 持续跟踪
- Provider 健康检查 / 失败重试 → §五 P3，纳入下一个 Sprint

### 7.5 结论
`PROVIDERS` 表已完全 Pi-化。后续若 Pi 上游增删 provider，无需改 UpUp 代码；只需在 `PREFERRED_ORDER` 调整 curated 顺序。MiniMax / MiniMax CN 由 Pi 0.85.1 catalog 直接覆盖，无需自定义 provider 注册。
## 六、结论

UpUp 在**架构层**是高度 Pi 原生：48 个 workspace package 全 manifest 化、唯一 `PiAgentSessionFactory`、27 个 `sideEffects` 全部声明、fail-closed policy 与 capability 协商齐备。`bun run dev` 启动、static gates、test 全部绿色。

真正的"未充分 Pi 化"集中在 **LLM 配置平面**：

1. agentDir = cwd 让 `~/.pi/agent/{skills,prompts,extensions,SYSTEM.md}` 静默丢弃；
2. `SettingsManager.inMemory()` 让 `~/.pi/agent/settings.json` 的 compaction / retry / theme / defaultProvider / defaultModel / defaultThinkingLevel 全部失效，`/model` 持久化到一个空 in-memory store；
3. 8 项 `PROVIDERS` 硬编码表遮蔽 Pi 40 provider catalog 与 `~/.pi/agent/models.json` 自定义 provider；
4. `resolvePiModel` 不查 `modelRuntime`，自定义 provider 走静默 fallback；
5. `packages/memory/embeddings.ts` 与 `packages/pi-research/search.ts` 直接打 raw fetch + 自签鉴权，不走 Pi provider registry。

修完 §5.2 P1 之后，UpUp 才能真正回答"用 Pi 的 LLM 配置"，而不是"用 UpUp 自己造的 LLM 配置"。
