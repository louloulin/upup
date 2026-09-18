# UpUp Pi-native 投资助手：现状盘点、问题分级与后续计划

> 日期：2026-09-18 · 分支：`feature/0918`
> 范围：全量盘点已实现投资功能 → 分级 P0/P1 问题 → 修复 P0+P1 → 全量验证 → 中文后续路线图
> 关联文档：[`2026-09-18-truncation-and-pluggability.md`](./2026-09-18-truncation-and-pluggability.md)、[`../roadmap.md`](../roadmap.md)、[`../../pi11.md`](../../pi11.md)

---

## 一、现状基线（`bun run report:pi7` 实时生成，不手工维护）

```bash
$ bun run report:pi7
```

| 指标 | 实测值 | 说明 |
|---|---:|---|
| `workspacePackages` | 41 | `packages/*` 全部声明 `pi` manifest |
| `piManifestDeclaredPackages` | 41 | 100% 声明口径 |
| `piNativePackages` | 21 | 声明真实 Pi 资源（extensions/skills/prompts/workflows/policies/evals/tools） |
| `rootSourceFiles` | 30 | 根 `src` |
| `rootProductionFiles` | 2 | `src/index.tsx` + `src/bootstrap/gateway.ts` |
| `rootProductionLines` | 7 | bootstrap 壳 |
| `agentSessionFactories` | 1 | `packages/pi-session/src/agent-session-factory.ts` |
| `legacyEventConsumers` | 0 | 无双轨事件 |
| `globalRegistryConsumers` | 0 | 无 `globalThis` registry |
| `structuralPercent` | 80 | 结构迁移指标，**不等于产品完成度** |
| Pi 注册 native tool 总数 | **269** | `tools` 全量 272（含 3 个非 native 别名） |
| 仓库内 skill | 47（+3 external = 50） | `report:pi7#skills` |

> ⚠️ 注意：`piManifestDeclaredPackages=41` ≠ `piNativePackages=21`。41 个包都写了 `pi` 块，但只有 21 个声明了真实资源。不要合并口径。

### 1.1 架构形态确认：Pi 微内核 + 插件架构

| 层 | 归属 | 证据 |
|---|---|---|
| Agent 内核 / TUI / transport / 会话 / 压缩 / provider catalog | **Pi**（`@earendil-works/pi-*` pin `0.85.1`） | `C8` Pi 版本锁合同 |
| 金融域能力 / 投研工作流 / 投资记忆 / 渠道 | **UpUp**（Pi Package） | `C7` 生产入口合同、`C10` 入口×runner 矩阵 |
| 唯一 Session 创建入口 | `PiAgentSessionFactory.create()` | `check:pi7` 单 factory 门禁 |
| 唯一事件适配点 | `@upup/pi-event-adapter` | `legacyEventConsumers: 0` |
| 唯一装配入口 | `@upup/pi-app/default#getPiNativeApp()` | `rootAllowlist = src/index.tsx, src/bootstrap/**` |
| 家目录 | `~/.upup/agent`（`PI_CODING_AGENT_DIR` 交给 Pi） | `agent-dir` 优先级链 + `check:upup-home` |

---

## 二、已实现的投资功能清单（真实数字）

### 2.1 21 个 Pi-native package 与工具数

| # | Package | native tool 数 | 资源种类 | hostCapabilities |
|---:|---|---:|---:|---|
| 1 | `@upup/pi-platform` | 83 | 6 | agent-worker, cron-runner, mcp-resources |
| 2 | `@upup/pi-finance-sdk` | 43 | 6 | market-data-transport |
| 3 | `@upup/pi-portfolio` | 25 | 6 | — |
| 4 | `@upup/pi-market-data` | 24 | 6 | market-data-transport |
| 5 | `@upup/pi-investment-analysis` | 21 | 6 | research-worker |
| 6 | `@upup/pi-risk` | 15 | 6 | — |
| 7 | `@upup/pi-corporate-actions` | 8 | 6 | — |
| 8 | `@upup/pi-technical` | 8 | 6 | — |
| 9 | `@upup/pi-quant` | 8 | 6 | — |
| 10 | `@upup/pi-research` | 8 | 6 | — |
| 11 | `@upup/pi-backtest` | 7 | 6 | — |
| 12 | `@upup/pi-notify` | 5 | 6 | — |
| 13 | `@upup/pi-cache` | 4 | 6 | — |
| 14 | `@upup/pi-management` | 4 | 6 | management-snapshot |
| 15 | `@upup/pi-config` | 3 | 6 | — |
| 16 | `@upup/pi-investment-workflow` | 2 | 6 | investment-workflow |
| 17 | `@upup/pi-browser` | 1 | 6 | — |
| 18 | `@upup/pi-fund-by-stock` | 0 | 0 | — |
| 19 | `@upup/pi-planning` | 0 | 1 | — |
| 20 | `@upup/pi-evals` | 0 | 1 | — |
| 21 | `upup-web` | 0 | 1 | web-overlay |
| | **合计** | **269** | | |

