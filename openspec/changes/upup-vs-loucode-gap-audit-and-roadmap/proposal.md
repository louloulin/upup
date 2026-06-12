## Why

UpUp (涨涨) 已经从 2025 年 9 月 fork dexter 起步,经过 8 轮 Sprint 持续打磨,目前已经形成了一个庞大的代码库:`src/agent/` 19807 行(单 agent.ts 1305 行)、`src/skills/` 50 个 SKILL.md、`src/tools/` 296 个 .ts 文件、18 个 workspace packages、`src/bridge/` 28 个文件、`src/kairos/` 9 个文件、`src/coordinator/` 13 个文件、`src/realtime/` 9 个文件、`src/multi-agent/` 27 个文件、`src/daemon/` 9 个文件 + workers 目录、`src/cron/` 6 个文件——单 Agent 投研 + 50 skills + 240+ tools + daemon 会话 + KAIROS 持续监控 + Coordinator 多 Agent 编排 + Bridge 远程控制 + Realtime 行情 + Event Bus + Feature Gates 三级门控 + 5 phase 投资工作流 (research→valuation→backtest→trade→review) + SandboxBroker + Brinson 归因 + i18n EN+zh-CN + 14 bundled skills + 4 runtime 插件,全栈成型。

但是,**在"投资版 Claude Code"这个产品定位上,目前仍然只是"强 demo + 弱生产"状态**。原因有三:

1. **架构全景图缺失**:Agent.ts 单文件 1305 行 + Daemon + KAIROS + Bridge + Coordinator + Realtime + Multi-Agent + i18n 各自独立演进,模块边界、调用方向、状态流转没有一份"权威架构图",新人 onboarding 必须靠读 8 个模块的源码猜。
2. **与 loucode(还原的 Claude Code)的能力差没量化**:loucode 有完整的 `buddy/`、`voice/`、`ssh/`、`remote/`、`server/`、`jobs/classifier`、3-tiers permission、`outputStyles/`、`moreright/`、`vim/`、`memdir/`、`migrations/`、`projectOnboardingState`、`cost-tracker` + `costHook`、native 1.0 setup、RemoteSessionManager + SessionsWebSocket、SSHSessionManager、worktrees—**这些能力在 upup 中哪些有、哪些缺、哪些有但弱,没人梳理过**。
3. **生产级别差距没列清楚**:目前 276 个测试 + 50 skills + 240+ tools,但 5 个 critical 能力(投资分析准确率/可解释性/回测保真度/交易沙盒/合规审计)都还停留在"功能存在但不可信"的阶段,真正达到券商 / 资管可用的"投资版 Claude Code"还有 8-12 个 P0 工作要做。

本次 change 不再重复 archived `top-tier-investment-assistant` 已经覆盖的 13 个新 capability 设计(那些已经基本落地),而是要做三件事:
- **A. 现状权威盘点**:把 upup 现有 19807 行 agent 代码、240+ tools、50 skills、daemon/kairos/coordinator/bridge/realtime/multi-agent/event-bus/feature-gates 等子系统全部映射到 ASCII 架构图
- **B. 与 loucode(Claude Code clone)能力对标**:逐项对比 30+ 关键能力,标注"已有/有但弱/缺失/不适用",输出一张能力差矩阵
- **C. 生产级投资助手改造路线图**:基于现状,识别 8-12 个 P0/P1 工作,补齐"投资版 Claude Code"真正生产可用的最后几公里

## What Changes

### A. 现状架构盘点(不写代码,只交付文档 + ASCII 图)

- **A.1** 在 `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/architecture-current.md` 写一份 **upup 当前架构权威文档**,包含:
  - ASCII 系统架构图(L0 整体,8 个子系统 + 边界)
  - ASCII Agent Loop 时序图(用户输入 → IntentDetect → PlanMode → Loop → Compact → Final Answer)
  - ASCII 5-Phase Investment Workflow 数据流图
  - ASCII Daemon/KAIROS/Coordinator 协作图
  - ASCII Bridge/Realtime/EventBus 数据通路图
  - ASCII 状态机图(Session / Plan / KAIROS Task / Coordinator)
- **A.2** 在 `docs/capability-matrix.md` 写一份 **upup × loucode 能力对标矩阵**,涵盖 30+ 能力维度:
  - LLM Provider、Tool System、Skill System、Memory、Context、Compaction
  - Subagent、Coordinator、Multi-Agent、Sessions
  - Cron、Heartbeat、KAIROS、Proactive
  - Bridge、Remote、SessionsWebSocket、SSH
  - Realtime、EventBus、Reactive
  - Permissions、Cost、OutputStyles、Voice
  - Buddy、Migrations、Setup、Project Onboarding
  - 投资域特定:Trading Sandbox、Brinson Attribution、5-Phase Workflow、Risk Dashboard、Portfolio Review
- **A.3** 在 `docs/architecture-debt.md` 写 **架构债清单**:
  - 单文件超长(agent.ts 1305 行)需要拆分
  - 模块边界泄漏(`agent/` 内部 import `tools/` 反向引用)
  - 状态机散落(Plan、KAIROS、Coordinator、Session 各自一套)
  - 测试覆盖(276 个测试文件 vs 296 个 tools 文件,比例不足)
  - TypeScript 严格度(allowed any 出现频次)
  - Bun 兼容性(部分 npm 包如 `@whiskeysockets/baileys` 风险)
