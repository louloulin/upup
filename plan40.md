# Plan40: UpUp 多智能体模式触发机制分析文档

**日期**: 2026-05-24
**版本**: 1.0
**状态**: 📋 分析完成

---

## 一、多智能体模式概述

UpUp 的多智能体系统基于 Claude Code Swarm 设计，支持：

- 团队创建和管理
- 子 Agent Spawn
- Agent 间消息传递
- 状态同步
- 结果聚合

---

## 二、多智能体触发方式

### 2.1 Skill 命令触发 (主要方式)

```
/swarm <symbol> [name] [depth]
/multi-agent <symbol> [name] [depth]
/analyze <symbol> [name] [depth]
```

**Skill 定义**: `src/skills/swarm-analysis/SKILL.md`

```yaml
---
name: swarm-analysis
context: swarm
agent: coordinator
aliases:
  - /swarm
  - /multi-agent
  - /analyze
whenToUse: |
  When you need to analyze a stock using multiple specialized agents
argumentHint: "<symbol> <name> [depth]"
---
```

**使用示例**:

```
/swarm 000001.SZ 平安银行 basic
/multi-agent 600519.SH 贵州茅台 detailed
```

### 2.2 工具触发

#### 2.2.1 team_create 工具

```
team_create(name="my-team", description="Optional description")
```

**实现**: `src/tools/team-tools.ts`

**返回**:
```json
{
  "team_name": "my-team-1234567890",
  "team_file_path": "~/.upup/teams/my-team-1234567890.json",
  "lead_agent_id": "agent-xxx"
}
```

#### 2.2.2 swarm_team_create 工具

```
swarm_team_create(team_name="stock-analysis", description="Stock analysis team")
```

**实现**: `src/multi-agent/tools/swarm-tools.ts`

#### 2.2.3 swarm_agent_spawn 工具

```
swarm_agent_spawn(
  team_name="stock-analysis",
  agent_name="researcher",
  role="researcher",
  prompt="Research company fundamentals..."
)
```

### 2.3 CLI 命令触发

目前没有直接的 CLI 命令来触发多智能体模式。需要通过 UpUp 交互界面输入 skill 命令或工具调用。

---

## 三、架构组件

### 3.1 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                    Multi-Agent Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SwarmCoordinator                       │    │
│  │                    (coordinator.ts)                      │    │
│  │                                                          │    │
│  │  - createTeam()                                          │    │
│  │  - spawnAgent()                                          │    │
│  │  - sendMessage()                                         │    │
│  │  - emitEvent()                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ TeamManager │     │   Backend   │     │  EventBus   │       │
│  │             │     │  Registry   │     │             │       │
│  │ - create()  │     │             │     │ - emit()    │       │
│  │ - delete()  │     │ - inprocess│     │ - on()      │       │
│  │ - list()    │     │ - tmux     │     │ - off()     │       │
│  └─────────────┘     │ - iterm2   │     └─────────────┘       │
│                      └─────────────┘                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 TeamManager

**文件**: `src/multi-agent/team-manager.ts`

**功能**:
- 团队创建、删除、列表
- 成员管理
- 文件持久化 (`~/.upup/teams/`)
- Session 清理集成

### 3.3 Backend Registry

**文件**: `src/multi-agent/backends/`

**支持的 Backend**:
| Backend | 说明 | 状态 |
|---------|------|------|
| inprocess | 进程内执行 | ✅ |
| tmux | Tmux pane | ✅ |
| iterm2 | iTerm2 tab | ✅ |
| workerpool | 工作池 | ⚠️ |

---

## 四、触发流程分析

### 4.1 Skill 命令触发流程

```
User Input: /swarm 000001.SZ 平安银行
    │
    ▼
Skill Loader
    │
    ▼
swarm-analysis SKILL.md
    │
    ▼
stock_analysis() tool
    │
    ▼
SwarmCoordinator.createTeam()
    │
    ├──► TeamManager.create()
    │
    └──► BackendRegistry.getBackendForSpawn()
              │
              ▼
         Backend.spawn()
```

### 4.2 工具调用触发流程

```
LLM Decision: Use team_create tool
    │
    ▼
Tool Registry
    │
    ▼
team_create() function
    │
    ▼
TeamManager.create()
    │
    ▼
SwarmCoordinator.registerTeamForSessionCleanup()
    │
    ▼
Team file created: ~/.upup/teams/{team-name}.json
```

---

## 五、多智能体示例

### 5.1 股票分析工作流

```typescript
// Step 1: 创建团队
swarm_team_create(team_name="stock-analysis-000001")

// Step 2: Spawn 研究员 Agent
swarm_agent_spawn(
  team_name="stock-analysis-000001",
  agent_name="researcher",
  role="researcher",
  prompt="Research company 000001.SZ fundamentals..."
)

// Step 3: Spawn 分析师 Agent
swarm_agent_spawn(
  team_name="stock-analysis-000001",
  agent_name="analyst",
  role="analyst",
  prompt="Analyze financial metrics..."
)

// Step 4: Spawn 总结 Agent
swarm_agent_spawn(
  team_name="stock-analysis-000001",
  agent_name="summarizer",
  role="summarizer",
  prompt="Generate investment recommendation..."
)

// Step 5: 获取结果
swarm_agent_results(team_name="stock-analysis-000001")
```