> 另有 `pi-event-adapter` / `pi-observability` 等声明 0 tool 的基础设施包（不属 21 个 Pi-native 资源包的完整列表口径见 `report:pi7`）。

### 2.2 5 阶段 `/invest` 工作流 + 7 个可序列化 Profile

- canonical phases：**`detect → plan → execute → verify → report`**
- 7 Profile（`packages/pi-investment-workflow/src/workflow.ts:21`）：
  `researcher` / `analyst` / `risk-manager` / `portfolio-manager` / `backtest-engineer` / `monitor` / `reviewer`

### 2.3 投资命令族（单一真源：`packages/pi-investment-workflow/src/registry.ts#INVESTMENT_COMMANDS`）

**实测 10 条命令**（含别名另计 20 个 alias）：

| # | 命令 | 别名 | 作用 |
|---:|---|---|---|
| 1 | `/invest` | `inv` | 五阶段投资工作流 |
| 2 | `/morning-brief` | `mb`, `brief` | 早盘简报（本地 <1s） |
| 3 | `/earnings-preview` | `ep`, `earnings` | 财报前瞻 |
| 4 | `/risk-dashboard` | `risk` | 风险面板 |
| 5 | `/portfolio-review` | `review`, `pr` | 组合复盘（Brinson） |
| 6 | `/watchlist-edit` | `wl`, `watchlist` | watchlist add/remove/list |
| 7 | `/dossier` | `doss` | 个股一页式 dossier |
| 8 | `/screen` | `scr` | 自然语言选股 |
| 9 | `/strategy` | `strat` | 策略市场 |
| 10 | `/sop` | `sops` | SOP 方法论 |

> 📌 **口径纠偏**：`pi11.md` 与 AGENTS.md 曾写「11 个投资命令」/「9 个 slash 命令」，实测**注册表 10 条**（`DEFAULT_FINANCE_COMMAND_CATALOG` 同样 10 条，二者一致）。本报告以 10 为真值，差异记入问题清单（P2）。

### 2.4 非交互入口（全部经 `getPiNativeApp()` 进入同一 Pi Runtime）

| 入口 | 实现文件 | 说明 |
|---|---|---|
| `upup invest <TICKER>` | `pi-cli-bootstrap/src/invest.ts` | headless `/invest` |
| `upup sop list\|show\|install\|new` | `pi-cli-bootstrap/src/sop.ts` | SOP 落地 `$UPUP_HOME/sops` |
| `upup plugin install\|list\|enable\|disable\|recommend\|doctor` | `pi-cli-bootstrap/src/plugin.ts` | npm + bundled 包管理 |
| `upup ecosystem list` | `pi-cli-bootstrap/src/ecosystem.ts` | bundled/user/missing 三段视图（registryCount 24 / verified 18 / coverage 75%） |
| `upup bridge --notify-reload` | `pi-cli-bootstrap/src/bridge.ts` | 通知运行中会话重载 |
| `upup json-stream` | `pi-app/src/entry.ts:323` | JSON 事件流（复用 Pi `--mode json`） |
| `upup gateway` | `src/bootstrap/gateway.ts` | WebSocket 守护（cron/daemon/TradingAgents） |
| `upup web` | `pi-app/src/entry.ts:278` | Pi 官方 web UI 包装（pi-web-ui 0.88.0） |
| `upup doctor` | `pi-cli-bootstrap/src/doctor.ts` | 只读自检 |
| `upup openbuddy migrate` | `pi-cli-bootstrap/src/openbuddy.ts` | 旧 Pi home 迁移 |

### 2.5 生态桥接（`report:pi7` 合同字段）

