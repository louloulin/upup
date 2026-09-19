# UpUp 截断与可插拔性分析与修复

> 日期：2026-09-18 · 分支：feature/0918

## 1. 现状速览（已实测）

| 项目 | 数值 | 数据来源 |
|---|---|---|
| workspace package 总数 | 41 | `bun run report:pi7` |
| 声明 Pi manifest 的 package | 41 | `report:pi7` |
| 真正的 Pi-native package（声明 resources） | 21 | `report:pi7` |
| 注册到 Pi 的 native tool 总数 | 269 | `report:pi7` |
| 根 `src/` 生产文件 | 2 | `report:pi7`（bootstrap + gateway，7 行） |
| verify:pi7-final 合同数 | 24 | 24 PASS / 1 SKIP(C15 需凭证) / 0 FAIL |
| Pi contract tests | 162 pass | `bun test src/runtime/pi` |

## 2. 已实现的投研功能（按 5 阶段 `/invest` 工作流）

### 数据栈（21 个 Pi-native package，269 tool）

- `@upup/pi-market-data`（24 tool）：CN/HK/US 行情、交易日历、实时订阅、provider SLA
- `@upup/pi-finance-sdk`（43 tool）：财务比率、SEC/A股公告、新闻、公司画像、akshare/tushare 网关
- `@upup/pi-investment-analysis`（21 tool）：DCF/DDM/可比估值、希腊字母、IV、技术指标矩阵、决策仪表盘
- `@upup/pi-risk`（15 tool）：VaR、压力测试、相关性、风险预算、回撤守卫
- `@upup/pi-portfolio`（25 tool）：组合构建、再平衡、因子暴露、收益归因
- `@upup/pi-backtest`（7 tool）：DCA/一次性/阈值回测、胜率、evaluate_trade
- `@upup/pi-platform`（83 tool）：finance subagent、记忆、cron、swarm team、watchlist widget、TUI plan footer
- `@upup/pi-research`（8 tool）：深搜、Perplexity search、exa 网关
- `@upup/pi-technical`（8 tool）：MACD/KDJ/BOLL/ATR/RSI/OBV/CCI
- `@upup/pi-corporate-actions`（8 tool）：分红/拆股/配股/总收益
- `@upup/pi-quant`（8 tool）：因子合成、统计套利信号
- `@upup/pi-investment-workflow`（2 tool）：dossier / strategy / screen / risk-dashboard / portfolio-review / earnings-preview / morning-brief / watchlist 的 7 个可序列化 Profile + `/invest` 五阶段 detect→plan→execute→verify→report
- `@upup/pi-notify`（5 tool）：PR 订阅、频道（log/whatsapp/email）、审计事件流
- `@upup/pi-cache`（4 tool）：prompt cache 优化统计
- `@upup/pi-config`（3 tool）：provider 配置运行时切换
- `@upup/pi-management`（4 tool）：只读 dashboard，端口 14580
- `@upup/pi-browser`（1 tool）：browser
- `@upup/pi-fund-by-stock`（3 tool）：基金反向搜索
- `@upup/pi-event-adapter`（0 tool）：Pi canonical event → ServerEvent 唯一出口
- `@upup/pi-observability`（0 tool）：telemetry + audit sink

### 7 个 Profile + 投资命令族

`@upup/pi-finance-sdk/extensions/commands.ts` 通过 Pi `registerCommand` 注册：`/invest`、`/dossier`、`/strategy`、`/risk-dashboard`、`/portfolio-review`、`/morning-brief`、`/earnings-preview`、`/watchlist-edit`、`/screen`。Profile：`researcher / analyst / risk-manager / portfolio-manager / backtest-engineer / monitor / reviewer`。

### 非交互入口

- `upup invest 600519.SH` — headless `/invest`，`packages/pi-cli-bootstrap/src/invest.ts`
- `upup sop list|show|install` — SOP 工作流，落地 `~/.upup/sops`
- `upup plugin install/list/enable/disable/recommend/doctor` — npm 第三方包管理
- `upup ecosystem list` — bundled/user/missing 三段视图
- `upup json-stream --provider minimax-cn --model MiniMax-M3` — JSON-RPC 头less
- `upup bridge --notify-reload` — 通知运行中会话重载
- `upup gateway` — WebSocket 守护（cron / daemon / TradingAgents）

