# Tasks: 顶级投资助手的 Claude Code (v3)

> **范围**:5 个新 spec + 2 个 v2 深化 spec,共 7 sprint(2-3 月)落地。
>
> **方法**:增量更新本 tasks.md,逐 sprint 推进,每个 task 完成需 typecheck + 测试全绿。

---

## Sprint 1 — 投研 Claude 主对话(1 turn,2-3 天)

### 1.1 role-system — 投研 Claude 人设 + prompt 模板

- [ ] 1.1.1 创建 `src/agent/role-system.ts`,定义"投研 Claude"人设
- [ ] 1.1.2 实现 `buildCoachSystemPrompt(userContext?)` 函数,拼 prompt
- [ ] 1.1.3 集成到 `src/agent/agent.ts` 主循环(默认注入,可通过 `UPUP_COACH_MODE=0` 关闭)
- [ ] 1.1.4 写 `role-system.test.ts`(10+ tests,覆盖:用户偏好 / 引用源 / 风险提示 / 关闭降级)

### 1.2 coach-memory — 跨会话记忆

- [ ] 1.2.1 创建 `src/coach/memory.ts`,定义 `CoachMemory` 类
- [ ] 1.2.2 实现 `.upup/coach/memory.json` 持久化(加密 + 脱敏)
- [ ] 1.2.3 实现 `loadMemory()` / `saveMemory()` / `updateMemory()` API
- [ ] 1.2.4 集成 KAIROS Dream 整合(用户偏好/持仓/关注)
- [ ] 1.2.5 写 `coach-memory.test.ts`(8+ tests)

### 1.3 coach-channels — 推送渠道最小骨架

- [ ] 1.3.1 创建 `src/coach/channels/` 目录
- [ ] 1.3.2 实现 `src/coach/channels/cli.ts`(CLI 推送,默认)
- [ ] 1.3.3 实现 `src/coach/channels/wechat.ts`(Server 酱 / PushPlus 骨架)
- [ ] 1.3.4 实现 `src/coach/channels/feishu.ts`(Lark Bot 骨架)
- [ ] 1.3.5 实现 `src/coach/channels/dingtalk.ts`(DingTalk Bot 骨架)
- [ ] 1.3.6 实现 `src/coach/channels/email.ts`(SMTP 骨架)
- [ ] 1.3.7 抽象 `PushChannel` 接口,`send(payload)` 方法
- [ ] 1.3.8 写 `coach-channels.test.ts`(5+ tests per channel)

### 1.4 cli-extension-p0 — 5 个高优隐藏命令

- [ ] 1.4.1 创建 `src/commands/morning-brief.tsx`(晨会)
- [ ] 1.4.2 创建 `src/commands/earnings-preview.tsx`(财报日 T-1)
- [ ] 1.4.3 创建 `src/commands/risk-dashboard.tsx`(风险仪表盘)
- [ ] 1.4.4 创建 `src/commands/portfolio-review.tsx`(组合复盘)
- [ ] 1.4.5 创建 `src/commands/watchlist-edit.tsx`(自选股编辑)
- [ ] 1.4.6 每个命令 export `command: Command` + `feature` 字符串
- [ ] 1.4.7 集成到 `src/commands/index.ts` 中央注册表
- [ ] 1.4.8 写 `cli-extension-p0.test.ts`(5+ tests per command)

**Sprint 1 完成标志**:
- 投研 Coach 主对话可用
- 5 个高优 CLI 命令可启用
- `bun test src/agent/ src/coach/ src/commands/` 全绿
- `bun run typecheck` 全绿

---

## Sprint 2 — 投研 Claude Code 5 层架构(2 turn,1 周)

### 2.1 manifest-5layer — 5 layer 视角

- [ ] 2.1.1 扩展 `src/agent/capability-manifest.ts` 加 `layer` / `featureGate` / `coachEnabled` / `markets` 字段
- [ ] 2.1.2 5 个 group(realtime/coordinator/kairos/trading/portfolio)各标到正确 layer
- [ ] 2.1.3 兼容 v2 manifest 解析(?? 兜底)
- [ ] 2.1.4 写 `manifest-5layer.test.ts`(8+ tests)