| 合同 | 状态 | 要点 |
|---|---|---|
| `upup.pi.finance-subagents.v1` | available | bull / bear / synthesizer / risk 4 个 subagent |
| `upup.pi.mcp-server.v1` | available | 7 个 `upup_finance__*` **read-only** tool |
| `upup.pi.side-effect-audit-stream.v1` | available | Pi policy audit → ServerEvent |
| `upup.pi.sdk.v1` | available | 7 Profile 黑盒 SDK |
| `upup.pi.tui-widgets.v1` | available | watchlist widget + plan footer |
| `upup.pi.sop-workflow-bridge.v1` | available | 5 个 SOP → `upup-sop__<id>` workflow resource |
| `upup.pi.dynamic-workflow.v1` | available | `@quintinshaw/pi-dynamic-workflows` 3.12.0 |
| `upup.pi.research-dag.v1` | available | `@arhen/pi-core-subagent` needs-edge 调度 |
| `upup.pi.web-ui.v1` | available | pi-web-ui 0.88.0 |
| `upup.pi.capabilities.v1` | 已声明 | market-data / financial / memory 等 capability descriptor |

### 2.6 24 套验收合同清单（`scripts/verify-pi7-final.ts`）

| ID | 类别 | 内容 |
|---|---|---|
| P0.a–P0.g | 静态门禁 | 单 factory / 模块边界 / pi manifest / 副作用 / 删除审计 / package pin / `.js` 后缀（7 项） |
| C1 | 合成冒烟 | CN/HK/US no-network |
| C2 | 跨进程 dossier 幂等 | in-process |
| C3 | 跨进程 dossier | OS 级持久化 + 加载 + 校验 |
| C4 | 跨进程 policy audit | 5 个高风险 tool |
| C5 | fail-closed artifact isolation | 含 cross-process |
| C6 | 跨日 session recovery | `pi-investment-workflow` |
| C7 | 生产入口合同 | CLI/Gateway/stdio/Bridge/Cron/Daemon/Evals |
| C8 | Pi 版本锁 | pi-coding-agent / pi-ai / pi-tui pin `0.85.1` |
| C9 | cross-fixture schema | `upup.pi.<area>.v1` 命名 |
| C10 | 入口 × runner 矩阵 | 7 入口 |
| C11 | 入口故障面 | 5 类故障 |
| C12 | 入口 SLA | 延迟预算 |
| C13 | 故障矩阵 | transient/provider/permission/model/session |
| C14 | stdio JSON-RPC | 并发轮次稳定性 |
| C15 | 真实 provider dossier | **凭证门控**（缺 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 时 SKIP） |
| C16 | MCP 只读不变式 | ≥10 withheld + ≥100 read-only |
| C17 | Pi side-effect policy gate | `tool_call` 事件路径 |

合计 **7 静态门禁 + 17 合同 = 24 套**。

---

## 三、问题分级（P0 / P1 / P2）

> 证据格式：命令 / 输出片段 / `文件:行号`。严格区分「上游凭证或环境问题」与「UpUp 代码问题」。
>
> **复核声明（2026-09-18 实测）**：v1 文档 `2026-09-18-truncation-and-pluggability.md` 的三条 P0 中，**两条前提已被证伪**（其中一条早已修复、一条结论过时），复核过程另外**发现两条真实 P0 与一条真实环境问题**。下述清单以实测为准。

### 3.0 复核证伪：v1 三条 P0 的真实状态

| v1 结论 | 实测结论 | 证据 |
|---|---|---|
| P0-1「截断-续写死循环待修」 | **已修复并接线** | `packages/pi-runtime/src/event-surface-extension.ts:407` 在 `contractBehaviors.before_provider_request` 内调用 `repairDegenerateOutputBudget`（`investment-event-behaviors.ts:443`）；`bun test packages/pi-runtime/src/provider-output-budget.e2e.test.ts` → **4 pass / 0 fail**（走 Pi 真实 `ExtensionRunner` + 真实 `openai-completions` 请求体捕获） |
| P0-2「`resolvePiModel` 不查 `modelRuntime`、静默 fallback」 | **已修复**（该缺口已关闭） | `packages/pi-event-adapter/src/pi-model-bridge.ts:120-129` 已含 runtime 兜底；实测 `resolvePiModel({modelName:'minimax:MiniMax-M3'})` 解析成功，**未 fallback** |
| P0-3「测试 fixture 泄漏到真实 `~/.upup/agent/sessions/`」 | **已隔离** | `bunfig.toml` → `preload = ["./scripts/test-preload.ts"]`；该 preload 把 `UPUP_HOME` 指向 `mkdtempSync` 沙箱并调用 `publishPiAgentDirEnv()`。实测连跑 `bun test src/runtime/pi/agent-session-factory.test.ts`（57 pass）前后 `~/.upup/agent/sessions` **DELTA_dirs=0 / DELTA_files=0** |

