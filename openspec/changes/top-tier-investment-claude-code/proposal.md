# Proposal: 顶级投资助手的 Claude Code (top-tier-investment-claude-code)

> **目的**:在 v2(已完成 96/191,聚焦"广度"——加 25 个新 spec)的基础上,**v3 聚焦"深度"**——把 Claude Code 的 5 层架构、loucode 还原出的 7 大隐藏功能、6 状态机主动模式、6 类任务运行时,真正"投研特化"到 upup 体内,把 upup 做成"既能回测、又能交易、还能远程协同;既能选股、又能研究、还能持续监控"的一流投研 Claude Code。

---

## Why

`top-tier-investment-assistant-v2`(简称 v2)从 2026-06-03 启动,核心思路是"加 25 个新 spec 把 v1 骨架填满":algo-trading / alt-data / bridge-mode / portfolio-attribution / session-sync + coordinator-v2 / feature-gates-v2 / bridge-v2 / kairos-proactive / task-runtime / worktree-isolation / plan-mode-v2 / monitor-task / brief-tool / telemetry-events + research-deep-search / matrix-analysis / nl-screener / intent-routing-zh / institutional-data-feed / tradingagents-compat。

到 2026-06-04,v2 已经推进 96/191(spec 1-4.5 落地,4.6/4.7/5/6/7 仍在 todo),upup 现状:**941 个 .ts/.tsx 文件、~200K LOC、50 个 SKILL.md、286 个 tool 文件、71 个 agent 文件**,5 个能力组(realtime / coordinator / kairos / trading / portfolio)已成型。

但对照 `loucode` 还原的 Claude Code 1,987 个 .ts/.tsx、210 个 tool、107 个 hook、33 个 bridge 文件、6 状态机、6 类任务运行时,以及对照 loucode `docs/` 总结出的 7 大隐藏功能(BUDDY / KAIROS / ULTRAPLAN / COORDINATOR / HIDDEN-COMMANDS / BRIDGE / FEATURE-GATES),v2 仍有 3 类缺口未补:

1. **架构层缺口**:v2 还在"加工具"模式,没有从 Claude Code 的 5 层架构(L1 基础循环 → L2 工具技能 → L3 多 Agent 编排 → L4 远程协同 → L5 持续自主)角度重塑 upup 的"投研 Claude Code 体系"。KAIROS 持续助手 / BUDDY 情感化交互 / ULTRAPLAN 云端深度规划 / 隐藏命令生态 / 编译开关 3 层门控这 5 个层面,upup 都没真正落地。
2. **投研域特殊能力缺口**:v2 重点放在"加竞品能力"(AlphaSense / Hebbia / FinChat / 问财 / Choice),但**对"投资决策—回测—交易—复盘"完整闭环**的"投研 Claude Code"形态没有顶层设计。具体包括:
   - **投研 Coach**:没有人格化、可持续学习的"投研 Claude"助手(类似 Claude Code 主对话);
   - **回测全链路**:`tools/backtest/` 雏形到"数据→策略→撮合→归因→报告"全链路;
   - **交易全链路**:sandbox + 2 broker 雏形到"策略→风控→下单→确认→监控→复盘";
   - **多用户协同**:Bridge 雏形到"本地 CLI ↔ 网页 ↔ 微信(飞书/钉钉) ↔ 移动端";
   - **KAIROS 投研特化**:盘中异动 / 财报日历 / 政策事件 / 行业轮动,跨日持久。
3. **差异化定位缺位**:v2 还没有把"4 个唯一"(CLI-first / 完全开源 / A 股+美股+港股+加密全覆盖 / 多 Agent+KAIROS+Bridge 三件套)讲清楚,没有把"对标竞品差异"形成"投资者决策路径"的可执行流程图。

v3 目标:用 1 turn 完成"全面分析"——基于 v2 baseline,做 ① 竞品定位矩阵(v2 已做,v3 增补 + 量化)② loucode 7 隐藏功能 → upup 投研 Claude Code 映射 ③ upup 现状能力盘点(5 layer 视角)④ 三维 gap 分析 ⑤ 5 layer + 7 隐藏 + 4 唯一 的综合改造计划,**形成可执行的 7 sprint v3 计划**。

---

## What Changes

### A. 顶层架构变更(2 项)

- **A1 引入"投研 Claude Code 5 层架构"**:把 upup 重塑为 5 层投研 Claude Code,每层对应 v3 新 spec
  - L1 基础循环:agent.ts / scratchpad / context / compaction(已稳定,投研 prompt 增强)
  - L2 工具 + 技能:tools/ + skills/ + 50 SKILL.md(扩到 80+) + MCP
  - L3 多 Agent:Coordinator V2 + Subagent + Task Runtime 6 类 + Worktree 隔离
  - L4 远程协同:Bridge 双模式 + Session Sync + 微信/飞书/钉钉推送
  - L5 持续自主:KAIROS 6 状态机 + Proactive + Telemetry + Dream 记忆整合
