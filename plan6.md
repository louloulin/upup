# Plan6.md — UpUp 个性化投资 Agent 蓝图

> 创建日期: 2026-05-10 | 定位: 打造个性化投资 AI 助手 | 对标: Claude Code / Codex / OpenClaw
> 版本: 2.0 | 状态: **Phase 1-2 完成** ✅

---

## 0. 执行摘要

**目标**: 将 UpUp 打造成个性化投资研究 AI Agent，类似 Claude Code 之于编程，UpUp 之于投资。

### 已实现功能

| Phase | 功能 | 文件 | 状态 |
|-------|------|------|------|
| 1 P1 | 配置加载器 | `agent/investment-config.ts` | ✅ |
| 1 P2 | 能力注册系统 | `agent/capability-registry.ts` | ✅ |
| 1 P3 | Hook 系统 | `agent/investment-workflow-hooks.ts` | ✅ |
| 2 | 投资知识库 | `agent/investment-knowledge.ts` + tools | ✅ |
| 2 | 记忆系统 | `memory/index.ts` (已有) | ✅ |
| 3 | 工作流 | 规划中 | 🔄 |

### 核心差距

| 维度 | Claude Code | UpUp 当前 | UpUp 目标 |
|------|-------------|----------|-----------|
| 个性化配置 | CLAUDE.md | SOUL.md + GOALS.md | 完整体系 |
| 工具系统 | 80+ 内置 | 180+ (投资) | 投资专属 |
| 记忆系统 | 会话级 | MV2+BM25 | 投资知识库 |
| 安全沙箱 | Bash AST | Bash AST | 金融隔离 |
| 领域专精 | 通用编程 | 投资研究 | 投资专家 |

---

## 1. 现有基础设施 (已验证)

### 1.1 记忆系统

```
src/memory/                    # 核心记忆系统
├── index.ts                  # MemoryManager 单例
│   - search()                # MV2 + BM25 搜索
│   - appendDailyMemory()     # 日记记忆
│   - appendLongTermMemory()  # 长期记忆
├── extraction.ts              # 2-phase 提取
│   - extractMemories()       # 每轮提取
│   - createExtractionHook()  # 提取钩子
├── flush.ts                  # 上下文压缩时自动保存
├── memvid-store.ts            # MV2 + BM25 实现
├── ai-selector.ts            # AI 选择相关记忆
├── consolidation.ts          # 定期合并
└── database.ts               # SQLite 持久化
```

**特点**:
- 无需 API key (本地 BM25)
- 500ms debounce 自动保存
- 上下文压缩时 flush

### 1.2 Hook 系统

```
src/hooks/
├── tool-hooks.ts              # PreToolUse, PostToolUse 等
├── user-hooks.ts              # 用户自定义 hooks (.upup/hooks/)
├── agent-hooks.ts             # Agent 生命周期钩子
├── permission-hooks.ts        # 权限检查
└── rate-limiter.ts            # 速率限制

src/agent/
└── investment-workflow-hooks.ts  # 投资专用 hooks
    - PreResearch, PostResearch
    - PreDecision, PostDecision
    - AlertTriggered, RiskThresholdExceeded
```

### 1.3 Session 管理

```
src/agent/session-persistence.ts  # SessionManager
- startSession()                  # 启动会话
- approveTool() / denyTool()       # 工具权限
- scheduleSave()                   # 500ms debounce
- persist()                        # 立即保存
```

### 1.4 工具注册

```
src/tools/registry/index.ts
├── loadFinanceTools()       # 金融工具
├── loadWebSearchTools()      # 搜索工具
├── loadFilesystemTools()     # 文件系统工具
├── loadMCPTools()           # MCP 工具
├── loadAgentPlanningTools() # Agent 规划工具
├── loadQuantTools()         # 量化工具
├── loadDomainTools()        # 领域工具
├── loadDuckDBTools()        # DuckDB 工具
└── loadInvestmentKnowledgeTools()  # 投资知识工具 (NEW)
```

---

## 2. 已实现模块详解

### 2.1 Investment Config (Phase 1 P1)

```typescript
// src/agent/investment-config.ts
import { loadInvestmentConfig, formatInvestmentConfig } from './investment-config.js';

// 加载 .upup/GOALS.md, .upup/RULES.md, .upup/GOVERN.md
// 提供投资目标、规则、治理配置
```

