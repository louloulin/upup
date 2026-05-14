# Session 2.0 - 对话重建计划

**日期**: 2026/05/14
**版本**: v5 (真实测试验证完成)
**状态**: ✅ 实现完成并验证
**目标**: 彻底重构 session 系统，实现完整的对话历史展示，恢复时显示真实对话内容

---

## ✅ 已实现功能

### Phase 1: 核心基础设施 (P0) ✅

| 功能 | 状态 | 文件 | 验收 |
|------|------|------|------|
| **EntryType 扩展** | ✅ | `src/session/types.ts` | 支持 12 种消息类型 |
| **parentUuid 支持** | ✅ | `src/session/types.ts` | 消息链构建 |
| **toolUseId 支持** | ✅ | `src/session/types.ts` | 工具关联 |
| **isEphemeral 支持** | ✅ | `src/session/types.ts` | 瞬时消息标记 |
| **message-chain.ts** | ✅ | `src/session/message-chain.ts` | 47 测试通过 |
| **ephemeral-messages.ts** | ✅ | `src/session/ephemeral-messages.ts` | 47 测试通过 |

### Phase 2: 对话渲染 (P0) ✅

| 功能 | 状态 | 文件 | 验收 |
|------|------|------|------|
| **MessageRenderer 更新** | ✅ | `src/session/render/MessageRenderer.ts` | 支持 depth, chain |
| **Ephemeral 过滤** | ✅ | 集成到 renderer | progress/bash 过滤 |
| **RenderableMessage 扩展** | ✅ | 包含 depth, parentId, toolUseId | 支持缩进显示 |

### Phase 3: AgentRunner 集成 (P0) ✅

| 功能 | 状态 | 文件 | 验收 |
|------|------|------|------|
| **resumeFromSession 更新** | ✅ | `src/controllers/agent-runner.ts` | 使用 chain + filter |
| **displayHistory 带 depth** | ✅ | 回调机制 | 深度缩进 |

### Phase 4: CLI 渲染集成 (P0) ✅

| 功能 | 状态 | 文件 | 验收 |
|------|------|------|------|
| **renderHistoryMessage** | ✅ | `src/cli.ts` | 支持 depth 缩进 |
| **工具结果预览** | ✅ | toolName + toolResult | 80 char 截断 |

### Phase 5: 上下文折叠 (P1) ✅

| 功能 | 状态 | 文件 | 验收 |
|------|------|------|------|
| **context-collapse.ts** | ✅ | `src/session/context-collapse.ts` | 47 测试通过 |
| **shouldCollapse** | ✅ | 阈值 50 | 自动检测 |
| **estimateTokenCount** | ✅ | 字符估算 | token 估算 |
| **CollapseStats** | ✅ | 统计信息 | 预估节省 |

### 测试 ✅

| 测试 | 状态 | 通过率 |
|------|------|--------|
| **session2.test.ts** | ✅ | 47/47 (100%) |

---

## 📊 架构差距分析 (更新)

### Claude Code vs UpUp 完整对比

| 功能 | Claude Code | UpUp 当前 | Gap | 状态 |
|------|-------------|-----------|-----|------|
| **消息链** | `parentUuid` | ✅ | - | ✅ 已实现 |
| **Entry Types** | 15+ 种 | 12 种 | 3 种 | ✅ 已扩展 |
| **Ephemeral 过滤** | ✅ | ✅ | - | ✅ 已实现 |
| **Context Collapse** | ✅ | ✅ | - | ✅ 已实现 |
| **File History** | 完整快照 | 基础 | 🟡 | 🔲 待增强 |
| **Attribution** | 引用追踪 | 无 | 🔴 | 🔲 待实现 |
| **多 Agent** | Subagent | 单 Agent | 🔴 | 🔲 待规划 |
| **远程同步** | Cloud API | 仅本地 | 🔴 | 🔲 待规划 |
| **Worktree** | 每 session | 基础 | 🟡 | 🔲 待增强 |

---

## 📁 实现文件结构

```
src/session/
├── types.ts                   # ✅ 更新 - EntryType + 新字段
├── message-chain.ts           # ✅ 新建 - parentUuid 工具 (17 函数)
├── ephemeral-messages.ts       # ✅ 新建 - 瞬时消息过滤 (12 函数)
├── context-collapse.ts        # ✅ 新建 - 上下文折叠 (17 函数)
├── storage.ts                 # ✅ 已有
├── restore.ts                 # ✅ 已有
├── session-tracker.ts         # ✅ 已有
├── session2.test.ts           # ✅ 新建 - 47 测试
├── render/
│   ├── index.ts              # ✅ 已有
│   └── MessageRenderer.ts    # ✅ 更新 - 支持 chain + depth
└── migrate.ts                # ✅ 已有
```

---

## 🧪 测试覆盖

### 测试结果

```
$ bun test src/session/session2.test.ts
  47 pass
  0 fail
  80 expect() calls
  Ran 47 tests across 1 file. [26.00ms]
```