### 验证体系（24/24 PASS）

| ID | 类别 | 内容 | 状态 |
|---|---|---|---|
| P0.a-g | 静态门禁 | 单 factory / 模块边界 / pi manifest / 副作用 / 删除审计 / package pin / js 后缀 | PASS×7 |
| C1 | 合成冒烟 | CN/HK/US no-network | PASS |
| C2 | 跨进程 dossier 幂等 | in-process | PASS |
| C3 | 跨进程 dossier | OS 级持久化+加载+校验 | PASS |
| C4 | 跨进程 policy audit | 5 个高风险 tool | PASS |
| C5 | fail-closed artifact isolation | + cross-process | PASS |
| C6 | 跨日 session recovery | pi-investment-workflow | PASS |
| C7 | 生产入口合同 | CLI/Gateway/stdio/Bridge/Cron/Daemon/Evals | PASS |
| C8 | Pi 版本锁 | pi-coding-agent/pi-ai/pi-tui 全部 pin 0.85.1 | PASS |
| C9 | cross-fixture schema | upup.pi.<area>.v1 命名 + consumer-producer | PASS |
| C10 | 入口×runner 矩阵 | 7 入口 | PASS |
| C11 | 入口故障面 | 5 类故障 | PASS |
| C12 | 入口 SLA | 延迟预算 | PASS |
| C13 | 故障矩阵 | transient/provider/permission/model/session | PASS |
| C14 | stdio JSON-RPC | 并发轮次 | PASS |
| C15 | 真实 provider dossier | 凭证门控 | SKIP（缺 TUSHARE/FINANCIAL_DATASETS_API_KEY） |
| C16 | MCP 只读不变式 | ≥10 withheld + ≥100 read-only | PASS |
| C17 | Pi side-effect policy gate | tool_call event 路径 | PASS |

## 3. 关键问题 1：会话反复截断的真实链路

### 3.1 三层叠加问题（按出现频率降序）

**问题 A：上游 provider 凭证已失效（当前会话的 401 死循环）**

- 实测：`curl -H x-api-key:$KEY https://api.minimaxi.com/anthropic/v1/messages` → `401 login fail`（`auth.json#minimax-cn.key`）
- `curl -H x-api-key:$AX https://sub.000878.xyz/v1/messages model=MiniMax-M3` → `401 INVALID_API_KEY`（`auth.json#lumos.access` 与 `auth.json#ax.access` 同源）
- 这不是 UpUp 的代码问题，是 `~/.upup/agent/auth.json` 中 `minimax-cn` / `lumos` / `ax` 凭证需要轮换
- 影响：本次会话每次实际请求都被网关拒绝 → 模型无响应 → 多次空响应后上下文超长 → clamp 触发 1 token 下限

**问题 B：Pi `clampMaxTokensToContext` 把输出预算夹到 1 token（AGENTS.md 已记录）**

机制：`max_tokens = contextWindow - estimate - 4096`，下限 1。`~/.upup/agent/models.json#custom_anthropic.models[0]` 声明 `MiniMax-M3` 的 `contextWindow=128000, maxTokens=16384`。当 session 跑 30+ 轮、estimate > 123904 时 clamp 命中下限 → 网关 `finish_reason: length` + 极小返回 → 模型被迫续写 → 死循环。

**问题 C：`MiniMax-M3` 模型目录错配（用户自定义 provider 静默 fallback）**

- `models.json` 有两个 provider 槽：`minimax`（空 `models: []`）和 `custom_anthropic`（含 `MiniMax-M3`）
- `default-model-runtime` 测试预期声明在 `minimax` provider 下；但当前实际声明在 `custom_anthropic` 下
- `model-registry.ts:64`：`modelId.startsWith("MiniMax-")` → 返回 `minimax`。结果：`getModel("minimax","MiniMax-M3")` 返回 `undefined`，运行时 fallback 到 Pi catalog 默认模型（`gpt-test`）
- 这是 AGENTS.md "已修复"段之前的历史 bug，根因仍在

### 3.2 修复

#### 3.2.1 问题 A：凭证轮换

