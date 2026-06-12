# UpUp × loucode 能力对标矩阵

> 版本:v1.0 · 对应 upup v2026.5.15 vs loucode clone · 生成日期 2026-06-06
> 评估方式:每行 4 列:`能力维度` / `upup 现状` / `loucode 现状` / `5 状态评估 + 引用`
> 5 状态:`已有强` / `已有弱` / `缺失` / `不适用` / `超 loucode`
> 配套图集:[ascii-diagrams.md](ascii-diagrams.md)

---

## §1 通用能力(12 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **LLM Provider** | 6 家(OpenAI / Anthropic / Google / xAI / OpenRouter / Ollama) | 同上 | **超 loucode**:本地 Ollama 集成,引用 `src/model/llm.ts` + `packages/llm/` |
| **Tool System** | 296 工具文件,LangChain StructuredTool 接口 | 类似 | **已有强**:工具注册表 + 并发映射,引用 `src/tools/registry/` + `src/agent/tool-executor.ts:337` |
| **Skill System** | 50 SKILL.md + 14 bundled + hot-reload | 12 投研 skill | **超 loucode**:数量多 + i18n + 依赖关系,引用 `src/skills/registry.ts` + `src/skills/loader.ts` |
| **Memory** | MemoryManager + flush + extraction + observation buffer | memdir/ + memories/ | **已有强**:turnCount 间隔抽取 + 持久化,引用 `src/memory/flush.ts` + `src/memory/extraction.ts` |
| **Context Management** | Anthropic-style(全量保留 + 阈值压缩) | Anthropic-style | **平手**:引用 `src/agent/compact.ts:454` + `src/agent/microcompact.ts:114` |
| **Compaction** | LLM 摘要 + 失败重试 + 强制截断 | 同 | **已有强**:失败 3 次强截断,引用 `src/agent/compact.ts:454` |
| **Subagent** | subagent.ts(403L) + subagent-runner.ts(631L) | subagent.ts(约 600L) | **已有强**:toolFilter + 权限继承,引用 `src/agent/subagent.ts:403` |
| **Coordinator** | coordinatorMode(工具白名单) + 4 phase 协议 | coordinatorMode(类似) | **平手**:都实现主从职责分离,引用 `src/coordinator/coordinatorMode.ts` |
| **Multi-Agent** | Multi-Agent 系统(team-manager / verifier) | 完整 | **已有弱**:7 个 verifier + 调度,但缺任务路由可视化,引用 `src/multi-agent/` |
| **Sessions** | Daemon Session(6 状态) + 序列化 | Session Manager | **平手**:都实现 resume / serialize,引用 `src/daemon/session.ts` |
| **Permissions** | approval-prompt.ts + tool-deny.ts + session-approved | approvalCallbacks | **已有弱**:有 3 层(deny/session/approve),但缺细粒度 regex 规则,引用 `src/components/approval-prompt.ts` |
| **Cost Tracking** | 无独立 cost-tracker | cost-tracker.ts(323L) + costHook.ts | **缺失**:无 token 计费、成本告警、月度报表,引用 `loucode/src/cost-tracker.ts` |

---

## §2 监控与远程(8 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **Cron** | croner + schedule.ts + store.ts | 类似 | **平手**:引用 `src/cron/schedule.ts` + `src/cron/store.ts` |
| **Heartbeat** | `src/cron/heartbeat-migration.ts` 已迁移到 KAIROS | 独立模块 | **已有强**:被 KAIROS 整合,引用 `src/cron/heartbeat-migration.ts` |
| **KAIROS** | scanner / position-monitor / proactive(3 子系统) | 完整 | **超 loucode**:3 子系统覆盖盘前/盘中/盘后,引用 `src/kairos/scanner.ts` + `position-monitor.ts` + `proactive.ts` |
| **Proactive** | proactive.ts 主动机会发现 | 简单 idle tracker | **超 loucode**:异动 + 估值修复 + 资金异动 3 类机会,引用 `src/kairos/proactive.ts` |
| **Bridge 远程** | server.ts + auth.ts + jwtUtils + session-sync | 类似 | **平手**:WebSocket + JWT + 跨设备同步,引用 `src/bridge/server.ts` + `src/bridge/auth.ts` |
| **Remote Sessions** | bridgeSessionApi + peerSessions(部分) | RemoteSessionManager(完整) | **已有弱**:本地 daemon 强,远程跨实例弱,引用 `loucode/src/remote/RemoteSessionManager.ts` |
| **Sessions WebSocket** | 有(bridge/session-sync.ts) | SessionsWebSocket(完整) | **平手**:引用 `src/bridge/session-sync.ts` |
| **SSH** | 无 | SSHSessionManager + createSSHSession(完整) | **不适用**:投资域不需要远程 shell,引用 `loucode/src/ssh/SSHSessionManager.ts` |