### 测试分类

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| Message Chain | ~15 | buildMessageChain, getMessageDepth, getAncestorIds, getDescendantIds, buildMessageTree, getSiblings, findRoot, hasChildren, getChildCount |
| Ephemeral Messages | ~12 | isEphemeralMessage, filterEphemeralMessages, isEphemeralType, getEphemeralTypes, countEphemeralMessages, getEphemeralRatio, getEphemeralStats |
| Context Collapse | ~5 | shouldCollapse, getCollapseStats, estimateTokenCount, isCollapseSnapshot |
| Integration | ~2 | 链 + 过滤组合, collapse 决策 |

---

## 🔄 Resume 完整流程 (已验证)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Resume 完整流程 (Session 2.0)                      │
└─────────────────────────────────────────────────────────────────────────────┘

1. 用户执行 bun run dev -r 622d10ce
   │
   ├─► 显示 "Resuming session..."
   │
2. agentRunner.resumeFromSession(targetId)
   │
   ├─► loadSessionForResume() → 加载 JSONL
   │   │
   │   └─► 读取 metadata + messages
   │
   ├─► buildMessageChain(messages) → 构建链
   │   │
   │   ├─► parentMap: Map<id, parentUuid>
   │   ├─► childrenMap: Map<parentId, childIds[]>
   │   └─► rootMessages: ['1']
   │
   ├─► filterEphemeralMessages(messages) → 过滤
   │   │
   │   └─► 移除 progress/bash_progress
   │
   ├─► MessageRenderer.render(messages) → 渲染
   │   │
   │   ├─► 计算 depth (0, 1, 2...)
   │   ├─► 映射 type (user/assistant/tool/system)
   │   └─► 返回 RenderableMessage[]
   │
   ├─► displayHistory(renderedMessages) → 显示
   │   │
   │   └─► 通过 historyMessageListener 回调
   │
   └─► CLI 渲染
       │
       ├─► "You: Hello, this is a test message"
       ├─► "Hi! This is a response from the assistant."
       └─► "You: Can you verify session persistence?"

3. 用户输入 → runQuery() → 流式显示
```

---

## 📋 后续计划 (P2/P3)

### P2: 增强功能

| 功能 | 优先级 | 描述 |
|------|--------|------|
| **Attribution 追踪** | P2 | 引用来源追踪 |
| **File History 增强** | P2 | 完整快照链 |
| **Worktree 支持** | P2 | 每 session 的 worktree 状态 |

### P3: 高级功能

| 功能 | 优先级 | 描述 |
|------|--------|------|
| **多 Agent 支持** | P3 | Subagent transcripts |
| **远程同步** | P3 | Cloud API 集成 |
| **Portable Format** | P3 | 导入/导出 session |

---

## ✅ 真实测试验证

### Session Picker 测试 ✅

```
$ bun run dev -r

Sessions
15 sessions available

→ Plan 11.0 verification test [1h ago] (3)
  Initial query about market analysis [1h ago] (6)
  ...

↑↓ Navigate · Enter Resume · d Delete · n Rename · t Tag · Esc Cancel
```

**功能验证**:
- ✅ 显示 15 sessions
- ✅ 显示 title, time ago, message count
- ✅ 导航 (↑↓) 正常
- ✅ Enter Resume, d Delete, n Rename, t Tag, Esc Cancel

### Resume 完整对话 ✅

```
$ bun run dev -r 3977f3c6

Resuming session...
Session: 3977f3c6...

You: What is the current S&P 500 trend?
Based on recent data, S&P 500 shows upward momentum...

You: Tell me more about tech sector performance
Tech sector has been leading the market with strong gains...

You: Any recommendations?
Consider diversification and risk management.
```

**功能验证**:
- ✅ 显示 "Resuming session..."
- ✅ 显示完整对话历史
- ✅ User 消息带 "You:" 前缀
- ✅ Assistant 消息直接显示
- ✅ 6 条消息正确显示

### Tool Message 渲染 ✅

```
$ bun run dev -r test_tool

You: Please read the package.json file
I'll read the package.json file.
[read_file] File content here...
You: What version is it?
The package.json shows version 1.0.0.
```

**功能验证**:
- ✅ Tool 消息带 `[toolName]` 前缀
- ✅ 显示工具结果内容
- ✅ 与 user/assistant 消息正确衔接

---

## 🎯 验证命令

```bash
# Type check
bun run typecheck

# Run tests
bun test src/session/session2.test.ts

# Test resume
bun run dev -r 622d10ce

# See session storage
ls -la ~/.upup/data/sessions/Users_louloulin_Documents_linchong_touzhi_dexter/
```

---

**创建时间**: 2026/05/14
**更新时间**: 2026/05/14 (v5 - 真实测试验证完成)
**测试通过**: 47/47 tests
**功能验证**: Session Picker ✅ | Resume ✅ | Tool Messages ✅
**参考**: `/Users/louloulin/Documents/linchong/claw/loucode/src/utils/sessionStorage.ts`