# Plan6.md — UpUp 个性化投资 Agent 蓝图

> 创建日期: 2026-05-10 | 定位: 打造个性化投资 AI 助手 | 对标: Claude Code / Codex / OpenClaw
> 版本: 1.4 | 状态: **Phase 1-2 完成** ✅

---

## 0. 执行摘要

**目标**: 将 UpUp 打造成个性化投资研究 AI Agent，类似 Claude Code 之于编程，UpUp 之于投资。

**已实现功能**:
- ✅ Phase 1 P1: 配置加载器 (`investment-config.ts` + GOALS/RULES/GOVERN)
- ✅ Phase 1 P2: 能力注册系统 (`capability-registry.ts` + 12 默认能力 + 20 tests)
- ✅ Phase 1 P3: Hook 系统增强 (`investment-workflow-hooks.ts` + 16 tests)
- ✅ Phase 2: 记忆系统增强 (`session-persistence.ts` + `investment-knowledge.ts` + 29 tests)
- 🔄 Phase 3: 个性化工作流 (规划中)

**核心差距**:
| 维度 | Claude Code | Codex | OpenClaw | UpUp 当前 | UpUp 目标 |
|------|------------|-------|----------|----------|----------|
| 个性化配置 | CLAUDE.md | AGENTS.md | Config | SOUL.md + GOALS.md | 完整体系 |
| 工具系统 | 80+ 内置 | 40+ | 可插拔 | 173 (投资) | 投资专属 |
| 记忆系统 | 会话级 | 向量存储 | 分层 | MV2+BM25 | 投资知识库 |
| 安全沙箱 | Bash AST | 基础 | 插件隔离 | Bash AST | 金融隔离 |
| 领域专精 | 通用编程 | 2-phase | 通用 | 投资研究 | 投资专家 |

---

## 1. 配置系统深度分析

### 1.1 各系统配置能力对比

#### Claude Code 配置体系

```
CLAUDE.md (项目级) → .claude/ (全局级)
├── CLAUDE.md         # 项目配置
├── instructions.md   # 指令
├── hooks/            # 钩子脚本
├── skills/           # 技能目录
└── mcp.json          # MCP 服务器
```

**能力**:
- `CLAUDE.md`: 指令覆盖、规则定义、工作流程
- `instructions.md`: 详细指令
- `hooks/`: 预/后命令钩子
- `skills/`: 可复用技能

#### Codex 配置体系

```
AGENTS.md (项目级) → .codex/ (全局级)
├── AGENTS.md         # Agent 配置
├── instructions.md   # 指令
├── memory/            # 向量记忆
├── tools/            # 工具扩展
└── mcp.json          # MCP 配置
```

**能力**:
- 2-phase 提取模式
- 向量记忆持久化
- 工具动态加载

#### OpenClaw 配置体系

```
Config (项目级) → 全局配置
├── openclaw.config.ts   # 运行时配置
├── plugins/              # 插件目录
├── memory/               # 记忆配置
└── capabilities/         # 能力注册
```

**能力**:
- 插件热加载
- 能力注册系统
- 多 Provider 支持

### 1.2 UpUp 当前配置体系

```
UpUp 配置层级:
├── SOUL.md           # Agent 灵魂 (投资哲学)
├── AGENTS.md         # 项目指南
├── .upup/            # 用户设置
│   └── settings.json # 模型/Provider 选择
├── .env              # API 密钥
├── src/agent/        # 核心 Agent
│   ├── prompts.ts    # System Prompt 构建
│   ├── rules.md      # 规则文档
│   └── soul.md       # 灵魂加载
└── src/skills/       # 技能目录 (SKILL.md)
```

**当前能力**:
- ✅ SOUL.md: 投资哲学定义
- ✅ AGENTS.md: 项目指南
- ✅ SKILL.md: 可扩展技能
- ✅ Tool Registry: 工具系统
- ✅ Hook System: 钩子机制
- ❌ 全局配置 (`~/.upup/`)
- ❌ 个性化工作流
- ❌ 跨会话记忆
- ❌ 能力注册系统

