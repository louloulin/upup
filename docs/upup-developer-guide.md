# UpUp Developer Guide — 自定义 SOP 与 Agent

UpUp 是 Pi 协议上的中文金融投研 Agent 平台。**底层能力（A 股/港股/美股真实数据、指标、技术分析、回测、风控、组合）由 UpUp 的 Pi package 提供，投研方法论（SOP）与方法论里用到的角色（Agent）由你定义。**

本文只讲四件事：怎么定义 Agent、怎么定义 SOP、怎么下载/安装现成 SOP、怎么运行与校验。

---

## 1. 目录约定

UpUp 从两个位置发现你定义的内容，**项目级优先于用户级**：

| 类型 | 项目级（优先级高） | 用户级 |
| --- | --- | --- |
| Agent | `<cwd>/.upup/agents/*.json` | `$UPUP_HOME/agents/*.json`（默认 `~/.upup/agents/*.json`） |
| SOP | `<cwd>/.upup/sops/*.yaml` | `$UPUP_HOME/sops/*.yaml`（默认 `~/.upup/sops/*.yaml`） |

同名（`id`）冲突时项目级覆盖用户级。UpUp 自带 5 个内置 SOP（`graham` / `momentum` / `debate` / `morning-brief` / `portfolio-review`），项目级同名 SOP 可以覆盖它们。

**用户级根目录 = `$UPUP_HOME`，未设置时才是 `~/.upup`。** 所有"下载/安装"的动作都写到这个根目录，绝不会写进 package 目录，所以 `UPUP_HOME=/tmp/upup-sandbox bun run dev` 可以在沙箱/CI 里完整跑一遍而完全不碰你的真实 `~/.upup`：

```bash
UPUP_HOME=/tmp/upup-sandbox bun run src/index.tsx sop install builtin:graham
```

同一个根目录也存放 `settings.json`、`agent/auth.json`、`sessions/`、`telemetry/`，因此 `$UPUP_HOME` 就是"整个 UpUp 用户态"的开关。

---

## 2. 定义 Agent（`.upup/agents/*.json`）

一个 Agent = 一个角色：系统提示 + 工具白名单 + 权限画像 + 输出契约。

```json
{
  "id": "my-value-analyst",
  "name": "My Value Analyst",
  "description": "只做深度价值分析，不碰交易",
  "version": "1.0.0",
  "systemPrompt": "你是价值投资者，只基于工具返回的证据下结论，缺少数据时明确写 (n/a)。",
  "skills": ["fundamental-analysis", "financial-research"],
  "tools": ["get_financials", "read_filings", "dcf_model", "ddm_model"],
  "capabilities": ["fundamentals", "valuation"],
  "taskTypes": ["research", "valuation"],
  "outputContract": "report",
  "dataPolicy": "live",
  "permissions": {
    "id": "read-only",
    "allow": ["safe", "warning"],
    "requireApproval": [],
    "deny": ["dangerous", "critical"],
    "allowExternalNetwork": true,
    "allowCredentialAccess": false,
    "allowFinancialWrites": false
  }
}
```

字段说明：

- `id` — 小写字母/数字/`-`，SOP 通过这个 id 引用该 Agent。
- `tools` — 工具名数组，或 `"*"` 表示全部。**工具名必须是 UpUp Pi package 已注册的**（`get_financials` / `market_data_quote` / `calculate_kdj` / `run_backtest` / `calculate_var` …）。
- `permissions` — 必填。`deny` 里的安全级别（`dangerous` / `critical`）由 Pi policy 层强制 fail-closed，写操作（`place_trade_order` 等）不会因为你在 Agent 里允许就绕过审批。
- `outputContract` — `markdown` / `json` / `report` / `evidence`，供上层渲染与校验使用。

UpUp 启动时会校验每个 Agent：id 格式、version 语义化、packages 名、tools 非空、permissions 合法、`allowFinancialWrites` 与 `deny: ['dangerous']` 不冲突。任一不合法 → 该文件被跳过并在 `/sop agents` 里显示警告。

---

## 3. 定义 SOP（`.upup/sops/*.yaml`）

一个 SOP = 一条投研方法论：阶段序列（可带依赖）+ 并行辩论组 + 审批门。

```yaml
id: my-graham
name: 我的格雷厄姆流程
description: |
  先收集证据，再算安全边际，最后做保守校验与报告。
version: 1.0.0
market: any                      # cn / hk / us / any
tags: [value, long-term]

phases:
  - id: detect
    agent: invest-explore        # 内置 Agent
    intent: |
      收集 {ticker} 的基本面证据：5 年营收/净利/ROE/负债率、每股净资产、股息。
      标注来源与报告期。不要给投资建议。
    outputContract: evidence
    dataPolicy: live

  - id: plan
    agent: my-value-analyst      # 你在 .upup/agents/ 里定义的角色
    intent: |
      基于 detect 的证据计算 {ticker} 的格雷厄姆数 sqrt(22.5 × EPS × BVPS)
      与安全边际。缺价或缺 EPS 时必须写 "(n/a)"，禁止编造估值。
    requires: [detect]
    outputContract: report

  - id: verify
    agent: invest-risk
    intent: |
      校验 plan 的估值假设：一次性损益、商誉减值、表外负债、股权稀释。
      给出悲观/中性/乐观三档情景。被推翻的假设必须显式列出。
    requires: [plan]

  - id: report
    agent: invest-review
    intent: 产出最终报告，所有数字必须可回溯到前序阶段证据。
    requires: [verify]

parallelGroups:                  # 可选：多 Agent 并行辩论 + 仲裁
  - id: debate
    agents: [invest-risk, invest-review, invest-trade]
    synthesizer: invest-plan
    reduce: llm-arbiter          # majority / weighted / llm-arbiter
    # weights: { invest-risk: 0.4, invest-review: 0.6 }   # reduce=weighted 时必填

approval:                        # 可选：人工审批门
  beforePhases: [report]
```

