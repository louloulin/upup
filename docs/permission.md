# Permission System

> Multi-layer permission architecture for safe operation

## Overview

UpUp implements a comprehensive permission system inspired by Claude Code, providing multiple layers of protection:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Permission System Layers                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 1: Session Mode                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • default      → Standard approval for sensitive tools       │   │
│  │  • .accept-all  → Accept all prompts                        │   │
│  │  • bypass       → Bypass all permission checks              │   │
│  │  • dangerously  → Allow dangerous operations               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  Layer 2: Tool Permissions                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • bypass  → Always allow                                 │   │
│  │  • ask     → Require user approval                       │   │
│  │  • deny    → Always block                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  Layer 3: Command Classification                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Bash commands classified by type:                          │   │
│  │  • read      → cat, grep, find (bypass)                  │   │
│  │  • write     → mkdir, rm, cp (ask)                       │   │
│  │  • dangerous → sudo, chmod (deny)                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Permission Modes

### Session Modes

```typescript
type PermissionMode =
  | 'default'           // Standard permission check
  | '.accept-all'       // Accept all prompts without asking
  | 'bypassPermissions' // Bypass all permission checks
  | 'dangerously';      // Allow dangerous operations
```

### Tool Modes

```typescript
type ToolPermissionMode =
  | 'bypass'  // Always allow
  | 'ask'     // Require user approval
  | 'deny';   // Always block
```

### Bash Command Classification

```typescript
type CommandClassification =
  | 'read'     // Read-only commands
  | 'write'    // Write/modify commands
  | 'dangerous' // Dangerous commands
  | 'unknown'; // Unclassified
```

---

## Built-in Rules

### Automatic Bypass (No Approval Required)

| Category | Commands |
|----------|----------|
| **Navigation** | `pwd`, `cd`, `ls`, `ll`, `la` |
| **Reading** | `cat`, `head`, `tail`, `less`, `more` |
| **Search** | `grep`, `find`, `which`, `wc`, `diff` |
| **Git (read)** | `git status`, `git log`, `git diff`, `git show` |
| **Info** | `echo`, `date`, `whoami`, `hostname` |

### Require Approval (Ask)

| Category | Commands |
|----------|----------|
| **Write** | `mkdir`, `touch`, `rm`, `cp`, `mv` |
| **Edit** | `sed`, `awk`, `tee` |
| **Git (write)** | `git commit`, `git push`, `git merge` |
| **Install** | `npm install`, `pip install`, `apt-get` |

### Always Deny

| Category | Commands |
|----------|----------|
| **System** | `sudo`, `su`, `chmod 777`, `chmod 000` |
| **Network** | `curl` with sensitive headers |
| **Dangerous** | `rm -rf /`, `mkfs`, `:(){:\|:&};:` |

---

## Configuration

### settings.json

```json
{
  "permissions": {
    "mode": "default",
    "dangerouslyAllow": false,
    "bypassRules": [
      "Bash(pwd)",
      "Bash(echo *)",
      "Bash(cat *)",
      "Read(*.md)",
      "Read(*.json)"
    ],
    "denyRules": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)",
      "Bash(rm -rf /*)"
    ]
  }
}
```

### Environment Variables

```bash
# Enable dangerous mode
UPUP_DANGEROUSLY_MODE=true

# Default permission mode
UPUP_PERMISSION_MODE=default

# Auto-approve timeout (seconds)
UPUP_APPROVAL_TIMEOUT=60
```

---

## Implementation

### Tool Executor

```typescript
// src/agent/tool-executor.ts
class ToolExecutor {
  async executeTool(tool: string, args: Record<string, unknown>) {
    // 1. Check if tool requires approval
    if (this.requiresApproval(tool)) {
      // 2. Check session approval
      if (!this.sessionApprovedTools.has(tool)) {
        // 3. Request approval
        const decision = await this.requestApproval(tool, args);
        if (decision === 'deny') {
          throw new PermissionDeniedError(tool);
        }
        if (decision === 'allow-session') {
          this.sessionApprovedTools.add(tool);
        }
      }
    }

    // 4. Execute tool
    return this.execute(tool, args);
  }
}
```

### Bash Permission Check

```typescript
// src/tools/bash/permission-mode.ts
function classifyCommand(command: string): CommandClassification {
  const readCommands = ['pwd', 'cd', 'ls', 'cat', 'grep', 'find'];
  const writeCommands = ['mkdir', 'touch', 'rm', 'cp', 'mv'];
  const dangerousCommands = ['sudo', 'chmod 777', 'rm -rf'];

  // Classification logic...
}
```

---

## Approval Flow

### Approval Options

```
┌─────────────────────────────────────────┐
│       Authorization Required              │
├─────────────────────────────────────────┤
│                                         │
│  Tool: write_file                       │
│  Args: { path: "test.txt" }            │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ [1] Allow once                   │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ [2] Allow for this session      │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ [3] Deny                         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ↑↓ Navigate  Enter Select  Esc Deny    │
└─────────────────────────────────────────┘
```

### Timeout Handling

- **Default timeout**: 60 seconds
- **On timeout**: Automatically deny
- **Visual indicator**: Countdown timer

---

## Session Approval

### Persistent Approvals

Approvals can be persisted for the session:

```typescript
// When user selects "Allow for this session"
sessionApprovedTools.add(tool);
sessionTracker.approveToolSync(tool); // Persist to disk
```

### Approval Recovery

On session resume:

```typescript
// Restore approved tools from SessionTracker
const tracker = getSessionTracker();
await tracker.startSession(sessionId);

for (const tool of TOOLS_REQUIRING_APPROVAL) {
  if (tracker.isToolApproved(tool)) {
    this.sessionApprovedTools.add(tool);
  }
}
```

---

## Hook Integration

### Permission Hooks

```typescript
// src/hooks/permission-hooks.ts
class PermissionHooks {
  requiresPermission(toolName: string): boolean {
    return ['write_file', 'edit_file', 'bash', 'delete_file'].includes(toolName);
  }

  async checkPermission(tool: string, args: unknown): Promise<PermissionDecision> {
    // Custom permission logic
  }
}
```

---

## Debugging

### Enable Permission Debugging

```bash
DEBUG=permissions bun start
```

### Log Output

```
[permissions] Tool 'write_file' requires approval
[permissions] User approved 'write_file' for session
[permissions] Tool 'bash' classified as 'write'
[permissions] Command 'rm -rf /' blocked by deny rule
```

---

## Related Documents

- [Architecture](architecture.md)
- [Session Management](session.md)
- [Tools](tools.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
