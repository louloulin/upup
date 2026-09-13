# Plugins

> **Plugins extend UpUp with new tools, skills, and data sources** — without forking. UpUp supports **4 runtime adapters** (`bun` / `jiti` / `wasm` / `mcp`) so you can pick the right isolation / performance trade-off.

---

## TL;DR

```bash
# Scaffold a new plugin
bunx create-upup-plugin my-plugin
cd my-plugin
bun run build

# Install into UpUp
cp -r ./dist/* ~/.upup/plugins/my-plugin/

# Enable
/plugin enable my-plugin

# Use
> Use my-plugin to do X
```

---

## Runtime Adapters

`src/plugins/adapters/` ships 4 adapters:

| Runtime | Speed | Isolation | Use case |
|---|---|---|---|
| `bun` | ⚡⚡⚡ Fastest (in-process ESM) | `process` | Trusted plugins, performance-critical |
| `jiti` | ⚡⚡ Fast (TS-native require) | `process` | Same as bun, but better Node compat |
| `wasm` | ⚡ Slower (compiled WASM) | `wasm` | Untrusted code, sandboxed execution |
| `mcp` | 🌐 Network (external process) | `mcp` | MCP servers, third-party tools |

### Sensitive tool sandbox requirement

Pi registers plugin tools only after validating the manifest security boundary. A
plugin's `security.sandbox` must match its runtime (`process` for `bun`/`jiti`,
`wasm` for `wasm`, and `mcp` for `mcp`). Because Bun/Jiti plugins execute
in-process, tools marked `dangerous` or `critical`, or tools with financial
impact, must use the `wasm` or `mcp` isolation runtime; declaring `process` is
not sufficient. The Pi bridge rejects sensitive in-process tools before
registration. Trust paths, pinned versions, tool allowlists, approvals,
credential redaction, and audit evidence remain separate controls and are all
required for production finance plugins.

Sensitive tools must also declare `networkDomains` and `credentialScopes` in
the manifest. Pi tool results include these declarations in a redacted
`securityAudit` record; credential values are never copied into the record.

Pi Packages must declare a stable `pi.source`; the deployment trust policy maps
each package name to exact allowed source identifiers. Package dependencies,
peer dependencies, and optional dependencies must use exact semver values and
must be present in the deployment `pinnedPackages` map. Before a session loads
an enabled Package, UpUp also resolves declared internal `@upup/*` runtime
dependencies against the same trusted catalog, including exact version and
enabled-state checks. Conflicting declarations across dependency sections and
internal dependency cycles are rejected as well. A missing, disabled, cyclic,
or mismatched dependency aborts loading rather than leaving a partially
functional extension.

The built-in finance Extension uses an additional host boundary. Its
`upup.pi.finance.host.v1` request must include the exact package identity
`@upup/pi-finance-sdk@0.1.0`, the owning Pi Session ID, and a declared
capability. UpUp returns production tool definitions only when all four values
match; mismatches return an empty capability response without calling the host.
This keeps third-party Packages from impersonating the built-in finance SDK.
The Package catalog also rejects duplicate slash-command declarations across
enabled Packages during registration, enablement, or selection, and restores
the previous catalog state when that check fails. Explicit AgentSpec Package
allowlists defer the check until selection, allowing unrelated unselected
Packages to coexist without weakening validation of the final enabled set.

### `bun` (default)

```ts
// upup.plugin.json
{
  "schemaVersion": "1.0",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "runtime": "bun",
  "entry": "./dist/index.js",
  "capabilities": ["tools", "skills"]
}
```

```ts
// src/index.ts
import { definePlugin } from '@upup/plugin-sdk';

export default definePlugin({
  id: 'my-plugin',
  async register(ctx) {
    ctx.registerTool({
      name: 'my_tool',
      description: 'Does X',
      schema: z.object({ input: z.string() }),
      execute: async ({ input }) => ({ result: `Did ${input}` }),
    });
  },
});
```

### `jiti`

Same as `bun` but uses `jiti` for TypeScript-native loading without a build step. Use when you want to ship `.ts` directly.

### `wasm`

For untrusted code. The plugin is compiled to a WASM module and runs in a sandboxed environment.

```ts
// upup.plugin.json
{
  "runtime": "wasm",
  "entry": "./dist/plugin.wasm"
}
```

WASM plugins can only use a limited set of host functions (no direct fs, no network without explicit grant).

### `mcp`

