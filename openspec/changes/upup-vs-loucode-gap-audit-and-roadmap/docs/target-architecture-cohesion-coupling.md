# UpUp 目标架构设计:高内聚低耦合

> 版本:v1.0 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> 配套文档:[architecture-current.md](architecture-current.md) · [architecture-debt.md](architecture-debt.md) · [production-readiness-checklist.md](production-readiness-checklist.md) · [capability-matrix.md](capability-matrix.md)
> 配套图集:[ascii-diagrams.md §图 15-17](ascii-diagrams.md)
> 调研方法:在 `src/` 全量 grep import 路径,标出所有跨层反向引用 + 文件内多职责混合,作为目标架构重构的事实依据

---

## §0 引言:为什么需要目标架构

截至 v2026.5.15,upup 已经形成 8 大子系统 + 18 个 workspace packages + 50 skills + 296 tools 的全栈,但**模块间依赖关系存在大量"反向引用"和"职责混合"**,具体数据:

| 指标 | 数值 |
|------|------|
| 源文件总数(非 test) | 374+ |
| 超大文件(> 800L) | 11 个 |
| 跨层反向引用(`tools/ → agent/`)| 14 处 |
| 跨层反向引用(`agent/ → tools/`)| 4 处 |
| 跨层反向引用(`daemon/ → agent/`)| 2 处 |
| 跨层反向引用(`multi-agent/ → agent/`)| 4 处 |
| 死代码信号(`.bak`)| 2 个 |
| 模块内类数(单一文件) | 平均 2.3 个,最多 7 个 |
| 工具 import 跨业务层(L5+)的次数 | 14+ |

如果不重构,继续往上加新 feature(P0-1~12)时,模块边界会越来越模糊,新 contributor onboarding 成本会指数级上升。本文档目标:**在不破坏现有功能的前提下,设计一个 7 层 + 1 套接口 + 1 个治理器的目标架构**,把 upup 重构为"高内聚低耦合"。

---

## §1 当前架构的内聚热点(Cohesion Hotspots)

> 定义:单个文件/类违反单一职责(SRP),内部混合多个不相关关注点。

### 1.1 src/agent/agent.ts(1305L) — 14 个职责

**最严重的内聚热点**。一个 `Agent` 类同时承担:

1. Agent Loop 编排(while 循环)
2. Plan Mode 自动触发(`maybeEnterPlanMode`)
3. 消息数组构造(SystemMessage / HumanMessage / ToolMessage)
4. LLM 调用(`streamLlmWithMessages` + `callLlmWithMessages`)
5. Tool 执行(`AgentToolExecutor`)
6. 上下文压缩(`compactContext` / `microcompactMessages`)
7. 工具指标收集(`useToolMetrics`)
8. 内存监控(`useMemoryUsage`)
9. 会话后台化(`useSessionBackgrounding`)
10. 会话恢复(`useSessionRecovery`)
11. 死循环检测(`getLoopDetector`)
12. 上下文看门狗(`useContextWatchdog`)
13. 记忆管理(`MemoryManager` / `runMemoryFlush` / `createExtractionHook`)
14. 停止钩子(`getStopHookRegistry` / `registerDefaultStopHooks`)

**影响**:1 个 bug 修在 14 个职责中的某 1 个,可能回归其他 13 个。**重构优先级 P0-9**。

### 1.2 src/hooks/agent-hooks.ts(945L) — 11 个 hook 混合

单个文件导出 11 个 hook 类:`useMemoryUsage` / `useMergedClients` / `useCommandQueue` / `useDynamicConfig` / `useSessionBackgrounding` / `useToolMetrics` / `useSessionRecovery` / `useContextWatchdog` / `useHookEventBus` / `useCanUseTool` / `+ 一些事件类型`。

**问题**:945L 单文件,内部类之间零共享(各自独立的 EventEmitter 子类),违反"一个文件一个职责"。

**重构建议**:拆为 `src/hooks/memory.ts` / `src/hooks/session.ts` / `src/hooks/tools.ts` / `src/hooks/context.ts` / `src/hooks/config.ts` / `src/hooks/bus.ts` / `src/hooks/permission.ts` 7 个文件,各 < 200L。

### 1.3 src/tools/research/research-tools.ts(1006L) — 9 个 export

- `quickSentimentScan` (alias `analyzeSentiment`)
- `deepSentimentAnalysis` + `DeepSentimentResult`
- `detectEvents` + `DetectedEvent`
- `extractEntities` + `ExtractedEntities`
- `extractEntitiesLegacy`
- `createAnalyzeSentimentTool`
- `createDetectEventsTool`
- `createExtractEntitiesTool`
- `researchTools` 集合

**问题**:情绪分析 + 事件检测 + 实体抽取 3 个独立功能,共享 keyword 字典。文件 1006L,测试覆盖不足(应拆为 3 个独立可测模块)。