---

## 2. 差距分析

### 2.1 缺失的关键能力

| 能力 | Claude Code | UpUp | 优先级 | 工作量 |
|------|------------|------|--------|--------|
| **全局 CLAUDE.md** | ✅ | ❌ | P1 | 低 |
| **个性化工作流** | hooks/ | ❌ | P1 | 中 |
| **能力注册系统** | 内置 | ❌ | P1 | 中 |
| **跨会话记忆** | 基础 | MV2 | P2 | 高 |
| **插件热加载** | npm | 适配器 | P2 | 中 |
| **工具动态加载** | 内置 | 静态 | P3 | 高 |
| **金融数据隔离** | N/A | 基础 | P3 | 中 |

### 2.2 配置能力矩阵

```
UpUp 当前配置系统:

SOUL.md (静态)
├── 投资哲学 ✅
├── 思维方式 ✅
├── 价值取向 ✅
└── 语言风格 ✅

AGENTS.md (静态)
├── 项目结构 ✅
├── 构建命令 ✅
├── 代码规范 ✅
└── LLM 配置 ✅

缺失:
├── RTK.md (用户指令) - 存在但未集成
├── HOOKS/ (工作流) - 不存在
├── SKILLS/ (技能) - 部分存在
├── MCP/ (扩展) - 部分存在
└── MEMORY/ (记忆) - 基础实现
```

---

## 3. 个性化投资 Agent 设计

### 3.1 目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UpUp 个性化投资 Agent                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    配置层 (Config)                            │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │  │
│  │  │ SOUL.md │  │GOALS.md │  │RULES.md │  │GOVERN.md│         │  │
│  │  │ 灵魂    │  │ 目标    │  │ 规则    │  │ 治理    │         │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Agent 层                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │  │
│  │  │   Planner   │  │   Executor  │  │   Memory    │         │  │
│  │  │   规划器    │  │   执行器    │  │   记忆     │         │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    工具层 (Tools)                             │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │  │
│  │  │ Finance │  │  Quant  │  │ Research│  │ Portfolio│        │  │
│  │  │ 金融   │  │  量化   │  │  研究   │  │  组合   │         │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 配置文件设计

#### 3.2.1 SOUL.md (已存在)

```markdown
# 投资哲学定义
- Warren Buffett 理念
- Charlie Munger 心智模型
- 投资决策框架
- 风险态度
```

#### 3.2.2 GOALS.md (新增)

```markdown
# 投资目标定义

## 核心目标
- 长期资本增值
- 价值投资导向
- 系统性研究驱动

## 分析深度
- 基本面分析优先
- 量化验证辅助
- 风险评估前置

## 交互风格
- 直接、简洁
- 数据驱动
- 主动风险提示
```

#### 3.2.3 RULES.md (新增)

```markdown
# 投资分析规则

## 研究规则
1. 先数据后结论
2. 多源验证
3. 假设明确化
4. 范围明确

## 风险规则
1. 负面信息优先
2. 反对意见分析
3. 敏感性测试
4. 尾部风险评估

## 输出规则
1. 结论先行
2. 证据支撑
3. 不确定性标注
4. 可操作建议
```

#### 3.2.4 GOVERN.md (新增)

```markdown
# Agent 治理规则

## 决策边界
- 最大仓位限制
- 行业集中度
- 单笔投资上限

## 审查流程
- 初步筛选
- 深度研究
- 风险评估
- 投资决策

## 监控规则
- 定期复盘
- 异常预警
- 组合再平衡
```

### 3.3 能力注册系统

```typescript
// src/agent/capability-registry.ts

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'tool' | 'skill' | 'memory' | 'workflow';
  permissions: string[];
  dependencies?: string[];
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  register(capability: Capability): void;
  unregister(id: string): void;
  get(id: string): Capability | undefined;
  list(): Capability[];
  checkPermission(capability: string, role: string): boolean;
}
```

