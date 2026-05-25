# Plan41.md - Upup 投资助手 vs Claude Code 完整差距分析

> 更新时间: 2026-05-25
> 目标: 构建顶级 AI Agent 投资助手

---

## 一、系统定位对比

### 1.1 核心定位

| 系统 | 定位 | 核心优势 |
|------|------|----------|
| **Claude Code** | 通用代码助手 | 代码编辑、LSP、Git、调试 |
| **Upup** | 金融投资助手 | A股、基金、财务分析、量化 |

### 1.2 代码规模对比

| 指标 | Claude Code | Upup |
|------|-------------|------|
| 总代码行数 | ~500,000+ | ~159,000 |
| 核心 Agent | ~48,000 | ~48,000 |
| Tools | ~50+ 基础工具 | ~100+ 金融工具 |
| Skills | ~20 内置 | ~100+ 文件 |

---

## 二、功能模块对比

### 2.1 Agent 核心

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| Agent Loop | ✅ 完整 | ✅ 完整 | 无 |
| Scratchpad | ✅ 完整 | ✅ 完整 | 无 |
| Context Management | ✅ 流式 | ✅ 流式 | 无 |
| Tool Executor | ✅ 流式 | ✅ 流式 | 无 |
| Plan Mode | ✅ 完整 | ✅ 完整 | 无 |

### 2.2 Skills 系统

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| SKILL.md 加载 | ✅ 完整 | ✅ 完整 | 无 |
| getPromptForCommand | ✅ 完整 | ✅ 完整 | 无 |
| 变量替换 | ✅ 完整 | ✅ 完整 | 无 |
| Shell 预执行 | ✅ BashTool 集成 | ✅ executeBashCommand | **中** |
| 权限集成 | ✅ hasPermissionsToUseTool | ⚠️ 缺失 | **高** |
| 结果存储 | ✅ processToolResultBlock | ⚠️ 缺失 | **中** |
| PowerShell | ✅ 懒加载 | ❌ 无 | **高** |
| MCP Skills | ✅ 支持 | ❌ 无 | **高** |
| 动态 Skills | ✅ 支持 | ⚠️ 部分 | **中** |

### 2.3 Tools 工具

#### 2.3.1 基础工具对比

| 工具 | Claude Code | Upup | 说明 |
|------|-------------|------|------|
| Bash | ✅ 160K+ 行 | ✅ 15K+ 行 | Upup 功能更丰富 |
| Read | ✅ | ✅ | |
| Edit | ✅ | ✅ | |
| Write | ✅ | ✅ | |
| Grep | ✅ | ✅ | |
| Glob | ✅ | ✅ | |
| LSP | ✅ | ❌ | **高** |
| Git | ✅ | ⚠️ 基础 | **中** |

#### 2.3.2 金融工具 (Upup 独有)

| 工具 | Claude Code | Upup | 说明 |
|------|-------------|------|------|
| stock_price | ❌ | ✅ | A股实时行情 |
| astock_financials | ❌ | ✅ | 财务数据 |
| fund_analysis | ❌ | ✅ | 基金分析 |
| market_screen | ❌ | ✅ | 市场筛选 |
| technical_analysis | ❌ | ✅ | 技术分析 |
| risk_assessment | ❌ | ✅ | 风险评估 |
| earnings_forecast | ❌ | ✅ | 盈利预测 |
| quant_strategies | ❌ | ✅ | 量化策略 |

---

## 三、缺失功能详细分析

### 3.1 Skills 权限系统 (P0)

**状态**: ⚠️ 部分实现

**缺失模块**:
```typescript
// src/skills/permissions.ts (缺失)
export async function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
  message: Message,
  inputSummary: string,
): Promise<PermissionResult>
```

**影响**: Shell 预执行无法进行权限检查

### 3.2 结果存储 (P0)

**状态**: ⚠️ 部分实现

**缺失模块**:
```typescript
// src/skills/toolResultStorage.ts (缺失)
export async function processToolResultBlock(
  tool: Tool,
  result: ShellResult,
  toolUseId: string,
): Promise<ToolResultBlock>
```

**影响**: 无法持久化工具执行结果

### 3.3 MCP Skills (P1)

**状态**: ❌ 缺失

**Claude Code 实现**:
```typescript
// src/skills/mcpSkills.ts
export { loadMCPSkills } from './mcpSkillBuilders.js';
```

**影响**: 无法使用 MCP 服务器的 skills

### 3.4 PowerShell 支持 (P2)

**状态**: ❌ 缺失