- **A2 引入"投研 Claude 主对话"**:`src/agent/role-system.ts` 定义"投研 Claude"人格(中文、对用户友好、引用源、有风险提示),主对话直接当 LLM 系统 prompt 的一部分,所有 subagent 继承

### B. loucode 7 隐藏功能 → 投研 7 增强(7 项)

| loucode | 投研 Claude Code | 差距 |
|---------|-----------------|------|
| **BUDDY**(虚拟宠物,情感化) | **投研 Coach 人格**:晨会/盘后/财报日/政策日推送个性化问候(不学 BUDDY 的电子宠物) | v2 缺,v3 新增 `coach-mode` |
| **KAIROS**(永不关机的 Claude) | **投研 KAIROS**:跨日持久、每日 dream 整合记忆、Proactive 6 状态机 | v2 雏形 8 文件,v3 升级 `kairos-v2` |
| **ULTRAPLAN**(云端 Opus 30 分钟规划) | **投研深度规划**:支持"长任务规划"——3 个月投资计划 / 年度组合复盘 / 行业深度研究 | v2 缺,v3 新增 `deep-plan` |
| **COORDINATOR**(多 Agent 4 阶段) | **投研 Coordinator V2**:主只调度,Worker 才执行;Worker XML 协议;失败续接;真实验证 | v2 雏形,v3 升级 `coordinator-v2`(已在 v2 plan) |
| **HIDDEN-COMMANDS**(50+ 隐藏开关) | **投研隐藏命令生态**:`/morning-brief` `/earnings-preview` `/risk-dashboard` `/portfolio-review` `/watchlist-edit` `/rebalance-now` 等 20+ 投研隐藏命令,通过 `feature()` 编译开关门控 | v2 部分,v3 完整化 `cli-extension` |
| **BRIDGE**(远程遥控终端) | **投研 Bridge**:本地 CLI ↔ 网页控制台 ↔ 微信/飞书/钉钉 ↔ 移动端 | v2 雏形 12 文件,v3 升级 `bridge-v2` + `multi-channel-bridge` |
| **FEATURE-GATES**(3 层门控) | **投研 Feature Gates 升级**:50+ 编译开关 + GrowthBook 灰度 + DCE friendly | v2 雏形 3-level,v3 升级 `feature-gates-v2` |

### C. 投研域 5 个核心 spec(在 v2 基础上加深)

- **C1 投研 Coach**(`coach-mode`):人格化助手,主对话即投研 Claude,跨会话记忆,主动推送(晨会 / 盘后 / 财报)
- **C2 回测全链路**(`backtest-v2`):数据→策略→撮合→归因→报告 5 步走通,产出净值曲线、夏普、最大回撤、归因分析
- **C3 交易全链路**(`trading-loop`):策略→风控→下单→确认→监控→复盘 6 步,sandbox 默认 + 4 algo + 4 broker 适配
- **C4 持续监控**(`kairos-v2`):盘中异动 / 财报日历 / 政策事件 / 行业轮动 / 风险预警,跨日持久 + dream 整合
- **C5 远程协同**(`bridge-v2` + `multi-channel-bridge`):本地 CLI ↔ 网页 ↔ 微信 / 飞书 / 钉钉 ↔ 移动端,远程审批 + 中断 + 切换模型

### D. 4 个唯一差异化(新增 spec,讲清楚定位)

- **D1 CLI-first Claude Code 形态**:把"投研 Claude Code 装进终端"作为产品故事的支柱,对应 `cli-extension` 大量隐藏命令 + TUI 美化
- **D2 完全开源 + 自托管**:作为合规场景刚需,在 README / 部署文档强化(不动 spec,只动 docs)
- **D3 A 股 + 美股 + 港股 + 加密四市场全覆盖**:在 capability-manifest.ts 显式分 4 market groups,确保 tool 设计全覆盖
- **D4 多 Agent + KAIROS + Bridge 三件套**:在 `src/agent/role-system.ts` / `src/kairos/` / `src/bridge/` 显式"投资 Claude Code 三件套"提示

### E. 非破坏性内部重构

