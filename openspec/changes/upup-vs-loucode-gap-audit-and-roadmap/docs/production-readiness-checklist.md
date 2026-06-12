# 投资版 Claude Code 生产级别改造路线图

> 版本:v1.0 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> 配套文档:[architecture-current.md](architecture-current.md) / [capability-matrix.md](capability-matrix.md) / [architecture-debt.md](architecture-debt.md) / [comparison-with-competitors.md](comparison-with-competitors.md)
> 范围:8-12 个 P0 改造工作,每条标注 `影响面 / 优先级 / 依赖 / 预计工期 / 验收标准` 5 字段

---

## §0 总览

| P0 编号 | 主题 | 优先级 | 工期(人天) | 依赖 | 子领域 |
|---------|------|--------|------------|------|--------|
| **P0-1** | 投资分析可解释性 | P0 | 8-10 | -- | 投资域 |
| **P0-2** | 回测保真度 | P0 | 12-15 | -- | 投资域 |
| **P0-3** | 沙盒交易审计 | P0 | 6-8 | P0-2 | 投资域 |
| **P0-4** | 实时风控 | P0 | 10-12 | P0-3 | 投资域 |
| **P0-5** | 合规边界 | P0 | 5-7 | P0-1 | 投资域 |
| **P0-6** | 多数据源对账 | P0 | 8-10 | -- | 数据 |
| **P0-7** | KAIROS 生产化 | P0 | 8-10 | -- | 运行时 |
| **P0-8** | Bridge 安全加固 | P0 | 6-8 | -- | 安全 |
| **P0-9** | Agent Loop 拆分 | P0 | 8-12 | -- | 架构 |
| **P0-10** | 状态机统一 | P0 | 8-12 | P0-9 | 架构 |
| **P0-11** | 错误处理 + 降级矩阵 | P0 | 8-10 | P0-9 | 运行时 |
| **P0-12** | 性能 + 资源约束 | P0 | 5-7 | -- | 运行时 |

> **总工期**:92-121 人天 (4-6 人月单人 / 2-3 人月 3-4 人小团队)

---

## §1 投资域 P0(优先级最高,投资人最关心)

### P0-1 投资分析可解释性

**问题**:当前 50 个投研 skill 输出结论,但**没有强制要求"为什么是这个结论"**。LLM 可能给出看起来专业但实际上是从训练数据"捏造"的判断,用户无法分辨"信号"和"噪音"。

**影响面**:
- `src/skills/decision-dashboard/SKILL.md` 投资决策面板
- `src/skills/technical-analysis/SKILL.md` 技术分析
- `src/skills/value-investing/SKILL.md` 价值投资
- `src/skills/earnings-forecast/SKILL.md` 财报预测
- `src/skills/risk-assessment/SKILL.md` 风险评估
- 50 个 SKILL.md 全部需要补"可解释性"段

**依赖**:无

**预计工期**:8-10 人天

**验收标准**:
1. 50 个 SKILL.md 全部加"可解释性输出"章节,明确要求 LLM 输出包含:
   - 1 段"为什么是这个结论"(基于哪些数据点)
   - 1 段"反方观点 / 风险点"
   - 1 段"信心度评估"(0-100%)
2. 决策面板(`decision-dashboard`)输出增加"决策依据来源"字段
3. 至少 3 个历史投资决策回溯测试,验证"为什么"段的合理性

**关键引用**:
- `src/skills/decision-dashboard/SKILL.md`
- `src/skills/technical-analysis/SKILL.md`
- `src/skills/risk-assessment/SKILL.md`

---

### P0-2 回测保真度

**问题**:当前 `src/tools/fund/fund-backtest.ts` 回测是简化模型,**没有考虑**:
- 滑点(流动性越差,滑点越大)
- 成交约束(涨跌停不能成交)
- 市场冲击(大单推动价格)
- 停牌 / 退市

**影响面**:
- `src/tools/fund/fund-backtest.ts` 主回测
- `src/tools/backtest/` 子模块
- `src/skills/backtest-dca/SKILL.md` 投研 skill

**依赖**:无

**预计工期**:12-15 人天