### 2.2 feature-gates-50+ — 编译开关完整化

- [ ] 2.2.1 列 50+ `feature()` 编译开关清单(在 `src/agent/feature-gates.ts`)
- [ ] 2.2.2 升级 `isXxxEnabled()` 函数,使用 loucode Positive ternary pattern
- [ ] 2.2.3 创建 `src/services/analytics/growthbook.ts`(GrowthBook 灰度)
- [ ] 2.2.4 集成到 `src/services/analytics/index.ts`
- [ ] 2.2.5 写 `feature-gates-50+.test.ts`(20+ tests,每个开关 1 个)

### 2.3 cli-extension-p1 — 6 个隐藏命令

- [ ] 2.3.1 创建 `src/commands/rebalance-now.tsx`(立即调仓)
- [ ] 2.3.2 创建 `src/commands/alert-add.tsx` / `alert-remove.tsx`(加减预警)
- [ ] 2.3.3 创建 `src/commands/screen.tsx`(自然语言选股)
- [ ] 2.3.4 创建 `src/commands/compare.tsx`(多标的对比)
- [ ] 2.3.5 创建 `src/commands/doctor.tsx`(环境自检)
- [ ] 2.3.6 集成到中央注册表
- [ ] 2.3.7 写 `cli-extension-p1.test.ts`(6+ tests per command)

### 2.4 docs-3d — 4 唯一故事

- [ ] 2.4.1 更新 `README.md` 顶部 sologan + 1 段话
- [ ] 2.4.2 添加竞品对比表
- [ ] 2.4.3 更新 `README_CN.md` 同步
- [ ] 2.4.4 写 `docs/positioning.md`(详细 4 唯一讲清楚)
- [ ] 2.4.5 写 `docs/deployment.md`(Docker / 自托管)

**Sprint 2 完成标志**:
- 5 layer × 5 group 双视角 manifest 解析正确
- 50+ 编译开关完整
- 11 个 CLI 隐藏命令
- 4 唯一故事在 README 清晰
- `bun test` + `bun run typecheck` 全绿

---

## Sprint 3 — loucode 7 隐藏功能 → 投研 7 增强(3 turn,2 周)

### 3.1 kairos-v2 — 升级 8 → 16 文件

- [ ] 3.1.1 创建 `src/kairos/runtime.ts`(状态机主类,6 状态)
- [ ] 3.1.2 创建 `src/kairos/compaction.ts`(dream 整合核心)
- [ ] 3.1.3 创建 `src/kairos/scheduling.ts`(持久 cron)
- [ ] 3.1.4 创建 `src/kairos/dream.ts`(4 阶段 dream)
- [ ] 3.1.5 创建 `src/kairos/memory.ts`(跨会话记忆)
- [ ] 3.1.6 创建 `src/kairos/session.ts`(会话管理)
- [ ] 3.1.7 升级 `src/kairos/proactive.ts`(6 状态机实现)
- [ ] 3.1.8 升级 `src/kairos/position-monitor.ts`(跨 broker)
- [ ] 3.1.9 升级 `src/kairos/scanner.ts`(多频率)
- [ ] 3.1.10 集成 `src/coach/channels/`(推送集成)
- [ ] 3.1.11 写 `kairos-v2.test.ts`(20+ tests)

### 3.2 bridge-v2 — 升级 12 → 34 文件

