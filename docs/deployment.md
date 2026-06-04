# upup 部署指南 (v5.6)

> 5 分钟从 0 到 5 步研究闭环。

## 1. 系统要求

- **Runtime**: Bun 1.0+ (推荐) / Node.js 20+
- **OS**: macOS / Linux / Windows (WSL2)
- **Memory**: 512 MB 起步
- **Disk**: 200 MB (含 node_modules)

## 2. 安装

```bash
# 1. 克隆
git clone https://github.com/louloulin/upup.git
cd upup

# 2. 安装依赖(Bun 推荐,Node 也支持)
bun install

# 3. 配置 API keys(见下一节)
cp env.example .env
# 编辑 .env 填入 LLM + Finance API key

# 4. type-check + 测试
bun run typecheck
bun test

# 5. 启动
bun run start
# 或
bun run src/index.tsx
```

## 3. 环境变量

最小配置(必填):

```bash
# LLM(选 1)
OPENAI_API_KEY=sk-...          # OpenAI (default)
# ANTHROPIC_API_KEY=sk-ant-... # Anthropic Claude
# GOOGLE_API_KEY=...           # Google Gemini
# XAI_API_KEY=...              # xAI Grok
# OPENROUTER_API_KEY=...       # OpenRouter

# Finance(必填,否则 5 步 phase 输出 stub)
FINANCIAL_DATASETS_API_KEY=...  # financial_datasets.io
# 或
TUSHARE_TOKEN=...               # A 股 Tushare
```

可选:

```bash
# Search(优先 Exa,fallback Tavily)
EXASEARCH_API_KEY=...
TAVILY_API_KEY=...

# Tracing
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true

# 测试/部署覆盖(避免污染用户 ~/.upup/)
UPUP_PLANS_DIR=/custom/path/plans
UPUP_WATCHLIST_FILE=/custom/path/watchlist.json
```

## 4. 命令速查

### 5 步研究闭环

```bash
/invest NVDA                    # 全 5 phase
/invest 600519.SH 估值          # A 股 + intent
/invest --fast AAPL             # fast lane(只跑检测到的 phase)
/invest --list                  # 列所有 plan
/invest --resume <planId>       # 从 checkpoint 继续
```

### 5 个 fast lane CLI(< 1s)

```bash
/morning-brief                  # 早盘简报
/earnings-preview NVDA          # 财报前瞻
/risk-dashboard                 # 风险面板
/portfolio-review               # 组合复盘
/watchlist-edit add NVDA 观察   # 加 NVDA + note
/watchlist-edit remove NVDA     # 移除
/watchlist-edit list            # 列表
```

### Claude Code 风格命令(50+)

```bash
/help                           # 帮助
/model                          # 切换模型
/plan                           # 进入 Plan Mode
/exit-plan                      # 退出 Plan Mode
/status                         # 系统状态
/cost                           # 成本
/commit                         # 提交
/diff                           # 差异
/history                        # 历史
... (50+ 命令,见 packages/commands/src/commands/)
```

## 5. 5 步研究闭环使用示例

```bash
# 启动 upup
bun run start

# 在 TUI 中键入
> /invest NVDA
# 立即看到 5 phase 进度
# ✓ research   [██████████] 12ms
# ✓ valuation  [██████████] 8ms
# ✓ backtest   [██████████] 15ms
# ✓ trade      [██████████] 6ms
# ✓ review     [██████████] 4ms
# 总耗时: 45ms  成功: 5/5

# 或
> /invest 600519.SH 估值
# 自动抽取 ticker,检测 phase=valuation(因为"估值"关键词)
# 只跑 detection 命中的 phase
```

## 6. Plan Mode 使用示例

```bash
# 自然语言触发(由 plan-builder 自动生成 plan)
> 分析 NVDA 估值

# Agent 输出(不直接调工具)
📋 投资研究 Plan (NVDA)

1. [research]  financial_metrics      → 市值/PE/PB/收入/EPS/股息
2. [research]  read_filings (10-K)    → 最新 10-K 业务风险摘要
3. [valuation] dcf_valuation          → DCF 内在价值
4. [valuation] comparison             → 同业 PE/PB/PS 对比

# 用户确认
> 确认
# Agent 开始执行,checkpoint + audit + persist
```

## 7. CI / 测试

```bash
# Type check
bun run typecheck

# 单跑某个模块
bun test src/plan/
bun test src/commands/investment/
bun test src/agent/investment-workflow.test.ts

# 全量
bun test
```

已知:`bun test` 全量有 3 个预存 langchain `@langchain/core/utils/uuid` 失败,与本次改动无关。

## 8. 数据持久化

```text
~/.upup/
├── plans/                    # 投资研究 plan(由 plan-executor 写)
│   ├── <plan-id>.json
│   └── audit.log             # JSONL 审计
├── watchlist.json            # watchlist 工具
├── portfolio.json            # 持仓
├── settings.json             # 配置(riskPreference 等)
├── data/sessions/            # 会话
├── memory/                   # 跨会话记忆
├── cache/                    # API 缓存
└── logs/                     # 日志
```

可用 `UPUP_PLANS_DIR` / `UPUP_WATCHLIST_FILE` 等 env var 覆盖(避免污染默认路径)。

## 9. 故障排查

| 症状 | 解决 |
|------|------|
| `Cannot find module '@langchain/core/utils/uuid'` | 已知问题,与本次改动无关。`bun install` 修复依赖即可 |
| 投资命令输出 "数据不可用" | 缺 FINANCIAL_DATASETS_API_KEY / TUSHARE_TOKEN,接 API 后自动填充 |
| 全量 test 偶发 12 个 fail | 测试隔离问题(共享 process.env),单跑模块可绕过 |
| 投资命令不识别 | 确认 `src/commands/executor.ts` 已加载 `investment/registry.ts` |
| Plan Mode 不触发 | 检查 `src/agent/plan-mode-state.ts` 是否被 agent.ts:756 调用 |

## 10. 升级

```bash
git pull upstream main
bun install
bun run typecheck
bun test
```

升级不破坏 `.upup/` 状态(plan JSON 向前兼容)。

## 11. 路线图(已完成)

| Sprint | 状态 | 内容 |
|--------|------|------|
| v3 Sprint 1.1 | ✅ | 投研 Claude 人设 + 5 路 coach 推送 + coach memory |
| v3 Sprint 2.3-2.4 | ✅ | bridge 36 文件 + kairos 6 状态机 |
| v3 Sprint 4.1-4.5 | ✅ | 5 大核心 spec(AlphaSense / Hebbia / FinChat / 同花顺问财 / telemetry) |
| v4 Sprint 4-1 | ✅ | code-archaeology + docs/CODE-MAP.md (970 文件 / 155K LOC) |
| v4 Sprint 4-2 | ✅ | 13 竞品 7 维度矩阵 + 4 唯一差异化 + docs/COMPETITIVE.md |
| **v5 Sprint 1** | ✅ | Plan Mode 投资研究工作流(plan-builder + plan-executor + audit) |
| **v5 Sprint 2** | ✅ | 5 个 fast lane 投资 CLI(零跨包、零循环) |
| **v5 Sprint 3** | ✅ | 5 步研究闭环 + /invest CLI |
| **v5 Sprint 4** | ✅ | docs/positioning.md + docs/deployment.md |
| **v5 Sprint 5** | ✅ | CHANGELOG + v3/v4 归档验证 |