**重构建议**:拆为 `src/tools/research/sentiment.ts` / `src/tools/research/events.ts` / `src/tools/research/entities.ts` + `src/tools/research/keywords.ts`(共享字典)。

### 1.4 src/agent/subagent/types.ts(731L) — 类型文件混入运行时

文件名是 `types.ts`,但实际导出了 `AgentMemoryStore` 类(运行时数据结构),不是纯类型。同时 `import` 自 `../subagent-runner.js`(运行时分发器)。

**问题**:
- 命名误导:文件叫 `types.ts` 但包含运行时类
- 跨文件依赖:`types.ts` 依赖 `subagent-runner.js`,破坏"类型不应有运行时依赖"的原则
- 多处被反向引用:`src/tools/team-tools.ts.bak` / `src/tools/registry/domain-tools.ts` 都 import 它

**重构建议**:`AgentMemoryStore` 移出 `types.ts`,新建 `src/agent/subagent/memory-store.ts`。

### 1.5 src/memory/(30+ 文件,9K+ LOC) — 巨型子系统

30+ 个文件,职责包括:加密存储 / 提取 / 索引 / 搜索 / 扫描 / 迁移 / RAG / memvid / 观察缓冲 / 团队路径 / 嵌套路径 / 投研档案 / 投研记忆 / 策略存储 / 审计签名 / 访问控制 / AI 选择器 / 提示模板 / 保存门 / 时序衰减 / TF-IDF / MMR / 项目路径 / 会话文件 / 日常日志 / 数据库。

**问题**:`src/memory/` 实际是一个"记忆操作系统",远超"记忆"单一职责。

**重构建议**:拆为 `src/memory/store/` (storage abstraction) + `src/memory/search/` (RAG / TF-IDF / MMR) + `src/memory/security/` (crypto / audit / access-control) + `src/memory/investment/` (dossier / strategy / investment-memory) + `src/memory/scanner/` + `src/memory/index.ts`(聚合入口)。

### 1.6 src/session/(13+ 文件,9K+ LOC) — Session 2.0 双套实现

`session/session-state.ts` + `session/storage.ts` + `session/restore-advanced.ts` + `session/session2.test.ts` 等,实际有 **2 套 session 实现**:`Session 1.0`(在 `session-state.ts`)+ `Session 2.0`(在 `session2.test.ts` 暗示的 `session-v2.ts` 或者 `session2/`)。

**问题**:Session 2.0 是升级版但未完全迁移,导致 2 套代码共存。

**重构建议**:明确 Session 2.0 是 canonical,Session 1.0 标 deprecated,加 migration 脚本。

### 1.7 src/agent/agent-port.ts(190L) + agent-port-extended.test.ts(76L) — 端口/适配器残缺

`agent-port.ts` 定义了端口接口(给上层用),但实现分散在 `src/agent/`,且 1 个端口有 2 个 test 文件。

**重构建议**:把端口实现移到 `packages/agent-core/`,test 集中到 1 个文件。

### 1.8 src/tools/bash/(8 文件,4K+ LOC) — 内部职责不分离

`bash/command-classifier.ts` (643L) + `bash/permission-mode.ts` (581L) + `bash/bash-tool.ts` (526L) + `bash/security.ts` (488L) + `bash/ast-parser.ts` (447L) + 3 个 test。

**问题**:bash 工具实际承担"命令分类 + 权限模式 + 安全审计 + AST 解析"4 个职责,但都在一个子目录。

**重构建议**:在 `src/tools/bash/` 下拆 `classifier.ts` / `permission.ts` / `security.ts` / `ast-parser.ts` 4 个独立 module,各 < 200L,`bash-tool.ts` 只组合。

### 1.9 src/tools/fund/(8 文件) — fund-tool.ts 989L + fund-api.ts 895L

**问题**:`fund-tool.ts` 989L 几乎肯定违反 SRP,`fund-api.ts` 895L 承担"所有基金 API"封装。

**重构建议**:按业务拆 `fund-tool/{holdings,performance,risk,comparison}.ts`,API 拆 `fund-api/{tushare,akshare,choice}.ts`。

### 1.10 src/tools/portfolio/(8 文件) — multi-portfolio 726L + portfolio-tools 593L

**问题**:与 `fund/` 同模式,2 个大文件混合多个业务关注点。

### 1.11 src/multi-agent/(27 文件) — 7 大功能混合

27 个文件,涵盖 `agent-registry` / `agent-loader` / `agent-factory` / `agent-memory` / `agent-cli` / `backends/` / `verifier/` / `monitor` / `coordinator` / `scheduler` / `intent-router` / `event-bus` / `team-manager` / `lifecycle` / `persistence` / `skill-tracker` / `session-cleanup` / `tools/` / `workflows/`。

**重构建议**:拆为 `src/multi-agent/{registry,backends,verifier,scheduler,intent,workflows,persistence}/` 7 个子目录。

