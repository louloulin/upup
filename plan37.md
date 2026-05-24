# Dexter/UpUp 生产级改进计划

**日期**: 2026-05-24  
**版本**: 4.0 (多智能体 & 自定义智能体增强版)  
**状态**: 生产级改进计划  
**分支**: feature/multi-agent-engine

---

## 一、现有能力盘点

### 1.1 已验证能力

| 模块 | 状态 | 与Claude Code对比 |
|------|------|-------------------|
| Agent Loop | ✅ 完整 | 相当 |
| Tool Executor | ✅ 完整 (并发分区) | 相当 |
| Compact System | ✅ 完整 (9段式总结) | 相当 |
| Memory Manager | ✅ 丰富 (4-type分类) | 超过 |
| Scratchpad | ✅ 完整 | 相当 |
| Skills (60+) | ✅ 丰富 | 超过 |
| Subagent Runner | ⚠️ 基础 | 差距大 |
| Slash Commands | ⚠️ 基础 | 差距大 |

---

## 二、Claude Code 多智能体系统分析

### 2.1 团队创建系统 (TeamCreate)

```
┌─────────────────────────────────────────────────────────────┐
│           CLAUDE CODE TEAM SYSTEM (Agent Swarms)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               TeamCreateTool                          │   │
│  │                                                      │   │
│  │  Input:                                               │   │
│  │  • team_name: string                                 │   │
│  │  • description?: string                             │   │
│  │  • agent_type?: string (researcher/test-runner)    │   │
│  │                                                      │   │
│  │  Output:                                              │   │
│  │  • team_name: string                                 │   │
│  │  • team_file_path: string                           │   │
│  │  • lead_agent_id: string                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               TeamFile Structure                      │   │
│  │                                                      │   │
│  │  {                                                    │   │
│  │    "name": "my-team",                               │   │
│  │    "lead": "agent-id",                              │   │
│  │    "members": [...],                               │   │
│  │    "description": "...",                           │   │
│  │    "created_at": "...",                            │   │
│  │    "status": "active"                              │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Swarm 后端架构

```
┌─────────────────────────────────────────────────────────────┐
│              SWARM BACKENDS (多智能体执行)                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Backend Registry                          │   │
│  │                                                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │   │
│  │  │InProcess│  │  Tmux   │  │ ITerm2  │  │ Pane    │ │   │
│  │  │ Backend │  │ Backend │  │ Backend │  │ Executor│ │   │
│  │  │         │  │         │  │         │  │         │ │   │
│  │  │• Inline │  │• Split  │  │• Split  │  │• Router │ │   │
│  │  │• Same   │  │• Multi  │  │• Multi  │  │• Status │ │   │
│  │  │  Process│  │  Panes  │  │  Panes  │  │  Sync   │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               TeammateExecutor Interface             │   │
│  │                                                      │   │
│  │  • spawn(config): Promise<TeammateInstance>         │   │
│  │  • sendMessage(id, msg): Promise<void>              │   │
│  │  • getOutput(id): Promise<string>                   │   │
│  │  • terminate(id): Promise<void>                     │   │
│  │  • listActive(): Promise<Teammate[]>                │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 内置 Skill 系统 (Bundled Skills)

