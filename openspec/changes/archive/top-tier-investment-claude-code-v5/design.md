# Design: 投研 Claude Code v5 架构设计

## 1. 总览

v5 在 v3 + v4 已落地能力之上,补 3 个 P0 + 2 个 P1。**不重写,不破坏,纯增量**。

```
┌──────────────────────────────────────────────────────────────┐
│  UpUp 投研 Claude Code v5                                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 主对话 (src/agent/agent.ts)                            │ │
│  │  + Plan Mode 集成 (Sprint 1)                           │ │
│  │  + 5 步工作流触发 (Sprint 3)                           │ │
│  └────────────────────────────────────────────────────────┘ │
│       │                                                      │
│       ├─→ 5 个高优 CLI (Sprint 2)                            │
│       │     /morning-brief /earnings-preview /risk-dashboard │
│       │     /portfolio-review /watchlist-edit                │
│       │                                                      │
│       ├─→ Plan Builder + Executor (Sprint 1)                 │
│       │     buildResearchPlan(intent, ctx) → Plan            │
│       │     executePlan(plan, ctx) → PlanResult              │
│       │     persistPlan(plan) → .upup/plans/<id>.json        │
│       │                                                      │
│       └─→ 5 步工作流编排 (Sprint 3)                          │
│             research → plan → backtest → trade → review      │
│             (复用现有工具,顺序编排,checkpoint 恢复)            │
│                                                              │
│  复用现有(不动):                                            │
│  - capability-manifest 5 groups (realtime/coordinator/...)   │
│  - coach (memory + 5 channels)                              │
│  - kairos (6 状态机 proactive)                              │
│  - coordinator (multi-agent 4 worker)                       │
│  - bridge (36 文件)                                          │
│  - investment-knowledge (324 行) + workflow-hooks (445 行)  │
│  - 60+ 工具(48 子目录)                                     │
│  - v4-1 code-archaeology / v4-2 competitive-positioning     │
└──────────────────────────────────────────────────────────────┘
```

## 2. Plan Mode 设计

### 2.1 状态机

```
       用户输入"分析 NVDA"
              │
              ▼
   ┌──────────────────────┐
   │ IDLE                 │
   │ (普通对话)            │
   └──────────┬───────────┘
              │ intent-detector 识别为"研究类"
              ▼
   ┌──────────────────────┐
   │ PLAN_MODE            │
   │ - LLM 生成研究计划   │
   │ - 用户审阅/修改      │
   │ - 等待用户确认        │
   └──────────┬───────────┘
              │ 用户确认 / 修改
              ▼
   ┌──────────────────────┐
   │ EXECUTE              │
   │ - 顺序执行 plan      │
   │ - checkpoint         │
   │ - 中间结果保存        │
   └──────────┬───────────┘
              │ 完成 / 失败
              ▼
   ┌──────────────────────┐
   │ DONE / FAILED        │
   │ - 输出最终报告        │
   │ - 持久化 plan         │
   │ - 推 Coach(可选)      │
   └──────────────────────┘
```

### 2.2 数据结构

```typescript
// src/plan/plan-context.ts (扩展)
export type PlanMode = 'idle' | 'planning' | 'executing' | 'done' | 'failed';

export interface ResearchPlan {
  id: string;                    // uuid
  createdAt: string;             // ISO
  userIntent: string;            // 原始用户输入
  context: CoachPromptContext;   // 用户上下文
  steps: PlanStep[];             // 研究步骤
  status: PlanMode;
  result?: PlanResult;           // 执行结果
  auditLog: PlanAuditEntry[];    // 审计日志
}

export interface PlanStep {
  id: string;
  description: string;           // "收集 NVDA 近 30 天财报"
  tools: string[];               // ['analyze_symbol', 'research_deep_search']
  estimatedDurationMs: number;
  dependsOn: string[];           // step ids
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;               // JSON
}

export interface PlanResult {
  finalReport: string;           // Markdown
  totalDurationMs: number;
  stepResults: Record<string, string>;
  warnings: string[];
}

export interface PlanAuditEntry {
  timestamp: string;
  action: 'created' | 'modified' | 'approved' | 'rejected' | 'started' | 'step-completed' | 'failed' | 'resumed';
  details: Record<string, unknown>;
}
```