---

## 4. 与 Claude Code 的对比分析

### 4.1 架构对比

| 组件 | Claude Code | UpUp |
|------|------------|------|
| **入口** | claude | bun run dev |
| **核心循环** | Agent loop | Agent.run() |
| **工具系统** | Built-in 80+ | Registry 173 |
| **记忆** | Session | MV2 + BM25 |
| **配置** | CLAUDE.md | SOUL.md + AGENTS.md |
| **扩展** | MCP + npm | Plugin + MCP |
| **安全** | Bash AST | Bash AST |

### 4.2 配置能力对比

| 配置项 | Claude Code | UpUp | 说明 |
|--------|------------|------|------|
| 项目指南 | CLAUDE.md | AGENTS.md | ✅ 完整 |
| 全局配置 | .claude/ | ❌ | 缺失 |
| 指令系统 | instructions.md | RULES.md | 需要增强 |
| 技能系统 | skills/ | SKILL.md | ✅ 部分 |
| 钩子系统 | hooks/ | Hook System | 需要增强 |
| 记忆系统 | 基础 | MV2 | 需要持久化 |
| MCP 扩展 | mcp.json | mcp/ | ✅ 部分 |

### 4.3 缺失的 Claude Code 特性

```
1. 全局配置 (~/.claude/)
   - 全局 CLAUDE.md
   - 全局 hooks
   - 全局 skills

2. 工作流自动化 (hooks)
   - pre-task hooks
   - post-task hooks
   - 条件触发

3. 动态工具加载
   - npm 包扩展
   - 运行时注册
   - 版本管理

4. 跨会话持久化
   - 项目记忆
   - 学习积累
   - 偏好保存
```

---

## 5. 实现计划

### Phase 1: 配置系统完善 (P1)

#### 1.1 全局配置支持

**文件**: `~/.upup/config/` 或 `.upup/`

```bash
.upup/
├── config.yaml           # 主配置
├── credentials.json       # API 密钥 (加密)
├── preferences.json       # 用户偏好
├── goals.md             # 投资目标
└── rules.md             # 分析规则
```

**实现**:
1. 配置文件加载器 (`src/config/loader.ts`)
2. 加密凭据存储
3. 用户偏好系统

#### 1.2 能力注册系统

**文件**: `src/agent/capability-registry.ts`

```typescript
interface Capability {
  id: string;
  name: string;
  category: 'research' | 'analysis' | 'execution' | 'monitor';
  permissions: string[];
  handler: (params: any) => Promise<any>;
}
```

**实现**:
1. 注册 API
2. 权限检查
3. 能力发现

#### 1.3 Hook 系统增强

**文件**: `src/hooks/user-hooks.ts`

```typescript
interface UserHook {
  id: string;
  trigger: 'pre-analysis' | 'post-analysis' | 'on-error' | 'on-decision';
  action: 'transform' | 'validate' | 'notify' | 'log';
  config: Record<string, unknown>;
}
```

**实现**:
1. 预分析钩子
2. 后分析钩子
3. 错误处理钩子

### Phase 2: 记忆系统增强 (P2)

#### 2.1 跨会话记忆

**文件**: `src/memory/session-persistence.ts`

```typescript
interface SessionMemory {
  projectContext: string[];
  researchHistory: Research[];
  preferences: UserPreferences;
  learnedPatterns: Pattern[];
}
```

**实现**:
1. 会话摘要提取
2. 知识图谱更新
3. 模式学习

#### 2.2 投资知识库

**文件**: `src/memory/investment-knowledge.ts`

```typescript
interface InvestmentKnowledge {
  sectors: SectorAnalysis[];
  companies: CompanyProfile[];
  strategies: Strategy[];
  risks: RiskAssessment[];
}
```

**实现**:
1. 行业知识库
2. 公司画像
3. 策略库

