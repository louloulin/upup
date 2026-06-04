# UpUp vs Claude Code — AI Agent 能力差距分析 (Sprint v7-6)

> 学习 /Users/louloulin/Documents/linchong/claw/loucode (Claude Code v3.0.0 反向工程) 后,
> 针对 upup 投资研究场景(不实现编码能力)梳理的差距清单 + 实施优先级。

## 0. 方法论

读了 loucode 的 5 篇核心文档(共 ~4500 行):

| 文档 | 关键点 |
|---|---|
| 02-architecture.md | QueryEngine Agent Loop, 模块顶层并行初始化, 6 类进程模型 |
| 11-context.md | AppState 100+ 字段, 分层 Context, 选择器订阅优化 |
| 12-memory.md | (待读) |
| 15-agent-system.md | 3 种执行模式 (Subagent/Teammate/Fork), 7 类内置 subagent, Coordinator 编排 |
| 05-hidden-features.md | 3 层门控 (编译 / GrowthBook / OAuth), BUDDY/KAIROS/Bridge/Voice |

## 1. upup 现状速描 (基于代码扫描)

| 能力 | 实现位置 | 行数 | 状态 |
|---|---|---|---|
| Agent Loop (QueryEngine) | `src/agent/agent.ts` | 39 个 `agent` 引用 | ✅ 完整 |
| Plan Mode | `src/agent/plan-mode-state.ts` + `plan-auto-trigger.ts` (v7-1) | 200+ | ✅ 完整 |
| Subagent Runner | `src/agent/subagent-runner.ts` | 631 | ✅ 完整 |
| Subagent 并行 | `subagent-parallel.test.ts` (v6-3) | — | ✅ 完整 |
| SwarmCoordinator | `src/multi-agent/coordinator.ts` | 396, **0 TODOs** | ✅ 完整 |
| TeamManager | `src/multi-agent/team-manager.ts` | 309, **0 TODOs** | ✅ 完整 |
| AgentRegistry | `src/agent/registry.ts` | — | ✅ 完整 |
| Custom Agent Registry | `src/multi-agent/agent-registry.ts` | 6 种 agentType | ✅ 完整 |
| Memory (database + crypto + embeddings + chunker + daily-log + consolidation) | `src/memory/` | 16 文件 | ✅ 基础设施齐 |
| Session 持久化 + resume | `src/session/` | — | ✅ 完整 |
| Skill (SKILL.md) | `src/skills/` | — | ✅ 完整 |
| Hooks | `src/hooks/user-hooks.ts` | — | ✅ 完整 |
| 端口注册表 (跨包解耦) | `src/agent/agent-port.ts` (6 端口) | — | ✅ 完整 |
| SCC + Layer 校验 | `scripts/check-scc.ts` (v7-4) | 355 | ✅ 完整 |
| 5 步投资 phase 真实工具 | `src/commands/investment/phase-handlers.ts` (v7-3) | 545 | ✅ 完整 |
| Multi-portfolio 实时 P&L | `src/tools/portfolio/multi-portfolio.ts` (v7-5) | 660+ | ✅ 完整 |

**核心结论**: upup 的 AI Agent 基础设施 **比 claude code 入门级更扎实** (零 TODO, 端口注册表比 claude code 严格)。
差距集中在 **"投资场景专用化"**, 而非 "AI 能力本身"。

## 2. 差距清单 (按投资价值排序)

### 差距 A: 投资专用 subagent 类型 (高, 立即做)

**claude code 有 7 种内置 subagent**: general, Explore, Plan, statusline-setup, claude-code-guide 等。
每个有 **专用 system prompt + 受限 tool set + 权限边界**。

**upup 现状**: `SubagentType = 'general' | 'specialized' | 'fork'`, 'specialized' 是空壳,
`AgentType` 支持 6 种 (researcher/reviewer/debugger/coordinator/executor/analyst) 但**未预注册**。

**投资场景需要的 5 种专用 subagent**:

| 类型 | 工具白名单 | 不可做 | 投资场景 |
|---|---|---|---|
| `explore` | 读类: getStockPrice, getFilings, getEarnings, web_search, browser | 写类工具, 交易工具 | 行业研究, 10-K 阅读 |
| `plan` | 同 explore + calculateValuationRatios, calculateDCF, backtestLumpSum | 实际下单, 写持仓 | 估值 + 回测设计 |
| `risk` | getPositions, getCash, calculatePortfolioPnL, attribution | 任何交易工具 | 风险评估, 合规检查 |
| `trade` | 全部 + placeTradeOrder | (无, 专职交易) | 执行 paper trade, 仓位管理 |
| `review` | getTradingPositions, getTradingBalance, attribution | 写持仓, 下单 | 复盘, 归因 |