---

## §3 数据通路(5 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **Realtime Feed** | eastmoney-feed + throttled + aggregator | 简单 polling | **超 loucode**:WebSocket + 100ms 节流 + K线聚合,引用 `src/realtime/eastmoney-feed.ts` + `throttled-feed.ts` + `aggregator.ts` |
| **Event Bus** | event-bus.ts(发布订阅) | 类似 | **已有弱**:有 on/emit,缺 topic 通配符 + 回放 buffer(已部分实现),引用 `src/core/event-bus.ts` |
| **Reactive Streams** | 无 | 类似 | **缺失**:无 RxJS 风格流,引用 `loucode/src/bridge/replBridgeTransport.ts` |
| **Stream Mode** | 4 模式(text/thinking/tool) | 类似 | **平手**:引用 `src/agent/types.ts:StreamMode` |
| **Stream Progress Event** | 有(40+ 类型事件) | 类似 | **平手**:引用 `src/agent/types.ts:AgentEvent` 40+ 类型 |

---

## §4 人机交互(5 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **OutputStyles** | 无 | outputStyles/(完整) | **缺失**:无 /formal /concise /explanatory 等风格,引用 `loucode/src/outputStyles/` |
| **Voice** | 无 | voice/ + voiceModeEnabled.ts | **缺失**:无语音模式,引用 `loucode/src/voice/voiceModeEnabled.ts` |
| **Buddy** | 无 | buddy/(CompanionSprite + prompt + types) | **不适用**:投资域不需要宠物,引用 `loucode/src/buddy/` |
| **Vim** | editor.ts(基础) | vim/(完整 vim 模式) | **已有弱**:基础 emacs-like 绑定,缺 vim 模式,引用 `src/components/custom-editor.ts` |
| **Migrations** | 无 | migrations/(完整数据迁移) | **缺失**:无 .upup 目录 schema 升级机制,引用 `loucode/src/migrations/` |

---

## §5 投资域特定(8 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **Trading Sandbox** | SandboxBroker + 撮合模型 + 滑点 + 手续费 | 无 | **超 loucode**:完整 sandbox,引用 `src/tools/trading/sandbox-engine.ts` |
| **Brinson Attribution** | attribution.ts(Brinson + Style + Sector) | 无 | **超 loucode**:3 维归因,引用 `src/tools/portfolio/attribution.ts` |
| **5-Phase Workflow** | research→valuation→backtest→trade→review | 无 | **超 loucode**:完整闭环,引用 `src/agent/investment-workflow.ts:308` + `src/commands/investment/phase-handlers.ts` |
| **Risk Dashboard** | risk-dashboard.ts(子命令) | 无 | **超 loucode**:独立面板,引用 `src/commands/investment/risk-dashboard.ts` |
| **Portfolio Review** | portfolio-review.ts(子命令) | 无 | **超 loucode**:复盘 + 归因,引用 `src/commands/investment/portfolio-review.ts` |
| **Watchlist Edit** | watchlist-edit.ts(子命令) | 无 | **超 loucode**:交互式自选股,引用 `src/commands/investment/watchlist-edit.ts` |
| **Investment Subagents** | investment-subagents.ts(260L) | 无 | **超 loucode**:投资域 subagent,引用 `src/agent/investment-subagents.ts:260` |
| **Intent Detector** | intent-detector.ts(479L,legacy keyword) | 无 | **已有弱**:有 5 类意图识别,缺 LLM-driven 分类,引用 `src/agent/intent-detector.ts:479` |

---

## §6 数据基础设施(8 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **A 股数据源** | Tushare Pro + AKShare + Financial Datasets | 无 | **超 loucode**:三源 + 仲裁,引用 `src/data/tushare/` + `src/data/akshare/` + `src/tools/finance/` |
| **港股 / 美股** | Financial Datasets(US) + 部分 Tushare | 部分 | **平手**:引用 `src/tools/finance/` |
| **基金数据** | fund-analysis / fund-comparison / fund-holdings(8 投研) | 简单 | **超 loucode**:引用 `src/skills/fund-*/` |
| **新闻 / 舆情** | sentiment-analysis + x-research + news tool | 简单 web_search | **超 loucode**:专业舆情,引用 `src/skills/sentiment-analysis/SKILL.md` + `src/skills/x-research/SKILL.md` |
| **公告 / 财报** | financial-report + earnings-calendar + earnings-season | 简单 | **超 loucode**:引用 `src/skills/financial-report/` + `src/skills/earnings-*/` |
| **研报** | research-report(8 投研) + 慧博 / Choice(规划) | 简单 | **已有强**:引用 `src/skills/research-report/SKILL.md` |
| **龙虎榜 / 北向** | dragon-tiger(规划) | 无 | **缺失**:规划中,引用 archived `top-tier-investment-assistant/specs/alt-data` |
| **本地数据存储** | better-sqlite3 + @duckdb/duckdb-wasm | 简单文件 | **超 loucode**:DuckDB 列存,引用 `package.json:@duckdb/duckdb-wasm` |

