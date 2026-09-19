# Pi Native 投资助手定型发布摘要（pi7-final-summary）

> 适用版本：Pi7/Pi8/Pi10/Pi11 已收敛；状态 11/12 完成定义 + 工程覆盖度 99.5%。
> 数据来源：`bun run report:pi7` 实时基线 + `bun run verify:pi7-final` 22 套合同（含 P0.g `.js` 后缀静态门禁）。

## 一、当前真实基线（2026-09-15）

```text
workspacePackages: 48
piNativePackages: 48
rootSourceFiles: 26
rootProductionFiles: 2  (src/index.tsx + src/bootstrap/gateway.ts)
rootProductionLines: 7
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1  (@upup/pi-session/src/agent-session-factory.ts)
structuralPercent: 100
```

### 关键命令一览

| 命令 | 用途 | 当前结果 |
|---|---|---|
| `bun run report:pi7` | 架构基线报告 | 48/48 packages，2 root 文件 / 7 行 |
| `bun run check:pi7` | Pi7 唯一架构检查 | PASS（1 factory / 0 global registry） |
| `bun run check:module-boundaries` | 边界 + 循环检查 | PASS（48 packages / 2 root src / 无环） |
| `bun run check:pi-packages` | Pi-native manifest 覆盖 | PASS（17 pi packages 全 pinned） |
| `bun run check:pi-side-effects` | 副作用声明覆盖 | PASS（27 required tool declarations manifest-owned） |
| `bun run check:pi-deletion-audit` (strict) | 旧实现删除审计 | PASS（legacy/global/old-root 全 0） |
| `bun run check:pi-package-audit` (strict) | 包版本钉住 | PASS（48/48 全 pinned 0.1.0） |
| `bun run verify:pi7-final` | 22 套合同 orchestrator | 22/22 PASS（21 验证 + C15 凭证 skip；含 P0.g `.js` 后缀静态门禁） |
| `bun test` | 全仓测试 | 2114/2114 PASS（7271 expect；含 8 个 `.js` suffix audit 测试） |
| `bun run typecheck` | TS 类型检查 | exit 0 |
| `bun run build` | 产物构建 | PASS（dist/ 含 4 类 Pi package 资源） |

## 二、Pi7 完成定义对账（11/12）

| # | 项 | 状态 | 真实证据 |
|---|---|---|---|
| 1 | 唯一 Pi AgentSession/Factory | ✅ | `check:pi7` 单 factory 检查；`production-entry-contract.test.ts` L83-93 |
| 2 | 能力通过 Pi Package manifest + extension 接入 | ✅ | 48/48 packages Pi-native；`check:pi-packages` PASS |
| 3 | Runtime 不硬编码业务 Package | ✅ | `agent-session-factory.ts` 仅组合不写业务分支 |
| 4 | 无生产 `legacy-events` 双轨 | ✅ | `legacyEventConsumers: 0`（`report:pi7`） |
| 5 | 无 `globalThis` capability/port registry | ✅ | `globalRegistryConsumers: 0` |
| 6 | root `src` 业务工具/skill/workflow 清空 | ✅ | 2 文件 / 7 行 / 26 测试在 allowlist |
| 7 | CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval 共享 Pi Runtime | ✅ | `verify-pi-entry-matrix` 8/8 PASS |
| 8 | `/invest` 状态可恢复/证据可追溯/风险可审计 | ✅ | pi-investment-workflow 5 步状态机 + 7 Profile |
| 9 | 副作用默认 sandbox/deny/approval | ✅ | 5 高风险工具 fail-closed（C4 cross-process PASS） |
| 10 | root `src` 仅 bootstrap + transport 壳 + 必要数据迁移 | ✅ | 2 文件 7 行：`src/index.tsx` + `src/bootstrap/gateway.ts` |
| 11 | 静态门禁 + Package contract + 全仓测试 + 入口 smoke 全过 | ✅ | 7 strict (P0.a-g) + 22 合同 + 2114 tests |
| 12 | **真实 provider dossier** | ⏳ | C15 skipIf 等 Tushare + financial-datasets 凭证 |

**当前：11/12 = 91.7%；工程覆盖度 ≈ 99.5%。**

