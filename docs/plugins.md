# Plugin System

> Runtime extensibility framework

## Overview

UpUp implements a multi-runtime plugin system supporting various plugin types and execution environments:

- **Bun Runtime**: Native ESM support
- **Jiti Runtime**: Native TypeScript execution
- **Wasm Runtime**: WebAssembly sandbox
- **MCP Runtime**: External service integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Plugin System Architecture                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Plugin Registry                          │    │
│  │                                                              │    │
│  │  • Plugin discovery                                        │    │
│  │  • Plugin loading                                          │    │
│  │  • Runtime adaptation                                      │    │
│  │  • Lifecycle management                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Bun      │      │   Jiti     │      │   Wasm     │     │
│  │  Native    │      │  TS Runtime │      │  Sandbox   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
│         ┌────────────────────┬────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │    MCP     │      │   Tools    │      │  Services   │     │
│  │  External  │      │  Registry  │      │  Registry   │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Supported Runtimes

| Runtime | Description | Sandbox Level |
|---------|-------------|---------------|
| `bun` | Bun runtime native support | process |
| `jiti` | TypeScript native execution | process |
| `wasm` | WebAssembly isolation | wasm |
| `mcp` | Model Context Protocol | mcp |

---

## Plugin Capabilities

Plugins can provide multiple capabilities:

```typescript
type PluginCapability =
  | 'data-source'   // Data source
  | 'tools'        // Tools
  | 'analysis'     // Analysis capabilities
  | 'strategy'     // Trading strategies
  | 'channel'      // Messaging channels
  | 'service'      // Background services
  | 'skill'        // Skills
  | 'hook';        // Hooks
```

---

## Plugin Manifest

Each plugin requires a `upup.plugin.json` manifest file:

```json
{
  "schemaVersion": "1.0",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "My plugin description",
  "runtime": "bun",
  "capabilities": ["tools", "data-source"],
  "entry": "./dist/index.js",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "security": {
    "sandbox": "process",
    "permissions": ["network", "filesystem"]
  }
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `schemaVersion` | Yes | Manifest version, always "1.0" |
| `id` | Yes | Plugin unique identifier (a-z0-9-) |
| `name` | Yes | Plugin display name |
| `version` | Yes | Semantic version (x.y.z) |
| `runtime` | Yes | Runtime type |
| `capabilities` | Yes | List of capabilities |
| `entry` | Yes | Entry file path |
| `description` | No | Plugin description |
| `author` | No | Author information |
| `security` | No | Security configuration |

---

## Plugin API

Plugins receive a unified API interface:

```typescript
interface UpUpPluginApi {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntime;
  config: Record<string, unknown>;

  // Tool registration
  registerTool(tool: AgentTool): void;
  registerTools(tools: AgentTool[]): void;

  // Hook registration
  registerHook(events: string[], handler: HookHandler): void;
  on(event: string, handler: HookHandler): void;

  // Service registration
  registerService(service: PluginService): void;

  // Lifecycle
  onLoad?(api: UpUpPluginApi): Promise<void>;
  onStart?(api: UpUpPluginApi): Promise<void>;
  onStop?(api: UpUpPluginApi): Promise<void>;
}
```

---

## Tool Types

```typescript
interface AgentTool {
  name: string;
  description?: string;
  execute(args: Record<string, unknown>): Promise<unknown>;
  schema?: Record<string, unknown>;
}
```

### Example: Registering Tools

```typescript
import type { UpUpPluginApi, AgentTool } from '@upup/sdk';

const myTool: AgentTool = {
  name: 'my_analysis',
  description: 'Custom analysis tool',
  execute: async (args) => {
    const symbol = args.symbol as string;
    return { result: `Analysis for ${symbol}` };
  },
};

export default {
  onLoad(api: UpUpPluginApi) {
    api.registerTool(myTool);
  },
};
```

---

## Hook System

### Available Hooks

```typescript
type HookName =
  // Lifecycle hooks
  | 'SessionStart'
  | 'SessionEnd'
  | 'BeforeAgentStart'
  | 'AgentEnd'
  // Tool hooks
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  // Message hooks
  | 'MessageReceived'
  | 'MessageSending'
  | 'MessageSent'
  // LLM hooks
  | 'LLMInput'
  | 'LLMOutput'
  // Investment-specific hooks
  | 'data_fetched'
  | 'analysis_complete'
  | 'portfolio_updated'
  | 'risk_threshold';
```

### Hook Handlers

```typescript
type HookHandler = (
  context: HookContext
) => Promise<HookResult> | HookResult;

interface HookContext {
  event: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}
```

### Example: Registering Hooks

```typescript
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerHook(['PreToolUse'], async (ctx) => {
      console.log('Before tool call:', ctx.data);
      return { allowed: true };
    });

    api.on('PostToolUse', async (ctx) => {
      console.log('After tool call:', ctx.metadata?.toolName);
    });
  },
};
```

---

## Service Types

```typescript
interface PluginService {
  name: string;
  start(ctx: ServiceContext): Promise<void>;
  stop?(ctx: ServiceContext): Promise<void>;
}
```

### Example: Registering Services

```typescript
const myService: PluginService = {
  name: 'market-data',
  start: async (ctx) => {
    console.log('Service started:', ctx.config);
    // Initialize service
  },
  stop: async (ctx) => {
    console.log('Service stopped');
    // Cleanup resources
  },
};

export default {
  onLoad(api: UpUpPluginApi) {
    api.registerService(myService);
  },
};
```

---

## Data Source Types (Investment Focus)

```typescript
interface DataSourcePlugin {
  id: string;
  name: string;
  provider: string;
  type: 'api' | 'file' | 'database';
  fetch<T>(params: DataSourceParams): Promise<T>;
  validateConfig?(config: Record<string, unknown>): boolean;
  healthCheck?(): Promise<boolean>;
}

interface DataSourceParams {
  symbol?: string;
  startDate?: string;
  endDate?: string;
  interval?: string;
  [key: string]: unknown;
}
```

---

## Complete Example

### Plugin Directory Structure

```
my-plugin/
├── upup.plugin.json
├── package.json
└── src/
    └── index.ts
```

### Complete Plugin Code

```typescript
// src/index.ts
import type { UpUpPluginApi, AgentTool, PluginService } from '@upup/sdk';

// Define tool
const stockTool: AgentTool = {
  name: 'get_stock_price',
  description: 'Get stock price',
  execute: async (args) => {
    const symbol = args.symbol as string;
    return { symbol, price: 150.25 };
  },
};

// Define service
const dataService: PluginService = {
  name: 'stock-data',
  start: async () => {
    console.log('Stock data service started');
  },
  stop: async () => {
    console.log('Stock data service stopped');
  },
};

// Plugin entry
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerTool(stockTool);
    api.registerService(dataService);

    api.on('PreToolUse', async (ctx) => {
      console.log('Tool call:', ctx.metadata?.toolName);
      return { allowed: true };
    });

    console.log(`Plugin ${api.name} loaded`);
  },
};
```

---

## Related Documents

- [Architecture](architecture.md)
- [Skills](skills.md)
- [API Reference](api.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
