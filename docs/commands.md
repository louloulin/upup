# Commands System

> Slash commands and CLI interface

## Overview

UpUp implements a command system that provides slash commands (e.g., `/help`, `/config`) and CLI interfaces for various operations.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Commands Architecture                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Command Registry                          │    │
│  │                                                              │    │
│  │  • Command registration                                     │    │
│  │  • Permission management                                   │    │
│  │  • Macro expansion                                        │    │
│  │  • UI context                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Built-in  │      │   Config   │      │    MCP      │     │
│  │   Commands  │      │   Commands │      │  Commands   │     │
│  │             │      │             │      │             │     │
│  │ • /help    │      │ • /config  │      │ • /mcp      │     │
│  │ • /doctor  │      │ • /doctor  │      │             │     │
│  │ • /sandbox │      │ • /plugin  │      │             │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Built-in Commands

### /help

Display help information:

```
/help [command]
```

### /doctor

Run system diagnostics:

```
/doctor
```

### /config

Configuration management:

```
/config get <key>
/config set <key> <value>
/config list
```

### /plugin

Plugin management:

```
/plugin list
/plugin enable <name>
/plugin disable <name>
```

### /mcp

MCP server management:

```
/mcp list
/mcp connect <server>
/mcp disconnect <server>
```

### /sandbox

Sandbox mode for testing:

```
/sandbox enable
/sandbox disable
```

---

## Command Interface

```typescript
interface Command {
  name: string;              // Command name
  description?: string;      // Help description
  usage?: string;            // Usage syntax
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

## Command Registry

### Registering Commands

```typescript
import { getGlobalRegistry } from '@upup/commands';

const registry = getGlobalRegistry();

registry.register({
  name: 'my-command',
  description: 'My custom command',
  usage: '/my-command <arg>',
  permission: 'read',
  async execute(args, ctx) {
    return {
      type: 'output',
      text: `Executing: ${args.join(' ')}`,
    };
  },
});
```

### Matching Commands

```typescript
import { matchCommands } from '@upup/commands';

// Match command from input
const command = matchCommands(input);
if (command) {
  console.log('Matched:', command.name);
  console.log('Args:', command.args);
}
```

---

## Macro System

Macros allow defining reusable command sequences:

```typescript
import { loadMacros, expandMacro } from '@upup/commands';

// Load macros from file
const macros = loadMacros('~/.upup/macros.json');

// Expand macro
const expanded = expandMacro(macros, 'deploy', { env: 'prod' });
console.log(expanded); // ['npm run build', 'npm run test', './deploy.sh prod']
```

### Macro Definition

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
      "Analyze {{target}}",
      "/plugin unload medfish"
    ]
  }
}
```

---

## Permissions

Commands can require permissions:

```typescript
type CommandPermission = 'read' | 'write' | 'dangerous';
```

### Permission Levels

| Level | Description |
|-------|-------------|
| `read` | Read-only operations |
| `write` | File system modifications |
| `dangerous` | System-level operations |

---

## UI Context

Commands can interact with the TUI:

```typescript
interface UIContext {
  showMessage(text: string, type: 'info' | 'error' | 'success'): void;
  showProgress(message: string): void;
  hideProgress(): void;
  requestInput(prompt: string): Promise<string>;
}
```

---

## Onboarding Commands

First-time setup wizard:

```typescript
import { runOnboarding } from './onboarding.ts';

await runOnboarding();
```

---

## Related Documents

- [Architecture](architecture.md)
- [Plugin System](plugins.md)
- [Development Guide](development.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