---

## §2 当前架构的耦合点(Coupling Smells)

> 定义:模块 A 反向依赖模块 B(本应 B → A 的方向),或循环依赖,或底层 import 高层。

### 2.1 完整耦合矩阵(基于 `grep -rEn "from ['\"](\.\./)+X/"` 全量扫描)

#### 2.1.1 `src/agent/* → src/tools/*` 反向引用(4 处,部分合理)

```
src/agent/agent.ts:5:// import { getTools, getToolConcurrencyMap } from '../tools/registry/index.js';  [注释,实际 lazy import]
src/agent/capability-manifest.ts:14:import { getToolRegistry } from "../tools/registry/index.js";  ← 反向,应抽离
src/agent/earnings-3w.ts:34:import { fetchEarningsTranscripts } from '../tools/finance/earnings-transcripts.js';  ← 反向,应抽离
src/agent/subagent-runner.ts:22:import { getTools, getToolConcurrencyMap } from '../tools/registry/index.js';  ← 反向,应抽离
src/agent/tool-executor.ts:22:import { classifyCommand } from '../tools/bash/command-classifier.js';  ← 反向,应抽离
```

**问题**:Agent Loop 需要"工具列表"和"并发映射",但它直接 import `src/tools/registry/`,导致 1) agent.ts 1305L,2) 改 registry 影响 agent。

**重构**:`getTools` / `getToolConcurrencyMap` 抽象到 `packages/agent-core/`(或 `src/agent/ports/tools-port.ts` 端口接口 + `src/tools/registry/adapter.ts` 适配器实现)。

#### 2.1.2 `src/tools/* → src/agent/*` 反向引用(**14 处**,最严重)

```
src/tools/agent-tool.ts:12:import { getDefaultSubagentRunner } from '../agent/subagent-runner.js';  ← 反向,严重
src/tools/agent-tool.ts:13:import type { SubagentConfig, SubagentContext } from '../agent/subagent.js';
src/tools/agent-tool.ts:15:import type { AgentEvent } from '../agent/types.js';
src/tools/finance/get-financials.ts:7:import { getCurrentDate } from '../../agent/prompts.js';  ← 工具 import 工具日期,反人类
src/tools/finance/get-market-data.ts:7:import { getCurrentDate } from '../../agent/prompts.js';  ← 同上
src/tools/finance/read-filings.ts:7:import { getCurrentDate } from '../../agent/prompts.js';  ← 同上
src/tools/plan/enter-plan-mode.ts:15:import { getPlanModeState } from '../../agent/plan-mode-state.js';  ← 工具反向依赖 agent
src/tools/plan/exit-plan-mode.ts:22:import { getPlanModeState } from '../../agent/plan-mode-state.js';
src/tools/registry/domain-tools.ts:11:import { isFeatureCompiledIn } from '../../agent/feature-gates.js';  ← 部分合理(feature gate)
src/tools/registry/domain-tools.ts:79:} from '../../agent/subagent/types.js';
src/tools/registry/investment-knowledge-tools.ts:7:import { investmentKnowledgeTools } from '../../agent/investment-knowledge-tools.js';
src/tools/skill-tool.ts:19:import type { SubagentRunner } from '../agent/subagent.js';  ← 反向
src/tools/snip-tool.ts:13:import { snipMessages, shouldSnip, estimateSnipSavings } from '../agent/snip.js';  ← 反向 + re-export
src/tools/snip-tool.ts:154:export { snipMessages, shouldSnip, estimateSnipSavings } from '../agent/snip.js';
src/tools/team-tools.ts.bak:10:import { agentMemoryStore } from '../agent/subagent/types.js';  ← 死代码,应删
```

**问题分析**:
- `getCurrentDate` 在 `src/agent/prompts.ts` 暴露给 3 个 finance tools,这是 **utility 函数放错层**(应放 `src/utils/`)
- `snipMessages` 在 `src/agent/snip.ts` 但被 `src/tools/snip-tool.ts` re-export,这是**端口/适配器不分**
- `SubagentRunner` 在 agent 层但被 `skill-tool.ts` / `agent-tool.ts` 直接 import,**subagent 是 agent 核心抽象,工具不应直接 import**

**重构**:
- `getCurrentDate` 移到 `src/utils/date.ts`
- `snipMessages` 抽象为 `src/utils/message-snip.ts`(纯函数)+ `src/tools/snip-tool.ts` 调它
- `SubagentRunner` 接口移到 `packages/agent-core/`,工具通过端口调用

#### 2.1.3 `src/daemon/* → src/agent/*` 反向引用(2 处)

```
src/daemon/workers/tasks.ts:13:import { getDefaultSubagentRunner } from '../../agent/subagent-runner.js';
src/daemon/workers/tasks.ts:14:import type { SubagentConfig } from '../../agent/subagent.js';
```

