# UpUp (涨涨) 🤖📈

> **中国版 Dexter** — 中文金融研究 AI 智能体
> Fork 自 [virattt/dexter](https://github.com/virattt/dexter),针对 A 股 / 港股 / 中文投研场景深度改造

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

**UpUp (涨涨)** 是一个**终端里的中文金融研究 AI 智能体**。你在命令行里问一个问题,它会拉数据、做估值、跑回测、引用文件,最后给你一份带依据的结论。

它从 [virattt/dexter](https://github.com/virattt/dexter) fork 后经过 8 轮 Sprint 持续打磨,**针对中文投研场景做了 8 个维度的实质性扩展**,现在是 10× 于上游体量、独立可发布的产品级项目。

> 📌 **本文档核心**:如果你只关心"中国版"品牌定位,读 [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)。可复现审计见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。

---

## 10 个核心优势

1. **10.9× 代码体量** — `src/` 237,914 行 vs 上游 21,899 行
2. **21× 投资技能** — 50 + 14 bundled = 64 个,vs 上游 3 个;全部 EN + zh-CN 双语
3. **5.6× 工具集** — 296 个工具 vs 53 个,独家覆盖 A 股 / 港股 / 估值 / 回测 / 风险
4. **A 股原生数据栈** — Tushare Pro + AKShare + 东方财富 fallback,覆盖 5000+ 标的
5. **4 runtime 插件系统** — bun / jiti / wasm / mcp,沙箱可选;上游无插件
6. **5 阶段投资工作流** — `/invest`:detect → plan → execute → verify → report,11 个投资子命令
7. **8 个 LLM provider + DeepSeek 默认** — 继承上游 8 个,把默认 provider 翻转为 DeepSeek
8. **EN + zh-CN 双语 i18n** — 56+ 强类型 key,缺译编译 fail;上游仅英文
9. **Session 2.0 + Plan Mode** — 参考 Claude Code 的计划模式 / Loop 恢复 / 自动压缩
10. **18 个 workspace package** — 完整分层,独立可发布;上游是单包

### 8 维度对比表(全部可复现)

| 维度 | UpUp | upstream dexter | 倍数 |
|---|---:|---:|---:|
| `src/` TS+TSX 文件数 | **1,055** | 184 | **5.7×** |
| `src/` 行数 | **237,914** | 21,899 | **10.9×** |
| `packages/` 文件 / 行 | **1,253 / 406,495** | 0 | n/a |
| `src/skills/*/SKILL.md` | **50** | 3 | **16.7×** |
| bundled 动态 skill | **14** | 0 | n/a |
| `src/tools/*.ts` 工具数 | **296** | 53 | **5.6×** |
| `src/commands/*` 命令数 | **28** | 1 | **28×** |
| 投资命令数 | **11** | 0 | n/a |
| Plugin runtime adapters | **4** | 0 | n/a |
| Workspace packages | **18** | 0 | n/a |
| LLM providers | **8**(DeepSeek 默认) | **8**(OpenAI 默认) | 1×(默认翻转) |
| i18n locales | **2** | 1 | 2× |
| `src/*/` 顶层模块数 | **48** | 12 | **4.0×** |

> 完整可复现命令见文末 [附:可复现命令](#附可复现命令)。

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
TUSHARE_TOKEN=your_tushare_token     # A 股(https://tushare.pro)
EXASEARCH_API_KEY=...                # 搜索(优选 Exa)
```

### 启动

```bash
bun start                            # 交互式 TUI
bun start "分析贵州茅台 2025 Q3 财报" # 直接问
bun start "/invest 600519.SH 2025Q3" # 5 阶段投研
```

---

## 投资工作流(5 阶段)

`/invest` 是 UpUp 的核心命令:

```
用户问 ──► detect   意图识别(个股 / 行业 / 组合 / 风险)
        ──► plan    拆解为可执行子任务(5-10 步)
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

> **upstream dexter 无任何投资工作流,仅 1 个 command 文件。**

---

## Skills(50 + 14 bundled)

### bundled 动态 Skill(14 个)

`research` · `fund` · `portfolio` · `portfolio-review` · `risk-assessment` · `alert` · `batch` · `stock-screen` · `dream` · `hunter` · `sandbox` · `verify` · `index` · `prompt-helpers`

### 文件型 Skill(`SKILL.md`,50 个,节选)

- **估值 / 财务**:`dcf` · `cash-flow-analysis` · `dividend-analysis` · `earnings-forecast` · `earnings-season` · `earnings-calendar` · `valuation-comparison` · `valuation-alert` · `financial-interpretation` · `financial-report` · `performance-prediction`
- **技术 / 量价**:`technical-analysis` · `money-flow` · `shareholder-analysis` · `momentum-investing` · `backtest-dca` · `dca-strategy`
- **行业 / 主题**:`sector-analysis` · `sector-rotation` · `macro-analysis` · `market-monitor` · `market-overview` · `swarm-analysis` · `x-research`
- **投资流派**:`value-investing` · `growth-investing`
- **基金 / 机构**:`fund-analysis` · `fund-comparison` · `fund-holdings` · `fund-management` · `manager-analysis` · `institution-research` · `institutional-holding`
- **组合**:`portfolio-management` · `portfolio-rebalancing` · `personalized-recommendation`
- **A 股专属**:`a-share-analysis` · 市场结构 / 资金流向
- **数据 / 报告**:`api-integration` · `research-report` · `alert-management` · `multi-market-analysis`

完整列表:`ls src/skills/*/SKILL.md`。Skills 是热加载的,新增 / 修改后下次启动自动发现,无需重启。

---

## 插件系统(4 Runtime)

| Runtime | 沙箱级别 | 典型用途 |
|---|---|---|
| `bun` | process | 同进程 ESM,最快 |
| `jiti` | process | TS 原生 require-style 加载 |
| `wasm` | wasm | 不可信代码隔离(沙箱执行) |
| `mcp` | mcp | Model Context Protocol 外部服务 |

注册入口:`registerPlugin` / `registerBuiltinPlugin` / `registerSingleton` / `registerFactory`。第三方插件用 `@upup/plugin-sdk`。详见 [docs/plugins.md](./docs/plugins.md)。

> **upstream dexter 没有插件系统。** UpUp 的 4 runtime + 公开 SDK 是从零搭建。

---

## LLM 提供商

| Provider | UpUp | upstream dexter |
|---|:---:|:---:|
| OpenAI | ✅ | ✅(默认) |
| Anthropic | ✅ | ✅ |
| Google(Gemini) | ✅ | ✅ |
| xAI(Grok) | ✅ | (via prefix) |
| **DeepSeek** | ✅ **默认** | (via prefix) |
| OpenRouter | ✅ | (via prefix) |
| Ollama | ✅ | ✅ |
| **总数(metadata)** | **8** | **8** |

切换:CLI 内 `/model`,或 `.upup/settings.json`。

---

## i18n

`src/i18n/strings.ts` 维护 EN + zh-CN 双语,强类型 key:

- 拼错 key → 编译报错
- 缺一个 locale → 单元测试 fail
- 优先以中文为用户目标语言

`getLocale()` 自动从 `LANG` / `LC_ALL` 推断,可被 `UPSTREAM_LOCALE` 覆盖。组件 / Prompt / Skill 描述 / 命令文案均已接入。

---

## 文档

完整文档见 **[docs/index.md](./docs/index.md)**。速查:

- 🚀 新用户:[docs/quickstart.md](./docs/quickstart.md) · [docs/a-share.md](./docs/a-share.md) · [docs/showcase.md](./docs/showcase.md) · [docs/faq.md](./docs/faq.md)
- 🔍 功能:[docs/commands.md](./docs/commands.md) · [docs/skills.md](./docs/skills.md) · [docs/investment-workflow.md](./docs/investment-workflow.md) · [docs/i18n.md](./docs/i18n.md) · [docs/session-and-permissions.md](./docs/session-and-permissions.md)
- 🛠 扩展:[docs/plugins.md](./docs/plugins.md) · [docs/architecture-overview.md](./docs/architecture-overview.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
- 📊 评估:[docs/benchmarks.md](./docs/benchmarks.md) · [docs/comparison.md](./docs/comparison.md) · [docs/roadmap.md](./docs/roadmap.md)
- 🇨🇳 中国版:[docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md) · [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)

---

## 安全

UpUp 默认在 `ask` 权限模式下运行,从不绕过。详见 [SECURITY.md](./SECURITY.md)。

- 漏洞披露:`security@upup.dev`
- 已知不重做:上游 dexter 的 LLM provider bug / `--dangerously` 误用

---

## 致谢

UpUp (涨涨) 站在两个巨人肩膀上:[virattt/dexter](https://github.com/virattt/dexter)(整体金融研究框架)+ [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code)(Session / Permission / TUI 设计参考)。

本文档不复制 dexter 的任何文案,所有描述均基于本仓库当前代码与可复现命令。

---

## 附:可复现命令

```bash
# UpUp(在仓库根目录)
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md | wc -l)"
echo "bundled skills:   $(ls src/skills/bundled/*.ts 2>/dev/null | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' | wc -l)"
echo "tools/finance:    $(find src/tools/finance -name '*.ts' | wc -l)"
echo "tools/astock:     $(ls src/tools/astock/ 2>/dev/null | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' | wc -l)"
echo "investment cmds:  $(ls src/commands/investment/*.ts 2>/dev/null | grep -v test | wc -l)"
echo "plugin adapters:  $(ls src/plugins/adapters/*.ts 2>/dev/null | grep -v index | wc -l)"
echo "workspaces:       $(ls packages/ 2>/dev/null | wc -l)"
echo "packages files:   $(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "session files:    $(find src/session -name '*.ts' 2>/dev/null | wc -l)"
echo "hooks files:      $(find src/hooks -name '*.ts' 2>/dev/null | wc -l)"
echo "memory files:     $(find src/memory -type f 2>/dev/null | wc -l)"
echo "multi-agent:      $(find src/multi-agent -type f 2>/dev/null | wc -l)"
echo "coordinator:      $(find src/coordinator -type f 2>/dev/null | wc -l)"
echo "kairos:           $(find src/kairos -type f 2>/dev/null | wc -l)"
echo "bridge:           $(find src/bridge -type f 2>/dev/null | wc -l)"
echo "tui:              $(find src/tui -type f 2>/dev/null | wc -l)"
echo "realtime:         $(find src/realtime -type f 2>/dev/null | wc -l)"
echo "daemon:           $(find src/daemon -type f 2>/dev/null | wc -l)"
echo "cron:             $(find src/cron -type f 2>/dev/null | wc -l)"
echo "telemetry:        $(find src/telemetry -type f 2>/dev/null | wc -l)"
echo "i18n keys:        $(grep -cE "^\s+\| '" src/i18n/strings.ts)"
```

```bash
# upstream dexter(在 dexter 仓库根目录)
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md 2>/dev/null | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' 2>/dev/null | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' 2>/dev/null | wc -l)"
echo "workspaces:       $(ls packages/ 2>/dev/null | wc -l)"
```

> 任何一项数字与本文档不符,请开 issue 并附命令输出。我们以命令输出为准。

---

## License

MIT License — 同上游 dexter。详见 [LICENSE](./LICENSE)。

---

<p align="center">
  <strong>UpUp (涨涨) — 涨,涨,一直涨。</strong><br/>
  <sub>终端里的中文金融研究 AI · Forked from <a href="https://github.com/virattt/dexter">virattt/dexter</a></sub>
</p>