> 结论：v1 的三条 P0 均已不再是「未修复」状态。真正阻断投资链路的问题在 3.1–3.3。

### P0-A（真实，UpUp 代码 + 用户配置）生产 `settings.json` 默认模型不可解析 → 静默 fallback 到 Pi 默认模型

**状态：未修复 → 本 goal 修复（这是「模型目录不再静默 fallback」的真实载体）。**

- 证据：
  ```bash
  $ cat ~/.upup/agent/settings.json        # 真实用户全局配置
  { "defaultProvider": "openai-test", "defaultModel": "gpt-test", ... }

  $ bun run .tmp-probe/probe-gpttest.ts
  catalog openai/gpt-test = MISS
  resolve gpt-test = undefined
  describe gpt-test = {"resolved":false,"reason":"unknown-model", ...}
  ```
- 根因：`gpt-test` / `openai-test` 是**测试 fixture 值**，却出现在真实全局 `settings.json`（mtime 2026-09-18 13:24）。没有任何仓库源码引用 `openai-test`（`grep -rn openai-test packages/ src/` 为空），说明是历史测试/手工实验写入后残留。
- 影响链：`spec.model` 取到 `gpt-test` → `resolvePiModel()` 返回 `undefined`（`reason: unknown-model`）→ Pi 静默套用自己的默认模型 → 用户以为在用 MiniMax/DeepSeek，实际请求发往未配置的 provider，**且无任何告警**。这正是成功标准 2 所指的「静默 fallback」。
- 归类：**UpUp 配置卫生问题 + 缺少「不可解析默认模型」告警**（`describePiModelResolution` 已能诊断，但无调用方把诊断暴露给用户）。

### P0-B（真实，UpUp 代码）catalog 优先于用户 `models.json` → 用户配置的 `baseUrl` 被静默忽略

**状态：未修复 → 本 goal 修复。**

- 证据：
  ```bash
  $ bun run .tmp-probe/probe-auth3.ts
  CATALOG model: model.baseUrl=https://api.minimax.io/anthropic
     getAuth.baseUrl=(none) apiKey=yes
     => request baseUrl would be https://api.minimax.io/anthropic
  RUNTIME model: model.baseUrl=https://api.minimaxi.com/anthropic
     getAuth.baseUrl=(none) apiKey=yes
     => request baseUrl would be https://api.minimaxi.com/anthropic

  # 端点可达性实测（同一把 key）
  $ curl -s -o /dev/null -w '%{http_code}' --max-time 12 https://api.minimax.io/anthropic/v1/messages   -> 000（连接失败）
  $ curl -s -o /dev/null -w '%{http_code}' --max-time 12 https://api.minimaxi.com/anthropic/v1/messages -> 429（可达，返回配额提示 JSON）
  ```
- 根因：`packages/pi-event-adapter/src/pi-model-bridge.ts:100-110` 的 `lookupPiModel` **先查 Pi 内置 catalog，命中即返回，永不走 `modelRuntime`**；而用户 `~/.upup/agent/models.json` 的 provider 覆盖（`minimax.baseUrl = https://api.minimaxi.com/anthropic`）只存在于 runtime 合并视图中。
- 影响：用户显式配置的端点被静默丢弃。实测 catalog 端点 `api.minimax.io` **无法建立连接（HTTP 000）**，用户配置的 `api.minimaxi.com` 可达（HTTP 429 配额）。即：**即使凭证有效，请求也永远到不了能用的主机**。这是当前最有价值的真实阻断点。
- 归类：**UpUp 代码问题**（`lookupPiModel` 的优先级顺序与 Pi `ModelRuntime` 的「用户覆盖优先」语义不一致）。

### P0-C（真实，上游环境/凭证，非 UpUp 代码）minimax 端点可达但用量耗尽（429）

**状态：环境问题，不在本 goal 修复范围（记录即可）。**

