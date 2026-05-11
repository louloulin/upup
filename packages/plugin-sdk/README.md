# @upup/plugin-sdk

UpUp Plugin SDK for external plugin development.

## Installation

```bash
npm install @upup/plugin-sdk
# or
bun add @upup/plugin-sdk
```

## Quick Start

```typescript
import type { PluginAPI } from '@upup/plugin-sdk';

export default function myPlugin(api: PluginAPI) {
  // Register a tool
  api.registerTool({
    name: 'stock_analyzer',
    description: 'Analyze stock data',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol' }
      }
    },
    handler: async (args) => {
      return { result: `Analyzed ${args.ticker}` };
    }
  });

  // Listen to events
  api.on('activate', async () => {
    api.logger.info('Plugin activated');
  });

  // Mark as ready
  api.ready();
}
```

## API Reference

### PluginAPI

Main interface passed to plugins during initialization.

| Method | Description |
|--------|-------------|
| `registerTool(tool, options?)` | Register a tool |
| `registerHook(events, handler)` | Register hook handlers |
| `registerChannel(config)` | Register MCP channel |
| `registerCli(commands)` | Register CLI commands |
| `registerProvider(config)` | Register LLM provider |
| `getConfig()` | Get plugin configuration |
| `on(event, handler)` | Listen to lifecycle events |
| `ready()` | Mark plugin as ready |

### ExternalTool

```typescript
interface ExternalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
```

### PluginManifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "configSchema": {
    "apiKey": {
      "type": "string",
      "required": true,
      "description": "API key"
    }
  },
  "capabilities": ["tool", "hook"],
  "hooks": ["llm_output"],
  "tools": ["my_tool"]
}
```

## Lifecycle Events

- `install` - Plugin is being installed
- `activate` - Plugin is being activated
- `deactivate` - Plugin is being deactivated
- `update` - Plugin is being updated

## License

MIT
