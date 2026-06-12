## ADDED Requirements

### Requirement: 8-12 个 P0 改造工作清单
变更 MUST 在 `docs/production-readiness-checklist.md` 中提供 8-12 个 P0 改造工作,每个 P0 标注:`影响面 / 优先级 / 依赖 / 预计工期 / 验收标准`。

#### Scenario: 至少 8 个 P0
- **WHEN** 读者读 §P0 路线图
- **THEN** 至少 8 个 P0 工作,每个独立小节,带唯一编号(P0-1 ~ P0-N)

#### Scenario: 每个 P0 5 字段齐全
- **WHEN** 任意 P0 节点
- **THEN** 5 字段全部存在,无空字段

### Requirement: P0-1 投资分析可解释性
P0-1 MUST 描述投资分析可解释性改造:Skill 输出强制带"信号 vs 噪音"区分,引用 `src/skills/decision-dashboard/SKILL.md`、`src/skills/technical-analysis/SKILL.md`,验收标准:每个投研 skill 输出包含 1 段"为什么是这个结论"的可解释文本。

#### Scenario: 验收标准具体
- **WHEN** 读者读 P0-1
- **THEN** 验收标准引用 2-3 个具体 SKILL.md 文件,标准可测

### Requirement: P0-2 回测保真度
P0-2 MUST 描述回测保真度改造:滑点模型、成交约束、市场冲击,引用 `src/tools/backtest/`,验收标准:用 2015 股灾 + 2020 疫情 + 2024 微盘股流动性危机 3 个历史事件回测,误差 ≤ 5%。

#### Scenario: 3 个历史事件测试集
- **WHEN** 读者读 P0-2
- **THEN** 验收标准列出 3 个具体历史事件作为 benchmark

### Requirement: P0-3 沙盒交易审计
P0-3 MUST 描述沙盒交易审计:全量成交日志 + 重放,引用 `src/tools/trading/sandbox-engine.ts`,验收标准:每次 paper trade 生成可重放的 JSON 日志,日志回放能复现 PnL。

#### Scenario: 重放保真
- **WHEN** 读者读 P0-3
- **THEN** 验收标准包含"重放"和"保真"两个具体可测项

### Requirement: P0-9 Agent Loop 拆分
P0-9 MUST 描述 `src/agent/agent.ts` (1305L) 拆分为 5 个 < 400 行模块,引用 `src/agent/agent.ts:1-1305`,验收标准:单文件最大 ≤ 400 行,功能不变(回归测试全过)。

#### Scenario: 拆分规模明确
- **WHEN** 读者读 P0-9
- **THEN** 验收标准"单文件最大 ≤ 400 行"明确可测

### Requirement: P0-10 状态机统一
P0-10 MUST 描述 4 套状态机统一为 1 套,引用 `src/daemon/session.ts:SessionState`、`src/plan/research-plan.ts`、`src/kairos/types.ts`、`src/coordinator/types.ts`,验收标准:4 套状态机的状态名收敛到 ≤ 8 个核心状态 + 转移函数可复用。

#### Scenario: 收敛目标明确
- **WHEN** 读者读 P0-10
- **THEN** 验收标准"≤ 8 个核心状态"明确可测

### Requirement: P0-11 错误处理 + 降级矩阵
P0-11 MUST 描述每个外部依赖(LLM API / Tushare / AKShare / Financial Datasets / WebSocket / Bridge / Realtime Feed)的失败模式 + 降级路径,引用 `src/model/llm.ts`、`src/data/*`、`src/realtime/*`、`src/bridge/server.ts`,验收标准:每个外部依赖有 1 个"主路径失败 → 降级路径"文档,降级路径有对应测试。

#### Scenario: 至少 7 个外部依赖
- **WHEN** 读者读 P0-11
- **THEN** 至少 7 个外部依赖被列入降级矩阵

### Requirement: P0-12 性能 + 资源约束
P0-12 MUST 描述单查询 token 上限、并发限制、内存保护,引用 `src/agent/agent.ts`、`src/agent/token-counter.ts`、`src/agent/loop-recovery.ts`,验收标准:单查询 token ≤ 200K(可配),并发子代理 ≤ 5,内存峰值 ≤ 1GB(默认)。

#### Scenario: 3 个量化指标
- **WHEN** 读者读 P0-12
- **THEN** 验收标准包含 token 上限、并发数、内存峰值 3 个可测数字