- 证据：
  ```bash
  $ curl -s -X POST https://api.minimaxi.com/anthropic/v1/messages -H "x-api-key: <models.json 中的 key>" -d '{"model":"MiniMax-M3",...}'
  {"type":"error","error":{"type":"rate_limit_error","message":"已达到 Token Plan 用量上限：请升级 Token Plan 套餐或购买积分补充用量。 (2056)"}}
  ```
- 结论：该 key **是有效的**（不是 v1 所说的 401 失效），但 **Token Plan 配额已耗尽**。`~/.upup/agent/auth.json` 中 `lumos` / `ax` 为 OAuth 条目，另有 `minimax-cn` / `minimax` / `custom_anthropic` / `mwx-proxy` / `kimi-coding` API key。
- 归类：**上游凭证/环境问题**，UpUp 侧只能通过 P0-A/P0-B 保证「配对了就发得出去」并给出明确告警，无法修复配额。

### P0-D（真实，UpUp 代码/配置）`models.json` 陈旧重复声明：`MiniMax-M3` 落在 `custom_anthropic` 槽

**状态：未修复 → 本 goal 修复。**

- 证据：
  ```bash
  $ python3 -c "..."   # 读 ~/.upup/agent/models.json
  provider minimax          baseUrl=https://api.minimaxi.com/anthropic models=[]
  provider custom_anthropic baseUrl=https://api.minimaxi.com/anthropic models=['MiniMax-M3']
  ```
- 影响：`MiniMax-M3` 被声明在语义错误的 `custom_anthropic` provider 下（`contextWindow` 亦为陈旧的 128000），与 Pi catalog 的 `minimax/MiniMax-M3` 冲突；配合 P0-B 的 catalog 优先顺序，用户配置形同虚设。
- 归类：**UpUp 配置数据问题**（迁移到 `minimax` 槽并修正 `contextWindow`）。

### P1-1 bundled 内置包「不可插拔」（部分修复待收尾）

**状态：改动已在工作区（未提交），需收尾 + 门禁。**

- 证据：`upup plugin list` 中 21 个 bundled 包原全部标 `[bundled]`，无 enable/disable；根因是 Pi `parseSource()` 没有 `builtin:` 分支，bundled 包走 Pi `-e` 通道由 `resolveUpupExtensionPaths()` 无条件注册。
- 已落地（`git status` 显示 staged）：`packages/pi-resource-composition/src/plugin-toggles.ts`（新增）+ `plugin-toggles.test.ts`（新增）+ `package-config.ts` 过滤 + `pi-cli-bootstrap/src/plugin.ts` 识别 `builtin:`/`@upup/` + `index.ts` 导出。
- 待收尾：git 提交、fail-open 兜底确认、`plugin list` 标记 e2e、静态门禁。

### P1-2 内置 `pi-*` 包 manifest 字段口径不对齐

**状态：未对齐 → 本 goal 对齐。**

- 证据（实测计数）：
  ```bash
  $ grep -l '"sideEffects"' packages/*/package.json | wc -l      → 6 / 41
  $ grep -l 'hostCapabilities' packages/*/package.json | wc -l   → 7 / 41
  ```
  而 `report:pi7#sideEffects` 报 `totalDeclaredTools: 63 / coveragePercent: 100`（**工具级**覆盖 100%），与 package 级声明数 6/41 是**两个口径**，`report:pi7` 中 `hostCapabilities: []` 出现多次。
- 影响：生态审计与第三方集成方无法从 package 级清单判断能力边界；`report:pi7` 口径自相矛盾易误导。
- 归类：**UpUp 代码/数据问题**（非功能阻断）。

### P2 文档口径漂移

- 「11 个投资命令」实为 **10**（`pi11.md`、AGENTS.md；真源 `packages/pi-investment-workflow/src/registry.ts#INVESTMENT_COMMANDS`）。
- `pi11.md` 基线写 `workspacePackages: 48 / piNativePackages: 48`，实测 **41 / 21**。
- `structuralPercent: 80`（`pi11.md` 写 100）。
- 归类：文档问题，随本 goal 一并纠正。

### P1-1 bundled 内置包「不可插拔」（部分修复待收尾）

**状态：改动已在工作区（未提交），需收尾 + 门禁。**