**Claude Code 实现**:
```typescript
// src/utils/shell/shellToolUtils.ts
export function isPowerShellToolEnabled(): boolean

// src/utils/promptShellExecution.ts
const shellTool = shell === 'powershell' && isPowerShellToolEnabled()
  ? getPowerShellTool()
  : BashTool
```

### 3.5 LSP 工具 (P2)

**状态**: ❌ 缺失

**Claude Code 实现**:
```typescript
// src/tools/LSPTool/LSPTool.ts
export class LSPTool implements Tool { ... }
```

---

## 四、Swarm/Team 多 Agent 系统

### 4.1 Claude Code Swarm

```typescript
// src/utils/swarm/inProcessRunner.ts
export async function startInProcessTeammate(
  teammateId: string,
  config: TeammateConfig,
): Promise<TeammateHandle>
```

**功能**:
- ✅ In-Process Teammate 运行
- ✅ AsyncLocalStorage 上下文隔离
- ✅ 权限同步
- ✅ Plan Mode 审批流
- ✅ 邮件箱通信

### 4.2 Upup Multi-Agent

**当前实现**: `src/multi-agent/`

| 组件 | 状态 | 说明 |
|------|------|------|
| coordinator.ts | ⚠️ 基础 | 协调器 |
| agent-factory.ts | ⚠️ 基础 | Agent 工厂 |
| team-manager.ts | ⚠️ 基础 | 团队管理 |

**差距**:
- ❌ 缺少 inProcessRunner
- ❌ 缺少 AsyncLocalStorage 隔离
- ❌ 缺少权限同步
- ❌ 缺少邮件箱通信

---

## 五、改造计划 (完整版)

### Phase 0: Skills 权限系统 (P0)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 0.1 | 实现 hasPermissionsToUseTool | 中 | 无 |
| 0.2 | 实现 toolPermissionContext 集成 | 小 | 0.1 |
| 0.3 | 实现 PermissionResult 类型 | 小 | 无 |

### Phase 1: 结果存储 (P0)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 1.1 | 实现 processToolResultBlock | 中 | 无 |
| 1.2 | 实现 ToolResultBlock 类型 | 小 | 无 |
| 1.3 | 集成到 promptShellExecution | 小 | 1.1 |

### Phase 2: MCP Skills (P1)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 2.1 | 实现 mcpSkills.ts | 大 | MCP 客户端 |
| 2.2 | 实现 mcpSkillBuilders.ts | 中 | 2.1 |
| 2.3 | 集成到 skill 加载 | 中 | 2.2 |

### Phase 3: PowerShell 支持 (P2)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 3.1 | 实现 isPowerShellToolEnabled | 小 | 无 |
| 3.2 | 实现 getPowerShellTool 懒加载 | 中 | 无 |
| 3.3 | 更新 promptShellExecution | 小 | 3.1, 3.2 |

### Phase 4: LSP 工具 (P2)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 4.1 | 实现 LSPTool | 大 | LSP 服务器 |
| 4.2 | 集成到 tools registry | 中 | 4.1 |

### Phase 5: Swarm/Team 增强 (P3)

| # | 任务 | 工作量 | 依赖 |
|---|------|--------|------|
| 5.1 | 实现 inProcessRunner | 大 | 无 |
| 5.2 | 实现 AsyncLocalStorage 隔离 | 中 | 5.1 |
| 5.3 | 实现权限同步 | 中 | 5.1 |
| 5.4 | 实现邮件箱通信 | 中 | 5.1 |

---

## 六、优先级和工作量

### 6.1 优先级矩阵

| 优先级 | 任务 | 价值 | 难度 |
|--------|------|------|------|
| P0 | Skills 权限系统 | 高 | 中 |
| P0 | 结果存储 | 中 | 中 |
| P1 | MCP Skills | 高 | 高 |
| P2 | PowerShell | 低 | 中 |
| P2 | LSP 工具 | 中 | 高 |
| P3 | Swarm 增强 | 中 | 高 |

### 6.2 实施路线图

```
Week 1-2: P0 Skills 权限系统
  ├── 0.1: hasPermissionsToUseTool 实现
  ├── 0.2: toolPermissionContext 集成
  └── 0.3: PermissionResult 类型

Week 3-4: P1 结果存储
  ├── 1.1: processToolResultBlock 实现
  └── 1.2: 集成测试

Week 5-6: P1 MCP Skills
  ├── 2.1: MCP Skills 加载
  └── 2.2: Skill Builders

Week 7-8: P2 PowerShell + LSP
  ├── 3.1: PowerShell 支持
  └── 4.1: LSP 工具

Week 9+: P3 Swarm 增强
  ├── 5.1: In-Process Runner
  └── 5.2: 通信机制
```

