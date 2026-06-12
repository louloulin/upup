## Context

UpUp (涨涨) 截至 2026-06-06,经过 8 轮 Sprint 打磨,代码规模:

| 模块 | 路径 | 文件数 | 关键文件 | 行数 |
|------|------|--------|---------|------|
| Agent 核心 | `src/agent/` | 60+ | `agent.ts` (1305L)、`scratchpad.ts` (557L)、`compact.ts` (454L)、`subagent-runner.ts` (631L) | ~19807 |
| Skills | `src/skills/` | 50 SKILL.md + 40+ TS | 50 个投研 skill | -- |
| Tools | `src/tools/` | 77 目录, 296 .ts | finance/portfolio/backtest/trading/screening/... | -- |
| KAIROS 持续监控 | `src/kairos/` | 9 | scanner/position-monitor/proactive | -- |
| Bridge 远程 | `src/bridge/` | 28 | server/session-sync/protocol/auth | -- |
| Coordinator 多 Agent | `src/coordinator/` | 13 | coordinatorMode/worker-xml/verification | -- |
| Realtime 行情 | `src/realtime/` | 9 | eastmoney-feed/throttled-feed/aggregator | -- |
| Multi-Agent | `src/multi-agent/` | 27 | coordinator/team-manager/scheduler/verifier | -- |
| Daemon | `src/daemon/` | 9 + workers | session/supervisor/worker-pool | -- |
| Event Bus | `src/core/` | 1 | event-bus.ts | -- |
| Cron | `src/cron/` | 6 | schedule/store/runner | -- |
| Plans | `src/plan/` | -- | plan-builder/plan-executor/research-plan | -- |
| Memory | `src/memory/` | -- | flush/extraction/observation-buffer | -- |
| Investment Workflow | `src/commands/investment/` | 15 | phase-handlers/invest/portfolio-review/... | -- |
| i18n | `src/i18n/` | -- | EN+zh-CN 强类型 | -- |
| Tests | `src/**/*.test.ts` | 276 | -- | -- |
| Workspace packages | `packages/` | 18 | llm/agent-core/skills/mcp/... | -- |

**核心架构已经成型**:Agent Loop (1305L) + Scratchpad (557L) + Compact (454L) + Subagent + Plan Mode + Tool Filter + Multi-Provider LLM + Event Bus + Feature Gates (compile/startup/runtime) + 5-Phase Investment Workflow (research/valuation/backtest/trade/review) + SandboxBroker + Brinson Attribution + Daemon Session + KAIROS Proactive + Bridge WebSocket + Realtime EastMoney + Coordinator Worker Pool + i18n EN+zh-CN + 50 Skills + 296 Tool Files。

**但 3 个根本问题没解决**:
1. **没有"权威架构图"**:新人必须读 agent.ts(1305L)+ 8 个子系统 + 18 个 packages 才能拼出全貌
2. **没有"能力差矩阵"**:与 loucode(Claude Code clone)的 30+ 能力维度对标没做过
3. **没有"生产级路线图"**:从"强 demo"到"真生产"还差什么,没说清楚

## Goals / Non-Goals

**Goals:**

1. **交付 5 份权威文档**(`docs/architecture-current.md`、`docs/capability-matrix.md`、`docs/architecture-debt.md`、`docs/production-readiness-checklist.md`、`docs/comparison-with-competitors.md`)和 1 份 ASCII 图集(`docs/ascii-diagrams.md`)
2. **提供 8-12 张 ASCII 架构图**:系统总览 / Agent Loop 时序 / 5-Phase Workflow / Daemon+KAIROS+Coordinator 协作 / Bridge+Realtime+EventBus 通路 / 状态机 / 错误处理 / 性能 / 安全
3. **提供 30+ 维度能力对标矩阵**(upup × loucode × 国际/国内竞品 × 大模型投资助手)
4. **输出 8-12 个 P0 工作的可执行路线图**(每个 P0 给出:影响面 / 优先级 / 依赖 / 预计工期 / 验收标准)
5. **每张 ASCII 图严格对应 src/ 代码**:每个节点引用具体 `src/xxx/xxx.ts:Lxx`

**Non-Goals:**

