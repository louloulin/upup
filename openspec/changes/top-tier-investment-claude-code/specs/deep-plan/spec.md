# Spec: 长任务深度规划 (deep-plan)

## Purpose

支持投研域的"长任务深度规划"——3 个月投资计划 / 年度组合复盘 / 行业深度研究等需要 5-30 分钟的复杂规划任务。本地多 Agent 协作,**不做云端**(投研域数据敏感)。对标 loucode ULTRAPLAN 但本地化 + 投研域。

## Requirements

### REQ-1: 触发条件

The deep-plan SHALL be triggered by:

- 用户输入 `/deep-plan <goal>` 命令
- 主对话 query 含 "深度规划" / "长期规划" / "投资计划" / "组合规划" / "行业研究"

### REQ-2: 5 阶段流程

The deep-plan SHALL run a 5-stage pipeline:

1. **Planner Agent**:拆解用户目标 → 子任务列表
2. **Researcher Agent**:多 worker 并行调研(基本面/技术/政策/行业,4-6 个 worker)
3. **Backtest Agent**:对候选策略做回测(可选)
4. **Synthesizer Agent**:综合,生成"投资计划书"(Markdown + 图表)
5. **Reviewer Agent**:同行评议(可选,默认开)

### REQ-3: 时间预算

The deep-plan SHALL enforce:

- 软超时:30 分钟(可被用户通过 `--max-minutes` 调整)
- 硬超时:60 分钟(超时自动取消 + 输出当前进度)
- 每阶段超时:Planner 1 min / Researcher 15 min / Backtest 10 min / Synthesizer 5 min / Reviewer 5 min

### REQ-4: 取消 / 续接

The deep-plan SHALL support:

- **取消**:用户在 CLI 按 Ctrl-C → 当前阶段 graceful stop → 进度保存
- **续接**:用户重新打开 CLI → `> 续接 plan-X` → 跳过已完成阶段,从断点继续
- **TASK_STOP + SEND_MESSAGE 协议**(参考 loucode)

### REQ-5: 产物

The deep-plan SHALL produce:

- `.upup/plans/<plan-id>.md`:投资计划书(Markdown,含图表)
- `.upup/plans/<plan-id>/`:中间产物(各阶段输出)
- `TaskCreate` 列表:可执行的下一步任务
- 可选:`.upup/plans/<plan-id>.html`:网页版(响应式)

### REQ-6: 协作

The deep-plan SHALL reuse:

- **Coordinator V2**(`src/coordinator/`):主只调度,Worker 才执行
- **Task Runtime 6 类**(`src/tasks/`):Planner / Researcher / Backtest / Synthesizer / Reviewer 作为 5 个 LocalAgentTask
- **Worktree 隔离**(`src/worktree/`):每个 worker 在独立 git worktree 跑

### REQ-7: 编译开关

The deep-plan SHALL be gated by `feature('DEEP_PLAN')`:

- 默认 off
- `UPUP_DEEP_PLAN=1` 启用
- 关闭时 `/deep-plan` 命令不可见

## Scenarios

### Scenario 1: 3 个月投资计划

- **Given**: 用户输入 `/deep-plan 为我的 100 万做 3 个月价值投资计划`
- **When**: deep-plan 启动
- **Then**:
  1. Planner 拆解 → 5 个子任务(行业筛选 / 标的初选 / 估值 / 回测 / 报告)
  2. Researcher 启动 4 worker 并行(基本面/技术/资金/行业)
  3. Backtest 对候选组合回测
  4. Synthesizer 输出投资计划书
  5. Reviewer 同行评议(可选)
  6. 用户审批 → 可执行 TaskCreate 列表

### Scenario 2: 取消 + 续接

- **Given**: deep-plan 正在跑 Researcher 阶段
- **When**: 用户按 Ctrl-C
- **Then**:
  1. 当前 stage graceful stop
  2. 进度保存到 `.upup/plans/<plan-id>/state.json`
  3. 用户重新打开 CLI,看到"上次 deep-plan 在 Researcher 阶段中断,续接?"
  4. 用户选"续接" → 跳过 Planner,直接从 Researcher 继续

### Scenario 3: 行业深度研究

- **Given**: 用户输入 `/deep-plan 深度研究新能源车行业`
- **When**: deep-plan 启动
- **Then**:
  1. Planner 拆解 → 行业概览 / 政策 / 竞争格局 / 龙头分析 / 投资建议
  2. Researcher 多 worker 并行
  3. Synthesizer 输出行业研究报告
  4. Reviewer 同行评议

## Dependencies

- `src/coordinator/`(v2 已建,v3 升级 V2)
- `src/tasks/`(v2 已建 LocalAgentTask)
- `src/worktree/`(v2 已建,worker 隔离)
- `src/coach/`(可选,完成后推送)

## Out of Scope

- 云端 Opus 集成(投研数据敏感,本地优先)
- 多用户协同(同 plan 多用户编辑,v4 考虑)
