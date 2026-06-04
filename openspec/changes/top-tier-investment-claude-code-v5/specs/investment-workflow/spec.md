# investment-workflow

## Purpose

5 步研究闭环 — 用户说"我想投资 NVDA",agent 一次性跑完 research → valuation → backtest → trade → review,无需 5 轮对话。

## ADDED Requirements

### Requirement: WORKFLOW-INVESTMENT-001 — 5 步闭环
`src/agent/investment-workflow.ts` SHALL 编排以下 5 步:

1. **research** — 基础面 + 消息面调研(financial_metrics + read_filings + research_deep_search)
2. **valuation** — DCF + 多倍对比 + 同业 benchmark(dcf_valuation + comparison)
3. **backtest** — 同策略历史回测(backtest 引擎)
4. **trade** — 交易建议 + 风险检查(trading sandbox + risk 工具)
5. **review** — 复盘 + 复利记录(portfolio-attribution + coach memory)

#### Scenario: 一次性闭环
- WHEN 用户键入 `/invest NVDA` 或自然语言 "我想投资 NVDA"
- THEN agent 顺序执行 5 步,每步 checkpoint
- AND 输出统一报告: research_summary + valuation_table + backtest_chart + trade_card + review_log
- AND 总耗时 < 60s(fast lane + 并行)

#### Scenario: 中途失败
- WHEN step 3 (backtest) 失败
- THEN 保留 step 1+2 结果
- AND 输出 partial report + 建议用户先研究不急交易

### Requirement: WORKFLOW-INVESTMENT-002 — checkpoint + resume
workflow SHALL 每步 checkpoint 到 `.upup/workflows/<id>.json`,支持 resume。

#### Scenario: 进程重启
- WHEN agent 重启,有未完成 workflow
- THEN 启动时检测到 checkpoint,询问用户是否 resume
- AND resume 从失败 step 继续,不重跑已完成 step

### Requirement: WORKFLOW-INVESTMENT-003 — 软失败
任一步失败 SHALL 不抛错,返回 partial result,标记 step status = "failed"。

#### Scenario: 软失败
- WHEN trading sandbox 因 broker 不可用失败
- THEN step 4 标记 "failed",step 1-3 保留
- AND 输出建议"等 broker 恢复后重试 step 4"