**验收标准**:
1. 实现滑点模型(默认 0.1% A 股,0.05% 美股,流动性 × 1.5 倍)
2. 实现涨跌停成交约束(根据历史 limit up/down 数据)
3. 实现市场冲击模型(根据成交量比例,默认 square-root impact)
4. 用 **3 个历史事件**回测验证:
   - 2015 年 6-7 月 A 股股灾(沪深 300 最大回撤 32%,2015-06-15 ~ 2015-08-26)
   - 2020 年 2-3 月 A 股疫情(沪深 300 最大回撤 16%,2020-01-23 ~ 2020-03-23)
   - 2024 年 1-2 月 A 股微盘股流动性危机(中证 2000 最大回撤 28%,2024-01-08 ~ 2024-02-08)
5. 误差:**3 个事件回测结果与真实最大回撤偏差 ≤ 5%**

**关键引用**:
- `src/tools/fund/fund-backtest.ts`
- `src/tools/backtest/`

---

### P0-3 沙盒交易审计

**问题**:`src/tools/trading/sandbox-engine.ts` SandboxBroker 已实现撮合 + 滑点 + 手续费,但**没有审计日志**(无法回答"谁在什么时候下了什么单")。

**影响面**:
- `src/tools/trading/sandbox-engine.ts` 主沙盒
- `src/commands/investment/phase-handlers.ts` 5-phase 触发器
- `.upup/audit/` 持久化目录(待新增)

**依赖**:P0-2(回测保真度)

**预计工期**:6-8 人天

**验收标准**:
1. 每次 paper trade 生成 1 份 JSON 审计日志,包含:
   - 订单 ID(全局 UUID)
   - 时间戳(ISO 8601,毫秒精度)
   - 用户 ID(从 session 推断)
   - 标的 / 价格 / 数量 / 订单类型
   - 撮合结果(成交 / 撤单 / 部分成交)
   - 触发原因(phase trade / 主动下单 / 风控平仓)
2. 日志写入 `.upup/audit/<YYYY-MM-DD>.jsonl`,JSONL 格式便于流式追加
3. 提供 `upup audit replay <date>` 命令,能重放当日所有交易
4. 重放保真:**重放后 PnL 与原始 PnL 偏差 = 0**(精确可重放)

**关键引用**:
- `src/tools/trading/sandbox-engine.ts`
- `src/commands/investment/phase-handlers.ts:trade`

---

### P0-4 实时风控

**问题**:KAIROS `position-monitor.ts` 监控持仓 PnL + 止盈止损,但**没有**:
- 单笔订单限额
- 组合 VaR(Value at Risk)
- 熔断机制(单日亏损 X% 暂停)

**影响面**:
- `src/kairos/position-monitor.ts` 持仓监控
- `src/tools/risk/` 风险工具
- `src/commands/investment/risk-dashboard.ts` 风险面板

**依赖**:P0-3(沙盒审计)

**预计工期**:10-12 人天

**验收标准**:
1. 单笔订单限额:
   - 默认 10% 总资产市值,可在 `.upup/settings.json` 配置
   - 超限 → 拒绝执行 + 提示"超限"
2. 组合 VaR:
   - 用历史 252 日日收益率,95% 置信度
   - 输出"今日最大可能亏损"金额 + 百分比
3. 熔断机制:
   - 单日亏损 ≥ 5% → 自动暂停所有主动下单(只允许平仓)
   - 单日亏损 ≥ 10% → 完全冻结(需用户手动恢复)
4. 风险面板(`risk-dashboard`)实时显示 3 个指标
5. 至少 3 个测试场景:
   - 触发单笔超限(应拒绝)
   - 触发 5% 熔断(应自动暂停)
   - 触发 10% 熔断(应完全冻结)

**关键引用**:
- `src/kairos/position-monitor.ts`
- `src/tools/risk/`
- `src/commands/investment/risk-dashboard.ts`

---

### P0-5 合规边界

**问题**:upup 输出"买入 NVDA"等明确的投资建议,**没有免责声明**,**没有数据源溯源**。在生产环境(尤其对接券商 / 资管)会有合规风险。

**影响面**:
- `src/i18n/strings.ts` 文案
- `src/components/answer-box.ts` 最终回答渲染
- 50 个 SKILL.md 全部需要加"免责声明"段

**依赖**:P0-1(可解释性)

**预计工期**:5-7 人天

