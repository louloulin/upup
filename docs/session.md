# Session Management

> Session state, persistence, and recovery

## Overview

UpUp implements a complete session management system providing:

- **Session State Tracking**: idle/running/requires_action state management
- **Session Persistence**: Persistent storage of session state and history
- **Tool Permission Tracking**: Session-level tool approval/denial state
- **Permission Mode Management**: Multiple permission mode support

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Session Management Architecture                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Session State Manager                      │    │
│  │                                                              │    │
│  │  • State tracking (idle/running/requires_action)           │    │
│  │  • Metadata synchronization                                 │    │
│  │  • Permission mode management                              │    │
│  │  • Event listeners                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Session Tracker                            │    │
│  │                                                              │    │
│  │  • Tool approval/denial                                    │    │
│  │  • Tool call counts                                        │    │
│  │  • Token usage statistics                                  │    │
│  │  • State persistence                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Session State

### State Types

```typescript
type SessionState = 'idle' | 'running' | 'requires_action';
```

| State | Description |
|-------|-------------|
| `idle` | Session is idle, waiting for user input |
| `running` | Session is running, agent is executing |
| `requires_action` | Requires user action (e.g., authorization) |

### State Management

```typescript
import {
  getSessionState,
  isSessionRunning,
  isSessionRequiresAction,
  notifySessionStateChanged,
} from './session-state';

// Get current state
const state = getSessionState();

// Check state
if (isSessionRunning()) {
  console.log('Session is running');
}

// Listen for state changes
setSessionStateChangedListener((state, details) => {
  if (state === 'requires_action') {
    console.log('Authorization required:', details?.tool_name);
  }
});
```

---

## Session Tracker

The session tracker (`SessionTracker`) provides session-level state tracking and persistence.

### Core Features

```typescript
const tracker = getSessionTracker();

// Start session
await tracker.startSession('session-123');

// Check tool approval
if (tracker.isToolApproved('Bash')) {
  console.log('Bash tool is approved');
}

// Approve tool
tracker.approveTool('Bash');

// Deny tool
tracker.denyTool('Bash');

// Record tool call
tracker.recordToolCall('Read');

// Update token statistics
tracker.updateTokens(1500);
```

### State Structure

```typescript
interface SessionTrackerState {
  id: string;
  sessionId: string;
  approvedTools: string[];        // Approved tools
  deniedTools: string[];          // Denied tools
  toolCallCounts: Record<string, number>;  // Tool call counts
  totalTokens: number;           // Total token count
  totalIterations: number;        // Total iterations
  lastQuery?: string;            // Last query
  lastUpdated: number;            // Last update time
}
```

### Persistence

Session tracker state is stored in `~/.upup/cache/session-tracker/`:

```
~/.upup/cache/session-tracker/
├── tracker_session-123.json
├── tracker_session-456.json
└── ...
```

One JSON file per session containing complete tracking state.

---

## Permission Modes

### Available Modes

```typescript
type PermissionMode =
  | 'default'           // Standard permission check
  | '.accept-all'       // Accept all prompts
  | 'acceptEdits'       // Auto-accept edits
  | 'bypassPermissions' // Bypass all permission checks
  | 'dangerously'       // Allow dangerous operations
  | 'dontAsk'          // Don't ask
  | 'plan'             // Plan mode (read-only)
  | 'auto'             // Auto mode
  | 'bubble';         // Bubble mode
```

### Mode Checking

```typescript
import {
  getPermissionMode,
  isDangerousMode,
  isAcceptAllMode,
  isPlanMode,
  isAcceptEditsMode,
} from './session-state';

// Get current mode
const mode = getPermissionMode();

// Check specific modes
if (isDangerousMode()) {
  console.log('Dangerous mode enabled');
}

if (isPlanMode()) {
  console.log('Plan mode: read-only operations');
}
```

### Mode Labels

```typescript
import { getPermissionModeLabel } from './session-state';

const label = getPermissionModeLabel();
// Returns: '[BYPASS]', '[DANGEROUS]', '[PLAN]', etc.
```

---

## Requires Action State

Used when the agent needs user action (like tool authorization) with `requires_action` state.

### Setting Pending Action

```typescript
import { setPendingAction, clearPendingAction } from './session-state';

setPendingAction({
  tool_name: 'Bash',
  action_description: 'Execute command: rm -rf temp/',
  tool_use_id: 'tool_123',
  request_id: 'req_456',
  input: { command: 'rm -rf temp/' }
});
```

### Getting Pending Action

```typescript
import { getPendingAction } from './session-state';

const pending = getPendingAction();
if (pending) {
  console.log(`Authorization required: ${pending.tool_name}`);
  console.log(`Action: ${pending.action_description}`);
}
```

### Clearing Pending Action

```typescript
clearPendingAction();  // State becomes 'idle'
```

---

## Event Listeners

### State Change Listener

```typescript
setSessionStateChangedListener((state, details) => {
  console.log(`State changed to: ${state}`);
  if (details) {
    console.log(`Details: ${JSON.stringify(details)}`);
  }
});
```

### Metadata Change Listener

```typescript
setSessionMetadataChangedListener((metadata) => {
  console.log('Metadata updated:', metadata);
});
```

### Permission Mode Change Listener

```typescript
setPermissionModeChangedListener((mode) => {
  console.log(`Permission mode changed to: ${mode}`);
});
```

---

## Session Recovery

### Listing All Sessions

```typescript
const tracker = getSessionTracker();
const sessions = await tracker.listSessions();

for (const session of sessions) {
  console.log(`Session: ${session.sessionId}`);
  console.log(`Last updated: ${new Date(session.lastUpdated)}`);
  console.log(`Approved tools: ${session.approvedTools.join(', ')}`);
}
```

### Recovering Session State

```typescript
const tracker = getSessionTracker();
await tracker.startSession('session-123');

const state = tracker.getSession();
console.log('Approved tools:', state?.approvedTools);
console.log('Tool calls:', state?.toolCallCounts);
```

---

## Singleton Pattern

```typescript
import { getSessionTracker, resetSessionTracker } from './session-tracker';

// Get global singleton
const tracker = getSessionTracker();

// Reset singleton (for testing)
resetSessionTracker();
```

---

## Reset All State

```typescript
import { resetAllSessionState, removeAllListeners } from './session-state';

// Reset all session state
resetAllSessionState();

// Remove all listeners
removeAllListeners();
```

---

## Related Documents

- [Architecture](architecture.md)
- [Permission System](permission.md)
- [API Reference](api.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