The plugin is an [MCP server](https://modelcontextprotocol.io). UpUp spawns the process and communicates via MCP.

```ts
// upup.plugin.json
{
  "runtime": "mcp",
  "entry": "node ./server.js",
  "mcp": {
    "transport": "stdio"
  }
}
```

Use this for:
- Reusing existing MCP servers (Tushare, AKShare, Alpha Vantage, etc.)
- Cross-language plugins (Python, Rust, Go)
- Plugins that need their own process lifecycle

---

## Plugin SDK

`@upup/plugin-sdk` exports:

```ts
import {
  definePlugin,
  type PluginContext,
  type PluginDefinition,
  type Tool,
  type Skill,
  type Hook,
  type Command,
  type DataSource,
} from '@upup/plugin-sdk';
```

### Register a tool

```ts
ctx.registerTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  schema: z.object({ city: z.string() }),
  execute: async ({ city }, ctx) => {
    const data = await fetch(`https://wttr.in/${city}?format=j1`).then(r => r.json());
    return { temp: data.current_condition[0].temp_C, condition: data.current_condition[0].weatherDesc[0].value };
  },
});
```

### Register a skill

```ts
ctx.registerSkill({
  name: 'weather-analysis',
  description: '天气因子分析。Trigger keywords: 天气, weather, climate, 气候变化',
  body: (await import('fs/promises')).readFile('./SKILL.md', 'utf-8'),
});
```

### Register a hook

```ts
ctx.registerHook({
  event: 'pre-tool-use',
  filter: (event) => event.tool === 'bash',
  handler: async (event, ctx) => {
    if (/rm -rf/.test(event.args.command)) {
      return { allow: false, reason: '禁止 rm -rf' };
    }
    return { allow: true };
  },
});
```

### Register a command

```ts
ctx.registerCommand({
  name: 'weather',
  description: 'Check weather',
  handler: async (args, ctx) => {
    const result = await ctx.callTool('get_weather', { city: args[0] || 'Beijing' });
    return { output: `${result.condition}, ${result.temp}°C` };
  },
});
```

### Register a data source

```ts
ctx.registerDataSource({
  id: 'my-source',
  schema: {
    'stock-price': { /* … */ },
    'fundamentals': { /* … */ },
  },
  fetch: async (query) => { /* … */ },
});
```

---

## Plugin Manifest

```ts
// upup.plugin.json
{
  "schemaVersion": "1.0",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "One-line description",
  "author": "Your Name <you@example.com>",
  "license": "MIT",
  "runtime": "bun",
  "entry": "./dist/index.js",
  "capabilities": ["tools", "skills", "commands", "hooks", "data"],
  "config": {
    "apiKey": {
      "type": "string",
      "required": true,
      "description": "API key for X"
    }
  },
  "permissions": {
    "fs": ["./data/**"],
    "net": ["api.example.com"],
    "env": ["MY_API_KEY"]
  },
  "minUpupVersion": "2026.5.0"
}
```

---

## Discovery & Loading

UpUp scans these directories in order of precedence (later overrides earlier):

1. `<built-in>/src/plugins/builtin-plugins.ts` — compiled-in
2. `~/.upup/plugins/<name>/` — user-installed
3. `.upup/plugins/<name>/` — project-local

Manifest validation happens at startup. Invalid plugins are logged and skipped (don't crash UpUp).

### Pi Package project settings

Pi-native finance packages can be enabled from a project-local `.pi/settings.json`. UpUp only accepts local paths inside the project root and requires an explicit `upupPiPackages` trust policy with exact package versions and source identifiers:

```json
{
  "packages": [{ "source": "./packages/pi-finance-sdk", "autoload": true }],
  "upupPiPackages": {
    "trustedPaths": ["./packages/pi-finance-sdk"],
    "pinnedPackages": {
      "@upup/pi-finance-sdk": "0.1.0",
      "@earendil-works/pi-coding-agent": "0.84.3",
      "typebox": "1.3.7"
    },
    "allowedSources": { "@upup/pi-finance-sdk": ["builtin:upup"] }
  }
}
```

Remote npm/git/HTTP sources and paths escaping the project root are rejected by the UpUp Pi package boundary. The package's Extension, Skill, Prompt, Workflow, Policy and Eval resources are loaded only after path, hash, version and source checks pass.

---

## Examples

### Example 1: Tushare MCP Server

```ts
// upup.plugin.json
{
  "id": "tushare-mcp",
  "name": "Tushare Pro",
  "runtime": "mcp",
  "entry": "uvx tushare-mcp-server",
  "mcp": { "transport": "stdio" },
  "config": {
    "token": { "type": "string", "required": true }
  }
}
```

### Example 2: Local DuckDB Plugin

```ts
// src/index.ts
export default definePlugin({
  id: 'duckdb-local',
  async register(ctx) {
    const db = await import('duckdb');
    const conn = db.default.createConnection(':memory:');
    ctx.registerDataSource({
      id: 'duckdb-local',
      schema: { 'sql': { /* … */ } },
      fetch: async (q) => conn.all(q.query),
    });
  },
});
```

### Example 3: WASM Sandbox for Untrusted Strategy

```ts
// upup.plugin.json
{
  "id": "user-strategy",
  "runtime": "wasm",
  "entry": "./strategy.wasm"
}
```

User uploads a strategy compiled to WASM. UpUp runs it with:
- No filesystem access (must use ctx.dataSources)
- No direct network (must use ctx.callTool)
- Memory capped at 256 MB
- CPU time capped at 30 sec

---

## Debugging

```bash
# List loaded plugins
/plugin list

# Show plugin details
/plugin info my-plugin

# Reload a plugin (without restart)
/plugin reload my-plugin

# Disable temporarily
/plugin disable my-plugin
```

Logs go to `~/.upup/logs/plugins.log`. Set `DEBUG=plugin:* bun start` for verbose output.

---

## Security

Plugins run with your user's permissions. Before installing:

- **Read the source** — `cat ~/.upup/plugins/<name>/src/*`
- **Check the manifest** — `cat ~/.upup/plugins/<name>/upup.plugin.json`
- **Use WASM runtime** for untrusted code
- **Use MCP runtime** for cross-process isolation
- **Don't paste random plugins from the internet** into a production setup

For vulnerability reporting, see [SECURITY.md](../SECURITY.md).

---

## See Also

- [docs/commands.md](./commands.md) — the commands that plugins can register
- [docs/skills.md](./skills.md) — the skills that plugins can register
- [docs/session-and-permissions.md](./session-and-permissions.md) — permission system that plugins must respect
- `src/plugins/sdk/` — SDK source

---

<p align="center"><strong>Build the tool you wish existed. Then share it.</strong></p>