- **A.4** 在 `docs/production-readiness-checklist.md` 写 **生产级别投资版 Claude Code 改造路线图**(8-12 个 P0 工作):
  - P0-1 投资分析可解释性 / P0-2 回测保真度 / P0-3 沙盒交易审计 / P0-4 实时风控
  - P0-5 合规边界 / P0-6 多数据源对账 / P0-7 KAIROS 生产化 / P0-8 Bridge 安全加固
  - P0-9 Agent Loop 拆分 / P0-10 状态机统一 / P0-11 错误处理 + 降级 / P0-12 性能 + 资源
- **A.5** 在 `docs/comparison-with-competitors.md` 写 **国际/国内顶级投资助手对标**(基于 archived `top-tier-investment-assistant` 的 6 层能力模型刷新):
  - 国际: AlphaSense / Hebbia / FinChat / BlackRock Aladdin
  - 国内: 同花顺 i 问财 / 东方财富 Choice / 招商 MindGo / Wind
  - 大模型投资助手: GPT-4o Investing / Anthropic Claude Finance / 智增增

### B. 不实现代码(本次 change 范围)

本次 change **只交付文档 + ASCII 图**,**不修改任何 src/ 代码**。所有 P0/P1 改造工作将作为后续 change(`production-grade-investment-v1`、`agent-loop-refactor` 等)单独 OpenSpec 流程推进。

**为什么只做文档不做代码**:本次任务的本质是"看清全局 + 对齐预期 + 排定优先级",不是"做某个具体功能"。后续 8-12 个 P0 每个都是独立大模块,每个都值得一个完整的 OpenSpec 流程(proposal + 5-10 specs + design + tasks + phase guard)。

### C. 范围之外(明确不做的)

- **不重复 archived `top-tier-investment-assistant` 的 13 个新 capability spec**——那些已经基本实现,本 change 只是引用
- **不重写 agent.ts 拆分**——这是 P0-9,留作后续 change
- **不实现 P0-1 ~ P0-12 任何一项**——都留作后续 change
- **不修改测试 / 构建 / CI 配置**
- **不修改 CLI 行为 / 不发布新版本**

## Capabilities

### New Capabilities

- `upup-current-architecture`: upup 现状架构权威盘点 + ASCII 图集(文档型 capability,无代码)
- `upup-vs-loucode-capability-matrix`: upup × loucode 能力对标矩阵(30+ 维度)
- `architecture-debt-register`: 架构债清单 + 影响面评估
- `production-readiness-roadmap`: 投资版 Claude Code 生产级改造路线图(8-12 个 P0 工作)
- `investment-domain-benchmark`: 投资助手行业对标(国际/国内/大模型三轴)

### Modified Capabilities

无——本次 change 不修改任何已存在 capability 的需求。

## Impact

### 受影响文档

- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/architecture-current.md` —— 新建
- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/capability-matrix.md` —— 新建
- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/architecture-debt.md` —— 新建
- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/production-readiness-checklist.md` —— 新建
- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/comparison-with-competitors.md` —— 新建
- `openspec/changes/upup-vs-loucode-gap-audit-and-roadmap/docs/ascii-diagrams.md` —— 新建(独立成册,方便嵌入到上述文档)

### 不影响

- 任何 `src/` 下的 TypeScript 代码
- 任何 `packages/` 下的 workspace package
- 任何 `src/skills/**/SKILL.md`
- 任何 `src/commands/**`
- `package.json` / `bunfig.toml` / 任何构建脚本
- 任何 `.upup/settings.json` / `.env`
- 任何 CI 配置 / GitHub workflow
- 任何测试文件

### 受影响依赖/系统

无(本次 change 不引入任何 npm 依赖、不修改任何系统路径、不要求用户迁移配置)。

### 受影响用户

无——本次 change 是纯文档审计,所有现有 upup 用户行为不变。

### 利益相关者

- **产品/架构师**:用这份架构图 + 能力矩阵 + 路线图对齐未来 6-12 个月 roadmap
- **新 contributor onboarding**:用 ASCII 图理解系统全貌,缩短 ramp-up
- **投资人/合作方**:用对标文档理解 upup 在国际/国内的定位
- **后续 change 作者**:以本路线图为索引,挑一个 P0 开新 change

## Non-Goals

- **不做任何代码修改**(零 `src/` 改动)
- **不发布新版本 / 不改版本号**
- **不修改 CI / 测试 / 构建**
- **不引入 npm 依赖**
- **不修改用户配置 / 行为**
- **不实现任何 P0/P1 改造**(都留作后续 change)
- **不复刻 archived `top-tier-investment-assistant` 任何已经完成的 capability**
- **不评估具体第三方库替代**(如"是否要换 LangChain → 直接调 OpenAI SDK")——这是后续 change 的范围

## Constraints

- **格式约束**:所有 ASCII 图必须用 `+`、`-`、`│`、`┌`、`┐`、`└`、`┘`、`├`、`┤`、`─`、`↓`、`→` 等 Unicode box-drawing 字符,纯文本可读
- **语言约束**:文档主体中文,代码片段 / spec id / API 名称英文
- **范围约束**:文档总篇幅控制在 50-80 KB,5 份文档各 10-15 KB,ASCII 图单图不超过 200 行
- **正确性约束**:每张 ASCII 图必须和实际 `src/` 代码一致(读者按图找代码能直接命中)
- **可审计约束**:每个"已实现/缺失"判断都引用 `src/xxx/xxx.ts:Lxx` 或 `src/skills/xxx/SKILL.md`,可回溯