**问题**:daemon 任务 worker 直接调 subagent。daemon 应是通用后台框架,**不应**绑死 agent。

**重构**:`SubagentRunner` 抽象到 `packages/agent-core/`,daemon 调端口。

#### 2.1.4 `src/multi-agent/* → src/agent/*` 反向引用(4 处)

```
src/multi-agent/agent-registry.ts:1:import type { AgentCapability } from '../agent/registry.js';
src/multi-agent/agent-registry.ts:9:import type { AgentDefinition } from '../agent/registry.js';
src/multi-agent/agent-registry.ts:10:import { getAgentRegistry } from '../agent/registry.js';  ← 重新导出!
src/multi-agent/backends/inprocess.ts:11:import { getDefaultSubagentRunner, type SubagentRunner } from '../../agent/subagent-runner.js';
src/multi-agent/backends/inprocess.ts:12:import type { SubagentConfig, SubagentType } from '../../agent/subagent.js';
src/multi-agent/backends/iterm2.ts:14:import { getDefaultSubagentRunner, type SubagentRunner } from '../../agent/subagent-runner.js';
src/multi-agent/backends/iterm2.ts:15:import type { SubagentConfig, SubagentType } from '../../agent/subagent.js';
src/multi-agent/intent-router.ts:37:} from '../agent/intent-detector/index.js';
src/multi-agent/intent-router.ts:41:} from '../agent/registry.js';
```

**问题**:`multi-agent/agent-registry.ts` 名字是 agent-registry,**但功能上在重新导出** `agent/registry.ts`,纯属重复文件。

**重构**:
- `src/multi-agent/agent-registry.ts` 删除,改用 `src/agent/registry.ts`
- `SubagentRunner` / `SubagentType` 移到 `packages/agent-core/`,multi-agent 调端口

#### 2.1.5 `src/coordinator/* → src/agent/*` 反向引用(1 处,合理)

```
src/coordinator/coordinatorMode.ts:29:import { featureGates } from '../agent/feature-gates.js';
```

**评价**:feature gate 是横切关注点,允许任意层 import。**保留**。

#### 2.1.6 `src/skills/* → src/agent/*` 反向引用(2 处,部分合理)

```
src/skills/executor.ts:23:import type { SubagentConfig, SubagentResult, SubagentRunner } from '../agent/subagent.js';
src/skills/i18n-helper.ts:13:import { getLocale, type Locale } from '../agent/locale.js';
src/skills/i18n-helper.ts:43:export { getLocale, type Locale } from '../agent/locale.js';  ← re-export
```

**评价**:
- `skills/executor.ts` 调 subagent — 合理,skills 是 agent 编排的一部分
- `skills/i18n-helper.ts` 重新导出 `getLocale` — 应删除,**重复**

#### 2.1.7 `src/commands/* → src/tools/*`(6 处,**合法**)

```
src/commands/investment/earnings-preview.ts:26:} from '../../tools/finance/earnings-transcripts.js';
src/commands/investment/earnings-preview.ts:27:import { getAnalystEstimates } from '../../tools/finance/estimates.js';
src/commands/investment/phase-handlers.ts:37:} from '../../tools/finance/index.js';
src/commands/investment/phase-handlers.ts:41:} from '../../tools/valuation/valuation-tools.ts';
src/commands/investment/phase-handlers.ts:45:} from '../../tools/fund/fund-backtest.js';
src/commands/investment/phase-handlers.ts:46:import { SandboxBroker } from '../../tools/trading/sandbox-engine.js';
src/commands/investment/phase-handlers.ts:47:import { attribution } from '../../tools/portfolio/attribution.ts';
src/commands/investment/screen.ts:12:import { createNlScreenTool, type NlScreenOutput } from '../../tools/screening/nl-screen.js';
src/commands/investment/strategy.ts:23:import { validateMethodology, type MethodologyDisclosure } from '../../tools/backtest/backtest-report.js';
src/commands/sandbox.ts:8:import { getSandboxManager } from '../tools/filesystem/sandbox-manager.js';
```

**评价**:`commands/` 编排工具是合法依赖方向(`commands → tools`,符合 L6 → L4)。**保留**。

---

## §3 目标架构:7 层 + 1 套接口 + 1 个治理器