```
┌─────────────────────────────────────────────────────────────┐
│            CLAUDE CODE BUNDLED SKILLS 系统                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             BundledSkillDefinition                   │   │
│  │                                                      │   │
│  │  Properties:                                         │   │
│  │  • name: string                                     │   │
│  │  • description: string                              │   │
│  │  • aliases?: string[]                                │   │
│  │  • whenToUse?: string                               │   │
│  │  • argumentHint?: string                           │   │
│  │  • allowedTools?: string[]                         │   │
│  │  • model?: string (override)                       │   │
│  │  • disableModelInvocation?: boolean                 │   │
│  │  • userInvocable?: boolean                          │   │
│  │  • progressMessage?: string                         │   │
│  │  • isEnabled?: () => boolean                       │   │
│  │  • context?: 'inline' | 'fork'                     │   │
│  │  • agent?: string (指定智能体)                     │   │
│  │  • files?: Record<string, string> (引用文件)       │   │
│  │  • getPromptForCommand(): Promise<ContentBlock[]>  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             内置 Skills 列表                        │   │
│  │                                                      │   │
│  │  /updateConfig  /keybindings  /verify  /debug       │   │
│  │  /loremIpsum   /skillify    /remember /simplify    │   │
│  │  /batch        /stuck       /dream   /hunter       │   │
│  │  /loop         /claude-api /claudeInChrome         │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Dexter 当前多智能体系统

### 3.1 Subagent 系统

```
┌─────────────────────────────────────────────────────────────┐
│              DEXTER SUBAGENT 系统 (当前)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             SubagentConfig                          │   │
│  │                                                      │   │
│  │  Properties:                                         │   │
│  │  • id?: string                                      │   │
│  │  • name?: string                                    │   │
│  │  • type: 'general' | 'specialized' | 'fork'        │   │
│  │  • tools: string[] | '*'                           │   │
│  │  • maxTurns?: number                               │   │
│  │  • model?: string | 'inherit'                      │   │
│  │  • permissionMode?: 'default' | 'bubble' | 'plan'  │   │
│  │  • isolation?: 'none' | 'worktree'                  │   │
│  │  • systemPrompt?: string                           │   │
│  │  • runInBackground?: boolean                       │   │
│  │  • timeoutMs?: number                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  能力:                                                       │
│  ✅ 子Agent创建 (SubagentRunner)                            │
│  ✅ 工具过滤 (toolFilter)                                    │
│  ✅ 权限模式 (default/bubble/plan)                          │
│  ✅ 隔离模式 (none/worktree)                                │
│  ⚠️ 无并行执行                                              │
│  ⚠️ 无团队管理                                              │
│  ⚠️ 无Swarm后端                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Skill 系统 (现有)

```
┌─────────────────────────────────────────────────────────────┐
│              DEXTER SKILLS 系统 (60+)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             SkillCommandRegistry                     │   │
│  │                                                      │   │
│  │  • parseSlashCommand() - 解析 /skill args           │   │
│  │  • registerSkillsFromDirectory()                    │   │
│  │  • discoverAndRegisterSkills()                      │   │
│  │  • routeSlashCommand() - 路由到skill执行            │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             Skill Features                           │   │
│  │                                                      │   │
│  │  • Inline/Fork 执行模式                            │   │
│  │  • 依赖解析 (resolveDependencies)                  │   │
│  │  • Auto-activation (auto-activate.ts)              │   │
│  │  • SKILL.md 文件格式                                │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ✅ 比Claude Code更多内置Skills (60+ vs 15+)              │
│  ✅ 支持复杂工作流                                          │
│  ✅ 支持投资领域专业技能                                    │
│  ⚠️ 无自定义Agent指定                                      │
│  ⚠️ 无files引用系统                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、差距分析矩阵

### 4.1 多智能体系统对比

```
┌─────────────────────────────────────────────────────────────────────┐
│                    多智能体系统差距分析                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  能力              │ Claude Code      │ Dexter        │ 差距        │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                      │
│  TEAM MANAGEMENT     │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  Team Create        │ ✅ TeamCreateTool  │ ⚠️ Subagent  │ 中         │
│  Team File          │ ✅ JSON TeamFile   │ ❌ 无        │ 大         │
│  Team Members       │ ✅ 完整管理       │ ⚠️ 基础      │ 大         │
│  Team Status        │ ✅ 实时跟踪       │ ❌ 无        │ 极大       │
│                                                                      │
│  SWARM BACKENDS      │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  In-Process         │ ✅                │ ⚠️ 有限      │ 中         │
│  Tmux               │ ✅                │ ❌ 无        │ 极大       │
│  iTerm2             │ ✅                │ ❌ 无        │ 极大       │
│  Pane Executor      │ ✅                │ ❌ 无        │ 极大       │
│                                                                      │
│  AGENT EXECUTION     │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  Parallel Spawn      │ ✅                │ ❌ 无        │ 极大       │
│  Message Pass       │ ✅                │ ❌ 无        │ 极大       │
│  Output Aggregation  │ ✅                │ ❌ 无        │ 极大       │
│  State Sync         │ ✅                │ ❌ 无        │ 极大       │
│                                                                      │
│  PERMISSIONS         │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  Permission Sync     │ ✅ leaderPermissionBridge │ ❌ 无  │ 极大       │
│  Bubble Mode        │ ✅                │ ⚠️ 基础      │ 中         │
│  Plan Mode          │ ✅                │ ✅           │ 无         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 自定义智能体/Skills 对比