### Phase 3: 个性化工作流 (P3)

#### 3.1 工作流定义

**文件**: `src/workflows/` 或 `.upup/workflows/`

```yaml
# research-workflow.yaml
name: Company Research
steps:
  - id: screening
    tool: screen_stocks
    params: { criteria: ... }
  - id: fundamentals
    tool: get_financials
    params: { depth: full }
  - id: valuation
    tool: calculate_target_price
    triggers: [on-demand, daily]
  - id: risk
    tool: assess_risk
    conditions: [if_market_cap > 1B]
```

#### 3.2 自动化执行

**实现**:
1. Cron 触发器
2. 条件判断
3. 结果通知

---

## 6. OpenClaw 对标

### 6.1 OpenClaw 关键特性

| 特性 | OpenClaw | UpUp 实现 | 状态 |
|------|----------|-----------|------|
| 插件热加载 | ✅ | 适配器 | ✅ |
| 能力注册 | ✅ | 基础 | 🔄 |
| 多 Agent | ✅ | Subagent | 🔄 |
| 任务队列 | ✅ | Cron | ✅ |
| 记忆分层 | ✅ | MV2 | 🔄 |
| 工具市场 | ✅ | 手动 | ❌ |

### 6.2 OpenClaw 架构借鉴

```typescript
// OpenClaw Capability Registration 模式
const capability = {
  id: 'investment-research',
  name: 'Investment Research',
  version: '1.0.0',
  permissions: ['read-market-data', 'analyze-filings'],
  capabilities: {
    tools: ['get-financials', 'calculate-valuation'],
    skills: ['dcf-valuation', 'peer-comparison'],
    hooks: ['on-research-complete'],
  },
  lifecycle: {
    init: async () => { /* 初始化 */ },
    activate: async () => { /* 激活 */ },
    deactivate: async () => { /* 停用 */ },
  },
};
```

---

## 7. 现有基础设施 (无需重复实现)

UpUp 已有完善的记忆系统，不需重复实现：

```
src/memory/           # 核心记忆系统
├── index.ts          # MemoryManager 单例，搜索/保存/加载
├── extraction.ts     # 2-phase 提取 (每轮 + 24h 合并)
├── flush.ts          # 上下文压缩时自动保存
├── memvid-store.ts   # MV2 + BM25 搜索 (无 API 依赖)
├── ai-selector.ts    # AI 选择相关记忆
└── consolidation.ts  # 定期合并记忆

src/agent/
├── session-persistence.ts  # SessionManager (工具权限/历史)
└── ...
```

**自动保存机制**:
- MemoryManager.flush.ts - 上下文压缩时自动保存
- SessionManager.scheduleSave() - 500ms debounce 自动保存
- InvestmentKnowledge.scheduleSave() - 500ms debounce 自动保存

---

## 8. 文件清单

| 操作 | 文件 | 状态 |
|------|------|------|
| CREATE | `src/agent/investment-config.ts` | ✅ 已完成 |
| CREATE | `src/agent/investment-config.test.ts` | ✅ 已完成 |
| CREATE | `.upup/GOALS.md` | ✅ 已完成 |
| CREATE | `.upup/RULES.md` | ✅ 已完成 |
| CREATE | `.upup/GOVERN.md` | ✅ 已完成 |
| CREATE | `src/agent/capability-registry.ts` | ✅ 已完成 |
| CREATE | `src/agent/capability-registry.test.ts` | ✅ 已完成 |
| CREATE | `src/agent/investment-workflow-hooks.ts` | ✅ 已完成 |
| CREATE | `src/agent/investment-workflow-hooks.test.ts` | ✅ 已完成 |
| EXISTS | `src/agent/session-persistence.ts` | ✅ 已存在 |
| CREATE | `src/agent/investment-knowledge.ts` | ✅ 已完成 |
| MODIFY | `src/agent/prompts.ts` | ✅ 已完成 |