- **零代码改动**:本次 change 不写 / 改 / 删任何 src/ 文件
- **零依赖新增**:不引入 npm 包、不修改 package.json
- **零测试改动**:不修改测试文件
- **零构建/CI 改动**:不修改 build/release/CI 配置
- **零 P0/P1 实现**:所有 P0 改造工作留作后续 change
- **不复刻 archived `top-tier-investment-assistant`**:那是已实现的 13 个 capability,本 change 只引用不重复
- **不重写 agent.ts**:那是 P0-9,留作后续 change

## Decisions

### D.1 文档组织:5 份独立文档 + 1 份 ASCII 图集

**决策**:不把所有内容塞进一份 `audit.md`,而是拆成 5 份独立 Markdown + 1 份 ASCII 图集,各自 10-15KB。

**理由**:
- 5 份文档面向不同读者(架构师 / 新人 / 投资人 / 后续 change 作者 / 竞品分析师)
- ASCII 图集独立成册,方便嵌入到其他文档
- 每份文档可以独立 review、独立迭代

**替代方案考虑**:
- ❌ 全部塞 1 个 `audit.md`(80KB 单文件)→ 太大,加载慢,读者抓不住重点
- ❌ 1 份 ASCII + 1 份文字(2 份)→ ASCII 图散落在文字里难找

### D.2 ASCII 图集独立文件 + 编号引用

**决策**:`docs/ascii-diagrams.md` 集中放 8-12 张 ASCII 图,每张图有独立编号(图 1 ~ 图 N),其他文档通过"图 N 见 ascii-diagrams.md §X"引用。

**理由**:
- 避免 ASCII 图散落在 5 份文档里,改图要改多处
- 集中维护:架构变了,改一处即可
- 阅读路径清晰:看文字跳到图、看图跳回文字

**替代方案考虑**:
- ❌ ASCII 图直接嵌在文字里 → 文字被图打断,长文档难读
- ❌ 每份文档各自重复一份图 → 改架构要改 5 处

### D.3 能力矩阵使用 5 状态:`已有强` / `已有弱` / `缺失` / `不适用` / `超 loucode`

**决策**:能力对标矩阵使用 5 个状态标签,而不是 3 状态(有/缺/弱)。

**理由**:
- 5 状态能区分"upup 比 loucode 强"(如 A 股专属数据栈)
- "不适用"明确"投资域不需要这个能力"(如 SSH 远程 shell)
- 后续 change 排序时,只对"缺失"和"已有弱"做工作

**替代方案考虑**:
- ❌ 3 状态(有/弱/缺)→ 模糊了"upup 独有的能力"
- ❌ 二元(有/无)→ 失真,无法表达"70% 实现"的中间态

### D.4 P0/P1 路线图不写实现细节,只写"做什么 / 为什么 / 验收"

**决策**:P0 路线图每条只写:`影响面 / 优先级 / 依赖 / 预计工期 / 验收标准`,**不写** "如何实现 / 改哪些文件"。

**理由**:
- 本次 change 不写代码,只排优先级
- "如何实现"留给后续 change 的 proposal.md + design.md + tasks.md 三件套
- 路线图太长(每条 5KB × 12 = 60KB)→ 失控
- 路线图太长 → 没人读

**替代方案考虑**:
- ❌ P0 路线图写实现细节 → 变成另一个 spec-driven change,职责混乱
- ❌ P0 路线图只写 1 行总结 → 信息密度太低,排期无法参考

### D.5 不修改任何 spec、只创建 5 个文档型 capability

**决策**:5 个新 capability 都是 "文档型"(`upup-current-architecture` 等),**不写 spec.md 中的"需求"**(因为是文档不是代码)。

**理由**:
- spec-driven schema 默认期望"代码 + 测试"二选一,但本次 change 纯文档
- 用"文档型 capability"表达"这只是一组 markdown,不需要代码 + 测试"
- 避免强行写 spec.md 造假需求

**替代方案考虑**:
- ❌ 把 5 个 capability 当代码 spec 写 → 文档型 capability 强行造需求,会失真
- ❌ 不用 capability,只写 docs/ → 失去 OpenSpec 治理能力,后续 change 无法引用

### D.6 文档语言策略:中文为主,英文术语保真

**决策**:5 份文档主体中文(产品 / 架构师 / 投资人对齐),但所有 spec id、API 名称、文件路径、`BUN_CONFIG_FEATURE_*` 等术语保真英文。

