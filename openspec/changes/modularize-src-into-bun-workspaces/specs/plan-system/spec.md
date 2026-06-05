# plan-system

## Purpose
提供 research plan、plan builder、plan executor、audit。

## Requirements

### R-1 Plan model
系统 SHALL 定义 ResearchPlan + PlanAuditEntry + 5 态状态机。

### R-2 Builder
系统 SHALL 把自然语言 query 拆成结构化 plan。

### R-3 Executor
系统 SHALL 按 plan 跑每一步并写 audit log。

### R-4 Persistence
系统 SHALL 把 plan 和 audit 持久化到 `.upup/plans/<id>.json`。

### R-5 Resume
系统 SHALL 支持从断点恢复 plan。

## Scenarios

### S-1 /invest NVDA
- **GIVEN** 用户输入 `/invest NVDA`
- **WHEN** system 收到
- **THEN** 5 步研究闭环 SHALL 跑完并写 audit log
