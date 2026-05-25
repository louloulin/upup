# UpUp Architecture

> System architecture and design decisions

## Overview

UpUp is a deep financial research AI agent built on a modular architecture that combines:

- **Dexter**: Financial research framework, tool system
- **Claude Code**: Permission management, session state, TUI design

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UpUp Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │    CLI      │     │    TUI      │     │  Bundled    │           │
│  │   Entry     │────▶│   Render    │────▶│   Runner    │           │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         └────────────────────┴────────────────────┘                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Agent Core                                │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │ Capability │  │  Session   │  │   Skill   │            │   │
│  │  │  Registry │  │   State    │  │  Executor │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │   Hook     │  │  Message   │  │   Tool    │            │   │
│  │  │  System   │  │   Queue    │  │ Executor  │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Tools     │      │   Skills     │      │ Components   │     │
│  │   (64+)     │      │   (25+)     │      │   (16)       │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Packages                               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │   llm   │  │ memory  │  │   sdk   │  │ plugins │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent Core (`src/agent/`)

The agent core handles LLM interaction and tool orchestration.

```
agent/
├── agent.ts              # Main agent loop
├── capability-registry.ts # Tool/skill registration
├── fallback-handler.ts   # Error handling
├── tool-executor.ts      # Tool execution
└── types.ts             # Type definitions
```

**Key Classes:**
- `Agent`: Main agent orchestrator
- `ToolExecutor`: Executes tools with approval flow
- `CapabilityRegistry`: Registers and manages capabilities

### 2. Session Management (`src/session/`)

Session management provides state persistence and recovery.

```
session/
├── session-state.ts      # Session state
├── session-tracker.ts   # State tracker
├── storage.ts          # Persistence
└── render/             # Message rendering
```

**Features:**
- Session persistence
- State recovery
- Conversation history
- Tool result storage

### 3. TUI Components (`src/components/`)

TUI components provide the terminal user interface.

```
components/
├── chat-log.ts         # Chat history
├── tool-event.ts       # Tool display
├── approval.ts         # Approval UI
├── status-bar.ts       # Status display
└── editor.ts          # Input editor
```

**Key Components:**
- `ChatLogComponent`: Displays conversation
- `ToolEventComponent`: Shows tool execution
- `ApprovalComponent`: Permission approval UI
- `StatusBarComponent`: Status information

### 4. Tool System (`src/tools/`)

Tool system provides capabilities via 64+ built-in tools.

```
tools/
├── bash/               # Bash command execution
├── filesystem/          # File operations
├── financial/          # Financial data tools
├── web/                # Web scraping
├── search/             # Search tools
└── types.ts            # Tool definitions
```

**Tool Categories:**
| Category | Count | Examples |
|----------|-------|----------|
| Bash | 1 | `Bash` |
| Filesystem | 8 | `Read`, `Write`, `Edit`, `Grep` |
| Financial | 20+ | `StockData`, `FinancialReport` |
| Web | 5 | `WebFetch`, `WebSearch` |
| Development | 15+ | `Git`, `CodeSearch` |

### 5. Skill System (`src/skills/`)

Skills provide domain-specific capabilities.

```
skills/
├── skill-registry.ts    # Skill loader
├── skill-executor.ts    # Skill runner
└── built-in/           # Built-in skills
    ├── medfish/        # Medical/pharmaceutical
    ├── technical/      # Technical analysis
    ├── backtest/       # Backtesting
    └── risk/           # Risk management
```

**Built-in Skills:**
| Skill | Purpose |
|-------|---------|
| `medfish` | Medical/pharmaceutical analysis |
| `technical-analysis` | RSI, MACD, Bollinger Bands |
| `backtesting` | Strategy backtesting |
| `risk-management` | Risk calculation |
| `sentiment-analysis` | News sentiment |
| `financial-data` | Data acquisition |

### 6. Hook System (`src/hooks/`)

Hooks provide extensibility via lifecycle events.

```
hooks/
├── agent-hooks.ts      # Agent lifecycle
├── tool-hooks.ts       # Tool execution
├── permission-hooks.ts  # Permission checks
└── rate-limiter.ts     # Rate limiting
```

**Hook Types:**
- `preToolUse`: Before tool execution
- `postToolUse`: After tool execution
- `preAgent`: Before agent iteration
- `postAgent`: After agent iteration

### 7. Plugin System (`src/plugins/`)

Plugins provide runtime extensibility.

```
plugins/
├── plugin-loader.ts    # Plugin discovery
├── plugin-runtime.ts   # Runtime execution
└── sandbox/           # Sandboxing
```

**Supported Runtimes:**
| Runtime | Sandbox | Use Case |
|---------|---------|----------|
| `bun` | process | Native ESM |
| `jiti` | process | TypeScript |
| `wasm` | wasm | Secure execution |
| `mcp` | mcp | Model Context Protocol |

---

## Data Flow

### Request Flow

```
User Input
    │
    ▼
CLI (cli.ts)
    │
    ▼
Agent (agent.ts)
    │
    ├──▶ CapabilityRegistry ──▶ ToolExecutor ──▶ Tools
    │
    ├──▶ SkillRegistry ──▶ SkillExecutor ──▶ Skills
    │
    ▼
ToolExecutor
    │
    ├──▶ Permission Check (hooks)
    │
    ├──▶ Rate Limiter
    │
    ▼
Tool Execution
    │
    ▼
Result Handler
    │
    ▼
TUI Render
    │
    ▼
User Display
```

### Approval Flow

```
Tool Request
    │
    ▼
requiresApproval() check
    │
    ▼
requestToolApproval()
    │
    ├──▶ Queue in approvalQueue
    │
    ▼
Emit tool_approval event
    │
    ▼
TUI shows approval dialog
    │
    ▼
User decision
    │
    ├──▶ allow-once
    ├──▶ allow-session ──▶ sessionApprovedTools
    └──▶ deny
    │
    ▼
Process next in queue
```

---

## Session State

### State Structure

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

### Persistence

- **Location**: `.upup/sessions/`
- **Format**: JSON files per session
- **Recovery**: Full conversation + tool results

---

## Error Handling

### Fallback Strategy

1. **Tool Error**: Retry with modified args
2. **Rate Limit**: Wait and retry
3. **Model Error**: Try fallback model
4. **Permission Denied**: Log and continue

### Error Types

```typescript
type UpUpError =
  | { type: 'tool_error'; tool: string; message: string }
  | { type: 'rate_limit'; tool: string; retryAfter: number }
  | { type: 'permission_denied'; tool: string; reason: string }
  | { type: 'model_error'; message: string }
```

---

## Performance

### Concurrency

- **Read tools**: Parallel execution (up to 10 concurrent)
- **Write tools**: Serial execution
- **Approval queue**: FIFO with timeout

### Rate Limiting

```typescript
const RATE_LIMITS = {
  'Bash': { maxPerMinute: 60 },
  'Read': { maxPerMinute: 120 },
  'Write': { maxPerMinute: 30 },
  'StockData': { maxPerMinute: 10 },
};
```

---

## Extension Points

### Adding a Tool

1. Create tool class in `src/tools/`
2. Register in `CapabilityRegistry`
3. Add permission requirements
4. Write tests

### Adding a Skill

1. Create skill in `src/skills/built-in/`
2. Add to skill manifest
3. Register in `SkillRegistry`

### Adding a Hook

1. Define hook interface
2. Implement hook
3. Register in `HookExecutor`

---

## Related Documents

- [Permission System](permission.md)
- [Skills System](skills.md)
- [Plugin System](plugins.md)
- [Session Management](session.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
