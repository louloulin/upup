# UpUp (涨涨) 🤖📈

> **中文金融研究 AI 智能体** — 终端里的 A 股 / 港股 / 美股投研工作台
> Fork 自 [virattt/dexter](https://github.com/virattt/dexter),针对中文投研场景独立建设

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-dexter-blueviolet.svg)](https://github.com/virattt/dexter)
[![i18n: EN | zh-CN](https://img.shields.io/badge/i18n-EN%20%7C%20zh--CN-ff69b4.svg)](#i18n)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/louloulin/upup.svg)](https://github.com/louloulin/upup/stargazers)

[中文](#) · [English](./README_EN.md) · [变更日志](./CHANGELOG.md) · [贡献指南](./CONTRIBUTING.md)

![UpUp CLI welcome screen — model DeepSeek V4 Flash, version 2026.6.12](./docs/images/upup-welcome.png)

---

## 这是什么

**UpUp (涨涨)** 是一个**终端原生的中文金融研究 AI 智能体**。你在命令行里问一句"分析贵州茅台 2025Q3 财报",它会拉数据、跑模型、引用文件、交叉验证,最后给你一份带依据的结构化报告。

它从 [virattt/dexter](https://github.com/virattt/dexter) fork 后独立建设了 8 轮 Sprint,补齐了中文投研从"工具调用"到"研究工作流"的全部环节——A 股数据栈、50 个投资 skill、5 阶段工作流、4 runtime 插件、双语 i18n、Session 2.0、多 Agent 协同、主动监控。详细定位见 [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)。

---

## 核心能力

### 🇨🇳 A 股 / 港股 / 中文投研原生

- **Tushare Pro + AKShare + 东方财富 fallback** 数据栈,覆盖沪深北 5000+ 标的
- **12 个 A 股专属工具**(`src/tools/astock/`):实时行情 / 财报 / 财务比率 / 资金流向 / 北向资金 / 龙虎榜 / 大宗交易 / 行业分类
- **申万 / 中信 / Wind 三套行业分类**;PE-TTM / PB / PS / PEG / 股息率 / DCF 全估值口径
- **港股**:Tushare HK + AKShare 港股数据
- **基金**:Tushare fund + AKShare 基金数据(REITs / ETF / 债券)
- **默认 provider 翻转**:`DEFAULT_PROVIDER='deepseek'`(vs upstream dexter 的 `openai`),中文金融场景性价比优先

### 🤖 Agent 核心(`src/agent/`)

- **Anthropic 风格 Agent Loop**:`src/agent/agent.ts`,max 50 iterations,工具调用 + Scratchpad
- **自动压缩**:`src/agent/compact.ts` + `microcompact.ts`,token 阈值触发,保留最近 3 轮
- **Loop Recovery**:`loop-recovery.ts` 检测无限循环,自动重启
- **Plan Mode**:`src/plan/plan-builder.ts` 根据用户意图自动生成 2-10 步研究计划,用户审阅后再执行
- **能力清单**:Capability Manifest(`capability-manifest.ts`)+ Registry + Feature Gates
- **意图检测**:Intent Detector(个股 / 行业 / 组合 / 风险)
- **Fallback Handler**:多模型级联,主模型失败自动降级
- **Stream Mode**:实时 token 输出 + token usage 追踪
- **会话级记忆**:Memory Manager + Extraction Hook + Observation Buffer

### 📊 50 个 SKILL.md + 14 个 bundled Skill

**bundled 动态 skill(14)**:`research` · `fund` · `portfolio` · `portfolio-review` · `risk-assessment` · `alert` · `batch` · `stock-screen` · `dream` · `hunter` · `sandbox` · `verify` · `index` · `prompt-helpers`

**文件型 SKILL.md(50,按领域)**:
- **估值 / 财务**:`dcf` · `cash-flow-analysis` · `dividend-analysis` · `earnings-forecast` · `earnings-season` · `earnings-calendar` · `valuation-comparison` · `valuation-alert` · `financial-interpretation` · `financial-report` · `performance-prediction`
- **技术 / 量价**:`technical-analysis` · `money-flow` · `shareholder-analysis` · `momentum-investing` · `backtest-dca` · `dca-strategy`
- **行业 / 主题**:`sector-analysis` · `sector-rotation` · `macro-analysis` · `market-monitor` · `market-overview` · `swarm-analysis` · `x-research`
- **投资流派**:`value-investing` · `growth-investing`
- **基金 / 机构**:`fund-analysis` · `fund-comparison` · `fund-holdings` · `fund-management` · `manager-analysis` · `institution-research` · `institutional-holding`
- **组合**:`portfolio-management` · `portfolio-rebalancing` · `personalized-recommendation`
- **A 股专属**:`a-share-analysis` · 市场结构 / 资金流向
- **数据 / 报告**:`api-integration` · `research-report` · `alert-management` · `multi-market-analysis`

**特性**:热加载(`hot-reload.ts`)+ 双语描述(i18n-helper)+ MCP 集成(`mcp-skills.ts`)+ 依赖检查(`dependency.ts`)+ 最近使用计数(`auto-activate.ts`)。

### 🎯 `/invest` 5 阶段投资工作流

```
用户问 ──► detect   意图识别(个股 / 行业 / 组合 / 风险)
        ──► plan    自动生成 2-10 步研究计划(用户审阅)
        ──► execute 并发拉数据 / 跑模型(金融工具 + skill + subagent)
        ──► verify  交叉验证(多源对比 / 历史回放 / 数字一致性)
        ──► report  结构化报告(带引用 + 数据卡片 + 风险提示)
```

### 11 个投资子命令

| 命令 | 用途 |
|---|---|
| `/invest <code>` | 完整 5 阶段投研 |
| `/dossier <code>` | 标的档案 |
| `/earnings-preview <code>` | 财报前瞻(业绩窗口前 7 天) |
| `/strategy` | 策略开发/审计/发布/分支 |
| `/screen` | 多因子筛选 |
| `/morning-brief` | 早盘速览 |
| `/portfolio-review` | 持仓复盘(Brinson 归因) |
| `/risk-dashboard` | 风险仪表盘(实时) |
| `/watchlist-edit` | 自选股编辑 |
| `/plan` | 进入计划模式 |
| `/skills` | 浏览所有 skill(动态发现) |

### 🛠 工具体系(48 个分类 / ~296 工具)

| 分类 | 工具数 | 说明 |
|---|---:|---|
| `finance` | 20 | 美股 SEC 数据(price / metrics / filings / estimates) |
| `astock` | 12 | A 股(Tushare + AKShare + 东方财富) |
| `portfolio` | 20 | 组合管理 / Brinson 归因 / 再平衡 |
| `quant` | 13 | 量化策略 / 回测 |
| `trading` | 11 | 执行算法(VWAP / POV / IS) |
| `bash` | 13 | Shell 执行 |
| `filesystem` | 16 | 文件读写 / git / worktree |
| `powershell` | 3 | Windows 兼容 |
| `valuation` | 7 | DCF / 估值对比 |
| `fund` | 7 | 基金分析 |
| `risk` | 1 | 风险评估 |
| `screening` | 3 | 多因子选股 |
| `sector` / `forecast` / `earnings` / `calendar` | 10 | 行业 / 预测 / 财报 / 日历 |
| `search` / `browser` / `fetch` | 12 | 搜索(Exa / Tavily)+ 浏览器(Playwright)+ 抓取 |
| `news` / `sentiment` / `alt-data` / `short-interest` | 10 | 舆情 / 情绪 / 另类数据 / 空头 |
| `monitor` / `alerts` / `heartbeat` / `cron` | 7 | 监控 / 告警 / 心跳 / 定时 |
| `plan` / `task` / `todo` / `workflow` | 11 | 计划 / 任务 / 待办 / 工作流 |
| `memory` / `cache` / `export` / `notify` / `lsp` | 20 | 记忆 / 缓存 / 导出 / 通知 / LSP |
| `discovery` / `comparison` / `benchmark` / `fx` | 11 | 发现 / 对比 / 基准 / 外汇 |

**安全层**:`registry/` 24 个文件统一管理 + Tool Safety Level / Category / Side Effects / Concurrency Metadata + 工具级 deny / 工具级模式 + 全局 tool-deny。

### 🔌 4 Runtime 插件系统

| Runtime | 文件 | 沙箱 | 用途 |
|---|---|---|---|
| `bun` | `src/plugins/adapters/bun.ts` | process | 同进程 ESM,最快 |
| `jiti` | `src/plugins/adapters/jiti.ts` | process | TS 原生 require-style 加载 |
| `wasm` | `src/plugins/adapters/wasm.ts` | wasm | 不可信代码隔离(沙箱执行) |
| `mcp` | `src/plugins/adapters/mcp.ts` | mcp | Model Context Protocol 外部服务 |

**注册入口**:`registerPlugin` / `registerBuiltinPlugin` / `registerSingleton` / `registerFactory`
**第三方 SDK**:`@upup/plugin-sdk`(可独立发包)
**示例插件**:`@upup/example-plugin` 跑通 4 runtime
**MCP**:独立 adapter,可挂载任意 MCP 服务(文件系统 / GitHub / 数据库 / 自定义)

### 🧠 Session 2.0 + 3 层权限(`src/session/` + `src/hooks/`)

- **18 个 Session 文件**:上下文折叠 / 消息链 / 迁移 / 恢复 / PID 管理 / Selector
- **Plan Mode**:用户先看 plan 再确认执行(参考 Claude Code)
- **3 层权限防护**:
  1. 静态白名单(`.upup/settings.json`)
  2. 工具级模式(`allow` / `ask` / `deny`)
  3. 会话级模式(临时提权 / 降权)
- **17 个 Hook 文件**:工具生命周期 / 权限 / 速率限制 / 停止 hook / elicitation / worktree
- **默认模式**:`ask`(从不绕过)

### 🤝 多 Agent 协同(`src/multi-agent/` + `src/coordinator/`)

- **39 个 multi-agent 文件**:并行任务编排 / 投资 subagent / 结果聚合
- **16 个 coordinator 文件**:4 worker 池 + 任务路由
- **5 个投资 Subagent**:Explore(数据拉取)/ Plan(计划生成)/ Risk(风险评估)/ Trade(执行)/ Review(复核)
- **5 个 general-purpose subagent**(继承自 dexter,扩展为投资域)

### ⏰ KAIROS 主动运行时(`src/kairos/` + `src/bridge/` + `src/realtime/` + `src/daemon/` + `src/cron/`)

- **KAIROS(14 文件)**:6 状态机主动运行时 — 财报触发器 / 持仓监控 / 行业轮动信号
- **Bridge(36 文件)**:远程 / 跨设备 / 加密通道
- **Realtime(10 文件)**:事件总线 / 实时推送
- **Daemon(12 文件)**:后台 workers / 持久化进程
- **Cron(6 文件)**:定时任务调度

### 🌍 EN + zh-CN 双语 i18n(`src/i18n/`)

- **56 个强类型 key**:拼错 key → 编译报错
- **缺译 fail**:`strings.test.ts` 单元测试,缺一个 locale → fail
- **自动推断**:`getLocale()` 从 `LANG` / `LC_ALL` 推断,可被 `UPSTREAM_LOCALE` 覆盖
- **覆盖范围**:组件 / Prompt / Skill 描述 / 命令文案
- **零依赖**:一张静态表 + lookup 函数,无运行时翻译库

### 🧩 8 个 LLM Provider(`packages/llm/`)

| Provider | 默认 | 备注 |
|---|:---:|---|
| **DeepSeek** | ✅ | 中文金融场景默认,成本最优 |
| OpenAI | | `gpt-5.4` |
| Anthropic | | Prompt caching(`cache_control`) |
| Google | | Gemini 系列 |
| xAI | | Grok |
| Moonshot | | Kimi |
| OpenRouter | | 聚合入口 |
| Ollama | | 本地(`http://127.0.0.1:11434`) |

切换:CLI 内 `/model`,或 `.upup/settings.json`。

### 📦 18 个 Workspace Package(`packages/`)

| Package | 用途 |
|---|---|
| `agent-core` | 核心 agent 抽象 |
| `llm` | 多 provider 适配 |
| `memory` | 持久化记忆 |
| `skills` | skill runtime |
| `plugins` | 插件基础设施 |
| `plugin-sdk` | 第三方插件 SDK |
| `mcp` | MCP 协议 |
| `commands` | 统一命令注册 |
| `gateway` | HTTP / WebSocket 网关 |
| `daemon` | 后台进程 |
| `cron` | 定时任务 |
| `hooks` | hook runtime |
| `state` | 状态管理 |
| `keybindings` | 键位绑定 |
| `types` | 共享类型 |
| `utils` | 工具函数 |
| `sdk` | 通用 SDK |
| `adapter-paperclip` | Paperclip 适配 |

**完全独立可发布**:每个 package 都有独立 `package.json` + `tsconfig.json`,可单独发到 npm。

### 📡 Web 网关 + 评估

- **Web 网关**:`src/web/` + `packages/gateway/`(read-only JSON snapshot)
- **评估框架**:`src/evals/` + LangSmith 240+ 题目 + 引用密度计数器 + Ink UI
- **遥测**:`src/telemetry/` + 审计签名 + 事件流

---

## 项目体量(可复现)

| 维度 | 数值 | 命令 |
|---|---:|---|
| `src/` TS+TSX 文件 | **1,055** | `find src -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` |
| `src/` 代码行 | **237,914** | 同上 + `-exec cat {} + \| wc -l` |
| `packages/` 文件 | **1,253** | `find packages -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` |
| `packages/` 代码行 | **406,495** | 同上 |
| `src/skills/*/SKILL.md` | **50** | `find src/skills -name SKILL.md \| wc -l` |
| `bundled/` TS skill | **14** | `ls src/skills/bundled/*.ts \| wc -l` |
| `src/tools/*.ts` | **296** | `find src/tools -name '*.ts' \| wc -l` |
| 工具分类 | **48** | `ls -d src/tools/*/ \| wc -l` |
| `src/commands/*.ts` | **28** | `find src/commands -name '*.ts' \| wc -l` |
| 投资子命令 | **11** | `ls src/commands/investment/*.ts \| grep -v test \| wc -l` |
| `src/plugins/adapters/` | **4** | `ls src/plugins/adapters/*.ts \| grep -v index \| wc -l` |
| `packages/` 数 | **18** | `ls packages/ \| wc -l` |
| `src/*/` 顶层模块 | **48** | `ls -d src/*/ \| wc -l` |
| i18n key | **56** | `grep -cE "^\s+\| '" src/i18n/strings.ts` |
| LLM provider | **8** | `packages/llm/src/providers.ts` |
| 测试文件 | **276** | `find src -name '*.test.ts' \| wc -l` |

> 所有数字可由 [附:可复现命令](#附可复现命令) 重新生成。

---

## 快速开始

### 环境要求

- [Bun](https://bun.sh) 1.0+(首选运行时)
- macOS / Linux / Windows(WSL 推荐)

### 安装

```bash
git clone https://github.com/louloulin/upup.git
cd upup
bun install
cp env.example .env
```

### 最小配置(`.env`)

至少一项 LLM Key。A 股用户推荐 DeepSeek:

```env
DEEPSEEK_API_KEY=sk-...              # 推荐:中文金融场景
ANTHROPIC_API_KEY=sk-ant-...         # 可选
OPENAI_API_KEY=sk-...                # 可选
TUSHARE_TOKEN=your_tushare_token     # A 股(https://tushare.pro 注册)
EXASEARCH_API_KEY=...                # 搜索(优选 Exa)
```

### 启动

```bash
bun start                            # 交互式 TUI
bun start "分析贵州茅台 2025 Q3 财报" # 直接问
bun start "/invest 600519.SH 2025Q3" # 5 阶段投研
bun start "/screen PE<20 ROE>15"     # 多因子筛选
```

---

## 项目结构

```
upup/
├── src/                          # 1,055 文件 / 237,914 行 / 48 子目录
│   ├── agent/                    # Agent loop / Plan mode / Loop recovery / Memory flush
│   ├── cli.ts                    # CLI 入口(Ink + pi-tui)
│   ├── index.tsx                 # 包入口
│   ├── commands/                 # 28 slash 命令(含 11 投资子命令)
│   │   └── investment/           #   - invest / dossier / earnings-preview /
│   │                             #     morning-brief / portfolio-review /
│   │                             #     risk-dashboard / strategy / screen /
│   │                             #     watchlist-edit / phase-handlers / registry
│   ├── skills/                   # 50 SKILL.md + 14 bundled + hot-reload + i18n-helper
│   ├── tools/                    # 296 工具文件 / 48 分类
│   │   ├── finance/              #   20 美股工具
│   │   ├── astock/               #   12 A 股专属(upup-only)
│   │   ├── portfolio/            #   20 组合工具
│   │   ├── quant/                #   13 量化
│   │   ├── trading/              #   11 执行算法(VWAP/POV/IS)
│   │   ├── bash/ / filesystem/   #   13 + 16 系统工具
│   │   └── registry/             #   24 注册表 + 类型 + 权限
│   ├── plugins/                  # 4 runtime adapter(bun/jiti/wasm/mcp)
│   ├── session/                  # 18 Session 2.0 文件
│   ├── plan/                     # Plan mode(builder / executor / context)
│   ├── hooks/                    # 17 hook 文件
│   ├── i18n/                     # EN + zh-CN 强类型
│   ├── components/               # Ink TUI 组件
│   ├── memory/                   # 48 记忆 / 观察缓冲 / 抽取 hook
│   ├── multi-agent/              # 39 多 Agent 编排
│   ├── coordinator/              # 16 4 worker 池
│   ├── kairos/                   # 14 主动运行时(6 状态机)
│   ├── bridge/                   # 36 远程 / 跨设备
│   ├── realtime/                 # 10 事件总线
│   ├── daemon/                   # 12 后台 workers
│   ├── cron/                     # 6 定时任务
│   ├── web/                      # 网关(read-only JSON snapshot)
│   └── tui/                      # 50 Ink + pi-tui 渲染
├── packages/                     # 18 workspace package / 1,253 文件 / 406,495 行
├── docs/                         # 设计 / 实施记录 / 验证报告
├── evals/                        # LangSmith 评估
├── .upup/                        # 用户级配置(gitignored)
└── package.json                  # name=upup, version=2026.6.12
```

---

## 文档

完整文档见 **[docs/index.md](./docs/index.md)**。速查:

- 🚀 新用户:[docs/quickstart.md](./docs/quickstart.md) · [docs/a-share.md](./docs/a-share.md) · [docs/showcase.md](./docs/showcase.md) · [docs/faq.md](./docs/faq.md)
- 🔍 功能:[docs/commands.md](./docs/commands.md) · [docs/skills.md](./docs/skills.md) · [docs/investment-workflow.md](./docs/investment-workflow.md) · [docs/i18n.md](./docs/i18n.md) · [docs/session-and-permissions.md](./docs/session-and-permissions.md)
- 🛠 扩展:[docs/plugins.md](./docs/plugins.md) · [docs/architecture-overview.md](./docs/architecture-overview.md) · [ARCHITECTURE.md](./docs/architecture-overview.md)
- 📊 评估:[docs/benchmarks.md](./docs/benchmarks.md) · [docs/comparison.md](./docs/comparison.md) · [docs/roadmap.md](./docs/roadmap.md)
- 🇨🇳 中国版:[docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)

---

## 安全

UpUp 默认 `ask` 权限模式,从不绕过。详见 [SECURITY.md](./SECURITY.md)。

- 漏洞披露:`security@upup.dev`
- 已知不重做:上游 LLM provider bug / `--dangerously` 误用

---

## 致谢

UpUp (涨涨) 站在两个巨人肩膀上:
- [virattt/dexter](https://github.com/virattt/dexter) — 整体金融研究框架 / Tool registry / Agent loop / SKILL.md 协议
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Session / Permission / TUI 设计参考

---

## 附:可复现命令

```bash
# 在 upup 仓库根目录
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md | wc -l)"
echo "bundled skills:   $(ls src/skills/bundled/*.ts | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' | wc -l)"
echo "tool categories:  $(ls -d src/tools/*/ | wc -l)"
echo "tools/finance:    $(find src/tools/finance -name '*.ts' | wc -l)"
echo "tools/astock:     $(ls src/tools/astock/ | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' | wc -l)"
echo "investment cmds:  $(ls src/commands/investment/*.ts | grep -v test | wc -l)"
echo "plugin adapters:  $(ls src/plugins/adapters/*.ts | grep -v index | wc -l)"
echo "workspaces:       $(ls packages/ | wc -l)"
echo "packages files:   $(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "session files:    $(find src/session -name '*.ts' | wc -l)"
echo "hooks files:      $(find src/hooks -name '*.ts' | wc -l)"
echo "memory files:     $(find src/memory -type f | wc -l)"
echo "multi-agent:      $(find src/multi-agent -type f | wc -l)"
echo "coordinator:      $(find src/coordinator -type f | wc -l)"
echo "kairos:           $(find src/kairos -type f | wc -l)"
echo "bridge:           $(find src/bridge -type f | wc -l)"
echo "tui:              $(find src/tui -type f | wc -l)"
echo "realtime:         $(find src/realtime -type f | wc -l)"
echo "daemon:           $(find src/daemon -type f | wc -l)"
echo "cron:             $(find src/cron -type f | wc -l)"
echo "telemetry:        $(find src/telemetry -type f | wc -l)"
echo "i18n keys:        $(grep -cE "^\s+\| '" src/i18n/strings.ts)"
echo "test files:       $(find src -name '*.test.ts' | wc -l)"
```

> 任何一项数字与本文档不符,请开 issue 并附命令输出。我们以命令输出为准。

---

## License

MIT License。详见 [LICENSE](./LICENSE)。

---

<p align="center">
  <strong>UpUp (涨涨) — 涨,涨,一直涨。</strong><br/>
  <sub>终端里的中文金融研究 AI · Forked from <a href="https://github.com/virattt/dexter">virattt/dexter</a></sub>
</p>
