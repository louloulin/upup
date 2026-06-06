# UpUp (涨涨) 🤖📈

> **中国版 Dexter** — 中文金融研究 AI 智能体
> Forked from [virattt/dexter](https://github.com/virattt/dexter), 针对 A 股 / 港股 / 中文投研场景深度改造

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-dexter-blueviolet.svg)](https://github.com/virattt/dexter)
[![i18n: EN | zh-CN](https://img.shields.io/badge/i18n-EN%20%7C%20zh--CN-ff69b4.svg)](#i18n)

[English](#) · [中文](./README_CN.md) · [变更日志](./CHANGELOG.md) · [贡献指南](./CONTRIBUTING.md)

---

## 这是什么

**UpUp (涨涨)** 是一个**终端里的中文金融研究 AI 智能体**。它在你的命令行里把多源金融数据、估值模型、回测引擎和投研工作流串成一个闭环：你问一个问题，它会拉数据、做估值、跑回测、引用文件，最后给你一份带依据的结论。

它不是 Dexter 的中文翻译，也不是简单的"换皮"。它是在 [Dexter](https://github.com/virattt/dexter) 基础上 fork 之后，针对**中文投研场景**做了 8 个维度的实质性扩展：A 股数据栈、50 个投资分析 skill、5 阶段投资工作流、4 runtime 插件系统、EN+zh-CN 双语 i18n、多 Agent 协同、Session 2.0 / Permission 体系（参考 Claude Code）、持续 8 轮 Sprint 打磨。

| 定位 | 说明 |
|---|---|
| 上游 | [virattt/dexter](https://github.com/virattt/dexter)（MIT，原始框架） |
| 本仓库 | [github.com/louloulin/upup](https://github.com/louloulin/upup) / [gitcode.com/lumosaigroup/upup](https://gitcode.com/lumosaigroup/upup) |
| 协议 | MIT（同上游） |
| 主要场景 | A 股 / 港股 / 美股个人投研，中文界面，Tushare + AKShare 优先 |

---

## 与上游的边界：什么来自 Dexter，什么是 UpUp 加的

> ⚠️ 这是一份诚实的清单。如果你想了解"哪些代码是从 dexter 继承 / 重写 / 新增"，读这一节就够了。

### 来自上游 Dexter（继承）

| 模块 | 说明 |
|---|---|
| Agent Loop | `src/agent/agent.ts` 工具调用循环（已加深拷贝 + 改造） |
| Tool Registry | 工具条件注册机制（已扩展为 64+ 工具） |
| Skill 协议 | `SKILL.md` YAML frontmatter + markdown body（已统一注册路径） |
| 渲染层 | Ink (React for CLI) + pi-tui 复用 |
| 数据抽象 | 金融数据接口基类（已重写 A 股实现） |
| LLM 抽象 | 多 provider 适配（已加 DeepSeek） |

### UpUp 的增量

| 增量 | 数量 / 说明 |
|---|---|
| **A 股数据栈** | Tushare Pro + AKShare + 东方财富 fallback，覆盖 5000+ 标的 |
| **投资分析 Skill** | **50 个** SKILL.md，14 个 bundled（含 DCF、技术分析、回测、舆情、行业、风险、估值、阿尔法、组合再平衡等） |
| **5 阶段投资工作流** | `/invest`：detect → plan → execute → verify → report |
| **专用投资命令** | `/dossier` `/earnings-preview` `/strategy` `/screen` `/morning-brief` `/portfolio-review` `/risk-dashboard` `/watchlist-edit` |
| **4 运行时插件** | `bun` / `jiti` / `wasm` / `mcp` runtime adapter（`src/plugins/adapters/`） |
| **i18n（EN + zh-CN）** | `src/i18n/strings.ts`，组件 / Prompt / Skill 描述全双语，强类型 key，缺译测试 fail |
| **多 Agent 协同** | `src/agent/subagent*` + 投资 subagent（含 `investment-subagents`） |
| **Session 2.0** | 计划模式、自动压缩、Loop 恢复、停止 hook（参考 Claude Code） |
| **Memory 系统** | `packages/memory` + 观察缓冲 + 抽取 hook |
| **18 个 workspace package** | adapter-paperclip / agent-core / commands / cron / daemon / gateway / hooks / keybindings / llm / mcp / memory / plugin-sdk / plugins / sdk / skills / state / types / utils |
| **Sprint v1–v8 持续打磨** | 投研 Claude Code 改造、Round 1-3 skills/plugins 整合、网关层、网关登录 |

---

## 快速开始

### 环境要求

- [Bun](https://bun.sh) 1.0+（首选运行时）
- Node.js 18+（仅在使用 `bun run build:node` 兼容构建时需要）
- macOS / Linux / Windows（Windows 需 WSL 推荐）

### 安装

```bash
# 克隆（任选一个镜像）
git clone https://github.com/louloulin/upup.git
# 或：git clone https://gitcode.com/lumosaigroup/upup.git
cd upup

# 安装依赖
bun install

# 复制环境变量模板
cp env.example .env
```

### 最小配置

`.env` 中至少需要一项 LLM Key。推荐 A 股用户使用 DeepSeek（中文友好 + 成本低）：

```env
# LLM（至少一项）
DEEPSEEK_API_KEY=sk-...              # 推荐：中文金融场景
ANTHROPIC_API_KEY=sk-ant-...         # Claude（强推理）
OPENAI_API_KEY=sk-...                # GPT 系列

# A 股数据（强烈推荐）
TUSHARE_TOKEN=your_tushare_token     # 在 https://tushare.pro 注册
# AKShare 无需 token，作为 fallback 自动启用

# 搜索（可选）
EXASEARCH_API_KEY=...                # 优选 Exa
TAVILY_API_KEY=...                   # 兜底 Tavily
```

### 启动

```bash
# 交互式 TUI
bun start

# 直接问一个研究问题
bun start "分析贵州茅台 2025 Q3 财报，重点看毛利率和合同负债"

# 一行命令完成多步工作流
bun start "/invest 600519.SH 2025Q3"
```

---

## 投资工作流（5 阶段）

`/invest` 是 UpUp 的核心命令，串起 detect → plan → execute → verify → report：

```
用户问 ──► detect   意图识别（个股 / 行业 / 组合 / 风险）
        ──► plan    拆解为可执行子任务（5-10 步）
        ──► execute 并发拉数据 / 跑模型（金融工具 + skill + subagent）
        ──► verify  交叉验证（多源对比 / 历史回放 / 数字一致性）
        ──► report  结构化报告（带引用 + 数据卡片 + 风险提示）
```

配套快捷命令（全部基于 5 阶段框架的子集）：

| 命令 | 用途 | 典型场景 |
|---|---|---|
| `/invest <code>` | 完整 5 阶段投研 | 单只个股深度研究 |
| `/dossier <code>` | 标的档案生成 | 一次性汇总公司画像 |
| `/earnings-preview <code>` | 财报前瞻 | 业绩窗口前 7 天 |
| `/strategy` | 策略开发/审计/发布/分支 | 自定义量化策略 |
| `/screen` | 多因子筛选 | 找符合条件的一组标的 |
| `/morning-brief` | 早盘速览 | 每个交易日开盘前 |
| `/portfolio-review` | 持仓复盘 | 每周/每月 |
| `/risk-dashboard` | 风险仪表盘 | 实时 |
| `/watchlist-edit` | 自选股编辑 | 长期跟踪 |

---

## Skills 概览（50 + 14 bundled）

`src/skills/` 下有 **50 个** `SKILL.md` 技能定义（由 `src/skills/registry.ts` 在启动时扫描），加上 `src/skills/bundled/` 下的 **14 个** 内置动态 skill。LLM 在系统 prompt 里看到这些 skill 的元数据，按需通过 `skill` 工具调用。

### 内置动态 Skill（bundled/，14 个）

| Skill | 功能 |
|---|---|
| `research` | 投研报告骨架（自动套用模板） |
| `fund` | 基金分析与对比 |
| `portfolio` / `portfolio-review` | 组合构建与复盘 |
| `risk-assessment` | 风险评估 |
| `alert` | 价格/事件告警 |
| `batch` | 批量分析（A 股池扫描） |
| `stock-screen` | 多因子筛选 |
| `dream` / `hunter` | 主题轮动 + 板块猎手 |
| `sandbox` | 沙箱执行（不可信代码隔离） |
| `verify` | 引用验证 / 数据交叉 |
| `index` | 索引入口 |
| `prompt-helpers` | Prompt 辅助 |

### 文件型 Skill（SKILL.md，50 个）

按领域分组（节选，详细列表 `ls src/skills/*/SKILL.md`）：

- **估值 / 财务**：`dcf`、`cash-flow-analysis`、`dividend-analysis`、`earnings-forecast`、`earnings-season`、`earnings-calendar`、`valuation-comparison`、`valuation-alert`、`financial-interpretation`、`financial-report`、`performance-prediction`
- **技术 / 量价**：`technical-analysis`、`money-flow`、`shareholder-analysis`、`momentum-investing`、`backtest-dca`、`dca-strategy`
- **行业 / 主题**：`sector-analysis`、`sector-rotation`、`macro-analysis`、`market-monitor`、`market-overview`、`swarm-analysis`、`x-research`
- **风格 / 投资流派**：`value-investing`、`growth-investing`、`momentum-investing`
- **基金 / 机构**：`fund-analysis`、`fund-comparison`、`fund-holdings`、`fund-management`、`manager-analysis`、`institution-research`、`institutional-holding`
- **组合**：`portfolio-management`、`portfolio-rebalancing`、`personalized-recommendation`
- **A 股专属**：`a-share-analysis`、市场结构 / 资金流向
- **数据 / 报告**：`api-integration`、`research-report`、`alert-management`、`api-integration`、`multi-market-analysis`

> Skills 是热加载的（`src/skills/hot-reload.ts`）。新增 / 修改 `SKILL.md` 后，LLM 下次启动会重新发现，无需重启。

---

## 插件系统（4 Runtime）

`src/plugins/adapters/` 暴露 4 种 plugin 加载方式：

| Runtime | 文件 | 沙箱级别 | 典型用途 |
|---|---|---|---|
| `bun` | `bun.ts` | process | 同进程 ESM，最快 |
| `jiti` | `jiti.ts` | process | TS 原生 require-style 加载 |
| `wasm` | `wasm.ts` | wasm | 不可信代码隔离（沙箱执行） |
| `mcp` | `mcp.ts` | mcp | Model Context Protocol 外部服务 |

注册入口（`src/plugins/` 下）：

```
registerPlugin        ← 通用入口
registerBuiltinPlugin ← 内置插件
registerSingleton     ← locator 注入
registerFactory       ← locator 工厂
```

`@upup/plugin-sdk` 暴露给第三方写插件用的类型 / manifest / 入口约定。详见 [`src/plugins/sdk/`](./src/plugins/sdk/)。

---

## 命令参考（部分）

`/` 触发 slash 命令补全（由 pi-tui 的 `CombinedAutocompleteProvider` 提供，已统一为单点实现）：

```
/invest           5 阶段投研
/dossier          标的档案
/strategy         策略管理 (list/show/new/publish/fork/audit)
/screen           多因子选股
/morning-brief    早盘速览
/portfolio-review 组合复盘
/risk-dashboard   风险仪表盘
/watchlist-edit   自选股
/skills           浏览所有 skill（动态发现）
/model            切换 LLM provider / 模型
/plan             进入计划模式
/help             帮助
/exit             退出
```

---

## 项目结构

```
upup/
├── src/                          # 主体代码（约 70+ 子目录）
│   ├── agent/                    # Agent loop、Plan mode、Memory flush、Subagent
│   ├── cli.tsx                   # CLI 入口
│   ├── index.tsx                 # 包入口
│   ├── run.ts                    # Bundled runner
│   ├── commands/                 # 47+ slash 命令
│   │   └── investment/           #   - dossier / strategy / earnings-preview /
│   │                             #     morning-brief / portfolio-review /
│   │                             #     risk-dashboard / watchlist-edit / invest
│   ├── skills/                   # 50 个 SKILL.md + 14 个 bundled skill
│   ├── tools/
│   │   ├── finance/              # 20 个金融数据工具
│   │   ├── search/               # Exa / Tavily
│   │   └── browser/              # Playwright
│   ├── plugins/                  # 4 runtime adapter + 插件系统
│   ├── session/                  # Session 2.0（参考 Claude Code）
│   ├── i18n/                     # EN + zh-CN 字符串表（强类型 key）
│   ├── components/               # Ink TUI 组件
│   ├── hooks/                    # Hook 系统
│   ├── memory/                   # 记忆 + 观察缓冲
│   ├── plan/                     # 计划模式
│   ├── web/                      # 网关（read-only JSON snapshot）
│   └── ...                       # 50+ 模块
├── packages/                     # 18 个 workspace package
│   ├── llm/                      #   - 多 provider 适配
│   ├── memory/                   #   - 持久化
│   ├── plugin-sdk/               #   - 第三方插件 SDK
│   ├── skills/                   #   - skill runtime
│   ├── daemon/                   #   - 后台进程
│   ├── gateway/                  #   - 网关（HTTP / WebSocket）
│   ├── hooks/                    #   - hook runtime
│   ├── mcp/                      #   - MCP 协议
│   ├── commands/                 #   - 统一命令注册
│   ├── cron/                     #   - 定时任务
│   ├── keybindings/              #   - 键位绑定
│   ├── state/                    #   - 状态管理
│   ├── types/                    #   - 共享类型
│   ├── utils/                    #   - 工具
│   ├── sdk/                      #   - 通用 SDK
│   ├── plugins/                  #   - 插件基础设施
│   ├── agent-core/               #   - 核心 agent
│   └── adapter-paperclip/        #   - Paperclip 适配
├── docs/                         # 设计 / 实施记录 / 验证报告
├── evals/                        # LangSmith 评估
├── .upup/                        # 用户级配置（gitignored）
├── env.example                   # 环境变量模板
└── package.json                  # 私有包，name=upup
```

---

## i18n

`src/i18n/strings.ts` 维护 **EN + zh-CN** 双语，强类型 key：

- 拼错 key → 编译报错
- 缺一个 locale → 单元测试 fail
- 不引第三方库（一张静态表 + lookup 函数）
- 优先以中文为用户目标语言

组件 / Prompt / Skill 描述 / 命令文案均已接入。`getLocale()` 自动从 `LANG` / `LC_ALL` 推断，可被 `UPSTREAM_LOCALE` 覆盖。

---

## LLM 提供商

| Provider | 备注 |
|---|---|
| OpenAI | 默认 |
| Anthropic | Prompt caching 优化（`cache_control`） |
| Google | Gemini 系列 |
| xAI (Grok) | |
| OpenRouter | |
| Ollama | 本地，默认 `http://127.0.0.1:11434` |
| **DeepSeek** | **UpUp 新增推荐**，中文金融场景性价比高 |

切换模型：CLI 内 `/model` 命令，或 `.upup/settings.json`。

---

## 致谢

UpUp (涨涨) 是站在两个巨人肩膀上的产物：

| 项目 | 贡献 |
|---|---|
| [virattt/dexter](https://github.com/virattt/dexter) | 整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议 |
| [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Session / Permission / TUI 设计、计划模式、Ink + pi-tui 渲染参考 |

如果上游 dexter 发布新版本，我们会在 PR 中评估是否 sync（见 `docs/sync-plan.md`）。本文档不复制 dexter 的任何文案，所有描述均基于本仓库当前代码。

---

## License

MIT License — 同上游 dexter。详见 [LICENSE](./LICENSE)。

---

<p align="center">
  <strong>UpUp (涨涨) — 涨，涨，一直涨。</strong><br/>
  <sub>终端里的中文金融研究 AI · Forked from <a href="https://github.com/virattt/dexter">virattt/dexter</a></sub>
</p>