**理由**:
- 用户明确要求"使用中文说明"
- 国际化开源项目术语统一(中英混用反而失真)
- 文件路径 / 环境变量 / 命令行参数必须是英文

**替代方案考虑**:
- ❌ 全英文 → 不符合用户要求
- ❌ 全中文 → 术语错位,搜索失真

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **ASCII 图与代码脱节**:写文档时按理解画图,后续代码改了图没跟上 | 每张图都标注"对应 src/xxx:Lxx",code review 时同时 review 图 |
| **能力矩阵的"5 状态"主观**:判断"已有弱"还是"缺失"容易扯皮 | 每个判断引用具体文件行号,review 时逐项核对 |
| **P0 工期估计不准**:路线图的"预计工期"很容易低估 | 用 1-3-5 人天(小)/ 1-2 人周(中)/ 1-3 人月(大)三档,标"乐观/现实/悲观" |
| **5 份文档被人跳过**:读者只看其中 1-2 份 | 在每份文档开头加 1 段"其他 4 份文档讲什么"导航 |
| **ASCII 图单图超过 200 行**:系统复杂时一张图画不下 | 拆成"图 N-主图"和"图 N-子图 A/B/C",主图给概览,子图给细节 |
| **文档写完但没人读**:典型 documentation rot | 路线图作为 OpenSpec change 的产物,后续 P0 change 必须引用它,自然有人看 |
| **archived `top-tier-investment-assistant` 与本 change 内容重叠**:13 个 capability 已被那个 change 覆盖 | 明确"本 change 不重复那 13 个 capability",只在引用时点名 |
| **"生产级别"定义模糊**:不同读者对"生产级别"理解不同 | 用 5 个具体验收维度(准确率/可解释性/可观测/可恢复/可审计)统一口径 |

## Migration Plan

本次 change 是纯文档,**没有 migration**(无版本切换、无配置迁移、无数据迁移)。但**文档发布流程**如下:

### 阶段 1(本次 change 内)

1. 写 `docs/architecture-current.md` —— 系统架构权威盘点 + ASCII 图引用
2. 写 `docs/capability-matrix.md` —— upup × loucode 30+ 维度对标
3. 写 `docs/architecture-debt.md` —— 架构债清单
4. 写 `docs/production-readiness-checklist.md` —— 8-12 个 P0 路线图
5. 写 `docs/comparison-with-competitors.md` —— 投资助手行业对标
6. 写 `docs/ascii-diagrams.md` —— 8-12 张 ASCII 图集
7. commit,PR review,merge

### 阶段 2(后续 change 引用)

后续每个 P0 change(`production-grade-investment-v1`、`agent-loop-refactor`、`state-machine-unify` 等)在 proposal.md 开头**必须**引用本 change 的 `docs/production-readiness-checklist.md` 编号,确保路线图被落地。

### 阶段 3(本 change 归档)

- 当后续 8-12 个 P0 change 全部 archived 后,本 change 也可 archive
- 路线图完成度 = archived P0 count / 12

## Open Questions

1. **5 份文档是否需要双语文档**(zh-CN + en)?当前只做 zh-CN,后续要不要补 en 版?
2. **ASCII 图是否要"可点击"链接化**(用 mermaid 替代纯文本)?mermaid 比 ASCII 信息密度低,但可以交互
3. **能力矩阵是否要加"投资域特定"维度**(A 股 / 港股 / 美股 / 加密 / 期权 / 期货)?当前默认只覆盖 A 股 + 港股
4. **P0 路线图是否要按团队排期**(前端 / 后端 / 数据 / 算法)?当前只按"逻辑模块"排
5. **archived `top-tier-investment-assistant` 的 13 个新 capability 是否要"刷新一遍"** 验证已实现?当前默认信任"基本实现",但缺一份验证
6. **架构图是否要画到 packages/ 层**(`@upup/llm` / `@upup/agent-core` / ...)?当前默认只画 src/ 内部
7. **P0-1 ~ P0-12 之间的依赖关系**如何处理?比如 P0-9(Agent Loop 拆分)是 P0-10(状态机统一)的前置,但 P0-9 自身是大工程
8. **"生产级别"的投资域 benchmark 用什么数据集**?A股 + 美股的历史数据 + 已知事件(如 2015 股灾、2020 疫情)可作为测试集