- `src/agent/capability-manifest.ts` 从 5 group 升级为 5 layer + 5 group 双视角
- `src/agent/feature-gates.ts` 从 3-level 升级为 50+ 编译开关 + GrowthBook 灰度
- `src/skills/` 50 → 80+ SKILL.md,新加"投研 Coach 每日简报"、"组合再平衡"、"风险仪表盘"等 chainable skills
- `src/coordinator/` 从 4 Worker 升级为 6 Worker 雏形(基本面/技术/资金/情绪/政策/行业)

### F. 破坏性变更(明确标记)

- **BREAKING**:`src/agent/capability-manifest.ts` 的 5 group 顺序会变(加 layer 维度),下游消费方需 read 时兼容(用 `?? []` 兜底)
- **BREAKING**:`src/agent/role-system.ts` 新增,主对话 system prompt 会拼一段"投研 Claude"人设,可能改变原有行为(可通过 `UPUP_COACH_MODE=0` 关闭)

---

## Capabilities

### New Capabilities(5 个)

- `claude-code-5layer`:5 层投研 Claude Code 顶层架构(SPEC 文档,描述分层与跨层协议)
- `coach-mode`:投研 Coach 人格化主对话(独立 spec,因为跨多组件)
- `deep-plan`:长任务深度规划(类似 loucode ULTRAPLAN,但本地化 + 投研域)
- `cli-extension`:CLI 隐藏命令生态(20+ 投研隐藏命令)
- `investment-3d-positioning`:"4 个唯一"差异化定位文档(产品 + 文档交付)

### Modified Capabilities(2 个,已存在的能力被加深)

- `kairos` (Sprint 2.4 + 5.1):升级到 loucode 6 状态机 + AutonomyMode + Dream 整合
- `bridge` (Sprint 2.3 + 5.6):升级到 34 文件 + 多渠道(微信/飞书/钉钉)

### Capabilities NOT in v3(已存在于 v2,不重复)

- coordinator / feature-gates / task-runtime / worktree-isolation / plan-mode-v2 / monitor-task / brief-tool / telemetry:在 v2 的 spec/ 中已建,v3 只**深化**不重建
- 7 竞品对标(research-deep-search / matrix-analysis / nl-screener / intent-routing-zh / institutional-data-feed / tradingagents-compat / web-search 增强):在 v2 spec/ 中已建,v3 只**使用**不重复

---

## Impact

| 维度 | 影响 | 缓解 |
|------|------|------|
| 现有 SKILL.md | 新增 30+ SKILL.md(从 50 升到 80+),需保持现有 50 个不破坏 | 走 `feature()` 开关,默认不加载新 SKILL.md,`UPUP_LOAD_ALL_SKILLS=1` 才全量 |
| 现有 tool | 5 group → 5 layer + 5 group 双视角,manifest.ts 字段扩展 | 下游消费用 `?? []` 兜底 |
| Agent 主循环 | agent.ts 投研 prompt 增强(主对话人设) | 通过 `UPUP_COACH_MODE=0` 可关闭,默认 `UPUP_COACH_MODE=1` |
| 配置文件 | `.upup/settings.json` 加 `coach`, `kairos_v2`, `bridge_v2` 开关 | 默认 `false`,用户主动开 |
| 包大小 | 50+ 编译开关 + 30+ SKILL.md,bundle 会涨 | DCE friendly:用 `feature('XXX')` 包,build 时 DCE |
| 启动时间 | 多 30+ SKILL.md 启动扫描耗时 | lazy-load:只在 `feature` 启用时才加载 |
| 兼容性 | v2 已落地的 96 spec 测试必须全绿 | 任何 v3 PR 必须 `bun test` 全绿 + `bun run typecheck` 全绿才能合 |

---

## Open Questions(等用户确认)

1. **coach-mode 范围**:投研 Coach 是个独立 spec 还是 coach 人设直接进主对话 system prompt?建议后者(简单,scope 小)。
2. **deep-plan 形态**:是本地多 Agent 协作 30 分钟,还是接云端(类似 loucode ULTRAPLAN)?建议本地优先,云端等 v4。
3. **cli-extension 命令清单**:20+ 隐藏命令优先级怎么排?建议先做 5 个高优(`/morning-brief` `/earnings-preview` `/risk-dashboard` `/portfolio-review` `/watchlist-edit`),其余按反馈加。
4. **3D 定位文档形态**:是单独 README 还是嵌入主 README + 一段 30 字 sologan?建议后者。
5. **v2 / v3 关系**:v3 完全替代 v2,还是 v3 是 v2 的"v2.1 增量"?建议 v3 = v2 的 v3 增量,任务不重复。
6. **5 layer 视角的 manifest.ts**:是字段扩展(向后兼容)还是新增文件(更干净)?建议字段扩展,`?? []` 兜底。
