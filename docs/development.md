# Development Guide

> Complete guide for developing UpUp

## Overview

This guide covers the complete development workflow for the UpUp project:

- Project structure
- Development environment setup
- Tool development
- Skill development
- Testing and debugging
- Building and deployment

---

## Project Structure

```
dexter/
├── src/
│   ├── cli.ts              # Main entry (~1500 lines)
│   ├── agent/              # Agent core
│   │   ├── agent.ts        # Agent main loop
│   │   ├── capability-registry.ts  # Capability registration
│   │   └── tool-executor.ts       # Tool executor
│   ├── session/            # Session management
│   │   ├── session-state.ts        # State management
│   │   └── session-tracker.ts      # Session tracking
│   ├── components/         # TUI components
│   │   ├── chat-log.ts     # Chat history
│   │   ├── approval.ts     # Authorization UI
│   │   └── editor.ts       # Input editor
│   ├── tools/              # Tool system (64+)
│   │   ├── bash/           # Bash command execution
│   │   ├── filesystem/     # File operations
│   │   ├── finance/       # Financial data
│   │   ├── search/        # Search tools
│   │   └── ...
│   ├── skills/             # Skill system
│   │   ├── skill-registry.ts
│   │   └── built-in/      # Built-in skills
│   ├── hooks/              # Hook system
│   │   ├── permission-hooks.ts
│   │   └── rate-limiter.ts
│   └── utils/              # Utility functions
├── packages/
│   └── sdk/               # Plugin SDK
├── docs/                   # Documentation
├── tests/                  # Tests
└── dist/                   # Build output
```

---

## Development Environment

### Requirements

- **Runtime**: Bun 1.x or Node.js 18+
- **Package Manager**: Bun (or npm/pnpm)
- **TypeScript**: Strict mode

### Installation

```bash
# Clone project
git clone https://github.com/your-org/dexter.git
cd dexter

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### .env Configuration

```bash
# LLM Provider (at least one required)
ANTHROPIC_API_KEY=sk-...      # Claude API
OPENAI_API_KEY=sk-...        # OpenAI API

# A-share data (optional)
TUSHARE_TOKEN=your_token_here
```

### Development Commands

```bash
# Interactive TUI
bun start

# Watch mode (hot reload)
bun dev

# Type check
bun run typecheck

# Run tests
bun test

# Build
bun run build
```

---

## Tool Development

### Tool Structure

Tools use LangChain's `DynamicStructuredTool`:

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const myTool = new DynamicStructuredTool({
  name: 'my_tool',
  description: 'Tool description',
  schema: z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional(),
  }),
  async func({ param1, param2 }): Promise<string> {
    // Tool logic
    return JSON.stringify({ result: 'ok' });
  },
});
```

### Example: Financial Data Tool

```typescript
// src/tools/my-stock-tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const getStockPriceTool = new DynamicStructuredTool({
  name: 'get_stock_price',
  description: 'Get current stock price',
  schema: z.object({
    symbol: z.string().describe('Stock symbol, e.g., AAPL'),
  }),
  async func({ symbol }): Promise<string> {
    // Simulate fetching price
    const price = Math.random() * 100 + 150;
    return JSON.stringify({
      symbol,
      price: price.toFixed(2),
      currency: 'USD',
      timestamp: new Date().toISOString(),
    });
  },
});
```

### Tool Registration

```typescript
// src/tools/index.ts
import { getStockPriceTool } from './my-stock-tool.ts';

export const tools = [
  getStockPriceTool,
  // ... other tools
];
```

### Security Checks (Bash Tool)

The Bash tool includes multi-layer security checks:

```typescript
// AST parsing - complex commands require extra confirmation
const astResult = parseForSecurity(command);

// Dangerous command detection
if (isDangerousCommand(command)) {
  return { stderr: 'Dangerous command blocked' };
}

// Path validation
const pathValidation = validatePaths(command, cwd);
```

---

## Skill Development

### Skill Structure

```
skills/
└── my-skill/
    ├── manifest.ts    # Skill metadata
    ├── index.ts       # Skill implementation
    └── capabilities/  # Capability definitions
```

### Skill Manifest

```typescript
// manifest.ts
export const manifest = {
  name: 'my-skill',
  version: '1.0.0',
  description: 'My custom skill',
  tags: ['analysis', 'custom'],
  capabilities: [
    {
      name: 'analyze',
      description: 'Execute custom analysis',
      parameters: [
        { name: 'symbol', type: 'string', required: true },
        { name: 'period', type: 'number', default: 30 },
      ],
      output: { type: 'report' },
    },
  ],
};
```

### Skill Implementation

```typescript
// index.ts
export async function execute(params: Record<string, unknown>) {
  const symbol = params.symbol as string;
  const period = params.period as number;

  // Skill logic
  const result = await analyze(symbol, period);

  return {
    symbol,
    analysis: result,
    timestamp: Date.now(),
  };
}
```

---

## Permission System Development

### Permission Modes

```typescript
type PermissionMode =
  | 'default'           // Standard permission check
  | '.accept-all'       // Accept all prompts
  | 'bypassPermissions' // Bypass all permission checks
  | 'dangerously';      // Allow dangerous operations
```

### Permission Check Flow

```typescript
// Check if tool requires approval
function requiresApproval(toolName: string, toolArgs: unknown): boolean {
  // High-risk tools always require approval
  const highRiskTools = ['Bash', 'Write', 'Edit'];
  if (highRiskTools.includes(toolName)) {
    return true;
  }
  return false;
}
```

### Approval Callback

```typescript
const approvalCallback = async (tool: string, args: unknown) => {
  // Show approval dialog
  const result = await showApprovalDialog(tool, args);

  if (result === 'allow') {
    return { approved: true };
  } else if (result === 'deny') {
    return { approved: false, reason: 'User denied' };
  }
};
```

---

## Testing

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test src/tools/my-tool.test.ts

# Watch mode
bun test --watch
```

### Test Example

```typescript
// src/tools/my-tool.test.ts
import { describe, it, expect } from 'bun:test';

describe('MyTool', () => {
  it('should return correct result', async () => {
    const result = await myTool.func({ symbol: 'AAPL' });
    const parsed = JSON.parse(result);

    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.price).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const result = await myTool.func({ symbol: '' });
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeDefined();
  });
});
```

---

## Debugging

### Permission Debugging

```bash
# Enable permission debug logs
DEBUG=permissions bun start
```

### Session Recovery

```bash
# Recover from crash
./dist/upup --resume <session-id>
```

### Type Checking

```bash
# Run TypeScript strict check
bun run typecheck
```

---

## Building

### Development Build

```bash
# TypeScript compile
bun run build

# Output to dist/
./dist/upup --help
```

### Production Build

```bash
# Clean and rebuild
bun run clean && bun run build

# Verify build
./dist/upup --version
```

---

## Related Documents

- [Architecture](architecture.md)
- [Permission System](permission.md)
- [Skills System](skills.md)
- [API Reference](api.md)
- [Session Management](session.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