### 2.3 集成到主对话

```typescript
// src/agent/agent.ts (伪代码)
async function processUserInput(input: string, ctx: AgentContext) {
  // 1. 检测意图
  const intent = await intentDetector.detect(input, ctx);
  
  // 2. 若是研究类 + 不在 plan mode → 进入 plan mode
  if (intent.kind === 'research' && !ctx.inPlanMode()) {
    const plan = await planBuilder.buildResearchPlan(input, ctx);
    ctx.enterPlanMode(plan);
    return { kind: 'plan-pending', plan };
  }
  
  // 3. 若在 plan mode + 用户确认 → 执行
  if (ctx.inPlanMode() && ctx.currentPlan()) {
    if (input.match(/^(确认|yes|ok|approve)/i)) {
      return planExecutor.executePlan(ctx.currentPlan()!, ctx);
    }
    if (input.match(/^(取消|cancel|no)/i)) {
      ctx.exitPlanMode();
      return { kind: 'plan-cancelled' };
    }
    // 否则视为 plan 修改
    const modified = await planBuilder.modifyPlan(ctx.currentPlan()!, input);
    return { kind: 'plan-modified', plan: modified };
  }
  
  // 4. 普通对话
  return runNormalAgentLoop(input, ctx);
}
```

### 2.4 软降级

- `UPUP_PLAN_MODE=0` 关闭 → 跳过 plan mode,直接走普通对话
- `BUN_CONFIG_FEATURE_PLAN_MODE_INVESTMENT=0` 编译期 DCE 排除

## 3. 5 个高优 CLI 设计

每个 CLI 是 `command: Command` 形状(同 v3 1.4 spec):

```typescript
// src/commands/morning-brief.tsx
export const command: Command = {
  id: 'morning-brief',
  name: '/morning-brief',
  description: '盘前 9:00 报告(持仓异动 + 关注股新闻 + 财报日提醒)',
  feature: 'COMMAND_MORNING_BRIEF',
  defaultEnabled: true,
  run: async (ctx) => {
    const portfolio = await loadPortfolio(ctx.userId);
    const watchlist = await loadWatchlist(ctx.userId);
    const earnings = await getUpcomingEarnings(watchlist.concat(portfolio.symbols), 1);
    return renderMorningBrief({ portfolio, watchlist, earnings, now: new Date() });
  },
};
```

**5 个 CLI 的复用工具**:
- morning-brief: portfolio + watchlist + earnings + news + (可选)kpi-digest
- earnings-preview: earnings + portfolio + watchlist + alert
- risk-dashboard: portfolio + risk(industry exposure / concentration / VaR) + sector
- portfolio-review: portfolio + brinson + sector + style + 周报模板
- watchlist-edit: watchlist CRUD + (可选)screen

## 4. 5 步研究闭环设计