```
┌─────────────────────────────────────────────────────────────────────┐
│                    自定义智能体/Skills 差距分析                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  能力              │ Claude Code      │ Dexter        │ 差距        │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                      │
│  BUNDLED SKILLS     │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  注册机制           │ ✅ registerBundledSkill │ ✅ registerBundledSkill │ 无     │
│  别名支持           │ ✅ aliases         │ ❌ 无        │ 中         │
│  模型覆盖           │ ✅ model override │ ❌ 无        │ 大         │
│  Agent指定          │ ✅ agent property │ ❌ 无        │ 极大       │
│  Files引用          │ ✅ files property │ ❌ 无        │ 大         │
│  Disable Invocation │ ✅               │ ❌ 无        │ 中         │
│                                                                      │
│  SKILL DISCOVERY    │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  目录扫描           │ ✅ loadSkillsDir  │ ✅ discoverSkills │ 无     │
│  MCP Skills         │ ✅ mcpSkillBuilders │ ⚠️ 基础     │ 中         │
│  动态注册           │ ✅               │ ✅           │ 无         │
│                                                                      │
│  EXECUTION MODE     │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  Inline            │ ✅ context=inline  │ ✅           │ 无         │
│  Fork              │ ✅ context=fork   │ ✅           │ 无         │
│  Background        │ ✅               │ ⚠️ 基础      │ 中         │
│                                                                      │
│  SPECIALIZED SKILLS │                    │              │            │
│  ──────────────────────────────────────────────────────────────────  │
│  Dream (自主探索)   │ ✅ /dream         │ ❌ 无        │ 大         │
│  Loop (循环监控)   │ ✅ /loop          │ ⚠️ cron     │ 中         │
│  Batch (批处理)    │ ✅ /batch         │ ⚠️ 基础      │ 中         │
│  Verify (验证)     │ ✅ /verify         │ ❌ 无        │ 大         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 五、目标架构

### 5.1 多智能体系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEXTER 多智能体目标架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         AGENT CORE LAYER                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │    │
│  │  │ Agent      │  │ Tool       │  │ Compact     │                  │    │
│  │  │ Loop       │  │ Executor   │  │             │                  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                             │
│  ┌──────────────────────────▼──────────────────────────────────────┐        │
│  │                     MULTI-AGENT LAYER                            │        │
│  │  ┌────────────────────────────────────────────────────────────┐ │        │
│  │  │                    SwarmCoordinator                        │ │        │
│  │  │  • team_create: 创建团队                                  │ │        │
│  │  │  • agent_spawn: spawn子Agent                             │ │        │
│  │  │  • message_pass: Agent间通信                             │ │        │
│  │  │  • state_sync: 状态同步                                  │ │        │
│  │  │  • output_aggregate: 结果聚合                            │ │        │
│  │  └────────────────────────────────────────────────────────────┘ │        │
│  │                                                              │        │
│  │  ┌────────────────────────────────────────────────────────────┐ │        │
│  │  │                    Backend Registry                       │ │        │
│  │  │                                                            │ │        │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │ │        │
│  │  │  │InProcess│  │  Tmux   │  │ ITerm2  │  │ WorkerPool│      │ │        │
│  │  │  │ Backend │  │ Backend │  │ Backend │  │ (新增)    │      │ │        │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │ │        │
│  │  └────────────────────────────────────────────────────────────┘ │        │
│  │                                                              │        │
│  │  ┌────────────────────────────────────────────────────────────┐ │        │
│  │  │                    Team Management                        │ │        │
│  │  │                                                            │ │        │
│  │  │  TeamFile ──► Members ──► Status ──► Permissions           │ │        │
│  │  │      │            │            │            │              │ │        │
│  │  │      ▼            ▼            ▼            ▼              │ │        │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │ │        │
│  │  │  │JSON     │  │Agent[]  │  │Active/  │  │Sync     │     │ │        │
│  │  │  │Persist  │  │列表     │  │Idle     │  │Bridge   │     │ │        │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │ │        │
│  │  └────────────────────────────────────────────────────────────┘ │        │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Skill/自定义智能体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DEXTER SKILL/自定义智能体目标架构                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   SKILL SYSTEM (增强)                                │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │                  SkillCommandRegistry                        │   │    │
│  │  │  • parseSlashCommand()      • registerBundledSkill()       │   │    │
│  │  │  • discoverSkills()         • routeSlashCommand()         │   │    │
│  │  │  • agent property (NEW)     • files property (NEW)        │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │                  BundledSkillDefinition (增强)                │   │    │
│  │  │                                                               │   │    │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐          │   │    │
│  │  │  │ name       │  │ aliases    │  │ agent      │          │   │    │
│  │  │  │ description│  │ whenToUse  │  │ model      │          │   │    │
│  │  │  │ argumentHint│  │ allowedTools│  │ files      │          │   │    │
│  │  │  └────────────┘  └────────────┘  └────────────┘          │   │    │
│  │  │                                                               │   │    │
│  │  │  ┌─────────────────────────────────────────────────────┐   │   │    │
│  │  │  │              Specialized Skills                      │   │   │    │
│  │  │  │                                                         │   │   │    │
│  │  │  │  /dream   /loop   /batch   /verify                   │   │   │    │
│  │  │  │  /hunter  /debug  /remember /simplify                  │   │   │    │
│  │  │  │                                                         │   │   │    │
│  │  │  │  + 60+ Investment Skills (DCF, A-share, Fund, etc.)    │   │   │    │
│  │  │  └─────────────────────────────────────────────────────┘   │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 六、实施计划

### Phase 1: Swarm Coordinator (2周)

#### 1.1 Team Management

```
┌─────────────────────────────────────────────────────────────┐
│                TEAM MANAGEMENT 实现                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            src/multi-agent/team-manager.ts          │   │
│  │                                                      │   │
│  │  interface TeamFile {                                │   │
│  │    name: string                                     │   │
│  │    lead: string                                     │   │
│  │    members: TeamMember[]                           │   │
│  │    description: string                              │   │
│  │    createdAt: number                                │   │
│  │    status: 'active' | 'paused' | 'completed'        │   │
│  │  }                                                  │   │
│  │                                                      │   │
│  │  class TeamManager {                                 │   │
│  │    • create(name, desc): Team                      │   │
│  │    • addMember(teamId, agent): TeamMember          │   │
│  │    • removeMember(teamId, agentId): boolean       │   │
│  │    • getTeam(teamId): Team | undefined            │   │
│  │    • listTeams(): Team[]                           │   │
│  │    • updateStatus(teamId, status): boolean         │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 1.2 Swarm Coordinator

```
┌─────────────────────────────────────────────────────────────┐
│              SWARM COORDINATOR 实现                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            src/multi-agent/coordinator.ts            │   │
│  │                                                      │   │
│  │  class SwarmCoordinator {                            │   │
│  │    private teams: Map<string, Team>                  │   │
│  │    private backends: Map<string, Backend>            │   │
│  │    private agents: Map<string, AgentInstance>       │   │
│  │                                                      │   │
│  │    // Team operations                                │   │
│  │    async createTeam(config): Promise<Team>          │   │
│  │    async spawnAgent(teamId, config): Promise<Agent>  │   │
│  │    async messagePass(from, to, msg): Promise<void>  │   │
│  │    async aggregateResults(teamId): Promise<string>  │   │
│  │    async terminateAgent(agentId): Promise<void>      │   │
│  │    async getActiveAgents(): Promise<Agent[]>        │   │
│  │  }                                                  │   │
│  │                                                      │   │
│  │  // Tools                                           │   │
│  │  • team_create: 创建团队                            │   │
│  │  • team_add_member: 添加成员                        │   │
│  │  • team_remove_member: 移除成员                     │   │
│  │  • agent_spawn: spawn子Agent                       │   │
│  │  • agent_message: Agent间消息                       │   │
│  │  • agent_results: 获取结果                          │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Backend Registry (2周)

#### 2.1 Backend Interface

```
┌─────────────────────────────────────────────────────────────┐
│                BACKEND REGISTRY 实现                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            src/multi-agent/backends/                │   │
│  │                                                      │   │
│  │  interface Backend {                                  │   │
│  │    type: 'inprocess' | 'tmux' | 'iterm2'           │   │
│  │    spawn(config): Promise<AgentInstance>          │   │
│  │    terminate(id): Promise<void>                     │   │
│  │    listActive(): Promise<AgentInstance[]>          │   │
│  │  }                                                  │   │
│  │                                                      │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │              BackendRegistry                  │   │   │
│  │  │                                             │   │   │
│  │  │  register(backend: Backend): void           │   │   │
│  │  │  get(type): Backend | undefined            │   │   │
│  │  │  detect(): Backend (auto-detect)            │   │   │
│  │  │  list(): Backend[]                          │   │   │
│  │  │                                             │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                                                      │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │              Implementations                 │   │   │
│  │  │                                             │   │   │
│  │  │  • InProcessBackend (复用现有Agent)         │   │   │
│  │  │  • TmuxBackend (新建)                       │   │   │
│  │  │  • ITerm2Backend (新建)                     │   │   │
│  │  │  • WorkerPoolBackend (复用Daemon Worker)    │   │   │
│  │  │                                             │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Skill System 增强 (2周)

#### 3.1 Bundled Skill 增强

```
┌─────────────────────────────────────────────────────────────┐
│              BUNDLED SKILL 增强                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            增强 SkillDefinition                        │   │
│  │                                                      │   │
│  │  新增属性:                                           │   │
│  │  • agent?: string      // 指定运行的Agent类型       │   │
│  │  • files?: Record<string, string>  // 引用文件      │   │
│  │  • aliases?: string[]  // 命令别名                  │   │
│  │  • model?: string      // 模型覆盖                  │   │
│  │                                                      │   │
│  │  新增内置Skills:                                     │   │
│  │  • /dream    - 自主探索模式                         │   │
│  │  • /verify   - 验证执行结果                         │   │
│  │  • /hunter   - 发现并追踪问题                       │   │
│  │  • /batch    - 批量任务执行                         │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Skill Execution 增强                       │   │
│  │                                                      │   │
│  │  支持模式:                                           │   │
│  │  • inline: 在主Agent中执行                          │   │
│  │  • fork: 在子Agent中执行                             │   │
│  │  • background: 后台异步执行                          │   │
│  │  • swarm: 在Team中执行                               │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: 投资核心 (3周)

```
┌─────────────────────────────────────────────────────────────┐
│                投资核心能力实现                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Investment Tools                     │   │
│  │                                                      │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐      │   │
│  │  │Sandbox    │  │Backtest   │  │ Alert     │      │   │
│  │  │Engine     │  │Engine     │  │Engine     │      │   │
│  │  │           │  │           │  │           │      │   │
│  │  │• create   │  │• run      │  │• create   │      │   │
│  │  │• simulate │  │• analyze  │  │• trigger  │      │   │
│  │  │• reset    │  │• optimize │  │• notify   │      │   │
│  │  └───────────┘  └───────────┘  └───────────┘      │   │
│  │                                                      │   │
│  │  ┌───────────┐  ┌───────────┐                      │   │
│  │  │Portfolio  │  │ Risk      │                      │   │
│  │  │Optimizer  │  │Engine     │                      │   │
│  │  │           │  │           │                      │   │
│  │  │• optimize │  │• VaR      │                      │   │
│  │  │• rebalance│  │• Stress   │                      │   │
│  │  │• track    │  │• Limit    │                      │   │
│  │  └───────────┘  └───────────┘                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Investment Skills                     │   │
│  │                                                      │   │
│  │  60+ 现有Skills + 新增:                              │   │
│  │  • /portfolio    - 组合管理                        │   │
│  │  • /backtest     - 回测分析                         │   │
│  │  • /risk         - 风险管理                         │   │
│  │  • /alert        - 警报配置                         │   │
│  │  • /sandbox      - 沙盒模拟                        │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、文件清单

### 新建文件

```
src/multi-agent/
├── coordinator.ts         # SwarmCoordinator 主控
├── team-manager.ts       # TeamManager 团队管理
├── backends/
│   ├── index.ts          # BackendRegistry
│   ├── inprocess.ts      # InProcessBackend
│   ├── tmux.ts          # TmuxBackend
│   └── iterm2.ts        # ITerm2Backend
├── types.ts              # 类型定义
└── tools/
    ├── team-create.ts    # team_create 工具
    ├── team-manage.ts    # team成员管理工具
    └── agent-spawn.ts    # agent_spawn 工具

src/skills/
├── bundled/
│   ├── dream.ts          # /dream 自主探索
│   ├── verify.ts        # /verify 验证
│   ├── hunter.ts         # /hunter 发现追踪
│   └── batch.ts          # /batch 批处理
└── registry.ts           # 增强版SkillRegistry
```

### 修改文件

```
src/agent/
├── subagent.ts           # 增强SubagentConfig
└── subagent-runner.ts    # 支持Swarm执行

src/tools/registry/
├── domain-tools.ts       # 注册multi-agent工具
└── index.ts              # 导出

src/skills/
├── index.ts              # 导出增强功能
└── executor.ts           # 支持swarm模式
```

---

## 八、时间线

```
Phase 1: Swarm Coordinator (2周)
────────────────────────────
Week 1: Team Management
        • TeamManager 实现
        • TeamFile 持久化
        • team_create/list/delete 工具

Week 2: Swarm Coordinator
        • Coordinator 主控
        • agent_spawn/message/results 工具
        • 状态同步机制

Phase 2: Backend Registry (2周)
────────────────────────────
Week 3: Backend Interface
        • BackendRegistry 实现
        • InProcessBackend (复用现有Agent)
        • WorkerPoolBackend (复用Daemon)

Week 4: Terminal Backends
        • TmuxBackend 实现
        • ITerm2Backend 实现

Phase 3: Skill System 增强 (2周)
────────────────────────────
Week 5: Bundled Skills
        • 增强SkillDefinition
        • /dream, /verify, /hunter, /batch 实现
        • aliases/files/agent 属性支持

Week 6: Skill Execution
        • Inline/Fork/Background/Swarm 执行模式
        • Skill命令路由增强

Phase 4: Investment Core (3周)
────────────────────────────
Week 7-8: SandBox Engine
        • 隔离环境
        • 模拟交易
        • 风险计算

Week 9: Backtest & Alert
        • 回测引擎增强
        • 警报系统
```

---

## 九、验收标准

### 多智能体系统

| 指标 | 当前 | 目标 |
|------|------|------|
| Team管理 | ❌ | ✅ |
| 并行Spawn | ❌ | ✅ |
| Agent间通信 | ❌ | ✅ |
| 结果聚合 | ❌ | ✅ |
| Backend类型 | 1 | 4 |

### Skill系统

| 指标 | 当前 | 目标 |
|------|------|------|
| Bundled Skills | 60+ | 70+ |
| Alias支持 | ❌ | ✅ |
| Agent指定 | ❌ | ✅ |
| Files引用 | ❌ | ✅ |
| Specialized Skills | 0 | 4+ |

### 投资核心

| 指标 | 当前 | 目标 |
|------|------|------|
| SandBox | ❌ | ✅ |
| Backtest | 基础 | 完整 |
| Alert | 基础 | 多渠道 |
| Portfolio | 基础 | 完整 |

---

## 十、关键差异对比

### Claude Code vs Dexter

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    核心差异: Claude Code vs Dexter                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    多智能体系统                                    │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  Claude Code:              │  Dexter (目标):                       │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  TeamCreate + TeamFile     │  TeamManager + SwarmCoordinator       │  │
│  │  Swarm Backends (4种)     │  BackendRegistry (4种)                 │  │
│  │  Pane-based UI            │  TUI/REPL + Web                       │  │
│  │  LeaderPermissionBridge   │  Permission Sync Bridge (新增)        │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    自定义智能体/Skills                              │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  Claude Code:              │  Dexter (目标):                       │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  15 Bundled Skills         │  70+ Skills (60投资 + 4专业化 + 6其他) │  │
│  │  agent/model/files属性     │  相同属性支持                         │  │
│  │  /dream (自主探索)         │  /dream 实现                          │  │
│  │  /loop (循环监控)          │  /loop 已有cron                      │  │
│  │  /verify (验证)           │  /verify 实现                        │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    投资专业能力                                    │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  Claude Code:              │  Dexter (优势):                       │  │
│  │  ─────────────────────────────────────────────────────────────────│  │
│  │  无投资功能               │  ✅ 60+ 投资Skills                     │  │
│  │  通用代码助手              │  ✅ DCF/A-share/Fund专业分析          │  │
│  │                          │  ✅ Backtest/Portfolio/Risk工具        │  │
│  │                          │  ✅ Tushare/AKShare数据集成           │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

**文档版本**: 4.0  
**创建时间**: 2026-05-24  
**分支**: feature/multi-agent-engine  
**策略**: 增量增强 + 多智能体 + 专业投资能力

---

## 十一、实现状态 (更新于 2026-05-24)

### Phase 1: Swarm Coordinator ✅ 已完成

```
┌─────────────────────────────────────────────────────────────┐
│              PHASE 1 实现状态                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ 已完成:                                                  │
│  ├── src/multi-agent/types.ts         - 类型定义            │
│  ├── src/multi-agent/team-manager.ts - TeamManager         │
│  ├── src/multi-agent/coordinator.ts  - SwarmCoordinator   │
│  ├── src/multi-agent/tools/swarm-tools.ts - Swarm工具      │
│  ├── src/multi-agent/index.ts         - 模块导出            │
│  └── src/multi-agent/multi-agent.test.ts - 单元测试 (6 pass)│
│                                                              │
│  ✅ 工具列表:                                               │
│  ├── team_create    - 创建多智能体团队                     │
│  ├── agent_spawn    - spawn子Agent                         │
│  ├── agent_message  - Agent间通信                         │
│  ├── agent_results  - 获取结果                            │
│  └── team_list      - 列出团队                            │
│                                                              │
│  ✅ 已集成到工具注册表:                                     │
│  └── src/tools/registry/domain-tools.ts                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Backend Registry ⏳ 待实现

```
┌─────────────────────────────────────────────────────────────┐
│              PHASE 2 计划                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  计划实现:                                                  │
│  ├── Backend Interface (Backend接口)                     │
│  ├── InProcessBackend (复用现有Agent)                     │
│  ├── WorkerPoolBackend (复用Daemon Workers)               │
│  ├── TmuxBackend (新)                                     │
│  └── ITerm2Backend (新)                                   │
│                                                              │
│  状态: ⏳ 待实现                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Skill系统增强 ⏳ 待实现

```
┌─────────────────────────────────────────────────────────────┐
│              PHASE 3 计划                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  计划实现:                                                  │
│  ├── 增强SkillDefinition属性                              │
│  │   ├── agent property                                  │
│  │   ├── files property                                  │
│  │   └── aliases property                                │
│  ├── 新增专业Skills                                       │
│  │   ├── /dream   - 自主探索                             │
│  │   ├── /verify  - 验证执行                            │
│  │   ├── /hunter  - 发现追踪                             │
│  │   └── /batch   - 批处理                               │
│  └── Skill执行模式增强 (swarm模式)                        │
│                                                              │
│  状态: ⏳ 待实现                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: 投资核心 ⏳ 待实现

```
┌─────────────────────────────────────────────────────────────┐
│              PHASE 4 计划                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  计划实现:                                                  │
│  ├── SandBox Engine (沙盒环境)                            │
│  ├── Backtest Engine (回测引擎增强)                       │
│  ├── Alert Engine (警报系统)                              │
│  └── Portfolio/Risk Tools                                 │
│                                                              │
│  状态: ⏳ 待实现                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 完成进度

```
┌─────────────────────────────────────────────────────────────┐
│                    总体完成进度                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Swarm Coordinator   ████████████████████ 100%  │
│  Phase 2: Backend Registry   ░░░░░░░░░░░░░░░░░░░░░░  0%  │
│  Phase 3: Skill系统增强       ░░░░░░░░░░░░░░░░░░░░░░░  0%  │
│  Phase 4: 投资核心           ░░░░░░░░░░░░░░░░░░░░░░░  0%  │
│                                                              │
│  总进度: ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 25%        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 文件清单 (已实现)

```
src/multi-agent/
├── types.ts              ✅ 类型定义 (TeamFile, AgentInstance, Backend)
├── team-manager.ts       ✅ TeamManager (团队创建/成员管理/持久化)
├── coordinator.ts       ✅ SwarmCoordinator (agent编排/消息/事件)
├── index.ts              ✅ 模块导出
├── multi-agent.test.ts   ✅ 单元测试 (6 pass)
└── tools/
    └── swarm-tools.ts   ✅ 5个工具 (team_create, agent_spawn, agent_message, agent_results, team_list)

src/tools/registry/
└── domain-tools.ts       ✅ 已注册Swarm工具到工具注册表

总计: 6个文件, ~1000行代码
```

### 下一步行动

1. ⏳ Phase 2: 实现BackendRegistry
2. ⏳ Phase 3: 增强Skill系统
3. ⏳ Phase 4: 实现投资核心能力

---

**实现版本**: v1.0  
**完成时间**: 2026-05-24  
**分支**: feature/multi-agent-engine  
**完成度**: 25% (Phase 1 完成)