- [ ] 3.2.1 创建 `src/bridge/bridgeServer.ts`(WebSocket server)
- [ ] 3.2.2 创建 `src/bridge/bridgeProtocol.ts`(消息协议)
- [ ] 3.2.3 创建 `src/bridge/bridgeAuth.ts`(JWT 鉴权)
- [ ] 3.2.4 创建 `src/bridge/bridgeSession.ts`(远端 session)
- [ ] 3.2.5 创建 `src/bridge/bridgeConfig.ts` + `envLessBridgeConfig.ts`
- [ ] 3.2.6 创建 `src/bridge/bridgeMessaging.ts` + `inboundMessages.ts` + `inboundAttachments.ts`
- [ ] 3.2.7 创建 `src/bridge/bridgeUI.ts` + `bridgeStatusUtil.ts`
- [ ] 3.2.8 创建 `src/bridge/bridgePermissionCallbacks.ts`
- [ ] 3.2.9 创建 `src/bridge/peerSessions.ts` + `sessionIdCompat.ts`
- [ ] 3.2.10 创建 `src/bridge/pollConfig.ts` + `pollConfigDefaults.ts`
- [ ] 3.2.11 创建 `src/bridge/replBridge.ts` + `replBridgeHandle.ts` + `replBridgeTransport.ts`
- [ ] 3.2.12 创建 `src/bridge/initReplBridge.ts`
- [ ] 3.2.13 创建 `src/bridge/workSecret.ts` + `trustedDevice.ts` + `capacityWake.ts` + `flushGate.ts`
- [ ] 3.2.14 创建 `src/bridge/jwtUtils.ts` + `webhookSanitizer.ts` + `debugUtils.ts` + `bridgeDebug.ts`
- [ ] 3.2.15 创建 `src/bridge/bridgePointer.ts` + `bridgeMain.ts` + `bridgeApi.ts`
- [ ] 3.2.16 创建 `src/bridge/bridgeEnabled.ts` + `codeSessionApi.ts` + `createSession.ts`
- [ ] 3.2.17 创建 `src/bridge/sessionRunner.ts` + `remoteBridgeCore.ts` + `types.ts`
- [ ] 3.2.18 升级已有 12 个 bridge 文件
- [ ] 3.2.19 写 `bridge-v2.test.ts`(30+ tests)

### 3.3 coach-active — 投研 Coach 主动模式

- [ ] 3.3.1 创建 `src/coach/morningBrief.ts`(晨会生成)
- [ ] 3.3.2 创建 `src/coach/afterHours.ts`(盘后总结)
- [ ] 3.3.3 创建 `src/coach/earningsPreview.ts`(财报日 T-1)
- [ ] 3.3.4 创建 `src/coach/policyDay.ts`(政策日)
- [ ] 3.3.5 集成 KAIROS cron 调度
- [ ] 3.3.6 集成 `src/coach/channels/`(多渠道推送)
- [ ] 3.3.7 写 `coach-active.test.ts`(8+ tests)

**Sprint 3 完成标志**:
- kairos-v2 16 文件完整(6 状态机 + Dream + 持久 cron)
- bridge-v2 34 文件完整(RBAC / UI / Permission / Poll / Status)
- coach-active 4 个主动模式可用
- `bun test` + `bun run typecheck` 全绿

---

## Sprint 4 — 投研 5 大核心 spec 深化(2 turn,1 周)

### 4.1 backtest-v2 — 回测全链路

- [ ] 4.1.1 创建 `src/backtest/data.ts`(历史数据加载)
- [ ] 4.1.2 创建 `src/backtest/strategy.ts`(策略接口 + 6 内置策略)
- [ ] 4.1.3 创建 `src/backtest/engine.ts`(回测引擎)
- [ ] 4.1.4 创建 `src/backtest/attribution.ts`(归因计算)
- [ ] 4.1.5 创建 `src/backtest/report.ts`(报告生成,图表 + 表格)
- [ ] 4.1.6 串通:数据 → 策略 → 撮合(sandbox) → 归因 → 报告
- [ ] 4.1.7 写 `backtest-v2.test.ts`(15+ tests)

### 4.2 trading-loop — 交易全链路

