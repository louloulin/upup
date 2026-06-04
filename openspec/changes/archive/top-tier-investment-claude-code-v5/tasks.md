# Tasks: 投研 Claude Code v5 (top-tier-investment-claude-code-v5)

> **范围**:5 sprint(3 P0 + 2 P1),1 turn 落地。基于 v3 + v4 已落地能力(投研 Claude / KAIROS / Bridge / 60+ 工具 / code-archaeology / competitive-positioning),纯增量。
>
> **方法**:逐 sprint 推进,每个 task 完成需 typecheck + 测试全绿。

---

## v5-Sprint 1 — Plan Mode 投资研究工作流(P0, 0.4 turn)

### 1.1 src/plan/ 扩展

- [ ] 1.1.1 扩展 `src/plan/plan-context.ts`:加 `enterPlanMode()` / `exitPlanMode()` / `isInPlanMode()` / `currentPlan()` API + PlanMode state
- [ ] 1.1.2 创建 `src/plan/plan-builder.ts`:`buildResearchPlan(intent, ctx)` 根据用户意图生成结构化 ResearchPlan(2-10 步骤)
- [ ] 1.1.3 创建 `src/plan/plan-executor.ts`:`executePlan(plan, ctx)` 顺序执行 plan 步骤,产出 PlanResult
- [ ] 1.1.4 集成到 `src/agent/agent.ts` 主循环:intent-detector 触发后自动 enter plan mode,生成计划 → 等用户确认 → 执行
- [ ] 1.1.5 持久化:`persistPlan(plan) → .upup/plans/<id>.json` + `loadPlan(id)` + `listPlans()`
- [ ] 1.1.6 审计日志:`.upup/plans/audit.log` JSONL,记录 created/modified/approved/rejected/started/step-completed/failed/resumed
- [ ] 1.1.7 写 `src/plan/plan.test.ts`(10+ tests)

### 1.2 编译开关

- [ ] 1.2.1 在 `src/agent/feature-gates.ts` 注册 `PLAN_MODE_INVESTMENT` flag(defaultEnabled: true, owner: agent)
- [ ] 1.2.2 软降级:`UPUP_PLAN_MODE=0` 关闭,跳过 plan mode,直接普通对话

**Sprint 1 完成标志**:用户问"分析 NVDA",agent 输出 ResearchPlan 步骤,等待用户确认后顺序执行,plan 持久化到 .upup/plans/,audit log 记录每步

---

## v5-Sprint 2 — 5 个高优投资 CLI(P0, 0.3 turn)

### 2.1 5 个 .tsx 命令

- [ ] 2.1.1 创建 `src/commands/morning-brief.tsx`(/morning-brief 盘前 9:00 报告:持仓异动 + 关注股新闻 + 财报日提醒)
- [ ] 2.1.2 创建 `src/commands/earnings-preview.tsx`(/earnings-preview 财报日 T-1 提醒:持仓 + 关注股)
- [ ] 2.1.3 创建 `src/commands/risk-dashboard.tsx`(/risk-dashboard 实时风险仪表板:VaR + 行业暴露 + 集中度)
- [ ] 2.1.4 创建 `src/commands/portfolio-review.tsx`(/portfolio-review 组合复盘:Brinson 归因 + 周报)
- [ ] 2.1.5 创建 `src/commands/watchlist-edit.tsx`(/watchlist-edit 自选股增删改)
- [ ] 2.1.6 每个 export `command: Command` + `feature` 字符串
- [ ] 2.1.7 集成到 `src/commands/index.ts` 中央注册表(去重 + 排序)
- [ ] 2.1.8 写 `src/commands/cli-extension-p0.test.ts`(5+ tests per command)

### 2.2 编译开关

- [ ] 2.2.1 在 `src/agent/feature-gates.ts` 注册 5 个 flag:`COMMAND_MORNING_BRIEF` / `COMMAND_EARNINGS_PREVIEW` / `COMMAND_RISK_DASHBOARD` / `COMMAND_PORTFOLIO_REVIEW` / `COMMAND_WATCHLIST_EDIT`(defaultEnabled: true, owner: agent)

**Sprint 2 完成标志**:5 个 CLI 在主对话中可调用,`bun test src/commands/cli-extension-p0.test.ts` 全绿

---

