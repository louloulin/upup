## 1. 准备阶段(0.x)

- [ ] 1.1 通读 `src/agent/agent.ts` 全文(1305L)并标注关键方法
- [ ] 1.2 通读 `src/agent/scratchpad.ts`、`src/agent/compact.ts`、`src/agent/subagent-runner.ts` 全文
- [ ] 1.3 通读 `src/daemon/`、`src/kairos/`、`src/coordinator/`、`src/realtime/`、`src/bridge/`、`src/multi-agent/` 顶层入口
- [ ] 1.4 通读 `src/commands/investment/phase-handlers.ts` 5 个 phase 真实工具映射
- [ ] 1.5 通读 `src/agent/feature-gates.ts` 三级门控
- [ ] 1.6 通读 `src/core/event-bus.ts` API
- [ ] 1.7 通读 `src/skills/investment/` 6 个核心投研 skill
- [ ] 1.8 通读 archived `top-tier-investment-assistant` 的 13 个 capability spec 确认已实现
- [ ] 1.9 通读 `loucode/src/` 30+ 关键文件(buddy/voice/ssh/remote/server/jobs/...)列出 30+ 能力维度
- [ ] 1.10 跑 `find src -name "*.test.ts" | wc -l` 和 `find src/tools -name "*.ts" | wc -l` 拿到最新数字

## 2. 现状架构盘点(对应 capability: upup-current-architecture)

- [ ] 2.1 在 `docs/architecture-current.md` §1 写"模块清单表"(15+ 行,模块/路径/文件数/总行数)
- [ ] 2.2 在 `docs/architecture-current.md` §2 画 ASCII 系统总览图(图 1:8 子系统 + i18n + 18 packages + 调用方向)
- [ ] 2.3 在 `docs/architecture-current.md` §3 画 ASCII Agent Loop 时序图(图 2:用户输入 → IntentDetect → PlanMode → Loop → Compact → Final Answer)
- [ ] 2.4 在 `docs/architecture-current.md` §4 画 ASCII 5-Phase Workflow 数据流图(图 3:research → valuation → backtest → trade → review)
- [ ] 2.5 在 `docs/architecture-current.md` §5 画 ASCII Daemon + KAIROS + Coordinator 协作图(图 4:消息通路 + 状态共享 + 生命周期)
- [ ] 2.6 在 `docs/architecture-current.md` §6 画 ASCII Bridge + Realtime + EventBus 数据通路图(图 5:WebSocket ↔ EventBus ↔ EastMoney)
- [ ] 2.7 在 `docs/architecture-current.md` §7 画 ASCII 状态机图(图 6-9:Session/Plan/KAIROS Task/Coordinator Task 各一张)
- [ ] 2.8 在 `docs/ascii-diagrams.md` 集中维护 8-12 张 ASCII 图,带编号(图 1-图 N),其他文档通过"图 N 见 ascii-diagrams.md §X"引用
- [ ] 2.9 校验:每张图节点都能在 `src/` 找到对应文件,引用行号偏差 ≤ 5%

## 3. 能力对标矩阵(capability: upup-vs-loucode-capability-matrix)

- [ ] 3.1 在 `docs/capability-matrix.md` §通用能力 写 12 维度表:LLM Provider / Tool System / Skill System / Memory / Context / Compaction / Subagent / Coordinator / Multi-Agent / Sessions / Permissions / Cost
- [ ] 3.2 在 `docs/capability-matrix.md` §监控与远程 写 8 维度表:Cron / Heartbeat / KAIROS / Proactive / Bridge / Remote Sessions / Sessions WebSocket / SSH
- [ ] 3.3 在 `docs/capability-matrix.md` §数据通路 写 5 维度表:Realtime / EventBus / Reactive / Stream Mode / Stream Progress
- [ ] 3.4 在 `docs/capability-matrix.md` §人机交互 写 5 维度表:OutputStyles / Voice / Buddy / Vim / Migrations
- [ ] 3.5 在 `docs/capability-matrix.md` §投资域特定 写 8 维度表:Trading Sandbox / Brinson / 5-Phase Workflow / Risk Dashboard / Portfolio Review / Watchlist Edit / Investment Subagents / Intent Detector
- [ ] 3.6 校验:每行 5 状态评估都有引用文件,无空字段

## 4. 架构债清单(capability: architecture-debt-register)

- [ ] 4.1 在 `docs/architecture-debt.md` §单文件超长 列出至少 4 个 > 800L 文件,每个标注"建议拆分"和"目标 < 400L"
- [ ] 4.2 在 `docs/architecture-debt.md` §模块边界泄漏 列出至少 3 个泄漏点,每个引用具体 `import` 语句
- [ ] 4.3 在 `docs/architecture-debt.md` §状态机散落 列出 4 套独立状态机,3 列对比(状态名 / 触发器 / 持久化)
- [ ] 4.4 在 `docs/architecture-debt.md` §测试覆盖 评估当前 276 测试 / 296 工具,核心模块覆盖率
- [ ] 4.5 在 `docs/architecture-debt.md` §TypeScript 严格度 评估 `as any` 出现频次
- [ ] 4.6 在 `docs/architecture-debt.md` §Bun 兼容性 列出至少 2 个 npm 包风险(baileys/better-sqlite3)
- [ ] 4.7 在 `docs/architecture-debt.md` §依赖图 列出 18 个 workspace packages 的依赖关系,标注循环依赖候选
- [ ] 4.8 在 `docs/architecture-debt.md` §错误处理 列出主要错误模式(LLM 超时 / API 限流 / 数据源失效)的处理是否一致

