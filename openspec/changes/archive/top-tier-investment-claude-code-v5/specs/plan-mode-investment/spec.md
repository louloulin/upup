# plan-mode-investment

## Purpose

投资研究 Plan Mode — 用户提"分析 NVDA"时,agent 先输出 2-10 步研究计划,等用户确认再执行,避免 LLM 单方面决定投研行动。

## ADDED Requirements

### Requirement: PLAN-INVESTMENT-001 — Plan Mode 入口
`src/agent/agent.ts` SHALL 在用户意图为深度投资研究时(关键词:分析/研究/估值/调研/对比/投资),自动调用 `enterPlanMode()`。

#### Scenario: 用户问"分析 NVDA"
- WHEN 用户输入包含"分析"+ 股票代码
- THEN agent 进入 plan mode,生成 ResearchPlan 推到用户面前
- AND 等待用户输入"确认/yes/ok/approve"才能执行

#### Scenario: 用户问"NVDA 股价"
- WHEN 用户输入只是简单查询(不含分析/研究关键词)
- THEN agent 跳过 plan mode,直接调用 financial_search 工具

### Requirement: PLAN-INVESTMENT-002 — ResearchPlan 结构
`src/plan/plan-builder.ts` SHALL 生成 `ResearchPlan { id, intent, steps[], estimatedDurationMs, requiredTools[] }`,steps 2-10 步,每步 `{ id, description, tool, params, expectedOutput }`。

#### Scenario: 计划生成
- WHEN intent = "分析 NVDA"
- THEN plan = [
  {step: "1. 拉取 NVDA 基础财务数据(市值/PE/收入)", tool: "financial_metrics"},
  {step: "2. 读最新 10-K + 10-Q", tool: "read_filings"},
  {step: "3. 调研近期新闻 + 管理层电话会", tool: "research_deep_search"},
  {step: "4. DCF 估值", tool: "dcf_valuation"},
  {step: "5. 写投资建议报告", tool: "skill"}
]

### Requirement: PLAN-INVESTMENT-003 — 用户修改计划
用户 SHALL 能通过自然语言修改计划(add/remove/modify step),agent 重新生成 plan。

#### Scenario: 用户说"加上和 AMD 的对比"
- WHEN plan 处于 "planning" 状态
- AND 用户输入包含"加/还/另外/对比"
- THEN modifyPlan() 插入新 step,plan 更新

### Requirement: PLAN-INVESTMENT-004 — 计划持久化 + 审计
所有 plan SHALL 持久化到 `.upup/plans/<id>.json`,审计日志到 `.upup/plans/audit.log`(JSONL)。

#### Scenario: 执行完成
- WHEN plan 状态 = "done"
- THEN persistPlan() 写入 .upup/plans/<id>.json
- AND auditLog 追加: enter, modify, confirm, execute_start, step_done, done