> **图 15 — 目标架构 7 层 + 单向依赖**见 [ascii-diagrams.md §图 15](ascii-diagrams.md#图-15--目标架构-7-层--单向依赖)

### 3.1 七层模型

```
┌─────────────────────────────────────────────────────────────┐
│  L7  Application Layer(应用层)                              │
│  src/commands/ + plugins/ + apps/                           │
│  职责: 业务编排、用户场景                                    │
├─────────────────────────────────────────────────────────────┤
│  L6  Presentation Layer(表示层)                              │
│  src/cli.tsx + src/controllers/ + src/components/          │
│       + src/multimodal/ + src/bridge/ + src/web/ + src/tui/ │
│  职责: 用户输入、UI 渲染、远程桥接                            │
├─────────────────────────────────────────────────────────────┤
│  L5  Orchestration Layer(编排层)                             │
│  src/agent/ + src/coordinator/ + src/multi-agent/           │
│       + src/kairos/ + src/daemon/ + src/cron/               │
│  职责: Agent Loop、Worker Pool、后台任务                     │
├─────────────────────────────────────────────────────────────┤
│  L4  Capability Layer(能力层)                                │
│  src/tools/ + src/skills/ + src/research/ + src/analysis/   │
│       + src/screening/ + src/multimodal/ + src/services/    │
│  职责: 可被 Agent 调用的能力,LangChain Tool 形式            │
├─────────────────────────────────────────────────────────────┤
│  L3  Domain Layer(领域层)                                    │
│  src/plan/ + src/commands/investment/ + src/coach/          │
│       + src/competitive-positioning/                        │
│  职责: 投资业务领域概念                                       │
├─────────────────────────────────────────────────────────────┤
│  L2  Infrastructure Layer(基础设施层)                          │
│  src/memory/ + src/session/ + src/realtime/ + src/storage/  │
│       + src/data/ + src/mcp/                                │
│  职责: 持久化、外部数据源、实时数据                            │
├─────────────────────────────────────────────────────────────┤
│  L1  Primitives Layer(原子层)                                │
│  src/utils/ + src/types/ + src/i18n/ + src/hooks/            │
│       + src/permissions/ + src/providers.ts + src/core/     │
│  职责: 通用工具、横切关注点、原子抽象                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 依赖方向(单向)

**只允许上层 → 下层**。**严禁下层 → 上层**。

```
L7 → L6 → L5 → L4 → L3 → L2 → L1
       ↓     ↓     ↓     ↓     ↓
       └─────┴─────┴─────┴─────┘
              (都依赖 L1)
```

**禁止的依赖方向**:
- ❌ L1 → L2/3/4/5/6/7
- ❌ L2 → L3/4/5/6/7
- ❌ L3 → L4/5/6/7
- ❌ L4 → L5/6/7
- ❌ L5 → L6/7
- ❌ L6 → L7

**例外**(明确允许):
- ✅ 任何层 → `L1/utils`(工具函数)→ 合法
- ✅ 任何层 → `L1/hooks`(横切关注点)→ 合法
- ✅ 任何层 → `L1/feature-flags`(横切关注点)→ 合法
- ✅ `L7/commands` → `L4/tools` → 合法(命令编排工具)
- ✅ `L4/skills` → `L5/agent`(skills 用 agent 调工具)→ 合法

### 3.3 packages/ 边界

`packages/` 提供"跨层共享"的代码,本身按依赖方向分:

```
L0 packages/types       (零依赖)
   ↓
L1 packages/utils       (零依赖,纯函数)
   ↓
L2 packages/state       (有限依赖:types + utils)
   ↓
L3 packages/llm         (依赖 types + utils + state)
   ↓
L4 packages/skills + packages/memory + packages/mcp
                       (依赖 types + utils + state + llm)
   ↓
L5 packages/plugin-sdk  (依赖 L4 全部)
   ↓
L6 packages/commands    (依赖 L5 + L4)
   ↓
L7 packages/agent-core  (依赖 L6 + L5 + L4)
                       (注意:agent-core 在 L7 顶层,
                        是因为它"使用"下面所有层的能力)
```

**禁止的 packages 依赖**:
- ❌ `packages/types` → 任何其他包
- ❌ `packages/utils` → `packages/state` 之外的包
- ❌ `packages/state` → `packages/llm`
- ❌ `packages/skills` → `packages/agent-core`(循环!)

### 3.4 跨包/跨层接口规范

**端口/适配器模式(Ports & Adapters)**:
- 每个跨层接口(eg. `SubagentRunner`、`MemoryStore`、`RealtimeFeed`、`BrokerAdapter`)在 `packages/*/src/ports/` 定义纯接口
- 适配器(实现)放在 `src/*/adapters/` 子目录
- 上层只调端口,不直接 new 实现

```
L5 调 L4  通过  port 抽象
                 ↓
           adapter 实现  (在 L4 内部)
```

### 3.5 横切关注点治理器:Governance Package

新增 `packages/governance/`,集中所有"横切治理":
- `feature-flags.ts` (从 `src/agent/feature-gates.ts` 抽)
- `event-bus.ts` (从 `src/core/event-bus.ts` 抽)
- `logger.ts` (从 `src/utils/logging/logger.ts` 抽)
- `metrics.ts` (从 `src/telemetry/integration.ts` 抽)
- `telemetry.ts` (从 `src/telemetry/` 抽)
- `feature-cohorts.ts` (A/B 测试)
- `audit.ts` (从 `src/memory/audit-signing.ts` 抽)

`governance` 包依赖:`types` + `utils` (L0),被任意层依赖。

### 3.6 死代码清理

| 文件 | 状态 | 建议 |
|------|------|------|
| `src/tools/team-tools.ts.bak` | 死代码 | **删除** |
| `src/multi-agent/tools/swarm-tools.ts.bak` | 死代码 | **删除** |
| `src/skills/i18n-helper.ts:43` (re-export) | 死代码 | 删 export |
| `src/multi-agent/agent-registry.ts:10` (re-export) | 死代码 | 删文件,改用 `src/agent/registry.ts` |
| `src/agent/agent-port.ts` (190L,功能残缺) | 半成品 | 重构或合并到 `packages/agent-core` |

---

## §4 重构 Roadmap(分 6 Wave)

> **图 16 — 重构 Roadmap 时间线**见 [ascii-diagrams.md §图 16](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线)
> **图 17 — 接口边界与端口**见 [ascii-diagrams.md §图 17](ascii-diagrams.md#图-17--接口边界与端口设计)

### Wave 1(并行 1 周) — 死代码清理 + 横切治理器奠基
**目标**:清理死代码,建立 `packages/governance/` 框架

- [ ] W1.1 删除 `src/tools/team-tools.ts.bak` 和 `src/multi-agent/tools/swarm-tools.ts.bak`
- [ ] W1.2 删 `src/skills/i18n-helper.ts:43` 的 re-export
- [ ] W1.3 删 `src/multi-agent/agent-registry.ts`,改用 `src/agent/registry.ts` 的 import
- [ ] W1.4 创建 `packages/governance/{package.json,src/{index.ts,feature-flags.ts,event-bus.ts,logger.ts,metrics.ts,telemetry.ts,audit.ts}}`
- [ ] W1.5 把 `src/agent/feature-gates.ts` 迁移到 `packages/governance/feature-flags.ts`
- [ ] W1.6 把 `src/core/event-bus.ts` 迁移到 `packages/governance/event-bus.ts`
- [ ] W1.7 更新所有 import 路径
- [ ] W1.8 跑 `bun run typecheck` + `bun test` 全部 PASS
- 工期:5-7 人天,1-2 人
- 验收:`grep -r "src/agent/feature-gates" src/ packages/` 应该为 0;`grep -r "src/core/event-bus" src/ packages/` 应该为 0

### Wave 2(并行 1-2 周) — 工具层去反向引用
**目标**:消除 14 处 `tools → agent` 反向引用

- [ ] W2.1 把 `getCurrentDate` 从 `src/agent/prompts.ts` 移到 `src/utils/date.ts`
- [ ] W2.2 更新 3 个 finance 工具的 import
- [ ] W2.3 把 `snipMessages` / `shouldSnip` / `estimateSnipSavings` 从 `src/agent/snip.ts` 抽到 `src/utils/message-snip.ts`(纯函数)
- [ ] W2.4 更新 `src/tools/snip-tool.ts` 改为 re-export `src/utils/message-snip.ts`
- [ ] W2.5 删 `src/agent/snip.ts`
- [ ] W2.6 把 `SubagentRunner` 接口抽到 `packages/agent-core/src/ports/subagent-port.ts`
- [ ] W2.7 把 `getDefaultSubagentRunner()` 实现从 `src/agent/subagent-runner.ts` 移到 `packages/agent-core/src/adapters/subagent-runner-adapter.ts`
- [ ] W2.8 更新 `src/tools/agent-tool.ts` / `src/tools/skill-tool.ts` / `src/daemon/workers/tasks.ts` / `src/multi-agent/backends/*` 改为 import 端口
- [ ] W2.9 把 `AgentCapability` / `AgentDefinition` / `getAgentRegistry` 从 `src/agent/registry.ts` 抽到 `packages/agent-core/`
- [ ] W2.10 跑全量 typecheck + test
- 工期:8-12 人天,1-2 人
- 验收:`grep -rE "from ['\"]\.\./\.\./agent/" src/tools/` 应该为 0;`grep -rE "from ['\"]\.\./agent/" src/daemon/ src/multi-agent/` 应该为 0

### Wave 3(并行 2-3 周) — 大文件拆分
**目标**:解决 11 个 > 800L 文件的内聚问题

- [ ] W3.1 拆 `src/agent/agent.ts` (1305L) 为 5 个 < 400L 模块(详见 [production-readiness-checklist.md §P0-9](production-readiness-checklist.md))
- [ ] W3.2 拆 `src/hooks/agent-hooks.ts` (945L) 为 7 个 < 200L 文件
- [ ] W3.3 拆 `src/tools/research/research-tools.ts` (1006L) 为 3 个文件
- [ ] W3.4 拆 `src/agent/subagent/types.ts` (731L) — 抽出 `AgentMemoryStore` 到 `subagent/memory-store.ts`
- [ ] W3.5 拆 `src/tools/fund/fund-tool.ts` (989L) + `fund-api.ts` (895L)
- [ ] W3.6 拆 `src/tools/portfolio/multi-portfolio.ts` (726L) + `portfolio-tools.ts` (593L)
- [ ] W3.7 拆 `src/tools/bash/` 4 个大文件
- [ ] W3.8 跑全量 test
- 工期:25-35 人天,2-3 人
- 验收:`find src -name "*.ts" ! -name "*.test.ts" -exec wc -l {} \; | awk '$1>800'` 应该 < 5 个

### Wave 4(并行 2-3 周) — 巨型子系统重构
**目标**:把 30+ 文件的 `src/memory/` 和 27 文件的 `src/multi-agent/` 拆为子模块

- [ ] W4.1 `src/memory/` 拆为 `memory/{store,search,security,investment,scanner}/`(详见 §1.5)
- [ ] W4.2 `src/session/` 明确 Session 2.0 是 canonical,Session 1.0 标 deprecated,加 migration
- [ ] W4.3 `src/multi-agent/` 拆为 7 个子目录
- [ ] W4.4 `src/agent/` 整体重构为"端口/适配器"模式(Agent 类瘦身为协调器)
- [ ] W4.5 跑全量 test
- 工期:30-40 人天,2-3 人
- 验收:`find src/memory -name "*.ts" ! -name "*.test.ts" | wc -l` 大幅减少;`find src/multi-agent -mindepth 1 -maxdepth 1 -type d` ≥ 7

### Wave 5(并行 1-2 周) — packages/ 层次治理
**目标**:在 packages/ 中显式化 L0-L7 分层,加 CI 循环依赖检查

- [ ] W5.1 显式 packages/ 依赖图(见 §3.3)
- [ ] W5.2 加 `madge --circular packages/` CI 检查
- [ ] W5.3 把当前散落在 `src/` 的可复用模块迁到 packages/(按层):
  - L0: `types` (已有)
  - L1: `utils` (已有,扩)
  - L2: 新 `state` + `governance` (Wave 1)
  - L3: `llm` (已有)
  - L4: `skills` / `memory` / `mcp` (已有)
  - L5: `plugin-sdk` (已有)
  - L6: `commands` (已有,扩)
  - L7: `agent-core` (已有,扩)
- [ ] W5.4 跑全量 test
- 工期:10-15 人天,1-2 人
- 验收:`madge --circular packages/` 无输出;`package.json` 依赖图符合 §3.3

### Wave 6(并行 1 周) — 验证与文档同步
**目标**:全量验证 + 同步所有架构文档

- [ ] W6.1 跑全量 `bun run typecheck` + `bun test` + `bun run evals`
- [ ] W6.2 用 `src/code-archaeology/scanner.ts` 重扫,确认 import 关系符合 §3.2 单向依赖
- [ ] W6.3 更新 `docs/architecture-current.md` / `docs/architecture-debt.md` / `docs/production-readiness-checklist.md` 反映新架构
- [ ] W6.4 更新 `README.md` / `README_CN.md` 加"模块分层"段
- [ ] W6.5 跑 5 阶段 E2E demo(在 `openspec/changes/archive/top-tier-investment-assistant/tasks.md §14` 定义)
- 工期:5-7 人天,1-2 人
- 验收:全量 test PASS,扫描器输出 0 跨层反向引用,文档同步

### 总工期汇总

| Wave | 工期(人天) | 参与人数 | 依赖 |
|------|------------|----------|------|
| Wave 1 | 5-7 | 1-2 | -- |
| Wave 2 | 8-12 | 1-2 | Wave 1 |
| Wave 3 | 25-35 | 2-3 | -- (与 Wave 2 并行) |
| Wave 4 | 30-40 | 2-3 | Wave 2+3 |
| Wave 5 | 10-15 | 1-2 | Wave 1 |
| Wave 6 | 5-7 | 1-2 | Wave 1+2+3+4+5 |
| **总计** | **83-116 人天** | **3-4 人小团队** | -- |

> **约 4-5 个月**(3-4 人小团队)可完成全部重构。

---

## §5 重构原则(13 条)

> 借鉴 Uncle Bob 的 SOLID + 12-Factor App + Clean Architecture

1. **单一职责(SRP)**:1 个文件 1 个关注点,1 个类 1 个理由变化
2. **开闭原则(OCP)**:扩展新功能不修改旧代码(用端口/适配器)
3. **里氏替换(LSP)**:子类型可替换父类型(端口实现可互换)
4. **接口隔离(ISP)**:小而专的接口(端口只暴露必需方法)
5. **依赖倒置(DIP)**:高层不依赖低层,都依赖抽象(端口)
6. **单向依赖**:L7 → L6 → L5 → L4 → L3 → L2 → L1(无环)
7. **端口/适配器**:跨层接口抽端口,实现在适配器
8. **包边界显式化**:packages/ 按 L0-L7 分层,加 CI 检查
9. **死代码立即删**:`.bak` / `re-export` / 未引用文件 → 删
10. **大文件拆小**:> 800L 必有 SRP 违反
11. **utility 函数回 L1**:`getCurrentDate` 之类应放 `src/utils/`
12. **横切关注点 governance**:`feature-flags` / `event-bus` / `logger` / `metrics` 集中
13. **每改一处必回归**:`bun run typecheck` + `bun test` 必过

---

## §6 风险与缓解

| 风险 | 缓解 |
|------|------|
| **Wave 3 大文件拆分回归** | 拆前先加 e2e test 覆盖原行为,拆完跑 e2e 必须全过 |
| **Wave 4 session 2.0 迁移破坏数据** | 加 migration 脚本,新数据走新 schema,并行运行 1 个版本 |
| **Wave 5 packages/ 重构影响构建** | CI 阶段加 madge --circular,本地 typecheck 失败立即拦截 |
| **过度设计 / 抽象层级过深** | 每个端口/适配器必须有 ≥ 2 个实现(否则 YAGNI) |
| **新 contributor 学习曲线** | 写 1 份 `docs/MODULES.md` 说明 7 层 + 端口,链接本文件 |
| **跨 Wave 集成问题** | Wave 6 集中验证;每周一次 demo 给团队看 |
| **重构 vs 新功能优先级** | 严格执行:Wave 1+2 + P0-1/2/3 投资域优先,其他 P0 跟随 |

---

## §7 度量指标(目标完成时)

| 指标 | 当前 | 目标 | 验证方式 |
|------|------|------|----------|
| **> 800L 文件数** | 11 | ≤ 3 | `find src -name "*.ts" ! -name "*.test.ts" -exec wc -l {} \; | awk '$1>800' | wc -l` |
| **跨层反向引用数** | 25+ | 0 | `grep -rE "from ['\"]\.\./(agent\|tools)\|from ['\"]\.\./\.\./(agent\|tools)" src/ --include="*.ts" ! --include="*.test.ts"` |
| **`.bak` 文件数** | 2 | 0 | `find src -name "*.bak"` |
| **packages/ 循环依赖** | 2 潜在 | 0 | `madge --circular packages/` |
| **单一文件类数**(平均) | 2.3 | 1.5 | 静态分析 |
| **`src/memory/` 文件数** | 30+ | ≤ 20(子目录后) | `find src/memory -name "*.ts" ! -name "*.test.ts" | wc -l` |
| **新 contributor 首次 PR 时间** | 估计 2 周 | 目标 3 天 | 团队调研 |
| **模块边界 leak 数** | 25+ | 0 | CI 加 `eslint-plugin-boundaries` 规则 |

---

## §8 实施建议

### 8.1 不开"巨型"change,分 3 个 follow-up change

| follow-up change 名 | 范围 | 工期 |
|---------------------|------|------|
| `architecture-cohesion-wave-1-2-5-6` | 死代码清理 + 工具去反向 + packages 治理 + 验证 | 30-45 人天 |
| `architecture-cohesion-wave-3` | 11 个大文件拆分 | 25-35 人天 |
| `architecture-cohesion-wave-4` | memory/session/multi-agent/agent 子系统重构 | 30-40 人天 |

### 8.2 与生产化 P0(参见 [production-readiness-checklist.md](production-readiness-checklist.md))并行

- Wave 1+2 完成后,P0-11(错误处理)+ P0-12(性能资源) 更容易做(因为包边界清晰)
- Wave 3 完成后,P0-9(Agent Loop 拆分) 已完成
- Wave 4 完成后,P0-10(状态机统一) 可用新 `packages/state/` 直接对接
- Wave 5 完成后,所有 P0 的跨包改动都符合依赖方向

### 8.3 不要等所有 P0 完成再重构

**建议**:Wave 1+2 优先做(1-2 周),然后启动 P0 投资域工作,Wave 3+4 跟随。

---

## §9 关键引用

- [architecture-current.md](architecture-current.md) — 当前架构(L0-L7 现状)
- [architecture-debt.md](architecture-debt.md) — 10 条架构债(本文件扩展至 13 个内聚热点)
- [production-readiness-checklist.md](production-readiness-checklist.md) — 12 个 P0 投资域改造
- [capability-matrix.md](capability-matrix.md) — 30+ 维度对标
- [comparison-with-competitors.md](comparison-with-competitors.md) — 12 家对标
- [ascii-diagrams.md §图 15-17](ascii-diagrams.md) — 目标架构 + 重构 Roadmap + 接口边界
- `openspec/changes/archive/top-tier-investment-assistant/proposal.md` — 13 个已实现 capability
- `src/code-archaeology/scanner.ts` — 已有的代码扫描器,可用于 §6 验证
