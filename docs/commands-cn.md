# 命令系统

> 斜线命令和 CLI 接口

## 概述

UpUp 实现了命令系统，提供斜线命令（如 `/help`、`/config`）和各种操作的 CLI 接口。

```
┌─────────────────────────────────────────────────────────────────────┐
│                       命令系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    命令注册表                                  │    │
│  │                                                              │    │
│  │  • 命令注册                                               │    │
│  │  • 权限管理                                               │    │
│  │  • 宏展开                                                 │    │
│  │  • UI 上下文                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   内置      │      │   配置      │      │    MCP      │     │
│  │   命令      │      │   命令      │      │   命令      │     │
│  │             │      │             │      │             │     │
│  │ • /help    │      │ • /config  │      │ • /mcp      │     │
│  │ • /doctor  │      │ • /doctor  │      │             │     │
│  │ • /sandbox │      │ • /plugin  │      │             │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 内置命令

### /help

显示帮助信息：

```
/help [命令]
```

### /doctor

运行系统诊断：

```
/doctor
```

### /config

配置管理：

```
/config get <key>
/config set <key> <value>
/config list
```

### /plugin

插件管理：

```
/plugin list
/plugin enable <name>
/plugin disable <name>
```

### /mcp

MCP 服务器管理：

```
/mcp list
/mcp connect <server>
/mcp disconnect <server>
```

### /sandbox

沙箱模式测试：

```
/sandbox enable
/sandbox disable
```

---

## 命令接口

```typescript
interface Command {
  name: string;              // 命令名称
  description?: string;      // 帮助描述
  usage?: string;           // 使用语法
  permission?: CommandPermission;
  execute(args: string[], ctx: CommandContext): Promise<CommandResult>;
}

interface CommandContext {
  sessionId: string;
  cwd: string;
  ui?: UIContext;
}

interface CommandResult {
  type: 'output' | 'error';
  text?: string;
  exitCode?: number;
}
```

---

## 命令注册表

### 注册命令

```typescript
import { getGlobalRegistry } from '@upup/commands';

const registry = getGlobalRegistry();

registry.register({
  name: 'my-command',
  description: '我的自定义命令',
  usage: '/my-command <参数>',
  permission: 'read',
  async execute(args, ctx) {
    return {
      type: 'output',
      text: `正在执行: ${args.join(' ')}`,
    };
  },
});
```

### 匹配命令

```typescript
import { matchCommands } from '@upup/commands';

// 从输入匹配命令
const command = matchCommands(input);
if (command) {
  console.log('已匹配:', command.name);
  console.log('参数:', command.args);
}
```

---

## 宏系统

宏允许定义可重用的命令序列：

```typescript
import { loadMacros, expandMacro } from '@upup/commands';

// 从文件加载宏
const macros = loadMacros('~/.upup/macros.json');

// 展开宏
const expanded = expandMacro(macros, 'deploy', { env: 'prod' });
console.log(expanded); // ['npm run build', 'npm run test', './deploy.sh prod']
```

### 宏定义

```json
{
  "deploy": {
    "steps": [
      "npm run build",
      "npm run test",
      "./deploy.sh {{env}}"
    ]
  },
  "analyze": {
    "steps": [
      "/plugin load medfish",
      "分析 {{target}}",
      "/plugin unload medfish"
    ]
  }
}
```

---

## 权限

命令可以要求权限：

```typescript
type CommandPermission = 'read' | 'write' | 'dangerous';
```

### 权限级别

| 级别 | 描述 |
|------|------|
| `read` | 只读操作 |
| `write` | 文件系统修改 |
| `dangerous` | 系统级操作 |

---

## UI 上下文

命令可以与 TUI 交互：

```typescript
interface UIContext {
  showMessage(text: string, type: 'info' | 'error' | 'success'): void;
  showProgress(message: string): void;
  hideProgress(): void;
  requestInput(prompt: string): Promise<string>;
}
```

---

## 引导命令

首次设置向导：

```typescript
import { runOnboarding } from './onboarding.ts';

await runOnboarding();
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [插件系统](plugins-cn.md)
- [开发指南](development-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
