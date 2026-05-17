# Plan 19: Commands/Skills 系统剩余改进 - React HelpV2 + 命令扩展

**Date**: 2026-05-17
**Status**: Analysis Complete - Ready for Implementation
**Target**: 投资助手 Dexter Command System v5
**Reference**: `/Users/louloulin/Documents/linchong/claw/loucode`

---

## Executive Summary

在 plan18 完成基础架构改造后，对比 Claude Code (loucode) 仍存在以下差距：

| 指标 | Dexter | loucode | 差距 |
|------|--------|---------|------|
| 命令数量 | 17 个 | 115 个 | 6.8x |
| Help 组件 | 纯文本 | React HelpV2 | UX 差距 |
| CLI switch/case | ~300 行 | 0 行 | 遗留问题 |
| 命令目录 | 16 个 | 98 个 | 6x |
| isHidden 支持 | 无 | 有 | 功能缺失 |
| immediate 支持 | 无 | 有 | 功能缺失 |

---

## 1. 差距分析

### 1.1 Help UI 差距

#### loucode HelpV2 组件

```tsx
// loucode/src/commands/help/help.tsx
import * as React from 'react';
import { HelpV2 } from '../../components/HelpV2/HelpV2.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

export const call: LocalJSXCommandCall = async (
  onDone,
  { options: { commands } }
) => {
  return <HelpV2 commands={commands} onClose={onDone} />;
};
```

**特点**:
- React 组件，支持交互式搜索
- 命令分类清晰，支持展开详情
- 键盘导航支持

#### Dexter 当前 Help (纯文本)

```typescript
// packages/commands/src/commands/help/help-impl.ts
return { type: 'text', value: lines.join('\n') }
```

**问题**: 纯文本输出，用户体验差

### 1.2 命令数量差距

| 类别 | loucode 命令 | Dexter 命令 | 缺失 |
|------|-------------|-------------|------|
| Git | branch, commit, diff | git (1个) | branch, commit, diff 独立命令 |
| Agent | agent, fork, tasks | agent (1个) | fork, tasks 独立命令 |
| MCP | mcp, mcp-add, mcp-start | mcp (1个) | mcp-add, mcp-start |
| Session | session, resume, continue | session (1个) | resume, continue |
| Config | config, theme, keybindings | theme (1个) | config, keybindings |
| 文件 | files, copy, add-dir | - | 缺失整个类别 |
| Debug | debug-tool-call, heapdump | - | 缺失整个类别 |
| DevEx | doctor, extra-usage, usage | doctor, cost | extra-usage, usage |

**总计**: 缺失 ~98 个命令

### 1.3 CLI switch/case 遗留问题

```typescript
// src/cli.ts ~300 行 switch/case
const handleSlashCommand = async (commandName: string, commandArgs: string = '') => {
  switch (commandName) {
    case 'model': modelSelection.startSelection(); break;
    case 'status': { /* 80 行实现 */ }
    case 'cost': { /* 60 行实现 */ }
    // ...
  }
}
```

**问题**: 
- 命令实现在 CLI 中，与 registry 不同步
- 维护困难，容易遗漏
- 无法利用新命令系统的懒加载

### 1.4 命令类型功能缺失

#### isHidden 支持

```typescript
// loucode/src/commands/cost/index.ts
const cost = {
  type: 'local',
  name: 'cost',
  get isHidden() {
    return isClaudeAISubscriber()  // 动态判断
  },
  supportsNonInteractive: true,
  load: () => import('./cost.js'),
} satisfies Command
```

#### immediate 支持

```typescript
// loucode/src/commands/status/index.ts
const status = {
  type: 'local-jsx',
  name: 'status',
  immediate: true,  // 不等待模型完成
  load: () => import('./status.js'),
} satisfies Command
```

---

## 2. 实施计划

### Phase 1: 实现 HelpV2 React 组件 (Day 1)

**目标**: 替换纯文本 Help 为交互式 React 组件

```
packages/commands/src/
├── commands/help/
│   ├── index.ts           # 改为 'local-jsx' 类型
│   └── help.tsx           # HelpV2 React 组件 (新建)
```

#### HelpV2 组件设计

```tsx
// packages/commands/src/commands/help/help.tsx
import * as React from 'react'

interface HelpV2Props {
  commands: Command[]
  onClose: () => void
}

export const HelpV2: React.FC<HelpV2Props> = ({ commands, onClose }) => {
  const [search, setSearch] = React.useState('')
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  const filteredCommands = commands.filter(
    cmd => cmd.name.includes(search) || cmd.description.includes(search)
  )

  // 渲染分类列表
  // 支持键盘导航
  // 显示命令别名
  // 显示命令来源 (builtin/plugin/skill)

  return (
    <div className="help-v2">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search commands..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {/* Command list grouped by category */}
      {/* Keyboard shortcuts */}
    </div>
  )
}
```

### Phase 2: 扩展命令到 40 个 (Day 2-3)

**目标**: 添加高频缺失命令

#### Git 命令拆分

```typescript
// packages/commands/src/commands/branch/index.ts
// packages/commands/src/commands/commit/index.ts
// packages/commands/src/commands/diff/index.ts
```