```typescript
// src/agent/investment-workflow.ts
export type InvestmentWorkflowStep =
  | 'research'      // analyze_symbol + research_deep_search
  | 'valuation'     // DCF skill + multiple compare
  | 'backtest'      // strategy_backtest + 5y data
  | 'trade'         // sandbox broker 模拟
  | 'review';       // Brinson + weekly report

export interface WorkflowStepSpec {
  id: InvestmentWorkflowStep;
  title: string;
  tools: string[];
  estimatedMs: number;
  dependsOn: InvestmentWorkflowStep[];
  checkpointable: boolean;
}

export const WORKFLOW_STEPS: WorkflowStepSpec[] = [
  { id: 'research',  title: '深度研究',   tools: ['analyze_symbol', 'research_deep_search'], estimatedMs: 60_000,  dependsOn: [], checkpointable: true },
  { id: 'valuation', title: '估值对比',   tools: ['valuation_dcf', 'compare_multiples'],     estimatedMs: 30_000,  dependsOn: ['research'],  checkpointable: true },
  { id: 'backtest',  title: '策略回测',   tools: ['strategy_backtest'],                       estimatedMs: 120_000, dependsOn: ['valuation'], checkpointable: true },
  { id: 'trade',     title: '模拟交易',   tools: ['sandbox_broker'],                           estimatedMs: 20_000,  dependsOn: ['backtest'],  checkpointable: true },
  { id: 'review',    title: '复盘报告',   tools: ['brinson', 'sector_attribution', 'style'],   estimatedMs: 30_000,  dependsOn: ['trade'],     checkpointable: true },
];

export async function runInvestmentWorkflow(symbol: string, ctx: AgentContext): Promise<WorkflowReport> {
  const checkpoint = await loadCheckpoint(symbol);
  const startFrom = checkpoint?.nextStep ?? 'research';
  const report: WorkflowReport = checkpoint ?? createEmptyReport(symbol);
  
  for (const step of WORKFLOW_STEPS) {
    if (step.id < startFrom) continue;
    if (step.checkpointable) await saveCheckpoint(symbol, { nextStep: step.id, ...report });
    const output = await runStep(step, symbol, ctx, report.stepResults);
    report.stepResults[step.id] = output;
  }
  
  report.finalMarkdown = renderFinalReport(report);
  await clearCheckpoint(symbol);
  return report;
}
```

**checkpoint 设计**:
- 每步完成后保存到 `.upup/workflow/<symbol>/checkpoint.json`
- 中断可恢复(LLM context 丢失,plan 数据可恢复)
- 24h 后自动过期

## 5. plan 持久化 + 审计

```
.upup/
├── plans/                                # ResearchPlan
│   ├── 2026-06-04-NVDA-deep-analysis.json
│   └── ...
├── workflow/                              # 5 步工作流 checkpoint
│   ├── NVDA/
│   │   ├── checkpoint.json
│   │   └── final-report.md
│   └── ...
└── plans/audit.log                        # JSONL 审计
    {"ts":"...","action":"created","planId":"...","userId":"..."}
    {"ts":"...","action":"approved","planId":"...","steps":5}
    ...
```

## 6. feature flags

注册 5 个 flag:

```typescript
{ name: 'PLAN_MODE_INVESTMENT', description: 'v5: 投资研究 plan mode(主对话集成)', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'COMMAND_MORNING_BRIEF', description: 'v5: /morning-brief 盘前报告', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'COMMAND_EARNINGS_PREVIEW', description: 'v5: /earnings-preview 财报日 T-1', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'COMMAND_RISK_DASHBOARD', description: 'v5: /risk-dashboard 风险仪表板', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'COMMAND_PORTFOLIO_REVIEW', description: 'v5: /portfolio-review 组合复盘', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'COMMAND_WATCHLIST_EDIT', description: 'v5: /watchlist-edit 自选股编辑', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
{ name: 'INVESTMENT_WORKFLOW', description: 'v5: 5 步研究闭环编排', category: 'agent', defaultEnabled: true, since: '2026.6.0', owner: 'agent' },
```

## 7. 测试策略

- **Sprint 1**:`src/plan/plan.test.ts`(10+ tests:enter/exit/build/execute/persist/audit/resume)
- **Sprint 2**:`src/commands/cli-extension-p0.test.ts`(5+ tests per command)
- **Sprint 3**:`src/agent/investment-workflow.test.ts`(8+ tests:5 step orchestration / checkpoint / resume)

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Plan Mode 误触发 | intent 阈值 + 用户确认;失败可改普通对话 |
| 5 步耗时 | checkpoint + resume;用户可"暂停" |
| CLI 注册冲突 | stable id 命名空间 + 中央注册表去重 |
| plan 体积膨胀 | LRU(最近 100 条)+ gzip 压缩 |
| v3/v4 兼容破坏 | 不改 capability-manifest 数据结构,只加字段 |