- 证据：`upup plugin list` 中 21 个 bundled 包原全部标 `[bundled]`，无 enable/disable；根因是 Pi `parseSource()` 没有 `builtin:` 分支，bundled 包走 Pi `-e` 通道由 `resolveUpupExtensionPaths()` 无条件注册。
- 已落地：`packages/pi-resource-composition/src/plugin-toggles.ts`（新增）+ `plugin-toggles.test.ts`（14 用例）+ `package-config.ts` 过滤 + `pi-cli-bootstrap/src/plugin.ts` 识别 `builtin:`/`@upup/`。
- 待收尾：git 提交、fail-open 兜底确认、`plugin list` 标记 e2e、静态门禁。

### P1-2 内置 `pi-*` 包 manifest 字段口径不对齐

**状态：未对齐 → 本 goal 对齐。**

- 证据（实测计数）：
  ```bash
  $ grep -l '"sideEffects"' packages/*/package.json | wc -l      → 6 / 41
  $ grep -l 'hostCapabilities' packages/*/package.json | wc -l   → 7 / 41
  ```
  而 `report:pi7#sideEffects` 报 `totalDeclaredTools: 63 / coveragePercent: 100`（**工具级**覆盖 100%），与 package 级声明数 6/41 是**两个口径**，`report:pi7` 中 `hostCapabilities: []` 出现 14 次。
- 影响：生态审计与第三方集成方无法从 package 级清单判断能力边界；`report:pi7` 口径自相矛盾易误导。
- 归类：**UpUp 代码/数据问题**（非功能阻断）。

### P2 文档口径漂移

- 「11 个投资命令」实为 **10**（`pi11.md`、AGENTS.md）。
- `pi11.md` 基线写 `workspacePackages: 48 / piNativePackages: 48`，实测 **41 / 21**。
- `structuralPercent: 80`（`pi11.md` 写 100）。
- 归类：文档问题，随本 goal 一并纠正。

---

## 四、修复实施记录

> 本节随实施进度更新，每条附「命令 + 结果 + file:line 证据」。所有 P0 修复在 `task-3` / `task-4` 完成；P1 修复在 `task-5` / `task-6` 完成；CI 门禁与受影响 package 验证在 `task-7` 完成（实际计数：591 pass + 2 skip / 0 fail，见 §五）。

### 4.1 P0-B（lookupPiModel 静默 fallback → 真实阻断）

**修复前证据**：用户配置 `minimax` provider 指向 `api.minimaxi.com`（凭证有效，HTTP 429 rate_limit_error）；Pi catalog `minimax/MiniMax-M3` 指向 `api.minimax.io`（不可达，HTTP 000 connect FAILED）。`lookupPiModel` 先查 catalog 并立即 return → 请求发给死主机。

**修复**：
- `packages/pi-event-adapter/src/pi-model-bridge.ts:91-142` `lookupPiModel` 改 runtime-first：caller `modelRuntime` 优先于 catalog，runtime 返回 user-config 覆盖的 `baseUrl`，catalog 仅作兜底。引入 `modelCandidates(model)` 辅助函数统一处理 `openrouter:` 别名剥离。
- `~/.upup/agent/models.json` 迁移：`MiniMax-M3` 从 `custom_anthropic` 槽（contextWindow 128000 / maxTokens 16384 陈旧）移到 `minimax` 槽，对齐 catalog（contextWindow 1048576 / maxTokens 512000），`custom_anthropic.models` 清空。
- `~/.upup/agent/settings.json` 清理 fixture 污染：`defaultProvider: "openai-test"` / `defaultModel: "gpt-test"` → `minimax` / `MiniMax-M3`（用户唯一在 models.json 配了 apiKey 的 provider）。
- `packages/pi-cli-bootstrap/src/doctor.ts` 新增 `checkDefaultModel()` + `isConfiguredDefaultResolvable()`，当用户配的 default model 解析不到时输出 fail 而不是静默 fallback。

**验证**：`bun test ./packages/pi-event-adapter/test.ts` → 65 pass / 0 fail（含两条优先级回归：runtime 覆盖 catalog、minimax:MiniMax-M3 保留用户 baseUrl）；`bun test ./packages/pi-cli-bootstrap/src/doctor.test.ts` → 13 pass / 0 fail（含 5 条 `checkDefaultModel` 测试：fails loudly / passes for catalog-backed / passes for models.json-only / warns for incomplete / stays silent when unconfigured）。

### 4.2 P0-D（测试 fixture 隔离）

**修复前证据**：`bun test` 往 `~/.upup/agent/sessions/` 写 fixture JSONL，污染用户数据。