#### Agent 命令拆分

```typescript
// packages/commands/src/commands/fork/index.ts
// packages/commands/src/commands/tasks/index.ts
```

#### MCP 命令拆分

```typescript
// packages/commands/src/commands/mcp-add/index.ts
// packages/commands/src/commands/mcp-start/index.ts
```

### Phase 3: 集成 executeCommand 到 cli.ts (Day 4)

**目标**: 移除 CLI switch/case，使用新命令系统

```typescript
// src/cli.ts
import { executeCommand } from '@upup/commands'

const handleSlashCommand = async (name: string, args: string) => {
  const result = await executeCommand(name, args, {
    cwd: process.cwd(),
    sessionId: agentRunner.sessionId,
    model: modelSelection.model,
    addText: (text) => chatLog.addChild(new Text(text, 0, 0)),
    requestRender: () => tui.requestRender(),
  })

  // 统一处理结果
  switch (result.type) {
    case 'output':
      chatLog.addChild(new Text(result.text, 0, 0))
      break
    case 'clear':
      chatLog.clearAll()
      break
    // ...
  }

  tui.requestRender()
}
```

### Phase 4: 支持 isHidden 和 immediate (Day 5)

```typescript
// packages/commands/src/types/command-types.ts

interface LocalCommand {
  type: 'local'
  name: string
  description: string
  aliases?: string[]
  isHidden?: boolean | (() => boolean)
  immediate?: boolean
  supportsNonInteractive?: boolean
  load: () => Promise<LocalCommandModule>
}
```

---

## 3. 命令扩展清单

### 3.1 高优先级命令 (10个)

| 命令 | 类别 | 说明 |
|------|------|------|
| branch | git | 列出/创建分支 |
| commit | git | Git 提交 |
| diff | git | Git diff |
| fork | agent | 并行分支 |
| tasks | agent | 任务状态 |
| mcp-add | mcp | 添加 MCP 服务器 |
| resume | session | 恢复会话 |
| config | tools | 配置管理 |
| keybindings | system | 快捷键设置 |
| theme-list | system | 主题列表 |

### 3.2 中优先级命令 (20个)

| 命令 | 类别 | 说明 |
|------|------|------|
| log | git | Git 日志 |
| stash | git | Git stash |
| remote | git | Git remote |
| mcp-start | mcp | 启动 MCP 服务器 |
| mcp-stop | mcp | 停止 MCP 服务器 |
| agents | agent | 列出代理 |
| workflow | agent | 工作流 |
| session-list | session | 列出会话 |
| session-delete | session | 删除会话 |
| session-tag | session | 标记会话 |
| files | tools | 文件操作 |
| copy | tools | 复制文件 |
| add-dir | tools | 添加目录 |
| export | tools | 导出对话 |
| usage | system | 用量统计 |
| extra-usage | system | 额外用量 |
| effort | system | 估算工作量 |
| feedback | system | 反馈 |
| share | system | 分享 |
| version | system | 版本信息 |

### 3.3 低优先级命令 (50+ 个)

详见 loucode 命令列表，可后续按需实现。

---

## 4. 验证清单

- [ ] HelpV2 React 组件正常工作
- [ ] Help 支持搜索功能
- [ ] Help 支持键盘导航
- [ ] 命令数量达到 40 个
- [ ] CLI switch/case 移除
- [ ] isHidden 支持正常
- [ ] immediate 支持正常

---

## 5. Success Metrics

| 指标 | 当前 | Day 5 目标 | 状态 |
|------|------|------------|------|
| 命令数量 | 17 | 40 | 🟡 |
| Help UI | 纯文本 | React | 🔴 |
| CLI switch/case | ~300 行 | 0 行 | 🔴 |
| isHidden 支持 | 无 | 有 | 🔴 |
| immediate 支持 | 无 | 有 | 🔴 |

---

## 6. 文件变更计划

### 新增文件

| 文件 | 说明 |
|------|------|
| `commands/help/help.tsx` | HelpV2 React 组件 |
| `commands/branch/index.ts` | Branch 命令 |
| `commands/commit/index.ts` | Commit 命令 |
| `commands/diff/index.ts` | Diff 命令 |
| `commands/fork/index.ts` | Fork 命令 |
| `commands/tasks/index.ts` | Tasks 命令 |
| `commands/mcp-add/index.ts` | MCP Add 命令 |
| `commands/resume/index.ts` | Resume 命令 |
| `commands/config/index.ts` | Config 命令 |
| `commands/keybindings/index.ts` | Keybindings 命令 |

### 修改文件

| 文件 | 修改 |
|------|------|
| `commands/help/index.ts` | 改为 'local-jsx' 类型 |
| `src/cli.ts` | 移除 switch/case，使用 executeCommand |
| `packages/commands/src/types/command-types.ts` | 添加 isHidden, immediate |

### 删除文件

| 文件 | 原因 |
|------|------|
| `commands/help/help-impl.ts` | 替换为 help.tsx |

---

**Document Version**: 1.0 (Plan 19)
**Last Updated**: 2026-05-17 16:00
**Status**: Planning Phase Complete - Ready for Implementation
**Next Steps**: Implement Phase 1 (HelpV2 React component)