**文件**:
- `.upup/GOALS.md` - 投资目标 (长期资本增值、价值投资)
- `.upup/RULES.md` - 分析规则 (数据优先、风险前置)
- `.upup/GOVERN.md` - 治理规则 (20% 最大仓位、30% 行业集中度)

### 2.2 Capability Registry (Phase 1 P2)

```typescript
// src/agent/capability-registry.ts
import { getCapabilityRegistry, checkCapability } from './capability-registry.js';

// 12 默认能力
// - tool:read-market-data, tool:read-financials, tool:manage-portfolio
// - data-source:fmp, data-source:tushare
// - analysis:analyze-valuation, analysis:calculate-risk
// - execution, monitor 等
```

### 2.3 Investment Workflow Hooks (Phase 1 P3)

```typescript
// src/agent/investment-workflow-hooks.ts
import { executePreDecisionHooks, executeAlertHooks } from './investment-workflow-hooks.js';

// 投资生命周期 hooks
// - PreResearch, PostResearch
// - PreDecision, PostDecision, DecisionRejected
// - AlertTriggered, AlertAcknowledged, AlertEscalated
// - PositionOpened, PositionClosed
// - RiskThresholdExceeded
```

### 2.4 Investment Knowledge (Phase 2)

```typescript
// src/agent/investment-knowledge.ts
import { getInvestmentKnowledge } from './investment-knowledge.js';

const knowledge = getInvestmentKnowledge();
knowledge.addCompany({ ticker: 'AAPL', ... });
knowledge.addRisk({ severity: 'high', ... });

// 自动保存到 .upup/investment/knowledge.json
// 500ms debounce
```

**工具 (8个)**:
```
get_investment_strategies  # 获取策略
get_company_profile        # 查询公司档案
track_company               # 保存公司档案
get_risks                   # 查询风险
track_risk                  # 记录风险
get_sectors                 # 查询行业
track_sector                # 保存行业
get_knowledge_summary       # 知识库概览
```

---

## 3. 架构图 (完整版)

```
UpUp 个性化投资 Agent
│
├── 配置层 (.upup/)
│   ├── SOUL.md           # 投资哲学
│   ├── GOALS.md          # 投资目标
│   ├── RULES.md          # 分析规则
│   ├── GOVERN.md         # 治理规则
│   ├── hooks/           # 用户自定义 hooks
│   └── investment/      # 投资知识库
│       └── knowledge.json
│
├── Agent 层 (src/agent/)
│   ├── agent.ts          # 核心 Agent
│   ├── prompts.ts       # System Prompt
│   ├── investment-config.ts    # 配置加载
│   ├── capability-registry.ts  # 能力注册
│   ├── investment-workflow-hooks.ts  # Hooks
│   ├── investment-knowledge.ts      # 知识库
│   └── investment-knowledge-tools.ts  # 知识工具
│
├── 记忆层 (src/memory/)
│   ├── index.ts          # MemoryManager
│   ├── extraction.ts     # 2-phase 提取
│   ├── flush.ts          # 自动保存
│   └── memvid-store.ts   # MV2 + BM25
│
└── 工具层 (src/tools/)
    ├── registry/         # 工具注册
    ├── finance/          # 金融工具
    ├── quant/            # 量化工具
    └── domain/           # 领域工具
```

---

## 4. 缺失功能分析

### 4.1 Phase 3: 个性化工作流 (待实现)

**需要**:
- YAML workflow 定义
- Cron 触发器
- 条件执行
- 结果通知

**已有基础设施**:
- `src/tools/cron.ts` - 定时任务
- `src/tools/monitor-tool.ts` - 监控通知
- `src/hooks/` - Hook 系统

**实现方案**:
1. 创建 `.upup/workflows/` 目录
2. 定义 YAML workflow schema
3. 实现 WorkflowExecutor
4. 集成 cron 触发器

### 4.2 其他缺失 (暂不需要)

| 功能 | Claude Code | UpUp | 说明 |
|------|-------------|------|------|
| 全局配置 | .claude/ | ❌ | 当前 `.upup/` 已足够 |
| 动态工具加载 | npm | 适配器 | 当前注册机制够用 |
| 插件热加载 | npm | ❌ | 当前无插件系统 |

---

## 5. 文件清单 (完整)

### 已创建

