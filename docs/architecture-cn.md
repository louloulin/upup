# UpUp 系统架构

> 系统架构与设计决策

## 概述

UpUp 是一个深度金融研究 AI 智能体，采用模块化架构：

- **Dexter**: 金融研究框架、工具系统
- **Claude Code**: 权限管理、会话状态、TUI 设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UpUp 系统架构                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │    CLI      │     │    TUI      │     │  Bundled    │           │
│  │   入口      │────▶│   渲染      │────▶│   Runner    │           │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         └────────────────────┴────────────────────┘                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Agent 核心                                │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │ Capability │  │  Session   │  │   Skill    │            │   │
│  │  │  Registry │  │   State    │  │  Executor  │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │   Hook     │  │  Message   │  │   Tool     │            │   │
│  │  │  System    │  │   Queue    │  │  Executor  │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   工具      │      │   技能      │      │   组件      │     │
│  │   (64+)     │      │   (25+)     │      │   (16)      │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      包模块                                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │   llm   │  │ memory  │  │   sdk   │  │ plugins │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. Agent 核心 (`src/agent/`)

Agent 核心处理 LLM 交互和工具编排。

```
agent/
├── agent.ts              # 主循环
├── capability-registry.ts # 工具/技能注册
├── fallback-handler.ts   # 错误处理
├── tool-executor.ts      # 工具执行
└── types.ts             # 类型定义
```

### 2. 会话管理 (`src/session/`)

会话管理提供状态持久化和恢复。

```
session/
├── session-state.ts      # 会话状态
├── session-tracker.ts   # 状态跟踪器
├── storage.ts          # 持久化
└── render/             # 消息渲染
```

### 3. TUI 组件 (`src/components/`)

TUI 组件提供终端用户界面。

```
components/
├── chat-log.ts         # 聊天历史
├── tool-event.ts       # 工具显示
├── approval.ts         # 授权UI
├── status-bar.ts       # 状态显示
└── editor.ts          # 输入编辑器
```

### 4. 工具系统 (`src/tools/`)

工具系统通过 64+ 内置工具提供能力。

```
tools/
├── bash/               # Bash 命令执行
├── filesystem/          # 文件操作
├── financial/          # 金融数据工具
├── web/                # 网页抓取
├── search/             # 搜索工具
└── types.ts            # 工具定义
```

**工具分类:**

| 类别 | 数量 | 示例 |
|------|------|------|
| Bash | 1 | `Bash` |
| 文件系统 | 8 | `Read`, `Write`, `Edit`, `Grep` |
| 金融 | 20+ | `StockData`, `FinancialReport` |
| 网页 | 5 | `WebFetch`, `WebSearch` |
| 开发 | 15+ | `Git`, `CodeSearch` |

### 5. 技能系统 (`src/skills/`)

技能提供领域特定能力。

```
skills/
├── skill-registry.ts    # 技能加载器
├── skill-executor.ts    # 技能执行器
└── built-in/           # 内置技能
    ├── medfish/        # 医疗器械/医药
    ├── technical/      # 技术分析
    ├── backtest/       # 回测
    └── risk/           # 风险管理
```

### 6. 钩子系统 (`src/hooks/`)

钩子通过生命周期事件提供扩展性。

```
hooks/
├── agent-hooks.ts      # Agent 生命周期
├── tool-hooks.ts       # 工具执行
├── permission-hooks.ts  # 权限检查
└── rate-limiter.ts     # 速率限制
```

### 7. 插件系统 (`src/plugins/`)

插件提供运行时扩展性。

```
plugins/
├── plugin-loader.ts    # 插件发现
├── plugin-runtime.ts   # 运行时执行
└── sandbox/          # 沙箱
```

---

## 数据流

### 请求流程

```
用户输入
    │
    ▼
CLI (cli.ts)
    │
    ▼
Agent (agent.ts)
    │
    ├──▶ CapabilityRegistry ──▶ ToolExecutor ──▶ 工具
    │
    ├──▶ SkillRegistry ──▶ SkillExecutor ──▶ 技能
    │
    ▼
ToolExecutor
    │
    ├──▶ 权限检查 (hooks)
    │
    ├──▶ 速率限制
    │
    ▼
工具执行
    │
    ▼
结果处理
    │
    ▼
TUI 渲染
    │
    ▼
用户显示
```

### 授权流程

```
工具请求
    │
    ▼
requiresApproval() 检查
    │
    ▼
requestToolApproval()
    │
    ├──▶ 加入 approvalQueue
    │
    ▼
发送 tool_approval 事件
    │
    ▼
TUI 显示授权对话框
    │
    ▼
用户决策
    │
    ├──▶ allow-once
    ├──▶ allow-session ──▶ sessionApprovedTools
    └──▶ deny
    │
    ▼
处理队列中的下一个
```

---

## 会话状态

### 状态结构

```typescript
interface SessionState {
  id: string;
  messages: Message[];
  approvedTools: string[];
  deniedTools: string[];
  toolCallCounts: Record<string, number>;
  totalTokens: number;
  lastUpdated: number;
}
```

### 持久化

- **位置**: `.upup/sessions/`
- **格式**: 每个会话的 JSON 文件
- **恢复**: 完整对话 + 工具结果

---

## 相关文档

- [权限系统](permission-cn.md)
- [技能系统](skills-cn.md)
- [插件系统](plugins-cn.md)
- [会话管理](session-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