**实施 (v7-7)**: 在 `src/agent/investment-subagents.ts` 预定义 5 个, 自动注册到 AgentRegistry,
启动时 module-level side effect。

### 差距 B: Coordinator 自动路由 (中, 紧随 A)

**claude code 行为**: AgentTool 接收 `subagent_type` 参数, 调用方显式指定, 也支持意图推断。

**upup 现状**: SwarmCoordinator 396 行, 但只支持显式 `spawnAgent({type: 'general'})`,
**没有意图分类器**。

**投资场景**: "分析 NVDA" 应自动路由到 `explore`; "建仓 600519" 应自动到 `trade`;
"NVDA 风险" 应自动到 `risk`。

**实施 (v7-8)**: 在 SwarmCoordinator 加 `routeByIntent(query: string)` 方法, 用关键词 + 简单
embedding 匹配 (复用已有 embeddings.ts), 映射到 5 种 subagent。

### 差距 C: 投资记忆 schema (中)

**claude code 12-memory.md** (未读, 但名字暗示): 用户偏好、跨 session 状态、个性化。

**upup 现状**: memory/ 有 16 文件, 通用 embedding + daily-log + consolidation, 但 **没有投资专用 schema**。

**投资场景需要记忆**:

| 类型 | 例子 | 用途 |
|---|---|---|
| 持仓历史 | "2025-01-15 买入 600519 @ 1800" | 跨 session 复盘 |
| 决策日志 | "因 DCF 折现 30% 上行, 2025-Q1 建仓" | 复盘决策质量 |
| 风险偏好 | "本人不接受单仓位 > 20%" | 风险 subagent 检查 |
| 行业偏好 | "重点关注消费/医药, 回避教培" | explore 优先级 |
| 复盘结论 | "Q1 NVDA 复盘: 选股贡献 +8%, 行业贡献 -3%" | 跨年度对比 |

**实施 (v7-9)**: 在 memory/ 加 `investment-memory.ts`, 5 种 schema + 序列化 + 嵌入检索。

### 差距 D: 投资 Status Line (低, 可选)

**claude code 状态栏**: 自定义 status line, 支持 {model}, {cost}, {context_used} 等模板变量。

**upup 现状**: 基础 status line, 信息不够丰富。

**投资增强**: 实时组合 P&L, 今日盈亏, 持仓集中度, 风险敞口。

**实施 (v7-10, 可选)**: 投资 status line 模板。

## 3. 实施优先级 (用户已确认 "优先实现差距")

| 优先级 | 差距 | Sprint | 价值 |
|---|---|---|---|
| 🥇 P0 | A: 投资专用 subagent 类型 | v7-7 (本轮) | 高 - 直接服务投资研究 |
| 🥈 P1 | B: Coordinator 自动路由 | v7-8 | 高 - 让 subagent 类型自动生效 |
| 🥉 P2 | C: 投资记忆 schema | v7-9 | 中 - 跨 session 智能 |
| 4 | D: 投资 status line | v7-10 | 低 - UI 增强 |

## 4. 不在范围 (用户明确排除)

- ❌ 编码工具 (claude code 的 BashTool, ReadTool, WriteTool, EditTool, NotebookEdit 等)
- ❌ Voice mode (loucode BUDDY/KAIROS, 投资不必要)
- ❌ Bridge 远程控制 (claude.ai 订阅功能, 投资场景不优先)
- ❌ Proactive 主动模式 (claude code 实验, 投资保守)
- ❌ ULTRAPLAN 云端规划 (claude code 实验, 不依赖)
- ❌ 195 个 slash commands (只挑投资相关, 例如 /analyze, /backtest, /trade, /review)

## 5. 当前进度 (v7 sprint chain)

```
v7-1   plan-auto-trigger          ✅
v7-2a  tracker.ts 三层 split       ✅
v7-2b  端口注册表 + 8 个深层 import ✅
v7-2c  plan-auto-trigger 测试污染  ✅
v7-3   trade + review 真实工具     ✅
v7-4   SCC + Layer CI 闸门         ✅
v7-5   multi-portfolio 实时 P&L    ✅
v7-6   loucode 学习 + 差距分析     ✅ (本文件)
v7-7   投资专用 subagent 类型      🔜 下一轮
v7-8   Coordinator 自动路由        ⏳
v7-9   投资记忆 schema             ⏳
```