- [ ] 4.2.1 创建 `src/trading-loop/pipeline.ts`(6 步管线)
- [ ] 4.2.2 创建 `src/trading-loop/risk-gate.ts`(风控)
- [ ] 4.2.3 创建 `src/trading-loop/approval.ts`(二次确认)
- [ ] 4.2.4 创建 `src/trading-loop/monitor.ts`(KAIROS 监控集成)
- [ ] 4.2.5 创建 `src/trading-loop/review.ts`(复盘 + 归因)
- [ ] 4.2.6 集成 sandbox + 4 algo + 4 broker
- [ ] 4.2.7 写 `trading-loop.test.ts`(15+ tests)

### 4.3 deep-plan — 长任务深度规划

- [ ] 4.3.1 创建 `src/deep-plan/planner.ts`(Planner Agent)
- [ ] 4.3.2 创建 `src/deep-plan/researcher.ts`(Researcher Agent)
- [ ] 4.3.3 创建 `src/deep-plan/backtest.ts`(Backtest Agent)
- [ ] 4.3.4 创建 `src/deep-plan/synthesizer.ts`(Synthesizer Agent)
- [ ] 4.3.5 创建 `src/deep-plan/reviewer.ts`(Reviewer Agent)
- [ ] 4.3.6 创建 `src/deep-plan/index.ts` + `types.ts` + `persistence.ts`
- [ ] 4.3.7 集成 Coordinator V2 + Task Runtime 6 类 + Worktree 隔离
- [ ] 4.3.8 写 `deep-plan.test.ts`(10+ tests)

**Sprint 4 完成标志**:
- backtest-v2 5 步全链路跑通
- trading-loop 6 步全链路跑通
- deep-plan 5 阶段 pipeline 跑通
- `bun test` + `bun run typecheck` 全绿

---

## Sprint 5 — 远程协同多渠道 + 移动端(2 turn,1 周)

### 5.1 multi-channel-bridge — 多渠道推送完整实现

- [ ] 5.1.1 升级 `src/coach/channels/wechat.ts`(完整实现:Server 酱 / PushPlus)
- [ ] 5.1.2 升级 `src/coach/channels/feishu.ts`(完整实现:Lark Bot)
- [ ] 5.1.3 升级 `src/coach/channels/dingtalk.ts`(完整实现:DingTalk Bot)
- [ ] 5.1.4 升级 `src/coach/channels/email.ts`(完整实现:SMTP)
- [ ] 5.1.5 添加 channel 健康检查 + 重试机制
- [ ] 5.1.6 写 `multi-channel-bridge.test.ts`(5+ tests per channel)

### 5.2 web-console-min — Web 控制台

- [ ] 5.2.1 创建 `web/` 目录 + `package.json` (Next.js)
- [ ] 5.2.2 实现 Bridge UI:聊天 / 审批 / 输出流
- [ ] 5.2.3 响应式(手机 / 平板 / 桌面)
- [ ] 5.2.4 JWT 鉴权 + trusted device
- [ ] 5.2.5 写 `web-console-min.test.ts`

### 5.3 mobile-pwa — 移动端 PWA

- [ ] 5.3.1 实现简化版 Bridge UI(只读 + 基本命令)
- [ ] 5.3.2 添加 PWA manifest + service worker
- [ ] 5.3.3 离线缓存
- [ ] 5.3.4 写 `mobile-pwa.test.ts`

**Sprint 5 完成标志**:
- 微信 / 飞书 / 钉钉 / 邮件 推送全可用
- Web 控制台可用(Bridge UI)
- 移动端 PWA 可用
- `bun test` + `bun run typecheck` 全绿

---

## Sprint 6 — 测试 + 评估 + 文档(1 turn,3-5 天)

### 6.1 e2e-coach — Coach 端到端 demo

- [ ] 6.1.1 创建 `src/evals/dataset/coach.jsonl`(20+ 测试用例)
- [ ] 6.1.2 实现 `src/evals/run-coach.ts`(评测 runner)
- [ ] 6.1.3 集成 LangSmith(可选)

### 6.2 e2e-backtest-trading — 回测 + 交易端到端