---

## 七、投资助手特色功能

### 7.1 已实现

| 功能 | 文件 | 说明 |
|------|------|------|
| A股实时行情 | `tools/astock/` | 12 个工具 |
| 基金分析 | `tools/fund/` | 7 个工具 |
| 财务分析 | `tools/finance/` | 20 个工具 |
| 量化策略 | `tools/quant/` | 16 个工具 |
| 投资知识 | `agent/investment-*.ts` | 专业工作流 |

### 7.2 待增强

| 功能 | 当前状态 | 目标 |
|------|----------|------|
| 实时数据 | AKShare/Tushare | 增加更多数据源 |
| 回测引擎 | 基础 | 完整策略回测 |
| 模拟交易 | 无 | Paper Trading |
| 组合优化 | 无 | Modern Portfolio Theory |

---

## 八、总体进度

| Phase | 任务 | 状态 | 进度 |
|-------|------|------|------|
| P0 | Skills 权限系统 | ⏳ 待实施 | 0% |
| P0 | 结果存储 | ⏳ 待实施 | 0% |
| P1 | MCP Skills | ⏳ 待实施 | 0% |
| P2 | PowerShell | ⏳ 待实施 | 0% |
| P2 | LSP 工具 | ⏳ 待实施 | 0% |
| P3 | Swarm 增强 | ⏳ 待实施 | 0% |

**当前进度: 0%** (准备开始)

---

## 九、架构图

### 9.1 完整 Upup 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Upup Investment Assistant                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│  CLI Interface (Ink/React)                                               │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent Core                                                             │
│  ├── Agent Loop (48K)                                                  │
│  ├── Tool Executor (流式)                                              │
│  ├── Context Manager                                                    │
│  └── Scratchpad                                                        │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ Skills System   │ │ Tools       │ │ Multi-Agent     │
│                 │ │             │ │                 │
│ ├── registry   │ │ ├── finance │ │ ├── coordinator │
│ ├── executor   │ │ ├── astock  │ │ ├── team-manager│
│ ├── loader     │ │ ├── fund     │ │ └── agent-factory│
│ ├── permissions│ │ ├── quant   │ │                 │
│ └── promptShell│ │ └── ...     │ │                 │
└─────────────────┘ └─────────────┘ └─────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ MCP Client     │ │ Data Sources│ │ Swarm/Team     │
│                 │ │             │ │                 │
│ ├── tushare    │ │ ├── AKShare │ │ (待增强)       │
│ ├── akshare    │ │ ├── Tushare │ │                 │
│ └── 自定义     │ │ └── ...     │ │                 │
└─────────────────┘ └─────────────┘ └─────────────────┘
```

### 9.2 Skills 权限流程

```
┌───────────────────────────────────────────────────────────────────────────┐
│  getPromptForCommand()                                                   │
│                                                                           │
│  1. substituteArguments() → {{args}}                                     │
│  2. ${CLAUDE_SKILL_DIR} → skillRoot                                   │
│  3. executeShellCommandsInPrompt()                                       │
│     ├── containsShellCommands() → 检查 ```! 或 !`                       │
│     ├── hasPermissionsToUseTool() ← P0 需要                             │
│     │   └── 检查 alwaysAllowRules                                       │
│     ├── executeBashCommand()                                             │
│     └── processToolResultBlock() ← P0 需要                               │
│  4. Returns enriched prompt                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 十、下一步行动

1. **立即开始 P0**: 实现 `hasPermissionsToUseTool`
2. **准备 P1**: MCP Skills 架构设计
3. **评估 P2**: PowerShell/LSP 需求
4. **规划 P3**: Swarm/Team 增强路线

---

## 十一、P0 & P1 完成详情 (2026-05-25)

### P0: Skills 权限系统

**新增文件**:
- src/skills/permissions.ts
- src/skills/toolResultStorage.ts

**实现的函数**:
- hasPermissionsToUseTool()
- createSkillPermissionContext()
- isCommandAllowed()
- processToolResultBlock()

**权限检查流程**:
1. 检查 toolPermissionContext.alwaysAllowRules.command
2. 支持 glob 模式匹配 (如 Bash(python3*))
3. 默认允许所有命令

### P1: 结果存储

**工具结果块**: ToolResultBlock 接口支持存储和检索

**验证结果**:
- TypeScript 编译通过
- 单元测试 12 pass
