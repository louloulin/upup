# upup 投研 AI 助手 — 完整版定位 (v5.6)

> 顶级投资助手的 CLI AI Agent — CLI-first / Open-source / 全市场 / 三件套

## 1. 一句话定位

**upup 是终端里的"投研 Claude Code"** — CLI 优先、开源、覆盖 A 股 / 港股 / 美股 / 加密,5 步研究闭环(research → valuation → backtest → trade → review)一句话触发,Plan Mode 让 LLM 不替你做投决。

## 2. 4 个唯一差异化(从 13 竞品 7 维度矩阵提炼)

| # | 差异化 | 具体 |
|---|--------|------|
| 1 | **CLI-first,不是 GUI/Notebook** | 终端原生,Ink/React TUI,可 SSH 远程,无浏览器依赖 |
| 2 | **Open-source + 全市场** | MIT 协议,A 股 / 港股 / 美股 / 加密,本地优先 |
| 3 | **5 步研究闭环一句话** | `/invest NVDA` 一次跑完 5 phase,checkpoint + resume |
| 4 | **Plan Mode 投决审计** | 用户问"分析 NVDA"先生成 2-10 步 plan,等确认再执行 |

## 3. 5 类投资者决策路径

| 投资者类型 | 入口 | 闭环 |
|------------|------|------|
| **早盘族** | `/morning-brief` | 隔夜 + 财报 + watchlist 异动,1 秒内出 |
| **财报跟踪** | `/earnings-preview NVDA` | 共识 + 历史 surprise + 研究 plan 框架 |
| **风控优先** | `/risk-dashboard` | active plan 进度 + 行业集中度 + 风险偏好 |
| **组合管理** | `/portfolio-review` | Brinson 归因 + 完成 plan 复盘 + rebalance |
| **深度研究** | `/invest NVDA 估值` | 5 步研究闭环(research→valuation→backtest→trade→review) |

## 4. 5 步研究闭环(一句话触发)

```
/invest NVDA                    → 全 5 phase (默认 full mode)
/invest --fast 600519.SH        → fast lane(只跑检测到的 phase)
/invest --list                  → 列所有 plan
/invest --resume <planId>       → 从 checkpoint 继续
```

5 步 phase 顺序(在 `src/agent/investment-workflow.ts` 中编排):
1. **research** — 基础面 + 消息面(财务指标 + 10-K + 近期新闻)
2. **valuation** — DCF 估值 + 多倍对比 + 同业 benchmark
3. **backtest** — 策略历史回测(胜率/收益/Sharpe/MaxDD)
4. **trade** — 交易建议(风险检查 + 仓位 + 止损/止盈)
5. **review** — 复盘(Brinson 归因 + 复利到 coach memory)

## 5. Plan Mode 投决审计

用户问"分析 NVDA 估值",agent 不直接跑工具 — 先生成 2-10 步 plan:

```
📋 投资研究 Plan (NVDA)

1. [research]  financial_metrics      → 市值/PE/PB/收入/EPS/股息
2. [research]  read_filings (10-K)    → 最新 10-K 业务风险摘要
3. [research]  research_deep_search   → 近期新闻 + 管理层指引
4. [valuation] dcf_valuation          → DCF 内在价值 + 敏感性表
5. [valuation] comparison             → 同业 PE/PB/PS 对比
6. [review]    portfolio_attribution  → Brinson 归因 + 贡献
7. [review]    coach_memory           → 复利到 memory,下次自动调用
```

用户输入"确认" / "yes" / "ok" → 执行;"取消" / "no" → 退出;"加上 AMD 对比" → 自动改 plan。

## 6. 5 个 fast lane CLI(< 1s,纯本地)

| 命令 | 别名 | 行为 |
|------|------|------|
| `/morning-brief` | `mb`, `brief` | 今日 plan + watchlist + 审计日志 |
| `/earnings-preview TICKER` | `ep` | ticker 研究 plan 框架 + 历史 plan |
| `/risk-dashboard` | `risk` | active plan 进度 + 风险偏好 + watchlist 集中度 |
| `/portfolio-review` | `review`, `pr` | 最近完成 plan + Brinson 框架 |
| `/watchlist-edit` | `wl`, `watchlist` | `add \| remove \| list` 本地 `.upup/watchlist.json` |

## 7. 技术栈 — 严格模块高内聚

- **Bun** runtime + TypeScript strict
- **LangChain** `@langchain/core` 多 provider(OpenAI / Anthropic / Google / xAI / OpenRouter / Ollama)
- **Ink** CLI 渲染(React 风格)
- **Playwright** headless browser 富页读取
- **Plan Mode** 已有 `src/agent/plan-mode-state.ts`(集成在 `agent.ts:756`)
- **Multi-Agent** Coordinator 4 worker(`src/coordinator/`)
- **Kairos** 6 状态机主动模式(`src/kairos/`)

### 模块依赖图(零循环)

```
src/commands/executor.ts
  → src/commands/investment/registry.ts
    → 5 + 1 个 CLI(morning-brief / earnings-preview / risk-dashboard
       / portfolio-review / watchlist-edit / invest)
      → src/plan/{plan-builder, plan-executor, plan-context, research-plan}.js
      → src/agent/investment-workflow.js
      → src/utils/storage-paths.js
      → node:fs / node:path
```

- **零** `src/tools/*` 依赖(避开 finance/portfolio → agent 反向引用)
- **零** `packages/commands` 依赖(避开跨包 + tsconfig rootDir)
- **零** 循环引用(每个 sprint 都严格验证 `grep -E 'src/tools/'`)

## 8. 9 个核心 spec(delta 格式)

```text
openspec/changes/top-tier-investment-claude-code-v5/
├── proposal.md            (51 行)
├── design.md              (285 行)
├── tasks.md               (129 行)
└── specs/
    ├── plan-mode-investment/spec.md   投资研究 Plan Mode
    ├── cli-investment-p0/spec.md      5 个高优 CLI
    └── investment-workflow/spec.md    5 步研究闭环
```

## 9. 对标竞品(从 13 竞品 7 维度矩阵)

| 竞品 | 类型 | upup 差异化 |
|------|------|------------|
| AlphaSense | 投研桌面 | CLI 优先 + 开源 + 三件套(plan/audit/checkpoint) |
| Hebbia | 矩阵分析 | 自然语言 + plan mode,不是 GUI 拖拽 |
| FinChat | 对话研究 | 5 步闭环 + checkpoint resume,不是单轮 |
| 同花顺问财 | A 股自然语言 | 全市场 + 多语种 + 开源 |
| TradingView | 图表 | CLI 优先,适配 SSH 远程 |
| Claude Code | 编码 Agent | **投研专精**,不实现编码能力 |

## 10. 30 字 sologan

> **终端里的"投研 Claude Code" — 一句话 5 步闭环,Plan Mode 不替你投决。**