语义：

- `{ticker}` 会被替换成实际标的（`--sop <id> 600519.SH`）。
- `requires` 构建 DAG，执行器会做拓扑排序；**循环依赖会被拒绝**。
- **线性阶段先全部执行，然后 `parallelGroups` 依次执行**：组内每个 Agent 并发跑，`synthesizer` 消费全部输出并按 `reduce` 仲裁。
- `approval.beforePhases` 里的阶段会暂停并返回 `approval_required`，不再往下跑。
- 每个阶段都在**独立的 Pi session** 中执行，并把前序阶段的结论拼进 prompt，因此阶段之间不共享上下文污染。

---

## 4. 下载 / 安装 SOP

`/sop install` 把一份或多个 SOP 拉进 `$UPUP_HOME/sops`（默认 `~/.upup/sops`），安装前会先解析 + 校验，**校验不过就一个字节都不写**；同名文件默认不覆盖，需要 `--force`。

```bash
# 从 URL 下载（远程 YAML）
/sop install https://example.com/sops/my-graham.yaml

# 从本地文件或目录（目录 = 批量安装其中的 *.yaml / *.yml）
/sop install ./team-sops/
/sop install ./sops/my-graham.yaml

# 把内置 SOP 落盘成可编辑副本（graham / momentum / debate / morning-brief / portfolio-review）
/sop install builtin:graham
/sop install graham              # 裸 id 是 builtin:<id> 的简写

# 装到项目级 <cwd>/.upup/sops（可提交进仓库给团队共享）
/sop install ./team-sops/ --project

# 生成一份可以直接跑的新方法论模板
/sop new my-methodology

# 卸载（只删用户级/项目级的文件，内置 SOP 永远不会被删）
/sop uninstall my-methodology
```

headless（脚本 / CI / 无凭证环境）用同一个实现：

```bash
upup sop install https://example.com/sops/my-graham.yaml
upup sop install ./team-sops/ --project
upup sop new my-methodology
upup sop uninstall my-methodology
upup sop help
```

安装路径规则：

| 源 | 落盘位置 |
| --- | --- |
| `https://…`、本地文件、本地目录 | `$UPUP_HOME/sops/<sop id>.yaml`（`--project` 时 `<cwd>/.upup/sops/`） |
| `builtin:<id>` / 裸 `<id>` | 同上下载一份副本，之后即可自由编辑（内置原件不受影响） |

---

## 5. 运行与查看

```bash
# 查看所有 SOP（内置 + 你定义的），并标出校验状态
/sop list

# 查看某个 SOP 的阶段图与并行组
/sop show my-graham

# 看看每个 SOP 从哪个目录加载
/sop sources

# 校验所有 SOP 与 Agent catalog 是否一致
/sop check

# 列出内置 + 自定义 Agent
/sop agents

# 运行 SOP（TUI 或 headless）
/invest --sop my-graham 600519.SH
upup invest --sop my-graham 600519.SH
upup invest --sops                      # 只列出可运行的 SOP
```

不带 `--sop` 时 `/invest <TICKER>` 仍走内置五阶段流程（`detect → plan → execute → verify → report`），行为不变。

---

## 6. 校验与守门

```bash
bun run check:sop-coverage    # 内置 SOP 数量 / 校验 / 并行组 / 用户 SOP 与 Agent 可发现性
bun run typecheck             # 类型
bun test packages/pi-investment-workflow/   # SOP 引擎单测
```

`check:sop-coverage` 会在 CI 里失败的情况：内置 SOP 少于 5 个、任一内置 SOP 校验失败、没有任何内置 SOP 使用并行组、`$UPUP_HOME/sops/` 或 `$UPUP_HOME/agents/` 里的定义无法被发现、`/sop install` 没有落到 `$UPUP_HOME/sops`（或覆盖了已存在的文件）。

---

## 7. 可用工具速查

Agent 的 `tools` 只能引用已注册的工具。常用分组：

| 分组 | 工具（部分） |
| --- | --- |
| 行情 | `market_data_quote`、`market_data_history`、`get_market_data`、`get_astock_price` |
| 基本面 | `get_financials`、`get_astock_financials`、`read_filings`、`get_company_profile` |
| 估值 | `dcf_model`、`ddm_model`、`calculate_target_price`、`valuation_ratios`、`peer_comparison` |
| 技术指标 | `calculate_technical_indicators`、`calculate_kdj`、`calculate_boll`、`calculate_wr`、`calculate_cci`、`calculate_atr`、`calculate_obv` |
| 风险/组合 | `calculate_var`、`calculate_max_drawdown`、`portfolio_attribution`、`run_backtest` |
| 研究/检索 | `web_search`、`web_fetch`、`research_deep_search`、`matrix_analysis`、`browser` |
| 流程 | `invest_workflow_phase`、`invest_workflow`、`skill` |

完整列表：`/sop agents` 看角色，或在会话里用 `/tools`（Pi 内建）查看当前可用工具。

---

## 8. 与 Pi 生态的关系

UpUp 不自己实现工作流引擎、子 Agent 调度、记忆或 web 检索——这些由 Pi 及其生态提供，UpUp 只做**金融领域层**：真实数据接入、指标/估值/风险工具、Pi package 装配与 policy 守门。

因此你定义的 SOP/Agent 是纯声明式的：换宿主（Pi CLI、headless `upup invest`、后续的 RPC/MCP 入口）时不需要改 YAML/JSON。