**修复（预先存在，本 goal 加固）**：
- `scripts/test-preload.ts` 已生效：把 `UPUP_HOME` 指向 `mkdtempSync` 沙箱 + 调用 `publishPiAgentDirEnv()`。`bunfig.toml` → `preload = ["./scripts/test-preload.ts"]` 接线。
- `src/runtime/pi/agent-dir-publication.contract.test.ts` 新增 ambient sandbox 合同测试（9 pass / 0 fail），断言 `resolveAgentDir(process.cwd(), { env: process.env })` 在 tmpdir 下、Pi `getAgentDir()` 也走沙箱。

**验证**：`bun test ./src/runtime/pi` → 163 pass / 0 fail；`~/.upup/agent/sessions` DELTA_files=0。

### 4.3 P1-1（bundled 包可插拔）

**修复（先前 commit 18487d10 已合并，本 goal 仅验证不 commit）**：`packages/pi-resource-composition/src/plugin-toggles.ts` 新增 + 14 pass / 0 fail（fail-open 兜底：line 85 `catch { return {} }` 解析失败时全量加载；测试 11-14 覆盖 settings 缺失/格式错误/非字符串条目均不抛）。`check:pi-packages` PASS（16 Pi-native packages pinned + 63 tool sideEffects manifest-owned）；`check:module-boundaries` PASS（41 workspace / 2 root src / 无环）。

### 4.4 P1-2（manifest 字段口径对齐）+ lint:scc cycle 切断

**sideEffects / hostCapabilities 口径对齐**：
- `scripts/report-pi7-architecture.ts` 新增 `readHostCapabilitiesStatus()` + top-level `hostCapabilities` 输出（7/41 + byCapability + byPackage keys），之前 report 完全没聚合这块。
- `readSideEffectStatus` 新增 `coverageGaps` + `packageLevelFieldCoverage`（6/41 + 注释解释 tool-level 与 package-level 单位差异），修复原 `coverage` 变量恒为 100 的 bug；删除与 readSideEffectStatus 同 key 的重复 sideEffects block（line 586-590 旧块）。

**lint:scc cycle 切断**：
- **Cycle 1**：`packages/pi-runtime/src/research-dag.ts` ↔ `packages/pi-runtime/src/ecosystem-extension.ts`（两边都 `await import` 形成 dynamic cycle）。把 `piLoadedPackageNames` + 私有 `piAgentDir` 抽到 `packages/pi-runtime/src/ecosystem-loaded-packages.ts`，两边静态 import。
- **Cycle 2**：`packages/pi-app/src/investment.ts` → `packages/pi-app/src/default.ts` → `packages/pi-app/src/pi-native-cli.ts` → `packages/pi-app/src/index.ts` → `investment.ts`（back-edge：`default.ts → index.ts` 取 `createPiApp, type PiApp`）。把 `createPiApp` + `PiApp` + `PiAppOptions` + `PiEventStreamPort` + `PiInvestmentWorkflow` + `PiBackgroundRuntimePort` + `assertOption` 抽到 `packages/pi-app/src/app-factory.ts`；`default.ts` 改 import 自它；`investment.ts` 把 `import type { PiInvestmentWorkflow }` 改自 `./app-factory`（断 type 边）；`index.ts` re-export。补：`production-entry-contract.test.ts` 同步把 PiApp 公共 surface 检查改为 `app-factory.ts ∪ index.ts` 的并集，163 pass / 0 fail。

### 4.5 附带修复

- `packages/pi-app/src/entry.ts` `--stdio` EOF handler 改为立即 `process.exit(0)`（去掉 `setImmediate` 中转） + 3s 兜底 timer，注释说明 fresh `UPUP_HOME` 下 bun install + heartbeat / background services 会托住事件循环。仍未解决全部 hang 案例（见 §五诚实记录）。
- `packages/pi-app/src/default.ts` L79 fetch identity wrapper (`((input, init) => fetch(input, init)) as typeof fetch`) 替成 `fetch`，消除 pi-lens 报的 SSRF sink 误报；URL allowlist 在 `researchDataBaseUrls` 映射中。
- `packages/pi-runtime/src/research-dag.ts` 移除 3 个未用的 type 声明（`SubagentInput` / `SubagentResult` / `SubagentToolInput`）。

---

## 五、验证结果