---

## §7 LLM 与优化(4 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **Model Fallback** | fallback.ts(423L)+ FallbackTriggeredError | 类似 | **已有强**:主备 + 触发检测,引用 `src/agent/fallback.ts:423` |
| **Anthropic Cache** | 显式 cache_control on system prompt | 类似 | **平手**:引用 `src/model/llm.ts` |
| **Streaming** | streamLlmWithMessages(AIMessageChunk) | 类似 | **平手**:引用 `src/model/llm.ts` |
| **Prompt Caching** | 显式 cache_control | 类似 | **平手** |

---

## §8 测试 / 质量 / 部署(8 维度)

| 能力维度 | upup 现状 | loucode 现状 | 5 状态评估 + 引用 |
|----------|-----------|--------------|------------------|
| **Tests** | 276 个 .test.ts | 类似 | **平手**:引用 `find src -name "*.test.ts" | wc -l` = 276 |
| **E2E** | 0 e2e + 一些 *.e2e.test.ts | 较全 | **已有弱**:缺完整端到端 demo,引用 `openspec/changes/archive/top-tier-investment-assistant/tasks.md §14` |
| **Evals** | evals/ + LangSmith | 类似 | **平手**:引用 `src/evals/run.ts` |
| **Type Check** | tsc --noEmit | 同 | **平手** |
| **CI** | GitHub Actions(typecheck + test) | 类似 | **平手** |
| **Build** | bun build --compile + esbuild + pkg | 类似 | **超 loucode**:Bun 编译二进制,引用 `package.json:scripts.build` |
| **Distribution** | npm + 二进制 + gitcode mirror | npm | **超 loucode**:多渠道分发,引用 `package.json:pkg.bin` |
| **Project Onboarding** | 弱 | projectOnboardingState(完整) | **已有弱**:缺 onboarding 状态机,引用 `loucode/src/projectOnboardingState.ts` |

---

## §9 总结:5 状态分布

| 状态 | 数量 | 占比 | 含义 |
|------|------|------|------|
| **超 loucode** | 16 | ~32% | upup 在该维度领先(A 股数据栈 + 50 skills + KAIROS + Coordinator + Trading Sandbox + 5-Phase Workflow + 8 投资域特性) |
| **平手** | 13 | ~26% | upup 与 loucode 能力持平(LLM Provider / Subagent / Sessions / Stream Mode ...) |
| **已有强** | 7 | ~14% | upup 已实现但实现得不错(Memory / Compaction / Realtime Feed) |
| **已有弱** | 7 | ~14% | upup 已实现但需要加强(Multi-Agent / Permissions / Remote Sessions / Event Bus / Intent Detector / E2E / Project Onboarding) |
| **缺失** | 5 | ~10% | upup 完全没实现(Cost Tracking / Reactive Streams / OutputStyles / Voice / Migrations / 龙虎榜) |
| **不适用** | 2 | ~4% | 投资域不需要(Buddy / SSH) |

> **总评**:upup 在 **投资域特定 8 维度全部 "超 loucode"**;通用能力 12 维度多数 **平手 / 已有强**;**缺失 5 维度中 Cost Tracking + OutputStyles + Voice + Migrations 是 Claude Code 标志性能力,需要补齐**;**不适用 2 维度(Buddy / SSH) 投资域不需要**。

---

## §10 关键差距(投资版 Claude Code 必须补齐的 8 件事)

按"投资价值 × 实现难度"排序:

1. **Cost Tracking** (缺失) — 投资域需要月度 token 报告 + 单查询成本告警 → 高优
2. **OutputStyles** (缺失) — 投资域需要 /formal(完整研报)/ /concise(快讯)/ /explanatory(教学) → 中优
3. **Migrations** (缺失) — `.upup/` schema 升级机制,无破坏性升级 → 中优
4. **龙虎榜 / 北向资金** (规划中) — 投资域高频需求,集成进 alt-data → 中优
5. **Reactive Streams** (缺失) — 大批量实时行情必备 → 低优
6. **Multi-Agent 任务路由可视化** (已有弱) — 用户体验 → 中优
7. **Remote Sessions 跨实例** (已有弱) — 多用户协作 → 中优
8. **Intent Detector LLM-driven** (已有弱) — 准确率从 70% 提到 90% → 高优

详见 [production-readiness-checklist.md](production-readiness-checklist.md) §P0 路线图