### 5.2 Agent 间通信

```typescript
// Agent A 发送消息给 Agent B
swarm_agent_message(
  from="researcher",
  to="analyst",
  content="Found strong revenue growth in Q1..."
)

// 获取消息
swarm_agent_results(team_name="stock-analysis-000001", agent_name="analyst")
```

---

## 六、Session 隔离机制

### 6.1 工作原理

```
Session A                         Session B
    │                                 │
    ▼                                 ▼
createTeam("verify-A")              (新会话)
    │                                 │
    ▼                                 ▼
registerTeamForSessionCleanup()       │
    │                                 ▼
    │                             createTeam("verify-B")
    │                                 │
    ▼                                 ▼
SIGINT/SIGTERM                   registerTeamForSessionCleanup()
    │                                 │
    ▼                                 ▼
cleanupSessionTeams()              SIGINT/SIGTERM
    │                                 │
    ▼                                 ▼
[teams/] = {verify-B}             cleanupSessionTeams()
                                        │
                                        ▼
                                   [teams/] = {}
```

### 6.2 清理触发条件

| 信号 | 说明 |
|------|------|
| SIGINT | Ctrl+C |
| SIGTERM | 进程终止 |
| SIGHUP | 终端关闭 |

---

## 七、使用场景

### 7.1 股票分析

```
/swarm 000001.SZ 平安银行 basic
```

启动 researcher + analyst + summarizer 三个 Agent 协同分析。

### 7.2 研究任务

```
team_create(name="research-team", description="Deep research")
swarm_agent_spawn(team_name="research-team", agent_name="web-searcher", ...)
swarm_agent_spawn(team_name="research-team", agent_name="data-analyzer", ...)
```

### 7.3 代码审查

```
team_create(name="code-review-team")
swarm_agent_spawn(team_name="code-review-team", agent_name="linter", ...)
swarm_agent_spawn(team_name="code-review-team", agent_name="tester", ...)
```

---

## 八、最佳实践

### 8.1 团队命名

```
stock-analysis-{symbol}    # 股票分析
research-{task-id}         # 研究任务
review-{pr-number}         # 代码审查
```

### 8.2 Agent 角色定义

| 角色 | 职责 |
|------|------|
| coordinator | 协调者，分配任务 |
| researcher | 研究员，收集信息 |
| analyst | 分析师，处理数据 |
| summarizer | 总结者，生成报告 |

### 8.3 消息传递

- 使用 `swarm_agent_message` 进行 Agent 间通信
- 消息会被存储在内存中，可通过 `swarm_agent_results` 获取

---

## 九、文件结构

```
src/multi-agent/
├── index.ts                    # 入口导出
├── coordinator.ts              # Swarm 协调器
├── team-manager.ts             # 团队管理器
├── session-cleanup.ts         # Session 清理
├── types.ts                    # 类型定义
├── event-bus.ts               # 事件总线
├── agent-registry.ts          # Agent 注册表
├── agent-factory.ts           # Agent 工厂
├── agent-loader.ts            # Markdown Agent 加载器
├── monitor.ts                  # 监控
├── scheduler.ts               # 调度器
│
├── backends/
│   ├── index.ts               # 后端注册表
│   ├── initialize.ts           # 后端初始化
│   ├── health-check.ts        # 健康检查
│   ├── inprocess.ts          # 进程内后端
│   ├── tmux.ts               # Tmux 后端
│   └── iterm2.ts             # iTerm2 后端
│
└── tools/
    ├── swarm-tools.ts         # Swarm 工具
    └── specialized-skills.ts  # 专业技能

src/skills/
└── swarm-analysis/
    └── SKILL.md              # Swarm 分析 Skill
```

---

## 十、故障排除

### 10.1 Agent 无法 Spawn

```bash
# 检查 Backend 健康状态
./dist/upup doctor

# 检查 teams 目录
ls ~/.upup/teams/
```

### 10.2 Session 隔离不工作

```bash
# 清理所有 teams
rm -rf ~/.upup/teams/*

# 重新测试
./dist/upup --stdio
```

### 10.3 iTerm2 Backend 不可用

```bash
# 检查 iTerm2 是否运行
ps aux | grep iTerm

# 检查 AppleScript 权限
osascript -e 'return "OK"'
```

---

## 十一、相关文档

- `plan39.md` - Session 隔离架构改造
- `src/skills/swarm-analysis/SKILL.md` - Swarm Skill 定义
- `src/multi-agent/coordinator.ts` - 协调器实现
- `src/multi-agent/team-manager.ts` - 团队管理器实现

---

**版本**: 1.0
**创建时间**: 2026-05-24 20:35 GMT+8
**状态**: 📋 分析完成