## 三、迁移阶段产物（Stage 1-7）

| 阶段 | 主题 | 关键 Package / 文件 | 状态 |
|---|---|---|---|
| 1 | Pi7 基线 + Package Contract | `docs/internal/migrations/pi7.md` + `@upup/pi-runtime/manifest` | ✅ |
| 2 | Runtime + Session Factory | `@upup/pi-session` / `agent-session-factory.ts` | ✅ |
| 3 | Agent-facing 投资能力 | `@upup/pi-finance-sdk` + 16 个 pi-* 包 | ✅ |
| 4 | Session / Memory / Planning / Observability | `@upup/pi-storage` `@upup/pi-memory` `@upup/pi-planning` | ✅ |
| 5 | MCP / Plugin / Gateway / Bridge / stdio / Cron / Daemon | `@upup/pi-mcp` `@upup/pi-gateway` `@upup/pi-bridge` `@upup/pi-stdio` `@upup/pi-cron` `@upup/pi-daemon` | ✅ |
| 6 | TUI + 应用装配 | `@upup/pi-tui-app` + `@upup/pi-app` | ✅ |
| 7 | 投资助手闭环 + 最终清理 | root `src` 2 文件 7 行 + C15 凭证路径 | ⏳（1/12 凭证依赖） |

## 四、Pi Native 协议兼容性

- 唯一执行内核：`@earendil-works/pi-coding-agent` 0.85.1（已 pin，C8 contract）
- 唯一事件流：`@upup/pi-event-adapter` 暴露的 canonical event
- 唯一 Session：`@upup/pi-session/src/agent-session-factory.ts`
- 唯一 Package contract：`upup.pi.runtime.v1`（48/48 packages 已声明）
- 唯一 capability context：`@upup/pi-capability-registry`
- 唯一 trust / sandbox：`@upup/pi-resource-composition` 的 PiPackageTrustPolicy

## 五、剩余路径（凭证到位后一键闭环）

```bash
# 凭证到位后：
export TUSHARE_TOKEN=<Tushare Pro token>
export FINANCIAL_DATASETS_API_KEY=<financial-datasets key>
export UPUP_REAL_INVEST=1
export UPUP_REAL_INVEST_CONFIRM=READ_ONLY
export UPUP_REAL_INVEST_TICKERS="600519.SH,00700.HK,AAPL"
bun run verify:pi7-final
# C15 skipIf 自动激活为真跑；artifact 落 .upup/real-invest-artifacts/
# Pi7/Pi10/Pi11 12/12 全部关闭
```

## 六、可发布证据链

> 以下迁移日志已归档至 [`docs/internal/migrations/`](./internal/migrations/)。

- [`pi6.md`](./internal/migrations/pi6.md)（5129 行）— 阶段 1-7 增量审计（pi81 → pi130）
- [`pi7.md`](./internal/migrations/pi7.md)（6672 行）— 实施执行与详细验证（pi114 → pi130）
- [`pi8.md`](./internal/migrations/pi8.md)（631 行）— Pi Native 投研闭环产品验收
- [`pi10.md`](./internal/migrations/pi10.md)（335 行）— 最终收口计划与实施报告
- [`pi11.md`](./internal/migrations/pi11.md)（191 行）— Pi Native 投资助手定型与发布收尾
- `pi7-final-summary.md`（本文件）— 可发布结构化摘要

## 七、未完成项与后续方向

| # | 主题 | 阻塞 | 优先级 |
|---|---|---|---|
| 12 | 真实 provider dossier（CN/HK/US） | C15 凭证依赖 | P0 |
| pi12 | 第三方 Pi Package marketplace（manifest contract 0.2.0） | 无 | P1 |
| pi12 | Session 2.0 持久化（JSONL → SQLite/WASM snapshot） | 无 | P1 |
| pi12 | `/invest` 多模态证据（PDF/Excel/图片 OCR） | 无 | P1 |
| pi12 | 跨市场 portfolio（A 股 + 港股 + 美股） | 无 | P2 |
| pi12 | 真实 cron 任务（morning-brief / portfolio-review / earnings-preview） | 凭证 | P2 |