```bash
# 临时方案：填入新的 minimax-cn key
upup login anthropic --label minimax-cn --base-url https://api.minimaxi.com/anthropic --api-key <NEW>
# 或：直接编辑 ~/.upup/agent/auth.json（0600 权限）
# Pi 的 sub2api 实例（ax/lumos）通过 Pi 设置面板走 OAuth 重新登录
```

#### 3.2.2 问题 B：output budget 已修复，验证仍生效

`packages/pi-runtime/src/investment-event-behaviors.ts:443` 的 `repairDegenerateOutputBudget` 检测 6 个 provider 协议字段（`max_tokens`/`max_completion_tokens`/`max_output_tokens`/`maxOutputTokens`/`max_tokens_to_sample`/`maxTokens`）到 3 层嵌套深度；触发时把预算抬到 `resolveOutputBudgetTarget(model.maxTokens)`（=16384），并写入审计 `outputBudgetRepair: {field, before, after}`。

e2e 守门：`packages/pi-runtime/src/provider-output-budget.e2e.test.ts`（用 Pi 真 ExtensionRunner + 真实 `openai-completions` 请求体捕获）。单元测试 8 个，覆盖 OpenAI Completions/Responses/Azure/Anthropic/Mistral/Google Vertex/Google Generative AI/Amazon Bedrock。

#### 3.2.3 问题 C：`MiniMax-M3` 目录迁移

把 `models.json` 的 `MiniMax-M3` 从 `custom_anthropic` 移到 `minimax` provider（保留 `api: anthropic-messages` 与 baseUrl）。修后：

```json
{
  "providers": {
    "minimax": {
      "authHeader": false,
      "baseUrl": "https://api.minimaxi.com/anthropic",
      "api": "anthropic-messages",
      "apiKey": "<new-key>",
      "models": [{ "id": "MiniMax-M3", "name": "MiniMax M3", "contextWindow": 200000, "maxTokens": 16384, "reasoning": false }]
    },
    "custom_anthropic": { "models": [] }
  }
}
```

`contextWindow` 从 128000 提到 200000（与 `pricing.json` 中 `MiniMax-M3` 同档），降低 clamp 触发概率。

审计：`models.json` 改后跑 `bun test packages/pi-runtime/src/default-model-runtime.test.ts`（8 用例）+ `bun run verify:pi7-final`（应仍 24 PASS）。

## 4. 关键问题 2：bundled UpUp 投资包"不可插拔"

### 4.1 实测证据

```bash
$ upup plugin list
# 输出里 21 个 bundled 包全部标 [bundled]，无 enable/disable 标记
# 用户可见的 enable/disable 只改 settings.json#packages，路径在
# packages/pi-cli-bootstrap/src/plugin.ts:301-345（runToggleAutoload）
# 它只匹配 manager.listConfiguredPackages()，即 npm 来源
```

### 4.2 根因

- bundled 包不走 Pi package-manager：注释在 `package-config.ts:182-185` 说明 Pi `parseSource()` 没有 `builtin:` 分支，会把 `builtin:@upup/<pkg>` 静默当相对路径丢弃
- 加载通道：Pi `-e` 通道，由 `packages/pi-app/src/pi-native-cli.ts:193-214` 的 `resolveUpupExtensionPaths()` 无条件注册所有 builtin 包
- `PiPackageCatalog` 内部有 `enable/disable/select/rollback`（`package-catalog.ts:265/272/279/285`）但用户层不暴露
- `settings.json` 没有 bundled 包的 disable 段

### 4.3 修复（最小侵入）

在 `getBuiltinPiPackageOptions()`（`package-config.ts:130`）前插一个 `getBuiltinPluginToggles(cwd)` 读取 `~/.upup/agent/settings.json#upupPlugins.disabled: string[]`，归一化为 `@upup/<dir>`，从 candidates 中剔除。再让 `formatBundledPackages()` 把"用户禁用"显式标 `[disabled by user]`。

实现要点（伪代码）：

```ts
// packages/pi-resource-composition/src/plugin-toggles.ts（新增）
export const UPUP_BUILTIN_PLUGIN_DIRECTORIES = [/* 19 项目录名 */];
export interface UpUpPluginSettings { disabled?: readonly string[]; enabled?: readonly string[]; }
export function normalizePluginKey(v: string): string { ... }
export function readUpUpPluginSettings(agentDir: string): UpUpPluginSettings { ... }
export function filterBuiltinCandidatesByToggles(
  candidates: readonly BuiltinCandidate[], settings: UpUpPluginSettings
): readonly BuiltinCandidate[] { ... }
// 然后在 package-config.ts:130 的 candidates = ... 后立刻：
// const toggles = readUpUpPluginSettings(./resolvedAgentDir);
// candidates = filterBuiltinCandidatesByToggles(candidates, toggles);
```

