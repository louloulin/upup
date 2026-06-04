# cli-investment-p0

## Purpose

5 个高优投资 CLI 命令 — 用户无需自然语言 30+ 字符解释,直接键入 `/morning-brief` 等即得。

## ADDED Requirements

### Requirement: CLI-INVESTMENT-001 — 5 个 P0 命令
`src/commands/` SHALL 注册以下 5 个投资 CLI:

- `/morning-brief` — 早盘简报(隔夜新闻 + 今日财报 + watchlist 异动)
- `/earnings-preview TICKER` — 财报前瞻(下次财报日期 + 共识预期 + 历史 surprise)
- `/risk-dashboard` — 风险面板(组合 β / 行业集中度 / 单股权重 / VaR)
- `/portfolio-review` — 组合复盘(Brinson 归因 + 贡献分析 + rebalance 建议)
- `/watchlist-edit` — watchlist 编辑(加/删/排序)

#### Scenario: 早盘简报
- WHEN 用户键入 `/morning-brief`
- THEN 5 秒内输出: 隔夜美股前 3 + 今日财报 calendar + 自选股异动 top 5
- AND 不调用 LLM 主对话(走 fast lane)

#### Scenario: 财报前瞻
- WHEN 用户键入 `/earnings-preview NVDA`
- THEN 输出: 下次财报日期 + 收入/GAAP EPS 共识 + Zacks 评级 + 历史 8 季 surprise 平均

### Requirement: CLI-INVESTMENT-002 — 中央注册表
`src/commands/index.ts` SHALL 维护稳定 id 命名空间 `investment:{name}`,避免与已有 9 个命令冲突。

#### Scenario: 注册冲突
- WHEN 新命令 id 与已有命令冲突
- THEN 中央注册表抛错,启动失败

### Requirement: CLI-INVESTMENT-003 — fast lane
5 个 P0 命令 SHALL 走 fast lane(直接调工具,不进 LLM 主对话),响应 < 5s。

#### Scenario: fast lane 性能
- WHEN `/morning-brief` 被调用
- THEN 不进入 LLM tool-calling loop
- AND 直接并行调 financial_news + earnings_calendar + watchlist_alerts
- AND < 5 秒输出
