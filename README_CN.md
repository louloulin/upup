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
[![Discord](https://img.shields.io/discord/placeholder.svg)](#社区)

[English](./README.md) · [中文](#) · [变更日志](./CHANGELOG.md) · [贡献指南](./CONTRIBUTING.md)

> 🇨🇳 **本文件是中文用户默认入口。** 英文用户请读 [README.md](./README.md)。


![UpUp CLI welcome screen — model DeepSeek V4 Flash, version 2026.6.12](./docs/images/upup-welcome.png)

---

## 这是什么

**UpUp (涨涨)** 是一个**终端里的中文金融研究 AI 智能体**。你在命令行里问一个问题,它会拉数据、做估值、跑回测、引用文件,最后给你一份带依据的结论。

它不是 dexter 的中文化翻译,也不是 dexter 的"换皮"。它是从 [virattt/dexter](https://github.com/virattt/dexter) fork 之后,经过 8 轮 Sprint 持续打磨,**针对中文投研场景做了 8 个维度的实质性扩展**,现在已经是一个 10 倍于上游体量、独立可发布的产品级项目。

> 📌 **本文档核心**:如果只读一段,请直接跳到下面的 **[UpUp vs Dexter · 充分对比](#upup-vs-dexter--充分对比)**。如果你关心"中国版"品牌定位,读 [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)。所有数字与提交 SHA 见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。

| 定位 | 说明 |
|---|---|
| 上游 | [virattt/dexter](https://github.com/virattt/dexter)(MIT,原始框架) |
| 本仓库 | [github.com/louloulin/upup](https://github.com/louloulin/upup) / [gitcode.com/lumosaigroup/upup](https://gitcode.com/lumosaigroup/upup) |
| 协议 | MIT(同上游) |
| 主要场景 | A 股 / 港股 / 美股个人投研,中文界面,Tushare + AKShare 优先 |
| 当前版本 | UpUp `1c5f9346` (v2026.05.15) · 上游 dexter `4adf9382` (v2026.6.9) |

---

## UpUp vs Dexter · 充分对比

这一节是本文档的核心。所有数字都可以用底部 [附:可复现命令](#附可复现命令) 重新跑出来校验。

### 一句话总结

> **UpUp 在不修改上游 dexter 任何协议 / 归属的前提下,把同一套 agent loop 框架扩展为针对中文投研市场的 10.9× 体积产品。代码体量、工具集、技能库、插件生态、双语体系、Session 2.0、多 Agent 协同、A 股数据栈全部是独立建设。**

### 10 个核心优势(一句话各一条)

1. **10.9× 代码体量** — `src/` 237,914 行 vs 21,899 行,8 轮 Sprint 持续打磨
2. **21× 投资技能** — 50 + 14 bundled = 64 个,vs 上游 3 个;全部支持 EN + zh-CN 双语描述
3. **5.6× 工具集** — 296 个工具 vs 53 个,独家覆盖 A 股 / 港股 / 估值 / 回测 / 风险
4. **A 股原生数据栈** — Tushare Pro + AKShare + 东方财富 fallback,覆盖 5000+ 标的;上游只接 Financial Datasets(美股为主)
5. **4 runtime 插件系统** — bun / jiti / wasm / mcp,沙箱可选;上游完全没有插件系统
6. **5 阶段投资工作流** — `/invest`:detect → plan → execute → verify → report,11 个投资子命令(+ 4 个 test);上游无任何投资工作流
7. **8 个 LLM provider**(继承上游)+ DeepSeek 默认 — 与上游同 8 个 provider 列表,把默认 provider 翻转为 DeepSeek(中文金融场景);上游默认 OpenAI
8. **EN + zh-CN 双语 i18n** — 56+ 强类型 key,缺译编译 fail;上游仅英文
9. **Session 2.0 + Plan Mode** — 参考 Claude Code 的计划模式 / Loop 恢复 / 自动压缩;上游是基础 session
10. **16 个 workspace package** — 完整分层,独立可发布;上游是单包

### 8 维度对比表(全部可复现)

| 维度 | UpUp | upstream dexter | 倍数 | 数据来源 |
|---|---:|---:|---:|---|
| `src/` TS+TSX 文件数 | **1,055** | 184 | **5.7×** | `find src -type f \( -name "*.ts" -o -name "*.tsx" \) \| wc -l` |
| `src/` 行数 | **237,914** | 21,899 | **10.9×** | 同上 + `-exec cat {} + \| wc -l` |
| `packages/` 文件数 | **1,253** | 0 | n/a | `find packages -type f …` |
| `packages/` 行数 | **406,495** | 0 | n/a | 同上 |
| `src/skills/*/SKILL.md` | **50** | 3 | **16.7×** | `find src/skills -name SKILL.md \| wc -l` |
| bundled 动态 skill | **14** | 0 | n/a | `ls src/skills/bundled/*.ts \| wc -l` |
| `src/tools/*.ts` 工具数 | **296** | 53 | **5.6×** | `find src/tools -name "*.ts" \| wc -l` |
| `src/commands/*` 命令数 | **28** | 1 | **28×** | `find src/commands -name "*.ts" \| wc -l` |
| 投资命令数 | **11** | 0 | n/a | `ls src/commands/investment/*.ts \| grep -v test \| wc -l` |
| Plugin runtime adapters | **4**(bun/jiti/wasm/mcp) | 0 | n/a | `ls src/plugins/adapters/*.ts` |
| Workspace packages | **15** | 0 | n/a | `ls packages/ \| wc -l` |
| LLM providers | **8** metadata (DeepSeek 默认) | **8** metadata (OpenAI 默认) | 1× (默认 provider 翻转) | `src/providers.ts` + Pi model registry |
| i18n locales | **2**(EN + zh-CN) | 1(EN) | 2× | `src/i18n/strings.ts` |
| `src/*/` 顶层模块数 | **48** | 12 | **4.0×** | `ls -d src/*/ \| wc -l` |

### 谁该用哪个 · 决策矩阵

| 你是… | 推荐 | 原因 |
|---|---|---|
| A 股 / 港股 / 中文投研用户 | **UpUp** ✅ | A 股数据栈 + 双语 + 50 投资 skill + 5 阶段工作流 |
| 纯美股 / SEC 10-K 投研 | dexter 即可 | upstream 原生覆盖美股,UpUp 也能用但冗余 |
| 想要 Claude Code 风格的 TUI | **UpUp** ✅ | Plan Mode / Loop 恢复 / 3 层权限;dexter 没有 |
| 想给 CLI 工具写插件 | **UpUp** ✅ | 4 runtime + 公开 SDK;dexter 无插件体系 |
| 想用 DeepSeek 跑中文金融场景 | **UpUp** ✅ | 推荐 provider;dexter 默认 OpenAI |
| 想要 OpenAI 严格对齐 + 最小依赖 | dexter 即可 | 体积小,集成路径简单 |
| 想做多 Agent 投研流水线 | **UpUp** ✅ | Coordinator 4 worker + 5 投资 Subagent |
| 想做生产级量化 / 主动监控 | **UpUp** ✅ | KAIROS 6 状态机 + Cron + Daemon |
| 只想跑一次单标的的 DCF 估值 | 两者都行 | 都有 `dcf` skill,UpUp 多 10 倍中文工具 |
| 想长期维护 + 自己 fork 改 | **UpUp** ✅ | 16 workspace package + 4 runtime 插件 + SDK |

### 上游继承 vs UpUp 增量(代码级)

| 模块 / 文件 | 上游 dexter | UpUp 现状 | 改动类型 |
|---|---|---|---|
| `src/agent/agent.ts` | 历史自定义工具调用循环 | 已删除；生产执行统一由 `src/runtime/pi/` 的 Pi AgentSession 提供 | 替换 |
| `src/tools/registry.ts` | 简单注册表 | 64+ 工具,3 层权限校验,env-var 条件启用 | 大幅扩展 |
| `src/skills/registry.ts` | 扫描 `src/skills/` | + `bundled/` 目录 + 热重载 + i18n helper + 最近使用计数 | 重写 |
| `src/model/llm.ts` | 历史 4 provider 路由 | 已删除；模型与 streaming 统一由 `src/runtime/pi/model.ts` / `pi-ai` 提供 | 替换 |
| 金融数据接口 | Financial Datasets(美股) | Tushare + AKShare + 东方财富 fallback,统一抽象层 | 重写 |
| `src/components/` | Ink 渲染 | + `status-hint.ts` 单行状态 + Ink + pi-tui 单点接管 | 替换 |
| 渲染层 | Ink | Ink + pi-tui 复用 + `CombinedAutocompleteProvider` 单点 | 复用 + 单点化 |
| 工具文件数 | 53 | 296 | 5.6× |
| `src/skills/` 目录 | dcf / x-research / write-memo | 50 + 14 bundled | 16.7× / n/a |
| 工作流 | 无 | `/invest` 5 阶段 + 11 个投资子命令(+ 4 test) | 全新 |
| 插件系统 | 无 | 4 runtime + SDK | 全新 |
| i18n | 无 | EN + zh-CN 强类型 56+ key | 全新 |
| Session / Plan / Loop | 基础 | Session 2.0(参考 Claude Code) | 全新 |
| 多 Agent | 5 个 subagent | + 5 个投资 Subagent + Coordinator 4 worker | 大幅扩展 |
| Memory | 简单 | 48 文件 + 观察缓冲 + 抽取 hook + 审计链 | 重写 |
| Workspace | 0 个 | 15 个 | 全新 |
| KAIROS / Bridge / Realtime / Daemon | 无 | 全部 upup-only | 全新 |
| 测试 | 7 文件 | 7 文件(`src/**` 范围) | 持平(待补) |

> 完整可复现命令见 [附:可复现命令](#附可复现命令)。

### 数据栈对比(投资研究的"水龙头")

| 数据维度 | UpUp | upstream dexter |
|---|---|---|
| A 股(沪深北三所) | ✅ Tushare Pro + AKShare + 东方财富 fallback | ❌ 无 |
| 港股 | ✅ Tushare Pro(HK)+ AKShare | ❌ 弱覆盖 |
| 美股 | ✅ Tushare + Financial Datasets | ✅ Financial Datasets(主) |
| 加密货币 | ✅ Tushare + CryptoCompare | ✅ CryptoCompare |
| 基金 | ✅ Tushare fund + AKShare 基金数据 | ❌ 无 |
| 债券 / REITs / ETF | ✅ Tushare 全覆盖 | ❌ 无 |
| 财报披露 | ✅ Tushare 财报 + AKShare 利润表/资产负债表/现金流量表 | ✅ Financial Datasets 10-K/10-Q |
| 北向资金 / 龙虎榜 / 大宗交易 | ✅ Tushare | ❌ 无 |
| 行业分类 | ✅ 申万 / 中信 / Wind 三套 | ❌ 无 |
| 估值口径 | ✅ PE-TTM / PB / PS / PEG / 股息率 / DCF | ✅ 美股标准 PE/PB/EV |
| 实时行情 | ✅ Tushare realtime + AKShare | ✅ Financial Datasets realtime |

### 投资工作流对比(用户最直观的差异)

| 用户场景 | UpUp | upstream dexter |
|---|---|---|
| 一句话深度研究单股 | `/invest 600519.SH 2025Q3`(5 阶段闭环) | ❌ 需要手动串 5-10 个工具调用 |
| 财报前瞻(业绩窗口前 7 天) | `/earnings-preview <code>` | ❌ 无 |
| 标的档案 | `/dossier <code>` | ❌ 无 |
| 早盘速览 | `/morning-brief`(每个交易日开盘前) | ❌ 无 |
| 持仓复盘 | `/portfolio-review`(Brinson 归因) | ❌ 无 |
| 风险仪表盘 | `/risk-dashboard`(实时) | ❌ 无 |
| 多因子选股 | `/screen` | ❌ 无(只有 `screen-stocks.ts` 工具) |
| 策略管理 | `/strategy`(list / show / new / publish / fork / audit) | ❌ 无 |
| 自选股 | `/watchlist-edit`(add / remove / list) | ❌ 无(只有内部 state) |
| 行业轮动 | `sector-rotation` skill | ❌ 无 |
| 主题猎手 | `dream` / `hunter` bundled skill | ❌ 无 |
| 批量分析 | `batch` bundled skill | ❌ 无 |

### 插件生态对比

| 维度 | UpUp | upstream dexter |
|---|---|---|
| 插件目录 | `src/plugins/adapters/`(4 个) | 无 |
| Runtime 数量 | **4**(bun / jiti / wasm / mcp) | 0 |
| 公开 SDK | `@upup/plugin-sdk`(可独立发包) | 无 |
| 注册入口 | `registerPlugin` / `registerBuiltinPlugin` / `registerSingleton` / `registerFactory` | 无 |
| 第三方插件示例 | `@upup/example-plugin` 跑通 4 runtime | 无 |
| MCP 支持 | ✅ 独立 `mcp.ts` adapter | ❌ 无 |
| 沙箱隔离 | wasm(不可信代码隔离)+ process 双层 | 无 |

### 会话与权限对比

| 维度 | UpUp | upstream dexter |
|---|---|---|
| Session 文件数(`src/session/`) | **18** | 0(基础 session 在 `agent.ts` 内) |
| Plan Mode(用户先看 plan 再确认) | ✅ 集成在 `src/plan/`,与 agent.ts:756 联动 | ❌ 无 |
| Loop 恢复 | ✅ Loop recovery 钩子 | ❌ 无 |
| 自动压缩 | ✅ Anthropic 风格,token 阈值触发 | ❌ 基础 |
| 权限层数 | **3 层**(静态白名单 + 工具级模式 + 会话级模式) | 1 层(env var 启停) |
| 默认模式 | `ask`(从不绕过) | 默认 ask,无细粒度 |
| Hook 系统 | `src/hooks/` 17 文件 + `packages/hooks/` 工作区 | ❌ 无 |
| 审计链 | `src/telemetry/` + 审计签名 | ❌ 无 |

### Memory / KAIROS / Bridge / Coordinator 对比

| 子系统 | UpUp | upstream dexter |
|---|---|---|
| `src/memory/` 文件数 | **48** | 基础实现 |
| 观察缓冲 | ✅ | ❌ |
| 抽取 hook | ✅ | ❌ |
| 审计链 | ✅ | ❌ |
| `src/kairos/` 主动运行时(6 状态机) | **14** | 0 |
| `src/bridge/` 远程/跨设备 | **36** | 0 |
| `src/realtime/` 事件总线 | **10** | 0 |
| `src/daemon/` 后台 workers | **12** | 0 |
| `src/multi-agent/` 编排 | **39** | 0 |
| `src/coordinator/` 4 worker 池 | **16** | 0 |
| `src/cron/` 定时任务 | **6** | 0 |
| `src/tui/` 50 文件 Ink + pi-tui 渲染 | ✅ | 极简 |

### LLM Provider 对比

| Provider | UpUp | upstream dexter | 备注 |
|---|:---:|:---:|---|
| OpenAI | ✅ | ✅ | upstream 默认 gpt-5.5;UpUp 默认 gpt-5.4 |
| Anthropic | ✅ | ✅ | 双方都做了 prompt caching(`cache_control`) |
| Google(Gemini) | ✅ | ✅ | |
| xAI(Grok) | ✅ | (via prefix) | UpUp 有专属 provider 实现 |
| **DeepSeek** | ✅ **默认 provider 翻转** | ✅(via prefix) | UpUp 把 `DEFAULT_PROVIDER` 从 `openai` 翻转为 `deepseek`(中文金融场景) |
| OpenRouter | ✅ | (via prefix) | 同上,UpUp 有专属 provider 实现 |
| Ollama(本地) | ✅ | ✅ | 默认 `http://127.0.0.1:11434` |
| **Provider 总数(metadata)** | **8** | **8** | 1×(默认 provider 翻转是 UpUp 的真正差异化点) |

### 路线图对比(2026 Q2–Q4)

| 计划能力 | UpUp | upstream dexter |
|---|---|---|
| 多 Agent 投研流水线 | ✅ 已落地(5 Subagent + Coordinator) | ❌ 路线图 |
| 主动监控 / KAIROS | ✅ 已落地 | ❌ |
| 量化回测 / 模拟盘 | ✅ 多个 skill + `src/tools/backtest/` | 基础策略工具 |
| 真实交易执行 | ❌ 明确不做(合规) | ❌ 明确不做 |
| 量化信号 API 化 | 🔄 路线图(2026 Q3) | ❌ |
| 远程跨设备(Bridge 加密) | ✅ 已落地 | ❌ |
| Web 网关 | ✅ `src/web/` + `packages/gateway/` | ✅ 基础(WhatsApp channel) |
| 移动端 App | 🔄 路线图(2026 Q4) | ❌ |
| 多用户协作 | 🔄 路线图(2026 Q4) | ❌ |


### 代码模式对比 · 同任务的两种实现

下面用 4 个真实任务,把同一个动作在两个仓库里的入口 / 工厂 / 注册 / 调用方式列在一起。所有路径与行号都可在两个仓库 `HEAD` 直接验证。

#### 任务 1 · 注册一个金融查询工具(以 `get_financials` 为例)

| 维度 | UpUp | upstream dexter |
|---|---|---|
| 工厂函数 | `src/tools/finance/get-financials.ts → createGetFinancials()` | 同上(继承) |
| 领域加载器 | `src/tools/registry/finance-tools.ts → loadFinanceTools(model)`(按模型裁剪工具集) | 内联在 `src/tools/registry.ts` 第 246 行内 |
| 注册入口 | `src/tools/registry/index.ts:getToolRegistry()` 编排 16 个领域 loader(`loadFinanceTools / loadFundTools / loadQuantTools / loadRealtimeTools / loadCoordinatorTools / loadKairosTools / …`) | 单文件 `src/tools/registry.ts`(246 行)直接 `import` + 顺序 push |
| 类型 / 元数据 | `src/tools/registry/types.ts` 集中定义 `ToolSafetyLevel / ToolCategory / ToolSideEffects / ToolConcurrencyMetadata / RegisteredTool` + 6 个 metadata 常量 | 仅 `RegisteredTool` interface,无 safety / concurrency / side-effect 字段 |
| 测试 | 每个 loader 一个 `*.test.ts`(共 16 个) | 单个 `registry.test.ts` |

> 一句话总结:UpUp 把 dexter 的 246 行单一 registry 拆成 16 个领域 loader(每个 ~50-150 行)+ 1 个 60 行编排器 + 1 个类型模块。代价是文件数变多,收益是:每个领域可独立测试、可独立 mock、可按模型选择性加载、可在 monorepo 里单独打包。

#### 任务 2 · "查询 AAPL 当前股价" 在 agent 里如何被解析

| 步骤 | UpUp | upstream dexter |
|---|---|---|
| 1. 用户输入 | CLI 接收 → `src/cli.tsx:Editor` → `src/runtime/pi/event-stream.ts` | Pi AgentSession |
| 2. LLM 决策 | `src/runtime/pi/model.ts` → Pi provider/model registry | Pi `pi-ai` streaming |
| 3. 工具匹配 | `src/tools/registry/index.ts:getToolRegistry()` 返回按模型裁剪后的工具集 → LLM 选 `get_stock_price` | `src/tools/registry.ts:getToolRegistry()` 返回全量工具 |
| 4. 数据获取 | `src/tools/finance/stock-price.ts → getStockPrice('AAPL')` → `https://api.financialdatasets.ai/...`(美股) | 同接口 |
| 5. A 股 fallback | `src/tools/astock/*` 12 个工具(Tushare Pro + AKShare + 东方财富 fallback)自动接管 | ❌ 无 A 股路径 |
| 6. 结果回填 | Pi tool result / Session entries → UpUp event and evidence adapters | Pi Session 单一状态源 |

> 一句话总结:UpUp 在第 2 步(默认 provider)与第 5 步(A 股 fallback)插入了中国场景分支,其他步骤与上游一致。

#### 任务 3 · 定义一个新 skill(比如新增 "DCF 估值" skill)

| 步骤 | UpUp | upstream dexter |
|---|---|---|
| 1. 创建 SKILL.md | `src/skills/dcf/SKILL.md`(YAML frontmatter `name` + `description` + markdown body) | 同结构(继承) |
| 2. 提示词注入 | `src/skills/registry.ts:discoverSkills()` 启动时扫描全部 `**/SKILL.md` → 注入系统提示 | 同上(继承) |
| 3. bundled(TS skill) | `src/skills/bundled/*.ts`(14 个 TypeScript 实现)→ 编译期注册 | ❌ 无 bundled 概念 |
| 4. 调用入口 | `skill` 工具 → `src/tools/skill-executor.ts` 路由到 SKILL.md 或 bundled.ts | `skill` 工具 → 只能路由到 SKILL.md |
| 5. i18n | 描述字段 EN + zh-CN 双写,缺译编译 fail(`src/i18n/strings.test.ts`) | 仅英文 |

> 一句话总结:UpUp 在第 3 步多了 "bundled TS skill" 这一类(14 个),它允许把确定性逻辑写进 TypeScript 而不是 markdown prompt,适合 `a-share-data` / `us-fin-data` 这类纯数据拉取型 skill。

#### 任务 4 · 启动一次多阶段投研任务(`/invest 评估宁德时代`)

| 阶段 | UpUp | upstream dexter |
|---|---|---|
| 用户输入 `/invest` | `src/commands/investment/invest.ts` 进入 5 阶段状态机 | ❌ 无 `/invest` 命令 |
| Phase 1 detect | `src/runtime/pi/intent-detector/` + Pi investment profiles(意图识别) | n/a |
| Phase 2 plan | `src/plan/` + `src/commands/investment/plan-display.tsx` Ink 渲染计划 → 用户审阅 | n/a |
| Phase 3 execute | `src/coordinator/`(4 worker pool)+ `src/multi-agent/`(编排)+ Pi-backed workers | n/a |
| Phase 4 verify | `src/runtime/pi/` workflow/evidence adapters(投研一致性检查) | n/a |
| Phase 5 report | `src/commands/investment/registry.ts` 把 dossier/strategy/earnings-preview/portfolio-review/risk-dashboard 写入 `.upup/runs/<id>/` | n/a |
| 审计链 | `src/telemetry/` + `src/session/`(每次 tool call 写入事件流) | n/a |

> 一句话总结:`/invest` 是 UpUp 的 0→1,五个阶段全部由独立模块实现。dexter 没有对应概念。

---

## 与上游的边界:什么来自 Dexter,什么是 UpUp 加的

> ⚠️ 一份诚实的清单。如果你只关心"哪些代码是从 dexter 继承 / 重写 / 新增",读这一节就够了。

### 来自上游 Dexter(继承)

| 模块 | 说明 |
|---|---|
| Agent Loop | Pi `AgentSession` / `pi-agent-core` 工具调用循环；UpUp 不再维护自定义 loop |
| Tool Registry | 工具条件注册机制(已扩展为 296 个) |
| Skill 协议 | `SKILL.md` YAML frontmatter + markdown body(已统一注册路径) |
| 渲染层 | Ink(React for CLI)+ pi-tui 复用 |
| 数据抽象 | 金融数据接口基类(已重写 A 股实现) |
| LLM 抽象 | 同上游 8 个 provider + `DEFAULT_PROVIDER='deepseek'` 默认翻转 + Chinese 模型 ID |

### China-Edition Increment(UpUp 独立贡献)

| 增量 | 数量 / 说明 |
|---|---|
| **A 股数据栈** | Tushare Pro + AKShare + 东方财富 fallback,覆盖 5000+ 标的 |
| **投资分析 Skill** | **50 个** SKILL.md + **14 个** bundled(含 DCF、技术、回测、舆情、行业、风险、估值、阿尔法、组合再平衡等) |
| **5 阶段投资工作流** | `/invest`:detect → plan → execute → verify → report |
| **专用投资命令** | `/dossier` `/earnings-preview` `/strategy` `/screen` `/morning-brief` `/portfolio-review` `/risk-dashboard` `/watchlist-edit` |
| **4 运行时插件** | `bun` / `jiti` / `wasm` / `mcp` runtime adapter(`src/plugins/adapters/`) |
| **i18n(EN + zh-CN)** | `src/i18n/strings.ts`,组件 / Prompt / Skill 描述全双语,强类型 key,缺译测试 fail |
| **多 Agent 协同** | `src/multi-agent/` + `src/coordinator/` + Pi 投资 profiles(含 `investment-subagents`) |
| **Session 2.0** | 计划模式、自动压缩、Loop 恢复、停止 hook(参考 Claude Code) |
| **Memory 系统** | `packages/memory` + 观察缓冲 + 抽取 hook |
| **16 个 workspace package** | commands / cron / daemon / gateway / hooks / keybindings / mcp / memory / pi-finance-sdk / plugin-sdk / plugins / sdk / skills / state / types / utils |
| **KAIROS / Bridge / Coordinator / Realtime / Daemon / Cron / Hooks** | 全部 upup-only,共 200+ 文件 |
| **Sprint v1–v8 持续打磨** | 投研 Claude Code 改造、Round 1-3 skills/plugins 整合、网关层、网关登录 |

---

## 核心特性(Features at a Glance)

| 类别 | 特性 |
|---|---|
| 🇨🇳 **A 股原生** | Tushare Pro + AKShare + 东方财富,覆盖 5000+ 标的 |
| 🤖 **Agent Loop** | Pi AgentSession 工具调用 + Session tree + 自动压缩 + Loop 恢复 |
| 📊 **50+ 投资 Skill** | DCF / 技术 / 回测 / 行业 / 风险 / 估值 / 组合 / 阿尔法 — 完整文件级 SKILL.md |
| 🎯 **5 阶段投资工作流** | `/invest`:detect → plan → execute → verify → report |
| 🔌 **4 运行时插件** | `bun` / `jiti` / `wasm` / `mcp`,安全 / 性能可调 |
| 🌍 **EN + zh-CN i18n** | 56+ 强类型 key,双语对称,缺译编译 fail |
| 🧠 **8 个 LLM Provider**(继承上游) | OpenAI / Anthropic / Google / xAI / Moonshot / OpenRouter / Ollama / **DeepSeek(中文金融默认)** |
| 🛡 **3 层权限防护** | 静态白名单 + 工具级模式 + 会话级模式,默认 `ask` |
| 🧩 **多 Agent 协同** | 5 个投资 Subagent(Explore / Plan / Risk / Trade / Review)并行拉数据 |
| 💾 **持久化记忆** | SQLite 长期记忆 + 观察缓冲 + 抽取 hook + 审计链 |
| 📡 **Web 网关** | Read-only JSON snapshot + 监控 |
| 📈 **KAIROS 主动监控** | 财报触发器 + 持仓监控 |
| 🧪 **评估框架** | Pi-native evaluation runner + 240+ 题目 + 引用密度计数器 + Ink UI |
| 📦 **15 个 Workspace Package** | 完整分层 + 独立可发布 |
| 🛠 **可观测** | Telemetry + Hook 系统 + 审计签名 |

更多真实输出示例见 [docs/showcase.md](./docs/showcase.md)。

## 快速开始

### 环境要求

- [Bun](https://bun.sh) 1.0+(首选运行时)
- Node.js 18+(仅在使用 `bun run build:node` 兼容构建时需要)
- macOS / Linux / Windows(Windows 需 WSL 推荐)

### 安装

```bash
# 克隆(任选一个镜像)
git clone https://github.com/louloulin/upup.git
# 或:git clone https://gitcode.com/lumosaigroup/upup.git
cd upup

# 安装依赖
bun install

# 复制环境变量模板
cp env.example .env
```

### 最小配置

`.env` 中至少需要一项 LLM Key。推荐 A 股用户使用 DeepSeek(中文友好 + 成本低):

```env
# LLM(至少一项)
DEEPSEEK_API_KEY=sk-...              # 推荐:中文金融场景
ANTHROPIC_API_KEY=sk-ant-...         # Claude(强推理)
OPENAI_API_KEY=sk-...                # GPT 系列

# A 股数据(强烈推荐)
TUSHARE_TOKEN=your_tushare_token     # 在 https://tushare.pro 注册
# AKShare 无需 token,作为 fallback 自动启用

# 搜索(可选)
EXASEARCH_API_KEY=...                # 优选 Exa
TAVILY_API_KEY=...                   # 兜底 Tavily
```

### 启动

```bash
# 交互式 TUI
bun start

# 直接问一个研究问题
bun start "分析贵州茅台 2025 Q3 财报,重点看毛利率和合同负债"

# 一行命令完成多步工作流
bun start "/invest 600519.SH 2025Q3"
```

---

## 投资工作流(5 阶段)

`/invest` 是 UpUp 的核心命令,串起 detect → plan → execute → verify → report:

```
用户问 ──► detect   意图识别(个股 / 行业 / 组合 / 风险)
        ──► plan    拆解为可执行子任务(5-10 步)
        ──► execute 并发拉数据 / 跑模型(金融工具 + skill + subagent)
        ──► verify  交叉验证(多源对比 / 历史回放 / 数字一致性)
        ──► report  结构化报告(带引用 + 数据卡片 + 风险提示)
```

配套快捷命令(全部基于 5 阶段框架的子集):

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

## Skills 概览(50 + 14 bundled)

`src/skills/` 下有 **50 个** `SKILL.md` 技能定义(由 `src/skills/registry.ts` 在启动时扫描),加上 `src/skills/bundled/` 下的 **14 个** 内置动态 skill。LLM 在系统 prompt 里看到这些 skill 的元数据,按需通过 `skill` 工具调用。

### 内置动态 Skill(bundled/,14 个)

| Skill | 功能 |
|---|---|
| `research` | 投研报告骨架(自动套用模板) |
| `fund` | 基金分析与对比 |
| `portfolio` / `portfolio-review` | 组合构建与复盘 |
| `risk-assessment` | 风险评估 |
| `alert` | 价格/事件告警 |
| `batch` | 批量分析(A 股池扫描) |
| `stock-screen` | 多因子筛选 |
| `dream` / `hunter` | 主题轮动 + 板块猎手 |
| `sandbox` | 沙箱执行(不可信代码隔离) |
| `verify` | 引用验证 / 数据交叉 |
| `index` | 索引入口 |
| `prompt-helpers` | Prompt 辅助 |

### 文件型 Skill(SKILL.md,50 个)

按领域分组(节选,详细列表 `ls src/skills/*/SKILL.md`):

- **估值 / 财务**:`dcf`、`cash-flow-analysis`、`dividend-analysis`、`earnings-forecast`、`earnings-season`、`earnings-calendar`、`valuation-comparison`、`valuation-alert`、`financial-interpretation`、`financial-report`、`performance-prediction`
- **技术 / 量价**:`technical-analysis`、`money-flow`、`shareholder-analysis`、`momentum-investing`、`backtest-dca`、`dca-strategy`
- **行业 / 主题**:`sector-analysis`、`sector-rotation`、`macro-analysis`、`market-monitor`、`market-overview`、`swarm-analysis`、`x-research`
- **风格 / 投资流派**:`value-investing`、`growth-investing`、`momentum-investing`
- **基金 / 机构**:`fund-analysis`、`fund-comparison`、`fund-holdings`、`fund-management`、`manager-analysis`、`institution-research`、`institutional-holding`
- **组合**:`portfolio-management`、`portfolio-rebalancing`、`personalized-recommendation`
- **A 股专属**:`a-share-analysis`、市场结构 / 资金流向
- **数据 / 报告**:`api-integration`、`research-report`、`alert-management`、`api-integration`、`multi-market-analysis`

> Skills 是热加载的(`src/skills/hot-reload.ts`)。新增 / 修改 `SKILL.md` 后,LLM 下次启动会重新发现,无需重启。**upstream dexter 不支持此能力。**

---

## 插件系统(4 Runtime)

`src/plugins/adapters/` 暴露 4 种 plugin 加载方式:

| Runtime | 文件 | 沙箱级别 | 典型用途 |
|---|---|---|---|
| `bun` | `bun.ts` | process | 同进程 ESM,最快 |
| `jiti` | `jiti.ts` | process | TS 原生 require-style 加载 |
| `wasm` | `wasm.ts` | wasm | 不可信代码隔离(沙箱执行) |
| `mcp` | `mcp.ts` | mcp | Model Context Protocol 外部服务 |

注册入口(`src/plugins/` 下):

```
registerPlugin        ← 通用入口
registerBuiltinPlugin ← 内置插件
registerSingleton     ← locator 注入
registerFactory       ← locator 工厂
```

`@upup/plugin-sdk` 暴露给第三方写插件用的类型 / manifest / 入口约定。详见 [`src/plugins/sdk/`](./src/plugins/sdk/)。

> **upstream dexter 没有插件系统。** UpUp 的 4 runtime 适配器 + 公开 SDK 是从零搭建的。

---

## 命令参考(部分)

`/` 触发 slash 命令补全(由 pi-tui 的 `CombinedAutocompleteProvider` 提供,已统一为单点实现):

```
/invest           5 阶段投研
/dossier          标的档案
/strategy         策略管理 (list/show/new/publish/fork/audit)
/screen           多因子选股
/morning-brief    早盘速览
/portfolio-review 组合复盘
/risk-dashboard   风险仪表盘
/watchlist-edit   自选股
/skills           浏览所有 skill(动态发现)
/model            切换 LLM provider / 模型
/plan             进入计划模式
/help             帮助
/exit             退出
```

> **upstream dexter 仅 1 个 command 文件,没有以上投资子命令。**

---

## 项目结构

```
upup/
├── src/                          # 1,055 个 TS/TSX 文件 / 237,914 行(48 个子目录)
│   ├── agent/                    # Agent loop、Plan mode、Memory flush、Subagent
│   ├── cli.tsx                   # CLI 入口
│   ├── index.tsx                 # 包入口
│   ├── run.ts                    # Bundled runner
│   ├── commands/                 # 28 个 slash 命令(含 11 个投资子命令(+ 4 个 test))
│   │   └── investment/           #   - dossier / strategy / earnings-preview /
│   │                             #     morning-brief / portfolio-review /
│   │                             #     risk-dashboard / watchlist-edit / invest
│   ├── skills/                   # 50 个 SKILL.md + 14 个 bundled skill
│   ├── tools/                    # 296 个工具文件(53 个 upstream 上限)
│   │   ├── finance/              # 20+ 金融数据工具
│   │   ├── search/               # Exa / Tavily
│   │   ├── browser/              # Playwright
│   │   └── astock/               # 12 个 A 股专属工具(upup-only)
│   ├── plugins/                  # 4 runtime adapter + 插件系统
│   ├── session/                  # 18 个 Session 2.0 文件(upup-only)
│   ├── i18n/                     # EN + zh-CN 字符串表(强类型 key)
│   ├── components/               # Ink TUI 组件
│   ├── hooks/                    # 18 个 Hook 系统文件
│   ├── memory/                   # 48 个记忆 + 观察缓冲文件
│   ├── plan/                     # 7 个计划模式文件
│   ├── multi-agent/              # 39 个多 Agent 编排文件
│   ├── coordinator/              # 16 个 4 worker 池文件
│   ├── kairos/                   # 14 个主动运行时文件
│   ├── bridge/                   # 36 个远程/跨设备文件
│   ├── realtime/                 # 10 个事件总线文件
│   ├── daemon/                   # 12 个后台 workers 文件
│   ├── cron/                     # 6 个定时任务文件
│   ├── web/                      # 网关(read-only JSON snapshot)
│   ├── tui/                      # 50 个 Ink + pi-tui 渲染文件
│   └── ...                       # 共 48 个子目录(vs 上游 12)
├── packages/                     # 16 个 workspace package
│   ├── pi-finance-sdk/           #   - Pi 金融扩展、skill、prompt、eval
│   ├── memory/                   #   - 持久化
│   ├── plugin-sdk/               #   - 第三方插件 SDK
│   ├── skills/                   #   - skill runtime
│   ├── daemon/                   #   - 后台进程
│   ├── gateway/                  #   - 网关(HTTP / WebSocket)
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
├── docs/                         # 设计 / 实施记录 / 验证报告(含 upup-china-edition-positioning)
├── evals/                        # Pi 原生金融评估
├── .upup/                        # 用户级配置(gitignored)
├── env.example                   # 环境变量模板
└── package.json                  # 私有包,name=upup
```

---

## i18n

`src/i18n/strings.ts` 维护 **EN + zh-CN** 双语,强类型 key:

- 拼错 key → 编译报错
- 缺一个 locale → 单元测试 fail(`src/i18n/strings.test.ts`)
- 不引第三方库(一张静态表 + lookup 函数)
- 优先以中文为用户目标语言

组件 / Prompt / Skill 描述 / 命令文案均已接入。`getLocale()` 自动从 `LANG` / `LC_ALL` 推断,可被 `UPSTREAM_LOCALE` 覆盖。

> **upstream dexter 不支持 i18n。** UpUp 是赛道**唯一**做到组件、prompt、skill 描述全 EN + zh-CN 双语对称的 CLI 投研工具。

---

## LLM 提供商

| Provider | 备注 |
|---|---|
| OpenAI | upstream 默认 gpt-5.5;UpUp 默认 gpt-5.4 |
| Anthropic | Prompt caching 优化(`cache_control`) |
| Google | Gemini 系列 |
| xAI (Grok) | 双方都支持 |
| OpenRouter | 双方都支持 |
| Ollama | 本地,默认 `http://127.0.0.1:11434` |
| **DeepSeek** | **UpUp 独家推荐**,中文金融场景性价比高 |

切换模型:CLI 内 `/model` 命令,或 `.upup/settings.json`。

---

## 文档(Documentation)

完整文档见 **[docs/index.md](./docs/index.md)**。以下是按场景分类的速查:

### 🚀 新用户
- [docs/quickstart.md](./docs/quickstart.md) — 10 分钟上手
- [docs/a-share.md](./docs/a-share.md) — A 股专属(Tushare / AKShare / 北向 / 龙虎榜)
- [docs/showcase.md](./docs/showcase.md) — 真实输出样例
- [docs/faq.md](./docs/faq.md) — 常见问题

### 🔍 功能参考
- [docs/commands.md](./docs/commands.md) — 28+ slash 命令
- [docs/skills.md](./docs/skills.md) — 50+ skill + 编写指南
- [docs/investment-workflow.md](./docs/investment-workflow.md) — 5 阶段 `/invest` 拆解
- [docs/i18n.md](./docs/i18n.md) — 双语 i18n 说明
- [docs/session-and-permissions.md](./docs/session-and-permissions.md) — 权限 / 计划模式 / 沙箱

### 🛠 扩展开发
- [docs/plugins.md](./docs/plugins.md) — 4 runtime 插件开发
- [docs/architecture-overview.md](./docs/architecture-overview.md) — 高层架构
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 334 行分层规则(canonical)

### 📊 评估 / 对比 / 路线图
- [docs/benchmarks.md](./docs/benchmarks.md) — 评估框架 + 早期结果
- [docs/comparison.md](./docs/comparison.md) — vs Dexter / Claude Code / Cursor / Aider / Kimi / Wind 等
- [docs/roadmap.md](./docs/roadmap.md) — 2026 Q2-Q4 路线图

### 🇨🇳 中国版定位
- [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md) — 中国版白皮书(3 承诺 / 3 非目标)
- [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md) — 8 维度可复现审计

## 社区

- 💬 **GitHub Discussions** — 提问 / 想法 / 展示
- 🐛 **GitHub Issues** — Bug 报告 / Feature 建议(用模板)
- 🇨🇳 **中文社区** — 欢迎 PR / 翻译 / 案例分享
- 📜 **行为准则** — [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## 安全

UpUp 默认在 `ask` 权限模式下运行,从不绕过。详见 [SECURITY.md](./SECURITY.md)。

- 漏洞披露:`security@upup.dev`
- 威胁模型、API Key 卫生、权限加固都在 SECURITY.md
- 已知不重做:Dexter 上游的 LLM provider bug / `--dangerously` 误用

## 致谢

UpUp (涨涨) 是站在两个巨人肩膀上的产物:

| 项目 | 贡献 |
|---|---|
| [virattt/dexter](https://github.com/virattt/dexter) | 整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议 |
| [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Session / Permission / TUI 设计、计划模式、Ink + pi-tui 渲染参考 |

如果上游 dexter 发布新版本,我们会在 PR 中评估是否 sync(见 `docs/sync-plan.md`)。本文档不复制 dexter 的任何文案,所有描述均基于本仓库当前代码与可复现命令。

---

## 附:可复现命令

所有上面"vs dexter"表格里的数字,都可以用以下命令重新生成:

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
echo "i18n keys:        $(grep -cE \"^\s+\| '\" src/i18n/strings.ts)"
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