## 5. 生产级别路线图(capability: production-readiness-roadmap)

- [ ] 5.1 在 `docs/production-readiness-checklist.md` §P0-1 投资分析可解释性,引用 `src/skills/decision-dashboard/SKILL.md` 等 3 个,验收标准:输出含"为什么"段
- [ ] 5.2 在 §P0-2 回测保真度,引用 `src/tools/backtest/`,验收标准:3 个历史事件回测误差 ≤ 5%
- [ ] 5.3 在 §P0-3 沙盒交易审计,引用 `src/tools/trading/sandbox-engine.ts`,验收标准:可重放 JSON 日志
- [ ] 5.4 在 §P0-4 实时风控,验收标准:单笔限额 + 组合 VaR + 熔断 3 个可测
- [ ] 5.5 在 §P0-5 合规边界,验收标准:免责声明 + 数据源溯源 2 个可测
- [ ] 5.6 在 §P0-6 多数据源对账,引用 `src/tools/finance/` + `src/tools/astock/`,验收标准:同标的 3 源仲裁
- [ ] 5.7 在 §P0-7 KAIROS 生产化,引用 `src/kairos/`,验收标准:消息持久化 + 失败恢复
- [ ] 5.8 在 §P0-8 Bridge 安全加固,引用 `src/bridge/auth.ts` + `src/bridge/jwtUtils.ts`,验收标准:端到端加密 + token 轮换
- [ ] 5.9 在 §P0-9 Agent Loop 拆分,引用 `src/agent/agent.ts:1-1305`,验收标准:单文件 ≤ 400L
- [ ] 5.10 在 §P0-10 状态机统一,引用 4 套状态机,验收标准:≤ 8 个核心状态
- [ ] 5.11 在 §P0-11 错误处理 + 降级矩阵,至少 7 个外部依赖,每个有"主失败 → 降级"路径
- [ ] 5.12 在 §P0-12 性能 + 资源,3 个量化指标(token ≤ 200K / 并发 ≤ 5 / 内存 ≤ 1GB)
- [ ] 5.13 在 §路线图时间表 给出 12 个 P0 的建议顺序和依赖关系图(ASCII)

## 6. 投资域对标(capability: investment-domain-benchmark)

- [ ] 6.1 在 `docs/comparison-with-competitors.md` §国际顶级 写 4 家(AlphaSense/Hebbia/FinChat/Aladdin)对比表
- [ ] 6.2 在 §国内顶级 写 4 家(同花顺 i 问财 / 东方财富 Choice / 招商 MindGo / Wind)对比表
- [ ] 6.3 在 §大模型投资助手 写 3 家(GPT-4o Investing / Claude Finance / 智增增)对比表
- [ ] 6.4 在 §6 层能力评分表 输出 12 行(产品) × 6 列(L1-L6)评分,无空格
- [ ] 6.5 在 §upup 定位总结 用 1 段话总结"upup 在国际/国内的差异化定位"(Coordinator 多 Agent + 5-Phase Workflow + KAIROS 持续监控)

## 7. 校对与归档

- [ ] 7.1 全文通读 5 份文档,检查 ASCII 图字符对齐、术语一致性
- [ ] 7.2 跑 `wc -l docs/*.md`,每份文档 ≤ 15KB(= ~250 行)
- [ ] 7.3 校验 ASCII 图纯文本可读(macOS Terminal / iTerm 打开)
- [ ] 7.4 校验每张图都能在 `src/` 找到对应文件(用 `find` 验证引用路径)
- [ ] 7.5 校验每张能力矩阵的"5 状态评估"有引用文件
- [ ] 7.6 校验每个 P0 都有 5 字段(影响面 / 优先级 / 依赖 / 工期 / 验收)
- [ ] 7.7 校验未做任何 `src/` 代码修改(`git diff src/` 应为空)
- [ ] 7.8 校验未引入任何 npm 依赖(`git diff package.json bun.lock` 应为空)
- [ ] 7.9 commit + PR + review + merge
- [ ] 7.10 同步将本次 change 引用方式写进 `docs/README.md` 或 `CONTRIBUTING.md`(若项目有)

## 8. 后续 change 索引(本次 change 完成后)

- [ ] 8.1 在 GitHub issue 中创建 12 个 P0 issue,每个 issue 在 description 引用本 change 的 §P0-N
- [ ] 8.2 创建 follow-up change `production-grade-investment-v1`,scope = P0-1 + P0-2 + P0-3 + P0-4(投资域 P0)
- [ ] 8.3 创建 follow-up change `agent-loop-refactor`,scope = P0-9 + P0-10(架构 P0)
- [ ] 8.4 创建 follow-up change `runtime-hardening`,scope = P0-7 + P0-8 + P0-11 + P0-12(运行时 P0)
- [ ] 8.5 上述 3 个 follow-up change 各自跑完整的 OpenSpec 流程(proposal + specs + design + tasks + phase guard)
