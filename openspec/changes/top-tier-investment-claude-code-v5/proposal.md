# Proposal: 投研 Claude Code v5 — Plan Mode + 5 高优 CLI + 5 步闭环

## Why

v3 + v4 已落地 1.1-1.3(投研 Claude 主对话)+ 2.3(Bridge)+ 2.4(KAIROS)+ 4.1-4.5(5 大核心 spec)+ v4-1(自指代码考古)+ v4-2(竞品定位)。但对照 Claude Code / loucode 核心能力 + 中文圈投研实战,识别的最大 3 个 P0 差距是:

1. **CLI 命令稀少** — 0 个投资研究高优命令(`/morning-brief` 等 5 个缺失)
2. **Plan Mode 缺位** — 主对话不能"先出研究计划 → 用户确认 → 执行"
3. **研究 → 计划 → 回测 → 交易 → 复盘 闭环未编排** — 5 步需用户手动串

这 3 个补完,UpUp 从"工具集"升级为"AI Agent 投决会伙伴"。

详细差距分析见 `docs/GAP-ANALYSIS.md`。

## What

5 sprint,1 turn 落地,3 P0 + 2 P1:

- **Sprint 1 — Plan Mode 投资研究工作流**(P0):主对话中 Claude Code 风格 plan mode
- **Sprint 2 — 5 个高优投资 CLI**(P0):morning-brief / earnings-preview / risk-dashboard / portfolio-review / watchlist-edit
- **Sprint 3 — 5 步研究闭环编排**(P0):1 句话触发 research → 计划 → 回测 → 交易 → 复盘
- **Sprint 4 — 文档 + 投研 plan 持久化审计**(P1):README + positioning + deployment + plan audit log
- **Sprint 5 — 归档 v3 + 收尾**(P1):v3 tasks 同步 + openspec archive + CHANGELOG

## Goals

- [x] G1: Plan Mode 在主对话中可触发(用户问"分析 NVDA"自动进入)
- [x] G2: 5 个高优投资 CLI 全部可用
- [x] G3: 5 步闭环 1 句话触发
- [x] G4: 投研 plan 可持久化 + 审计 + 重放
- [x] G5: README / positioning / deployment 文档完整
- [x] G6: v3 plan 归档
- [x] G7: `bun test` + `bun run typecheck` 全绿(不破坏 v4-1 / v4-2)
- [x] G8: 5 sprint 全部 commit + push upstream main

## Non-Goals

- 不实现编码能力(用户明确):跳过 v4-3 code-review + v4-4 refactor + test-coverage
- 不重写 v3 已落地能力(1.1-1.3 / 2.4 / 4.1-4.5)
- 不引入新外部依赖(保持 Bun + TypeScript + LangChain 现状)
- 不破坏向后兼容(capability-manifest `competitorRefs` 字段已 `?? []` 兜底)
- 不商业化预备(v3 Sprint 7 不做)

## Capabilities / Impact

- **新能力**:plan-mode / cli-morning-brief / cli-earnings-preview / cli-risk-dashboard / cli-portfolio-review / cli-watchlist-edit / investment-workflow
- **新文件**:`src/plan/{plan-builder,plan-executor}.ts` + 5 个新 `src/commands/*.tsx` + `src/agent/investment-workflow.ts`
- **修改文件**:`src/plan/plan-context.ts`(扩展 enter/exit)+ `src/agent/agent.ts`(plan mode 集成)+ `src/commands/index.ts`(中央注册表)+ `src/agent/feature-gates.ts`(注册 PLAN_MODE_INVESTMENT 等 5 flag)
- **新文档**:`README.md`(sologan 顶部)+ `docs/positioning.md` + `docs/deployment.md` + `openspec/CHANGELOG.md`
- **兼容性**:`CapabilityGroup.competitorRefs` 沿用 v4-2 `?? []` 兜底;plan 持久化用 `?? null` 兜底
- **风险**:Plan Mode 误触发(intent 阈值 + 用户确认)+ 5 步耗时(checkpoint + resume)+ CLI 注册冲突(stable id)+ plan 体积(LRU + 压缩)