**验收标准**:
1. 50 个 SKILL.md 全部加"输出免责声明"段:本输出仅供参考,不构成投资建议
2. `src/components/answer-box.ts` 自动在投资相关回答末尾追加免责声明(i18n 双语)
3. 数据源溯源:每个数据点输出都标注来源(例:"PE = 25.3 (来源:Tushare Pro 2026-06-05)")
4. 用户首次使用时强制显示"风险提示"对话框
5. 投资建议可追溯:提供 `upup audit why-decision <ticker>` 命令,回溯决策依据

**关键引用**:
- `src/i18n/strings.ts`
- `src/components/answer-box.ts`
- 50 个 `src/skills/*/SKILL.md`

---

## §2 数据 P0

### P0-6 多数据源对账

**问题**:A 股数据来自 Tushare Pro + AKShare + Financial Datasets 三源,**没有仲裁机制**。同一标的的同一指标可能 3 个源给出不同数字,LLM 不知道用哪个。

**影响面**:
- `src/data/tushare/`
- `src/data/akshare/`
- `src/tools/finance/`
- `src/tools/astock/`

**依赖**:无

**预计工期**:8-10 人天

**验收标准**:
1. 实现数据源仲裁层 `src/data/arbitrator.ts`:
   - 输入:同一标的同一指标 3 个源数据
   - 输出:统一字段 + 数据源 + 置信度 + 偏差范围
2. 仲裁规则:
   - 2/3 一致 → 采纳,标"高置信"
   - 1/3 偏离 > 5% → 标"中置信 + 偏离源"
   - 全部偏离 > 5% → 标"低置信 + 全部列出"
3. 投资 skill 输出自动采用仲裁后数据
4. 用户可查询 `upup data source-comparison 600519 PE`

**关键引用**:
- `src/data/tushare/`
- `src/data/akshare/`
- `src/tools/finance/`

---

## §3 运行时 P0

### P0-7 KAIROS 生产化

**问题**:`src/kairos/` 三个子系统已实现 scanner / position-monitor / proactive,但**生产环境缺乏**:
- 消息持久化(进程崩溃后任务丢失)
- 失败恢复(scanner 失败后状态未知)
- 监控(无人知道 KAIROS 在不在跑)

**影响面**:
- `src/kairos/scanner.ts`
- `src/kairos/position-monitor.ts`
- `src/kairos/proactive.ts`
- `src/cron/store.ts`(共享持久化)

**依赖**:无

**预计工期**:8-10 人天

**验收标准**:
1. 消息持久化:
   - KAIROS 所有事件写入 `.upup/kairos/events/<YYYY-MM-DD>.jsonl`
   - 进程崩溃后重启能恢复未完成任务
2. 失败恢复:
   - scanner 连续失败 3 次 → 自动降级到低频模式(1/4 频率)
   - 持续失败 5 次 → 邮件 / 飞书告警
3. 健康检查:
   - 提供 `upup kairos health` 命令
   - 输出:scanner 状态 / 最后扫描时间 / 失败次数 / 累计告警数
4. 监控接入:
   - KAIROS 事件通过 Event Bus 暴露给监控消费方
   - 提供 `src/tools/notify/kairos-alert.ts` 钉钉 / 飞书 Adapter

**关键引用**:
- `src/kairos/scanner.ts`
- `src/kairos/position-monitor.ts`
- `src/kairos/proactive.ts`
- `src/cron/store.ts`

---

### P0-8 Bridge 安全加固

**问题**:`src/bridge/` 已实现 WSS + JWT,但**生产环境缺**:
- 端到端加密(消息可能被中间人劫持)
- Token 轮换(JWT 长期有效被窃取风险)
- 审计日志(谁远程连接过、做过什么)

**影响面**:
- `src/bridge/auth.ts` 鉴权
- `src/bridge/jwtUtils.ts` JWT 工具
- `src/bridge/server.ts` WSS 服务器
- `src/bridge/protocol.ts` 消息协议

**依赖**:无

**预计工期**:6-8 人天

**验收标准**:
1. 端到端加密:
   - 客户端 ↔ 服务端消息用 `libsodium-wrappers` 加密
   - 密钥由双方 ECDH 协商,每次会话独立
2. Token 轮换:
   - JWT 有效期从 7 天 → 1 小时
   - 引入 Refresh Token(7 天)
   - 自动轮换
3. 审计日志:
   - 所有 bridge 事件写入 `.upup/bridge/audit.log`
   - 包含:连接时间 / 客户端 IP / 消息类型 / 用户