- [ ] 6.2.1 创建 `src/evals/dataset/backtest-trading.jsonl`(10+ 测试用例)
- [ ] 6.2.2 实现 `src/evals/run-backtest-trading.ts`
- [ ] 6.2.3 验证:用户输入 → 主对话 → 回测 → 模拟 → 报告

### 6.3 docs-final — 完整文档

- [ ] 6.3.1 写 `docs/quickstart.md`(快速开始)
- [ ] 6.3.2 写 `docs/coach.md`(投研 Coach 配置)
- [ ] 6.3.3 写 `docs/kairos.md`(KAIROS v2)
- [ ] 6.3.4 写 `docs/bridge.md`(Bridge v2)
- [ ] 6.3.5 写 `docs/deep-plan.md`(长任务规划)
- [ ] 6.3.6 写 `docs/cli-extension.md`(20+ 隐藏命令)
- [ ] 6.3.7 写 `docs/multi-channel.md`(多渠道推送)
- [ ] 6.3.8 更新 `README.md` + `README_CN.md`
- [ ] 6.3.9 写 `CHANGELOG.md` v3 entry

### 6.4 regression — 全量测试

- [ ] 6.4.1 跑 `bun test` 全量(基线 v2 96 spec + v3 新 spec)
- [ ] 6.4.2 跑 `bun run typecheck` 全量
- [ ] 6.4.3 配置 CI 跑上述
- [ ] 6.4.4 修复发现的回归

**Sprint 6 完成标志**:
- 端到端 demo 跑通
- 完整文档发布
- 全量测试 + typecheck 全绿

---

## Sprint 7 — 发布 + 商业化预备(0.5 turn,1-2 天)

### 7.1 release

- [ ] 7.1.1 bump `package.json` 版本(2026.6.4 → 2026.6.X)
- [ ] 7.1.2 跑 `bash scripts/release.sh <version>` 自动打 tag + GitHub release

### 7.2 v3-archive

- [ ] 7.2.1 archive `top-tier-investment-claude-code` change → `openspec/changes/archive/`
- [ ] 7.2.2 关闭 change,生成 summary

**Sprint 7 完成标志**:
- v3 发布
- change archive

---

## 进度跟踪

| Sprint | 状态 | 完成 task 数 |
|--------|------|------------|
| Sprint 1 | ⏳ 进行中 | 0/27 |
| Sprint 2 | ⏸ 待开始 | 0/25 |
| Sprint 3 | ⏸ 待开始 | 0/30 |
| Sprint 4 | ⏸ 待开始 | 0/24 |
| Sprint 5 | ⏸ 待开始 | 0/15 |
| Sprint 6 | ⏸ 待开始 | 0/22 |
| Sprint 7 | ⏸ 待开始 | 0/4 |
| **总计** | | **0/147** |

---

## 关键依赖与里程碑

| 里程碑 | Sprint 完 | 标志 |
|--------|----------|------|
| M1 主对话 | Sprint 1 | 投研 Coach + 5 高优 CLI |
| M2 架构 | Sprint 2 | 5 layer + 50+ 开关 + 4 唯一 |
| M3 loucode 深度 | Sprint 3 | kairos-v2 + bridge-v2 + coach-active |
| M4 投研核心 | Sprint 4 | 回测 + 交易 + 深度规划 |
| M5 远程协同 | Sprint 5 | Bridge 34 + 多渠道 + 移动端 |
| M6 完整 | Sprint 6 | 测试 + 评估 + 文档 |
| M7 发布 | Sprint 7 | 版本 + archive |

---

## 与 v2 的关系

- **v3 不重复 v2 工作**:v2 已落地 96 spec,v3 只深化 + 加 5 个新 spec
- **v3 复用 v2 资源**:coordinator-v2 / feature-gates-v2 / kairos-proactive / task-runtime / worktree-isolation / plan-mode-v2 / monitor-task / brief-tool / telemetry / 7 竞品对标
- **v3 增量**:5 个新 spec(claude-code-5layer / coach-mode / deep-plan / cli-extension / investment-3d-positioning) + 2 个深化(kairos-v2 / bridge-v2)