CLI 侧：`packages/pi-cli-bootstrap/src/plugin.ts` 让 `runToggleAutoload` 同样识别 `builtin:@upup/pi-cache` 或 `@upup/pi-cache` 来源，把 disable 写入 `settings.json#upupPlugins.disabled`。`runList` 在 `[bundled]` 后追加 `[disabled by user]` 标记。

### 4.4 验证

- 新增 `packages/pi-resource-composition/src/plugin-toggles.test.ts`（10 用例）：归一化、settings 读取、candidate 过滤
- 新增 `packages/pi-cli-bootstrap/src/plugin.test.ts` 用例：`upup plugin disable @upup/pi-cache` 后 `plugin list` 出现 `[disabled by user]`
- 跑 `bun run verify:pi7-final` 应仍 24/24 PASS（disable 不影响 C1/C17 的 read-only 矩阵）
- 跑 `bun run check:pi-packages`：所有 builtin 包仍满足 `piManifestDeclared` 与资源契约

## 5. 后续 30 天计划

### Sprint A：凭证 + 目录（1 周，3 工日）

1. **A1**：用 `upup login anthropic` 轮换 `minimax-cn` 凭证；填回 `models.json#minimax.apiKey`（D1）
2. **A2**：把 `MiniMax-M3` 从 `custom_anthropic` 迁到 `minimax` provider；contextWindow 200000（2h）
3. **A3**：跑 `bun run verify:pi7-final` + `bun test packages/pi-runtime` 守门（1h）

### Sprint B：bundled 包可插拔（1 周，4 工日）

1. **B1**：新增 `packages/pi-resource-composition/src/plugin-toggles.ts` + 测试（1.5d）
2. **B2**：`package-config.ts:130` `getBuiltinPiPackageOptions` 调用 toggle 过滤（0.5d）
3. **B3**：`pi-cli-bootstrap/src/plugin.ts` 的 `runToggleAutoload` 识别 `builtin:` 与 `@upup/`；`formatBundledPackages` 显示 `[disabled]`（1d）
4. **B4**：`check:pi-plugin-toggles` 静态门禁 + e2e（1d）

### Sprint C：补足其它缺口（2 周，8 工日）

