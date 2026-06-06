# Session, Plan & Permissions

> **UpUp runs commands on your behalf.** This page explains the safety mechanisms. Read it once. The default mode is `ask`, never `bypass`.

---

## Three Layers of Safety

```
┌─────────────────────────────────────────────┐
│ Layer 3: Session mode                        │
│   default | accept-all | bypassPermissions  │
│   | dangerously                              │
├─────────────────────────────────────────────┤
│ Layer 2: Tool mode (per tool)                │
│   bypass | allow | ask | deny                │
├─────────────────────────────────────────────┤
│ Layer 1: Static bypass rules                 │
│   (always allowed: cat, ls, git status …)    │
└─────────────────────────────────────────────┘
```

A tool call is executed only if it passes **all three** layers.

---

## Layer 1: Static Bypass Rules

These commands are always allowed (read-only, side-effect-free). Configured in `src/permissions/bypass-rules.ts`.

| Category | Commands |
|---|---|
| Basic | `pwd`, `echo`, `cd`, `ls`, `date`, `whoami` |
| Read | `cat`, `head`, `tail`, `grep`, `find`, `wc`, `sort`, `uniq` |
| Git (read) | `git status`, `git log`, `git diff`, `git show`, `git branch` |
| Bun | `bun --version`, `bun install` (with confirmation) |
| UpUp | `/help`, `/version`, `/skills`, `/model` (read-only slash commands) |

---

## Layer 2: Tool Mode

Each tool can be configured with a mode:

```ts
type ToolMode = 'bypass' | 'allow' | 'ask' | 'deny';
```

Default is `ask`. Set per-tool in `.upup/settings.json`:

```jsonc
{
  "permissions": {
    "tools": {
      "bash": "ask",
      "read": "allow",
      "web_fetch": "ask",
      "browser": "deny"
    }
  }
}
```

When a tool is in `ask` mode, UpUp shows a confirmation prompt before running it:

```
⚠ Permission Required
  Tool:    bash
  Command: rm -rf node_modules
  Args:    ["rm", "-rf", "node_modules"]
  
  Allow once?  [y/N/a(dd to allowlist)]
```

- `y` — run this one time
- `n` (default) — cancel
- `a` — add a permanent rule (e.g., `Bash(rm -rf node_modules)`)

---

## Layer 3: Session Mode

The session mode is the top-level "trust level" for the whole session:

| Mode | Behavior |
|---|---|
| `default` | Every `ask`-mode tool prompts for confirmation. **Default.** |
| `accept-all` | Skip prompts for the current session. Tool-mode still applies. |
| `bypassPermissions` | Skip all permission checks for the current session. |
| `dangerously` | Bypass + allow destructive tools. **Use only in sandbox.** |

### Switching session mode

```bash
# In TUI
/permissions default
/permissions accept-all
/permissions bypassPermissions

# At startup
bun start --accept-all
bun start --bypass

# Via env var (for scripting)
UPUP_PERMISSION_MODE=accept-all bun start
UPUP_DANGEROUSLY_MODE=true bun start
```

---

## Plan Mode

`/plan` enters a mode where the agent proposes before doing. Useful for complex / multi-step tasks.

```
> /plan

# Plan mode active. The agent will explore and propose before executing.

> /invest 600519.SH 2025Q3

[Plan mode] Generating plan…

Proposed plan:
  1. Detect intent (A-share deep-dive, 2025 Q3)
  2. Fetch financials from Tushare
  3. Fetch flow data from AKShare
  4. Read 巨潮 announcement
  5. Compute DCF with default assumptions
  6. Cross-validate with peer comparison
  7. Compose markdown report

Approve? [Y/n/edit]
```

- `Y` — execute the plan
- `n` — abort
- `edit` — open the plan in an editor for customization

---

## Hooks

For programmatic policy enforcement, UpUp supports Claude Code-style hooks:

```jsonc
// .upup/settings.json
{
  "hooks": {
    "pre-tool-use": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "echo 'About to run bash: $CMD' >> ~/.upup/audit.log" }
        ]
      }
    ],
    "post-tool-use": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "~/bin/notify" }] }
    ],
    "stop": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "~/bin/save-session" }] }
    ]
  }
}
```

Built-in hook types: `command` (shell script), `webhook` (POST), `memory` (write to `packages/memory`).

---

## Recommended `.upup/settings.json`

```jsonc
{
  "permissions": {
    "defaultMode": "ask",
    "tools": {
      "bash": "ask",
      "read": "allow",
      "edit": "ask",
      "write": "ask",
      "web_fetch": "ask",
      "web_search": "allow",
      "browser": "ask"
    },
    "allow": [
      "Bash(bun test:*)",
      "Bash(bun run typecheck)",
      "Bash(bun run build)",
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(git log:*)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(rm -rf /*)",
      "Bash(chmod 777 *)",
      "Bash(curl * | bash)",
      "Bash(eval *)"
    ],
    "dangerouslyAllow": false
  },
  "env": {
    "DEFAULT_MODEL": "deepseek-v4-flash"
  }
}
```

---

## Audit Trail

Every tool call is logged:

```jsonl
# ~/.upup/audit.jsonl
{"ts": "2026-05-15T08:32:11Z", "session": "abc", "tool": "bash", "args": ["ls"], "result": "ok", "duration_ms": 23}
{"ts": "2026-05-15T08:32:15Z", "session": "abc", "tool": "tushare.get_financials", "args": {"ticker": "600519.SH"}, "result": "ok", "duration_ms": 421, "user_approved": true}
{"ts": "2026-05-15T08:33:02Z", "session": "abc", "tool": "skill.dcf", "args": {"ticker": "600519.SH"}, "result": "ok", "duration_ms": 8421}
```

The audit log is signed (HMAC) for tamper-evidence. See `src/memory/audit-signing.ts`.

---

## Sandbox Mode

For running untrusted code (e.g., user-uploaded strategies), use `/sandbox`:

```
> /sandbox run "node user-strategy.js"

[sandbox] 256 MB memory cap
[sandbox] 30 second CPU cap
[sandbox] no network (use ctx.dataSources for data)
[sandbox] no filesystem (use ctx.dataSources for state)

Running…

Result: … (within limits)
```

`sandbox` is implemented via `bun --smol` + `worker_threads`. See `src/skills/bundled/sandbox.ts`.

---

## CLI Flags

```bash
bun start                          # default mode
bun start --accept-all             # accept-all for this session
bun start --bypass                 # bypass permissions for this session
bun start --dangerously            # dangerously mode
bun start --safe                   # read-only mode (deny all mutating tools)
bun start --model deepseek-v4-pro  # one-off model override
bun start --resume <session-id>    # resume previous
bun start --no-screenshots         # privacy: no browser screenshots
bun start --no-telemetry           # privacy: no LangSmith
```

---

## See Also

- [SECURITY.md → Permission System](../SECURITY.md#permission-system-defense-in-depth)
- [CONTRIBUTING.md → Coding Standards](../CONTRIBUTING.md#coding-standards)
- `src/session/` — session state
- `src/permissions/` — permission registry
- `src/hooks/` — hook system

---

<p align="center"><strong>Default is <code>ask</code>. Be explicit. Be safe.</strong></p>