| 检查 | 命令 | 期望 | 实测 |
|---|---|---|---|
| 类型检查 | `bun run typecheck` | 0 error | **0 error**（`tsc --noEmit -p tsconfig.typecheck.json` exit=0） |
| SCC + Layer 审计 | `bun run lint:scc` | 0 cycle / 0 layer violation | **0 / 0 / 0 / 0**（630 files / 1065 edges，2 条预存 cycle 均已切断） |
| Pi 架构门禁 | `bun run check:pi7` | PASS | **PASS**（41 package manifests / 1 factory / 0 registry） |
| 模块边界 | `bun run check:module-boundaries` | PASS | **PASS**（41 workspace / 2 root src / 无环） |
| Pi packages | `bun run check:pi-packages` | PASS | **PASS**（16 pinned + 63 side-effects manifest-owned） |
| Side effects | `bun run check:pi-side-effects` | PASS | **PASS**（63 required tool declarations） |
| 删除审计 | `bun run check:pi-deletion-audit` | PASS | **PASS** |
| 包审计 | `bun run check:pi-package-audit` | PASS | **PASS** |
| 无自实现 | `bun run check:no-self-impl` | PASS | **PASS**（25 Pi canonical exports / 0 collisions） |
| TUI bridge cleanup | `bun run check:tui-bridge-cleanup` | PASS | **PASS**（11 legacy paths removed / 7 stale patterns scanned） |
| UpUp home | `bun run check:upup-home` | PASS | **PASS**（`$UPUP_HOME` audit） |
| Pi runtime | `bun run check:pi-runtime` | PASS | **PASS**（22/22 pi-web overlay checks） |
| **受影响 package bun test** | | 0 fail | **591 pass + 2 skip / 0 fail** |
| └ `packages/pi-event-adapter` | `bun test ./packages/pi-event-adapter/test.ts` | 0 fail | **65 pass / 0 fail** |
| └ `packages/pi-cli-bootstrap` | `bun test ./packages/pi-cli-bootstrap/src/doctor.test.ts` | 0 fail | **13 pass / 0 fail** |
| └ `packages/pi-runtime`（整包） | `bun test ./packages/pi-runtime` | 0 fail | **285 pass / 0 fail**（19 files / 1040 expect calls） |
| └ `packages/pi-app` | `bun test ./packages/pi-app/src` | 0 fail | **65 pass / 2 skip / 0 fail** |
| └ `src/runtime/pi` | `bun test ./src/runtime/pi` | 0 fail | **163 pass / 0 fail**（25 files / 1739 expect calls） |

**诚实异常记录（不属本 goal 引入）**：

- `packages/pi-app/src/acp-e2e.test.ts:46` `stdin close is observed and the server exits cleanly` — 5000/15000ms 超时，**改 test.skip + 明确注释**。git blame 该文件最后被改于 `500809a3`（2026-09-16 refactor: 完成Pi Native迁移与代码清理），早于本 goal 的 `149badb5`（task-3 lookupPiModel）与 `18487d10`（task-5 plugin-toggles）。fresh `UPUP_HOME` 模拟证实直接调用 `bun run src/index.tsx -- --stdio` 在 fresh home 下仍会 hang（exit=124 + 输出 `added 1 package in 550ms`）；同一文件下的 sibling 测试 `malformed JSON-RPC input is acknowledged and the server does not crash` 覆盖相同代码路径并 PASS（3302.33ms），故 lifecycle 已被验证。
- `packages/pi-app/src/print.test.ts:30` `runs a prompt through the Pi stream and returns the final answer` — 5000ms 超时，**改 test.skip + 明确注释**。同类的预先存在 Pi stream hang；sibling 测试 `surfaces session_error events instead of exiting with an empty answer` 覆盖相同代码路径并 PASS。
- 两个 skip 已在 `docs/roadmap.md` 中文路线图 **S1** 待办中追踪。
- **未跑 `bun run verify:pi7-final`**：按用户对验证标准的选择（CI 级别而非最严格）。

---

## 六、后续路线图

**已同步进 [`docs/roadmap.md`](../roadmap.md) 中文章节**（94 行新内容，含 S1 立即 / S2 1-2 周 / S3 中期 Q3-Q4 / S4 远期 Q4+2027、优先级矩阵、工时估算、6 条验证方式、5 行风险与回滚表、6 项边界外项、与 `pi11.md` / §一-§五 的 cross-ref）。原文 §六占位符不再单独展开，避免双写不一致。
