## ADDED Requirements

### Requirement: 30+ 维度能力对标矩阵
变更 MUST 在 `docs/capability-matrix.md` 中提供一份涵盖 30+ 能力维度的对标矩阵,使用 5 状态评估:`已有强` / `已有弱` / `缺失` / `不适用` / `超 loucode`。

#### Scenario: 5 状态评估示例
- **WHEN** 维度为"A 股数据源"
- **THEN** upup 状态为"超 loucode"(Tushare Pro + AKShare + Financial Datasets 三源),引用 `src/tools/finance/`、`src/tools/astock/`

#### Scenario: 不适用维度
- **WHEN** 维度为"SSH Remote Shell"
- **THEN** upup 状态为"不适用",引用 `loucode/src/ssh/`(已存在但 upup 不需要)

### Requirement: 通用能力 12 维度
矩阵 MUST 覆盖 12 个通用能力:LLM Provider、Tool System、Skill System、Memory、Context Management、Compaction、Subagent、Coordinator、Multi-Agent、Sessions、Permissions、Cost Tracking。

#### Scenario: 12 维度全列出
- **WHEN** 读者读 `docs/capability-matrix.md` §通用能力
- **THEN** 12 个维度都在表里,每个维度有"upup / loucode / 5 状态评估 / 引用文件"4 列

#### Scenario: LLM Provider 多供应商
- **WHEN** 维度为"LLM Provider"
- **THEN** upup 评估为"超 loucode",引用 `src/model/llm.ts` + `packages/llm/`,支持 OpenAI/Anthropic/Google/xAI/OpenRouter/Ollama 6 家

### Requirement: 监控与远程能力 8 维度
矩阵 MUST 覆盖 8 个监控/远程能力:Cron、Heartbeat、KAIROS、Proactive、Bridge、Remote Sessions、Sessions WebSocket、SSH。

#### Scenario: 8 维度全列出
- **WHEN** 读者读 §监控与远程
- **THEN** 8 个维度都有 upup / loucode 对比,upup 的 KAIROS 标"超 loucode"(含 scanner/position-monitor/proactive 三个子系统)

#### Scenario: SSH 不适用标注
- **WHEN** 维度为 SSH
- **THEN** upup 标"不适用",并说明"投资域不需要远程 shell"

### Requirement: 数据通路能力 5 维度
矩阵 MUST 覆盖 5 个数据通路能力:Realtime、EventBus、Reactive Streams、Stream Mode、Stream Progress Event。

#### Scenario: Event Bus 详细标注
- **WHEN** 维度为"Event Bus"
- **THEN** upup 评估为"已有弱",引用 `src/core/event-bus.ts`,并说明"目前只有 `on/once/off/emit`,缺 topic 通配符 + 回放"

### Requirement: 投资域特定 8 维度
矩阵 MUST 覆盖 8 个投资域特定能力:Trading Sandbox、Brinson Attribution、5-Phase Workflow、Risk Dashboard、Portfolio Review、Watchlist Edit、Investment Subagents、Intent Detector。

#### Scenario: 8 维度全列出
- **WHEN** 读者读 §投资域
- **THEN** 8 个维度都有,每个引用 `src/tools/` 或 `src/commands/investment/` 或 `src/agent/` 下的具体文件

#### Scenario: Trading Sandbox 评估
- **WHEN** 维度为"Trading Sandbox"
- **THEN** upup 评估为"已有弱",引用 `src/tools/trading/sandbox-engine.ts`,并说明"已支持 paper trading + 撮合模型,但无券商实盘 Adapter"