4. 速率限制:
   - 单客户端 100 消息/分钟
   - 超限 → 断开连接 + 5 分钟内禁止重连

**关键引用**:
- `src/bridge/auth.ts`
- `src/bridge/jwtUtils.ts`
- `src/bridge/server.ts`
- `src/bridge/protocol.ts`

---

## §4 架构 P0

### P0-9 Agent Loop 拆分

**问题**:`src/agent/agent.ts:1305` 单文件 1305L,集成 14 个职责。详见 [architecture-debt.md §1](architecture-debt.md#§1-单文件超长p0-1)。

**影响面**:
- `src/agent/agent.ts`(主目标)
- 所有 import agent.ts 的文件

**依赖**:无(但 P0-10 依赖此)

**预计工期**:8-12 人天

**验收标准**:
1. `src/agent/agent.ts` 拆分为 5 个 < 400L 模块:
   - `agent.ts` 主类(协调器,200L)
   - `agent-loop.ts` while 循环(300L)
   - `agent-prep.ts` 消息构造(300L)
   - `agent-compact.ts` compact 调度(300L)
   - `agent-cleanup.ts` cleanup + 持久化(200L)
2. 所有现有测试不修改通过(回归测试全过)
3. Agent 公开 API 不变(`Agent.create()` / `agent.run()` / events)
4. 性能不退化(同样的 query 跑时间偏差 ≤ 5%)

**关键引用**:
- `src/agent/agent.ts:1-1305`

**目标架构参考**:
- 内聚热点分析:[target-architecture-cohesion-coupling.md §1.1](target-architecture-cohesion-coupling.md#§1-当前架构的内聚热点cohesion-hotspots) (列举了 14 个职责的拆分依据)
- 拆分后 7 层定位:[ascii-diagrams.md §图 15](ascii-diagrams.md#图-15--目标架构-7-层--单向依赖) (L5 Orchestration = 拆出来的 agent-loop / agent-prep / agent-compact / agent-cleanup 所在层)
- 端口/适配器模式:[ascii-diagrams.md §图 17](ascii-diagrams.md#图-17--接口边界与端口设计) (拆分后 agent.ts 通过 SubagentRunner / LlmProvider / MemoryStore 端口调下游)
- 重构 Wave 归属:[target-architecture-cohesion-coupling.md §Wave 3](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) W3.1,工期 25-35 人天
- 时间线图:[ascii-diagrams.md §图 16](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线)

---

### P0-10 状态机统一

**问题**:4 套独立状态机。详见 [architecture-debt.md §3](architecture-debt.md#§3-状态机散落p0-3) + [target-architecture-cohesion-coupling.md §1.6](target-architecture-cohesion-coupling.md#§1-当前架构的内聚热点cohesion-hotspots) (Session 2.0 双套实现)。

**影响面**:
- `src/daemon/session.ts:SessionState`
- `src/plan/research-plan.ts:ResearchPlanState`
- `src/kairos/types.ts:TaskState`
- `src/coordinator/types.ts:WorkerState`

**依赖**:P0-9(Agent Loop 拆分,确保在干净的环境下做状态机统一)

**预计工期**:8-12 人天

**验收标准**:
1. 在 `packages/state/` 实现 `StateMachine<S, E>` 抽象
2. 4 套状态机收敛:
   - 状态名收敛到 ≤ 8 个核心状态(Queued / Running / Waiting / Verifying / Completed / Failed / Cancelled / Paused)
   - 每个状态机保留自己的"领域事件",但底层 transfer 函数共享
3. 持久化统一:
   - 全部用 better-sqlite3 持久化
   - 状态机定义在 `packages/state/migrations/`
4. 调试接口:
   - 每个状态机实例暴露 `stateMachine.current()` / `stateMachine.history()` / `stateMachine.subscribe()`
5. 状态机状态图导出:
   - 支持 Mermaid `stateDiagram-v2` 输出
   - 嵌入 [ascii-diagrams.md](ascii-diagrams.md) 作为状态机档案(图 6-9)

**目标架构参考**:
- Session 2.0 统一: [target-architecture-cohesion-coupling.md §1.6](target-architecture-cohesion-coupling.md) (建议 Session 1.0 标 deprecated,Session 2.0 canonical)
- packages/state 边界: [target-architecture-cohesion-coupling.md §3.3](target-architecture-cohesion-coupling.md#§3-3-packages-边界) (state 在 L2,可被 L3-L7 任意层依赖)
- 状态机档案图: [ascii-diagrams.md §图 6-9](ascii-diagrams.md) (Agent / Plan / KAIROS / Coordinator 4 套状态机的现状)
- 重构 Wave 归属: [target-architecture-cohesion-coupling.md §Wave 4](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) W4.2,工期 30-40 人天
- 与 P0-9 同步进行: [ascii-diagrams.md §图 16](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线) (Wave 3 与 Wave 4 并行)
   - 提供 `upup state-machine inspector <kind> <id>` 查看任意对象的状态历史
6. 回归测试:4 套状态机的所有现有行为不变

**关键引用**:
- `src/daemon/session.ts:SessionState`
- `src/plan/research-plan.ts:ResearchPlanState`
- `src/kairos/types.ts:TaskState`
- `src/coordinator/types.ts:WorkerState`

---

### P0-11 错误处理 + 降级矩阵

**问题**:错误处理不一致。详见 [architecture-debt.md §8](architecture-debt.md#§8-错误处理不一致p1-4)。

**影响面**:
- 7+ 个外部依赖:`src/model/llm.ts` (LLM) / `src/data/tushare/` (Tushare) / `src/data/akshare/` (AKShare) / `src/tools/finance/` (Financial Datasets) / `src/bridge/server.ts` (WSS) / `src/realtime/eastmoney-feed.ts` (EastMoney WS) / `src/cron/store.ts` (better-sqlite3)
- 整个 `src/agent/` 错误处理路径

**依赖**:P0-9(Agent Loop 拆分后,在干净环境统一错误处理)

**预计工期**:8-10 人天

**验收标准**:
1. `packages/utils/result.ts` 实现 `Result<T, E>` 类型
2. 7+ 个外部依赖每个有 1 份"主失败 → 降级"文档:
   - LLM API 超时 → fallback 到备用 provider
   - Tushare 限流 → 降级到 AKShare
   - AKShare 失败 → 降级到 Financial Datasets
   - Financial Datasets 失败 → 返回缓存(若 < 1 小时)
   - WSS 断连 → 自动重连 3 次
   - EastMoney WS 失败 → 降级到 polling(每 5 秒)
   - SQLite 写失败 → 降级到内存
3. 降级路径必须被测试覆盖(用 mock 失败)
4. 错误监控:所有降级事件写 Event Bus topic `system.degraded.*`

**关键引用**:
- 上述 7 个外部依赖文件
- 整个 `src/agent/`

---

### P0-12 性能 + 资源约束

**问题**:当前没有显式性能 / 资源约束。1 个查询可能消耗 200K tokens,1 个用户可能并发 10 个子代理,1 个 session 可能累积 5GB 内存。

**影响面**:
- `src/agent/agent.ts`(主 Agent Loop)
- `src/agent/token-counter.ts`(33L,极小)
- `src/agent/loop-recovery.ts`
- `src/utils/memory-usage.ts`
- 整个 `src/`

**依赖**:无

**预计工期**:5-7 人天

**验收标准**:
1. 单查询 token 上限:
   - 默认 ≤ 200K(可配 `.upup/settings.json`)
   - 接近上限时主动 compact
   - 超过上限 → 优雅拒绝 + 提示用户拆分查询
2. 并发子代理限制:
   - 默认 ≤ 5 个并发 subagent
   - 超过 → 排队,提供进度显示
3. 内存峰值保护:
   - 默认 heap ≤ 1GB
   - 接近上限时强制 compact + 提示
   - 超过上限 → 终止 run + 清理
4. 性能监控:
   - 每次 run 结束输出 `upup perf report` 命令可用
   - 报告包含:token 总数 / LLM 次数 / 工具调用次数 / 总耗时 / 内存峰值

**关键引用**:
- `src/agent/agent.ts`
- `src/agent/token-counter.ts:33`
- `src/agent/loop-recovery.ts:502`

---

## §5 路线图时间表(ASCII 图)

```
2026 Q3                    2026 Q4                    2027 Q1
────────────────────────────────────────────────────────────────────
Wave 1 (并行 1-2 周)
├─ P0-1 投资分析可解释性 (8-10d) ─────────────────────────────▶
├─ P0-5 合规边界 (5-7d) ─────────────────────▶  (依赖 P0-1)
└─ P0-6 多数据源对账 (8-10d) ────────────────────────────────▶

Wave 2 (并行 2-3 周)
├─ P0-2 回测保真度 (12-15d) ──────────────────────────────────▶
├─ P0-7 KAIROS 生产化 (8-10d) ────────────────────────────────▶
├─ P0-8 Bridge 安全加固 (6-8d) ───────────────────────▶
└─ P0-12 性能 + 资源约束 (5-7d) ─────────────────▶

Wave 3 (并行 3-4 周,依赖 Wave 1+2)
├─ P0-9 Agent Loop 拆分 (8-12d) ──────────────────────────────▶
├─ P0-10 状态机统一 (8-12d) ────────────────────────────▶  (依赖 P0-9)
└─ P0-11 错误处理 + 降级矩阵 (8-10d) ──────────────────▶  (依赖 P0-9)

Wave 4 (并行 2-3 周,依赖 Wave 3)
├─ P0-3 沙盒交易审计 (6-8d) ─────────▶  (依赖 P0-2)
└─ P0-4 实时风控 (10-12d) ──────────────────────▶  (依赖 P0-3)

总计:约 18-22 周(4-5 个月,3-4 人小团队)
```

---

## §6 实施建议

### 6.1 分 3 个 follow-up change 推进

不要把所有 12 个 P0 放在 1 个 OpenSpec change 里,会失控。建议拆为 3 个:

#### follow-up change A: `production-grade-investment-v1`
- 范围:P0-1 + P0-2 + P0-3 + P0-4 + P0-5 + P0-6
- 子领域:投资域
- 工期:8-10 周,3 人小团队

#### follow-up change B: `agent-loop-refactor`
- 范围:P0-9 + P0-10
- 子领域:架构
- 工期:4-6 周,2 人

#### follow-up change C: `runtime-hardening`
- 范围:P0-7 + P0-8 + P0-11 + P0-12
- 子领域:运行时
- 工期:6-8 周,2 人

### 6.2 验收标准统一

每个 P0 完成后,必须:
1. 写 e2e 测试覆盖验收标准
2. 更新对应 OpenSpec spec 文件
3. 更新 [capability-matrix.md](capability-matrix.md) 把"已有弱" 改为 "已有强" 或 "超 loucode"
4. 在 README_CN.md 加 1 段"v2026.X.X 新增能力"

### 6.3 风险缓解

| 风险 | 缓解 |
|------|------|
| **P0-9 拆分后回归测试失败** | 先加 e2e 测试覆盖原行为,再拆分;拆完跑 e2e 必须全过 |
| **P0-10 状态机统一破坏持久化格式** | 老数据加 migration 脚本;新数据走新 schema;并行运行 1 个版本 |
| **P0-11 错误处理改造影响性能** | 用 `Result<T, E>` 而非 throw;避免大量 try/catch 链 |
| **P0-4 实时风控误熔断** | 阈值可在 settings.json 配置;默认保守(5%/10%)而非激进(3%/5%) |
| **P0-1 可解释性增加 token 消耗** | 用 schema 而非自然语言,固定模板避免 LLM 自由发挥 |

### 6.4 关键里程碑

| 里程碑 | 完成时间 | 验收 |
|--------|----------|------|
| **M1 投资域 P0 完成** | 2026-09 | P0-1+2+3+4+5+6 完成,投资域 E2E demo 跑通 |
| **M2 架构债清理** | 2026-11 | P0-9+10 完成,agent.ts 拆分,状态机统一,回归测试全过 |
| **M3 运行时加固** | 2026-12 | P0-7+8+11+12 完成,生产可观测性 + 降级矩阵就位 |
| **M4 生产版 v1.0** | 2027-Q1 | 12 个 P0 全部完成,3.5 → 4.5 星国际对标 |

---

## §7 关键引用

- [architecture-current.md](architecture-current.md) — 现状架构
- [capability-matrix.md](capability-matrix.md) — 30+ 维度对标
- [architecture-debt.md](architecture-debt.md) — 10 条架构债
- [comparison-with-competitors.md](comparison-with-competitors.md) — 国际/国内/大模型对标
- [ascii-diagrams.md](ascii-diagrams.md) — 14 张 ASCII 图
- `openspec/changes/archive/top-tier-investment-assistant/` — 13 个已实现 capability