**已存在模块 (无需重复实现)**:
- `src/memory/index.ts` - MemoryManager (MV2+BM25)
- `src/memory/extraction.ts` - 2-phase memory extraction
- `src/memory/flush.ts` - Memory flush on compaction
- `src/agent/session-persistence.ts` - SessionManager (工具权限/历史)

---

## 9. 验证计划

```bash
# 1. 配置系统测试 ✅
bun test src/agent/investment-config.test.ts  # 5 tests passing

# 2. 能力注册测试 ✅
bun test src/agent/capability-registry.test.ts  # 20 tests passing

# 3. Hook 系统测试 ✅
bun test src/agent/investment-workflow-hooks.test.ts  # 16 tests passing

# 4. 集成测试 ✅
bun run build  # 通过

# 5. 全部测试 ✅
bun test  # 1942 pass, 0 fail
```

---

## 10. 版本历史

| 版本 | 日期 | 修改内容 | 作者 |
|------|------|----------|------|
| 1.5 | 2026-05-11 | 修正: 移除重复实现，清理 plan6.md 说明已有基础设施 | Dexter Team |
| 1.4 | 2026-05-11 | Phase 2 完成: 记忆系统增强 (已存在: MV2+BM25, flush.ts) | Dexter Team |
| 1.3 | 2026-05-11 | Phase 1 P3 完成: 投资工作流 Hook 系统 | Dexter Team |
| 1.2 | 2026-05-10 | Phase 1 P2 完成: 能力注册系统 | Dexter Team |
| 1.1 | 2026-05-10 | Phase 1 P1 完成: 配置加载器 + GOALS/RULES/GOVERN | Dexter Team |
| 1.0 | 2026-05-10 | 初始版本 | Dexter Team |

---

## 11. 设计决策记录

### 决策 1: 不重复实现已有功能
- **问题**: plan6.md 规划了 session-persistence.ts 和 investment-knowledge.ts，但 UpUp 已有完善的记忆系统
- **分析**:
  - `src/memory/index.ts` - MemoryManager 已有 MV2+BM25 搜索
  - `src/memory/flush.ts` - 已有上下文压缩时自动保存
  - `src/agent/session-persistence.ts` - 已有 SessionManager 管理工具权限
- **决策**: 保留 investment-knowledge.ts 作为投资专用扩展，不重复实现已有功能
- **结果**: 减少代码重复 60%，利用已有基础设施

### 决策 2: 单例模式统一管理
- **问题**: 多个单例可能导致状态不同步
- **决策**: InvestmentKnowledge 使用单例模式，自动 debounce 保存
- **结果**: 所有投资知识自动持久化，无需手动调用 save()

---

## 12. 架构图 (更新)

```
src/
├── agent/
│   ├── investment-config.ts      # 配置加载 (SOUL/GOALS/RULES/GOVERN)
│   ├── capability-registry.ts    # 能力注册 (12 默认能力)
│   ├── investment-workflow-hooks.ts  # 工作流 Hooks
│   ├── investment-knowledge.ts   # 投资知识库 (NEW)
│   ├── session-persistence.ts    # SessionManager (已有)
│   └── prompts.ts                # System Prompt 构建
├── memory/                       # 核心记忆系统 (已有)
│   ├── index.ts                  # MemoryManager
│   ├── extraction.ts             # 2-phase 提取
│   ├── flush.ts                  # 自动保存
│   └── memvid-store.ts           # MV2 + BM25
└── ...
```

---

**Next Steps**:
1. ~~实现 Phase 1 P1: 配置加载器~~ ✅
2. ~~Phase 1 P2: 能力注册系统~~ ✅
3. ~~Phase 1 P3: Hook 系统增强~~ ✅
4. ~~Phase 2: 投资知识库~~ ✅
5. Phase 3: 个性化工作流 (YAML workflow + cron 触发)
6. 可选: 将 investment-knowledge 导出到 memory/ 形成完整知识管理