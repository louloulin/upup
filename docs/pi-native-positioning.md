# UpUp (涨涨) — Pi-native 定位白皮书

> **本文件是 UpUp 定位的权威表述。** 任何与本文件冲突的其他描述，以本文件为准。
> 最近复核：2026-09-16（Pi Native 迁移定型后）。
>
> **文档关系**：早期 `docs/positioning.md`（v5.6 中文定位）已归档至 [`internal/positioning/positioning.md`](./internal/positioning/positioning.md)，`docs/pi-native-invest-assistant-analysis.md` 已归档至 [`internal/audits/pi-native-invest-assistant-analysis.md`](./internal/audits/pi-native-invest-assistant-analysis.md)；冲突以本文件为准。

---

## 1. 一句话定位

**UpUp 是运行在终端里的 Pi-native AI 投资助手**：Agent 内核、交互界面、工具执行、会话与扩展宿主全部复用
[Pi](https://github.com/earendil-works/pi) runtime；UpUp 只贡献 **金融域能力、投研工作流、投资记忆、渠道**。

**Pi 是 runtime，UpUp 是产品。**

---

## 2. 为什么是「复用 Pi」而不是「自建 agent」

Agent 工程里真正昂贵、且与领域无关的部分是：agent loop、上下文压缩、tool 执行与权限、TUI 编辑器与补全、
会话持久化与恢复、扩展宿主、provider catalog、沙箱与 bash 执行。这些 Pi 已经做得比 UpUp 自建版本更好，
且持续维护。

UpUp 在 2026-09 的 Pi Native 迁移里删掉了全部自实现版本（约 10 万行）：

| 已删除的自实现 | 替换为 |
|---|---|
| `pi-tui-app`（自建 TUI / 补全 / 权限 UI / 状态管理） | Pi `InteractiveMode` + `@earendil-works/pi-tui` |
| `pi-platform/src/bash`、`sandbox`（自建 bash 分类器 / AST / 沙箱） | Pi `bash` / `read` / `write` / `edit` tool + `BashOperations` |
| `pi-session/src/{storage,state,service,tracker,restore}` | Pi `SessionManager` / `SettingsManager` |
| `pi-bridge`、`pi-stdio`（自造 JSON 协议） | Pi `pi-protocol` / `pi-client` / `pi-server` |
| `state`、`keybindings`、`i18n`、`hooks`、`sdk`、`commands` | Pi `AgentSession.state` / settings / keybindings / extension host |
| `pi-finance-composition`、`pi-platform-composition` | Pi `DefaultPackageManager` composition |

**UpUp 不做 fork。** Pi 以 `@earendil-works/pi-*@0.85.1` 锁定在 `node_modules` 中且不被修改；
UpUp 只通过 env var（`PI_CODING_AGENT_DIR`）、入口、Pi SDK 与 `ExtensionAPI` 接入。

---

## 3. UpUp 在 Pi 之上贡献了什么

### 3.1 金融域能力（Pi 完全没有）

- **A 股 / 港股数据栈**：Tushare Pro + AKShare + 东方财富 fallback，覆盖 5000+ 标的
- **美股数据栈**：Financial Datasets（行情、基本面、财报、内部人交易、分部数据）
- **公告与监管文件**：A 股公告、SEC filings 检索与抽取
- **分析与决策工具**：估值（DCF / DDM / 剩余收益 / 可比）、组合优化、风险（VaR / CVaR / 回撤）、
  回测（事件驱动）、量化因子、技术面、公司行动、通知

### 3.2 投研工作流（Pi 没有领域编排）

`/invest` 五阶段：`detect → plan → execute → verify → report`，每阶段产出可审计 artifact
（`intent.json` / `plan.md` / `evidence/*.json` / `verification.json` / `report.md`）。
7 个可序列化 Profile：`researcher`、`analyst`、`risk-manager`、`portfolio-manager`、
`backtest-engineer`、`monitor`、`reviewer`。

### 3.3 投资记忆

跨日 / 跨进程的 dossier 与投资上下文；Pi 不内置 memory。

### 3.4 渠道

WhatsApp gateway（投研 bot）、A 股 / 财报披露日历 cron、daemon supervisor、MCP client（UpUp 侧实现，
因为 Pi 明确不内置 MCP）、management 只读页。

---

## 4. 扩展模型：只有 Pi Package

新增能力的唯一姿势是在 `packages/<name>/package.json` 声明 `pi` 块：

```json
{
  "pi": {
    "extensions": ["extensions/index.ts"],
    "skills": ["skills/**/SKILL.md"],
    "prompts": ["prompts/*.md"],
    "workflows": ["workflows/*.json"],
    "policies": ["policies/*.json"],
    "evals": ["evals/*.json"],
    "tools": ["my_tool"],
    "sideEffects": { "my_tool": "read" }
  }
}
```

由 Pi 的 `DefaultPackageManager` + `DefaultResourceLoader` 装载。**禁止**在根 `src/` 自建
agent loop、tool registry、skill registry 或 event 映射。

---

## 5. 存储与品牌

| 项 | 位置 |
|---|---|
| 全局 Pi home（settings / models / auth / themes / prompts / skills / extensions / sessions） | **`~/.upup/agent`**（经 `PI_CODING_AGENT_DIR` 发布给 Pi） |
| 项目级配置 | `<cwd>/.upup/`（`.upup/settings.json` 优先；`.pi/settings.json` 仅兼容回退） |
| API key | `.env`（gitignored） |

- `~/.pi/agent` **不在**回退链中；首次启动 `bootstrapUpupAgentSync()` 一次性 seed allowlist
  （`settings.json` / `models.json` / `auth.json` / `themes/` / `prompts/` / `skills/` / `extensions/`），
  绝不覆盖已有文件，凭证文件强制 `0600`。
- 品牌：UpUp 用 Pi 官方扩展点 `before_agent_start` 改写 system prompt 身份，并安装 `upup-dark` 主题。

---

## 6. 非目标

- **不 fork Pi**：不修改 `node_modules`、不做 patch-package、不复制 Pi 源码。
- **不重造 agent / TUI / transport / session**：这些一律用 Pi 的。
- **不做真实资金交易执行**：UpUp 是研究工具（`place_trade_order` 默认 fail-closed）。
- **不提供私有 LLM**：模型能力来自 Pi provider catalog 与用户自带 key。
- **不做付费分层**：MIT，全功能开源。

---

## 7. 合规姿态

- 所有输出标注数据来源与时间戳；`verify` 阶段做跨源一致性与引用图校验。
- 高风险副作用（写文件 / 通知 / 凭证 / 交易）默认 `deny`，需显式 approval。