## v5-Sprint 3 — 5 步研究闭环编排(P0, 0.3 turn)

### 3.1 src/agent/investment-workflow.ts

- [ ] 3.1.1 定义 `WORKFLOW_STEPS` 数组(5 步:research / valuation / backtest / trade / review)
- [ ] 3.1.2 实现 `runInvestmentWorkflow(symbol, ctx)`:顺序执行 5 步,产出 WorkflowReport
- [ ] 3.1.3 checkpoint 机制:`.upup/workflow/<symbol>/checkpoint.json`,可 resume
- [ ] 3.1.4 24h 后自动过期(checkpoint mtime 检查)

### 3.2 集成到 Plan Mode

- [ ] 3.2.1 plan-builder 识别"完整研究流"意图 → 自动生成 5 步 plan
- [ ] 3.2.2 plan-executor 调度 `runInvestmentWorkflow` 而非单步工具
- [ ] 3.2.3 中间结果渲染:每步完成输出"研究进度 1/5 / 2/5 / ..."

### 3.3 测试

- [ ] 3.3.1 写 `src/agent/investment-workflow.test.ts`(8+ tests:5 step orchestration / checkpoint / resume / timeout)

### 3.4 编译开关

- [ ] 3.4.1 注册 `INVESTMENT_WORKFLOW` flag(defaultEnabled: true, owner: agent)

**Sprint 3 完成标志**:用户问"完整研究 NVDA",1 句话触发 5 步流程,产出 Markdown 投决会摘要

---

## v5-Sprint 4 — 文档 + 投研 plan 持久化审计(P1, 0.2 turn)

### 4.1 文档

- [ ] 4.1.1 更新 `README.md`:顶部 sologan + 1 段话 + 4 唯一链接
- [ ] 4.1.2 创建 `docs/positioning.md`:4 唯一详细故事(从 COMPETITIVE.md 抽出)
- [ ] 4.1.3 创建 `docs/deployment.md`:Docker / 自托管 / 5 路推送配置指南
- [ ] 4.1.4 更新 `docs/COMPETITIVE.md` 链接到 v5 新增能力(Plan Mode / 5 CLI / 5 步)

### 4.2 plan 持久化审计增强

- [ ] 4.2.1 plan 持久化支持 gzip 压缩(> 5KB 时)
- [ ] 4.2.2 LRU:最近 100 条 plan 保留,更早自动清理
- [ ] 4.2.3 plan 列表 API:`listPlans({ limit, status })` 给 `/plan-list` 命令用

**Sprint 4 完成标志**:4 文档完整 + plan 持久化优化

---

## v5-Sprint 5 — 归档 v3 + 收尾(P1, 0.1 turn)

### 5.1 v3 同步

- [ ] 5.1.1 同步 v3 tasks.md checkbox:143 tasks 按实际落地情况勾选(1.1-1.3 done,2.3 done,2.4 done,4.1-4.5 done;其他保持 unchecked)
- [ ] 5.1.2 `openspec archive top-tier-investment-claude-code`(3 已完成 sprint 进 archive)
- [ ] 5.1.3 v3 specs sync 到 `openspec/specs/`
- [ ] 5.1.4 更新根 `openspec/CHANGELOG.md`(v3 归档 + v5 上线)

### 5.2 v5 收尾

- [ ] 5.2.1 跑全量 typecheck + test 回归
- [ ] 5.2.2 commit + push upstream main
- [ ] 5.2.3 v5 plan 暂留 active(下个 turn 持续)

**Sprint 5 完成标志**:v3 归档 + v5 上线 + git push

---

## v5 完成标志(总)

- [ ] Plan Mode 在主对话中可触发(用户问"分析 NVDA"自动进入)
- [ ] 5 个高优投资 CLI 全部可用
- [ ] 5 步闭环 1 句话触发 + checkpoint resume
- [ ] 投研 plan 可持久化 + 审计 + 重放
- [ ] README / positioning / deployment 文档完整
- [ ] v3 plan 归档 + CHANGELOG 更新
- [ ] `bun test` + `bun run typecheck` 全绿(不破坏 v4-1 / v4-2)
- [ ] 全部 commit + push upstream main

---

## v5 = 投研 Claude Code 完整版(对外可宣称"AI Agent 投决会伙伴")