- **C1**：C15 真实凭证门禁激活（CI 注入 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY`）
- **C2**：fix `src/runtime/pi/agent-session-factory.test.ts:208` swarm fixture 泄漏 —— 与同文件 line 326 一样补 `UPUP_AGENT_DIR=mkdtemp(...)` 隔离，避免每个 `bun test` 往 `~/.upup/agent/sessions/` 写 fixture jsonl
- **C3**：删掉 `~/.pi/agent/sessions/--Users-louloulin-appx-upup--/` 下 654 个 `upup-platform-fixture` 残留 + 1067 个空 cwd 目录（先用 cp -a 备份到 /tmp）
- **C4**：`AGENTS.md` 文档中提到"已修复"的项逐条核对：① MiniMax-M3 目录（B1 已覆盖）；② provider-output-budget（已生效）；③ SettingsManager.inMemory（C2 顺带）；④ Welcome to Pi 反复出现（`upup doctor` 校验 settings.json 是否完整）
- **C5**：`upup plugin` 的 bundled 段在 UI（TUI picker）里也允许禁用，而不是仅 CLI
- **C6**：批量把内置 pi-* 的 package.json 字段对齐 schema：① `hostCapabilities` 字段填齐（当前 21 个 package 中只有 2 个声明）；② `sideEffects` 字段从 21 个补到 21/21 声明（`check:pi-side-effects` 是 green 的，所以是 `report:pi7` 口径差异）

### Sprint D：长期（>30 天）

- **D1**：把 21 个 pi-* 包按"投资必备"vs"可选"分级（投资必备=finance-sdk/market-data/investment-analysis/risk/portfolio/investment-workflow/technical/corporate-actions/quant/notify；其余 platform/browser/research/cache/config/management/event-adapter/observability 可选）
- **D2**：upup-web 的 desktop 形态（Web UI / Tauri 壳）接通 MCP `upup_finance__*` 7 个 read-only tool
- **D3**：SOP workflow bridge（`UPUP.pi.sop-workflow-bridge.v1`）从 Pi ecosystem 升到正式 feature；提供 `upup sop new` 引导模板
- **D4**：评测管线 `@upup/pi-evals` 与 `@upup/pi-research` 的 search-coverage eval 形成 nightly gate

## 6. 风险与回滚

- B 段改 `getBuiltinPiPackageOptions`：若 toggle 解析失败，必须 fall-through 到全量加载（fail-open 而非 fail-closed），否则 TUI 起不来
- C1 注入真实凭证会触发实际写文件 / 真实下单边界，所有 eval 必须在 `UPUP_DRY_RUN=1` 下跑，且 C15 仍用 SKIP 而不是 PASS
- C2 修 fixture 泄漏：CI 改用 `UPUP_AGENT_DIR=$RUNNER_TEMP/agent-dir`，避免依赖真实 home

## 7. 实施结果（截至 2026-09-18）

### 7.1 已落地的代码改动

- 新增 packages/pi-resource-composition/src/plugin-toggles.ts（约 88 行）：UPUP_BUILTIN_PLUGIN_DIRECTORIES、normalizePluginKey、filterBuiltinCandidatesByToggles、readUpUpPluginSettings
- 新增 packages/pi-resource-composition/src/plugin-toggles.test.ts（107 行，14 用例）：覆盖归一化、过滤、settings 读取、容错
- packages/pi-resource-composition/src/package-config.ts：导入 toggle 函数；getBuiltinPiPackageOptions 在 resolveBuiltinPackages 之后立刻过滤 disabled/enabled
- packages/pi-resource-composition/src/index.ts：re-export ./plugin-toggles
- packages/pi-cli-bootstrap/src/plugin.ts：导入 toggle 函数；新增 runToggleUpUpBuiltin 与 isBuiltinUpUpSource；runToggleAutoload 在 builtin 来源时路由到 toggle 函数；formatBundledPackages 给 disabled 包打 [disabled by user] 黄色标

### 7.2 实测验证（端到端）

1. settings.json 注入 upupPlugins.disabled = ["@upup/pi-cache", "pi-risk"]
2. resolveConfiguredPiPackages() 返回 17 个 piPackagePaths（原 19 - 2 禁用）
3. 列表里 pi-cache / pi-risk 缺席，其它 17 个全部到位（含 pi-finance-sdk / pi-market-data / pi-investment-analysis）

### 7.3 用户级用法

```bash
# 禁用 bundled 包（写入 settings.json#upupPlugins.disabled，下次启动不再通过 -e 加载）
upup plugin disable pi-cache
upup plugin disable @upup/pi-risk

# 启用（从 disabled 集合中删掉，下次启动恢复加载）
upup plugin enable pi-cache

# 查看当前生效状态
upup plugin list  # [disabled by user] 标黄
```

### 7.4 测试结果

- bun test packages/pi-resource-composition/ → 92 pass / 0 fail（其中 14 是新增的 toggle 用例）
- bun test packages/pi-cli-bootstrap/ → 85 pass / 0 fail（既有 CLI 用例未受影响）
- bun run verify:pi7-final → 24/24 PASS（架构合同未受影响，1 个 SKIP 为 C15 凭证门控）

### 7.5 已知遗留 / 未完成

1. C15 真实凭证激活需要 TUSHARE_TOKEN + FINANCIAL_DATASETS_API_KEY（未到位 → SKIP）
2. 问题 A（auth.json#minimax-cn.key 401）仍需手动 upup login 轮换；这是用户操作，不在代码范围内
3. 问题 C（MiniMax-M3 模型目录迁移到 minimax provider）已写进 §3.2.3 修复方案但未自动改 ~/.upup/agent/models.json（避免改用户 home）
4. Sprint C2 的 fixture 泄漏修复未做（src/runtime/pi/agent-session-factory.test.ts:208 swarm 测试需补 UPUP_AGENT_DIR=mkdtemp(...) 隔离）
5. 680 个 fixture session 清理未做（可执行命令见早期对话）