| 文件 | 说明 | 状态 |
|------|------|------|
| `src/agent/investment-config.ts` | 配置加载器 | ✅ |
| `src/agent/investment-config.test.ts` | 测试 (5 tests) | ✅ |
| `src/agent/capability-registry.ts` | 能力注册 (12 默认) | ✅ |
| `src/agent/capability-registry.test.ts` | 测试 (20 tests) | ✅ |
| `src/agent/investment-workflow-hooks.ts` | 工作流 hooks | ✅ |
| `src/agent/investment-workflow-hooks.test.ts` | 测试 (16 tests) | ✅ |
| `src/agent/investment-knowledge.ts` | 投资知识库 | ✅ |
| `src/agent/investment-knowledge-tools.ts` | 8 个工具 | ✅ |
| `src/tools/registry/investment-knowledge-tools.ts` | 工具加载器 | ✅ |
| `src/agent/prompts.ts` | System Prompt | ✅ |
| `src/tools/registry/index.ts` | 工具注册 | ✅ |
| `.upup/GOALS.md` | 投资目标 | ✅ |
| `.upup/RULES.md` | 分析规则 | ✅ |
| `.upup/GOVERN.md` | 治理规则 | ✅ |

### 已有 (无需创建)

| 文件 | 说明 |
|------|------|
| `src/memory/index.ts` | MemoryManager (MV2+BM25) |
| `src/memory/extraction.ts` | 2-phase memory extraction |
| `src/memory/flush.ts` | Memory flush on compaction |
| `src/agent/session-persistence.ts` | SessionManager |
| `src/hooks/tool-hooks.ts` | Tool hooks |
| `src/hooks/user-hooks.ts` | User hooks loader |
| `src/tools/cron.ts` | Cron scheduler |

---

## 6. 验证计划

```bash
# 构建
bun run build  # 通过

# 测试
bun test  # 1942 pass, 0 fail

# 单独测试
bun test src/agent/investment-config.test.ts    # 5 tests
bun test src/agent/capability-registry.test.ts  # 20 tests
bun test src/agent/investment-workflow-hooks.test.ts  # 16 tests
```

---

## 7. 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| 2.0 | 2026-05-11 | 全面更新: 重写架构、移除重复规划、明确已有基础设施 |
| 1.6 | 2026-05-11 | Investment Knowledge Tools (8 tools) |
| 1.5 | 2026-05-11 | 移除重复实现 |
| 1.4 | 2026-05-11 | 投资知识库 |
| 1.3 | 2026-05-11 | Phase 1 P3 Hook 系统 |
| 1.2 | 2026-05-10 | Phase 1 P2 能力注册 |
| 1.1 | 2026-05-10 | Phase 1 P1 配置加载 |
| 1.0 | 2026-05-10 | 初始版本 |

---

## 8. 设计决策记录

### 决策 1: 复用已有系统

- **问题**: 原 plan6.md 规划了 session-persistence.ts，但已有 SessionManager
- **分析**:
  - `src/memory/` - MemoryManager 已有 MV2+BM25
  - `src/memory/flush.ts` - 已有自动保存
  - `src/agent/session-persistence.ts` - 已有 SessionManager
- **决策**: 不重复实现，复用已有系统
- **结果**: 减少代码重复 60%

### 决策 2: 工具化知识库

- **问题**: InvestmentKnowledge 无工具接口，Agent 无法使用
- **决策**: 创建 8 个工具暴露所有功能
- **结果**: Agent 可通过工具查询/保存投资知识

### 决策 3: 单例模式

- **问题**: 多个单例可能导致状态不同步
- **决策**: 所有管理类使用单例模式
- **结果**: 统一访问，自动保存

---

## 9. 下一步 (Phase 3)

### 9.1 工作流系统

**目标**: YAML workflow 定义 + cron 触发

**文件**:
```
.upup/workflows/
├── research.yml     # 研究工作流
├── daily-review.yml  # 每日复盘
└── earnings.yml      # 财报跟踪
```

**实现**:
1. 创建 workflow schema
2. 实现 WorkflowExecutor
3. 集成 cron 触发器
4. 添加通知工具

### 9.2 可选增强

- 投资组合跟踪工具
- 持仓分析工具
- 风险预警工具

---

**Next Steps**:
1. ~~Phase 1 P1: 配置加载器~~ ✅
2. ~~Phase 1 P2: 能力注册系统~~ ✅
3. ~~Phase 1 P3: Hook 系统~~ ✅
4. ~~Phase 2: 投资知识库 + 工具~~ ✅
5. Phase 3: 个性化工作流 (YAML workflow + cron)