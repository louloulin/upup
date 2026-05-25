# Components System

> TUI (Terminal User Interface) component library

## Overview

UpUp implements a rich TUI component library for the terminal-based user interface. These components provide visual feedback for agent activities, tool execution, and user interactions.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Components Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Component Library                         │    │
│  │                                                              │    │
│  │  • Chat components                                         │    │
│  │  • Tool components                                         │    │
│  │  • Approval components                                     │    │
│  │  • Editor components                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   ChatLog  │      │  ToolEvent  │      │   Approval  │     │
│  │            │      │             │      │             │     │
│  │ • UserQuery│      │ • Progress │      │ • Prompt    │     │
│  │ • AnswerBox│     │ • Complete │      │ • Selector  │     │
│  │ • Browser  │      │ • Error    │      │ • Request   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### ChatLogComponent

The main chat display component that shows conversation history:

```typescript
import { ChatLogComponent } from './chat-log.ts';

const chatLog = new ChatLogComponent(tui);

// Add user query
chatLog.addQuery('Analyze tech stocks');

// Start tool execution
chatLog.startTool(toolCallId, 'Bash', { command: 'ls' });

// Update tool progress
chatLog.updateToolProgress(toolCallId, 'Reading files...');

// Complete tool execution
chatLog.completeTool(toolCallId, '→ ls completed', 150);

// Finalize answer
chatLog.finalizeAnswer('Analysis complete.');
```

### ToolEventComponent

Displays tool execution status:

```typescript
import { ToolEventComponent } from './tool-event.ts';

const tool = new ToolEventComponent(tui, 'Bash', { command: 'ls' });

// Set active state (during execution)
tool.setActive('Running command...');

// Set complete state
tool.setComplete('→ ls completed', 150);

// Set error state
tool.setError('Command failed: permission denied');

// Add sub-agent detail
tool.addSubAgentDetail('→ Subtask 1 completed');
```

### BrowserSessionComponent

Special component for browser automation:

```typescript
import { BrowserSessionComponent } from './chat-log.ts';

const browser = new BrowserSessionComponent(tui);

// Set browser action
browser.setStep({ action: 'navigate', url: 'https://example.com' });

// Set active state
browser.setActive('Loading page...');

// Set complete
browser.setComplete('→ Page loaded', 500);

// Set approval
browser.setApproval('allow-once');
```

---

## Approval Components

### ApprovalPromptComponent

Full-screen permission prompt:

```typescript
import { ApprovalPromptComponent } from './approval-prompt.ts';

const prompt = new ApprovalPromptComponent('Bash', {
  command: 'rm -rf temp/',
});

prompt.onSelect = (decision) => {
  if (decision === 'allow-session') {
    console.log('Tool approved for session');
  }
};
```

### ApprovalSelector

Inline approval selector:

```typescript
import { createApprovalSelector } from './select-list.ts';

const selector = createApprovalSelector((decision) => {
  console.log('User selected:', decision);
});
```

---

## Input Components

### UserQueryComponent

Displays user input:

```typescript
import { UserQueryComponent } from './user-query.ts';

const query = new UserQueryComponent('Show me A-share tech stocks');
```

### CustomEditorComponent

Terminal text editor for multi-line input:

```typescript
import { CustomEditorComponent } from './custom-editor.ts';

const editor = new CustomEditorComponent(tui, {
  placeholder: 'Enter your query...',
  onSubmit: (text) => {
    console.log('Submitted:', text);
  },
});
```

---

## Status Components

### WorkingIndicator

Shows agent thinking/working state:

```typescript
import { WorkingIndicatorComponent } from './working-indicator.ts';

const indicator = new WorkingIndicatorComponent(tui);
indicator.start();
indicator.stop();
```

### HintBarComponent

Bottom status bar with hints:

```typescript
import { HintBarComponent } from './hint-bar.ts';

const hintBar = new HintBarComponent();
hintBar.setHint('Press Enter to submit, Esc to cancel');
```

### DebugPanelComponent

Debug information display:

```typescript
import { DebugPanelComponent } from './debug-panel.ts';

const debug = new DebugPanelComponent(tui);
debug.showTokens(1500);
debug.showDuration(5000);
debug.showModel('claude-sonnet-4');
```

---

## Border & Decoration

### BorderBox

Styled box container:

```typescript
import { BorderBox } from './BorderBox.ts';

const box = new BorderBox(
  [new Text('Content')],
  { style: 'single', paddingX: 1 }
);
```

### AnswerBoxComponent

Styled answer display:

```typescript
import { AnswerBoxComponent } from './answer-box.ts';

const answer = new AnswerBoxComponent('Here is the analysis...');
```

---

## Component Interface

### ToolDisplayComponent

Standard interface for tool-related components:

```typescript
interface ToolDisplayComponent {
  setActive(progressMessage?: string): void;
  setComplete(summary: string, duration: number): void;
  setError(error: string): void;
  setLimitWarning(warning?: string): void;
  setApproval(decision: 'allow-once' | 'allow-session' | 'deny'): void;
  setApprovalPending(onSelect: (decision: 'allow-once' | 'allow-session' | 'deny') => void): void;
  getApprovalCallback?(): ((decision: 'allow-once' | 'allow-session' | 'deny') => void) | null;
  setDenied(path: string, tool: string): void;
  addSubAgentDetail?(message: string): void;
  dispose?(): void;
}
```

---

## Approval State Management

### Approval Callback Flow

```typescript
// 1. Tool requests approval
chatLog.startTool(toolCallId, 'Bash', args);

// 2. Check for pending approval
if (chatLog.hasApprovalPending()) {
  const callback = chatLog.getFirstApprovalCallback();
  if (callback) {
    // User selects decision
    callback('allow-session');
  }
}

// 3. Update component state
chatLog.approveTool(toolCallId, 'allow-session');

// 4. Clear all callbacks (for full-screen takeover)
chatLog.clearAllApprovalCallbacks();
```

---

## Theme Support

Components use a centralized theme system:

```typescript
import { theme } from '../theme.ts';

// Apply theme colors
theme.primary('Blue text');
theme.success('Green success');
theme.error('Red error');
theme.warning('Yellow warning');
theme.muted('Gray muted');
```

---

## Related Documents

- [Architecture](architecture.md)
- [Permission System](permission.md)
- [Session Management](session.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
