# Pi Plugin Authoring Guide for UpUp

> Audience: anyone writing a Pi-native extension that UpUp should install, mount, and exercise through `upup plugin`. Tested against `@earendil-works/pi-coding-agent@0.85.1`.

UpUp is a microkernel: `@upup/pi-app/default#getPiNativeApp()` is the only place that wires tools, skills, prompts, policies, and event sinks. **Plugins never touch UpUp internals** — they declare a manifest, ship through `DefaultPackageManager`, and UpUp's resource loader + chord facet bridge turn them into live runtime facets.

This guide shows the four shapes an UpUp-compatible Pi plugin can take:

1. **Pi package manifest (`pi.*` block)** — the canonical form
2. **Inline extension via `pi.registerExtension()`** — runtime-only
3. **chord facet** — bidirectional services
4. **Hybrid** — manifest + chord bridge

---

## 1. Package manifest (recommended)

A Pi package is an npm/git/local directory that ships a `package.json` with a `pi` block. `DefaultPackageManager` reads it; UpUp re-broadcasts the same manifest into chord.

### Minimal example

```jsonc
// packages/my-finance-tool/package.json
{
  "name": "@my-org/pi-finance-tool",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "pi": {
    "extensions": ["./dist/extension.js"],
    "skills": ["./skills/ratios.md", "./skills/dcf.md"],
    "prompts": ["./prompts/analyst.md"],
    "workflows": ["./workflows/dcf.toml"],
    "tools": [
      { "name": "compute_pe_ratio", "sideEffects": "read" },
      { "name": "fetch_balance_sheet", "sideEffects": "network" }
    ],
    "capabilities": ["finance:read", "finance:write"],
    "policies": ["./policies/safe-mode.json"],
    "sideEffects": ["compute_pe_ratio:read", "fetch_balance_sheet:network"]
  }
}
```

`check:pi-packages` enforces a consistent shape across all 19 Pi-native UpUp workspace packages, so reuse the same field names.

### Install + verify

```bash
# from the local repo
bun run packages/pi-app/src/entry.ts plugin install ./packages/my-finance-tool --local
# from npm
bun run packages/pi-app/src/entry.ts plugin install npm:@my-org/pi-finance-tool
# from git
bun run packages/pi-app/src/entry.ts plugin install git:https://github.com/my-org/pi-finance-tool

# settings.json now records the source, ~/.upup/agent/{extensions,skills,...} are populated.
bun run packages/pi-app/src/entry.ts plugin list
bun run packages/pi-app/src/entry.ts plugin reload    # extensions: N+1, skills: M+K
```

`bun run verify:pi-plugin-e2e` is the canonical smoke (install → reload → chord facet mount → uninstall).

### Manifest contract

`@upup/pi-runtime` freezes the `PiPackageManifestContract` (resources, capabilities, trust, lifecycle, version). Three rules to keep CI green:

- `pi.tools` must list every tool the extension registers; `pi.sideEffects` mirrors them with a `:kind` suffix.
- `pi.extensions` are paths relative to the package root; no absolute paths.
- `pi.capabilities` are strings in the form `domain:action`.

`check:pi-packages` reports drift; `check:pi-side-effects` fails if a `tools` entry is missing its `sideEffects`.

---

## 2. Inline extension (no install)

For session-only logic (e.g. a per-eval test fixture), call `pi.registerExtension()` from `@earendil-works/pi-coding-agent`:

```ts
import { registerExtension } from '@earendil-works/pi-coding-agent';

export default registerExtension({
  name: 'inline-finance-check',
  tools: [
    {
      name: 'sanity_check',
      description: 'Verify the LLM is sane',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true, ts: Date.now() }),
    },
  ],
});
```

Inline extensions register on `getPiNativeApp().getGatewayRuntime()` only for the current process — they vanish at next `bun run start`.

---

## 3. chord facet (services ↔ extensions)

UpUp's microkernel also mounts every Pi package as a chord `Facet`. The bridge (`@upup/pi-resource-composition/chord-facet`) is bidirectional:

```ts
import { defineFacet, defineService } from '@earendil-works/chord';

export const MARKET_QUOTE_SERVICE = defineService<{ quote(symbol: string): Promise<number> }>(
  'market.quote',
  { local: true },
);

export default defineFacet({
  id: 'pi-package:@my-org/pi-finance-tool',
  services: [MARKET_QUOTE_SERVICE],
  factory: () => ({
    [MARKET_QUOTE_SERVICE.id]: {
      quote: async (symbol) => {
        // real impl
        return 100;
      },
    },
  }),
});
```

When the package is uninstalled, the facet host calls `unmountIfCurrent(id, expected)` to avoid disposing a replacement generation; `reload()` swaps in-place when the id set is unchanged.

### Exposing UpUp capabilities to plugins (Phase 0.2b)

Want third-party facets to consume UpUp services? Export them with `defineService({ local: true })` from inside UpUp itself:

```ts
// in @upup/pi-portfolio
import { defineService } from '@earendil-works/chord';

export const PORTFOLIO_STATE_SERVICE = defineService<{
  positions(): readonly Position[];
  rebalance(target: Allocation): Promise<void>;
}>('portfolio.state', { local: true });
```

Then plugin authors can `import { PORTFOLIO_STATE_SERVICE } from '@upup/pi-portfolio'` and `services.bind(PORTFOLIO_STATE_SERVICE)` in their facet factory.

---

## 4. Migrating an existing Pi extension

1. Add a `pi` block to your existing package's `package.json` (Pi 0.85.x has the same contract as UpUp's `@upup/pi-runtime`).
2. Verify with `check:pi-packages` patterns from `scripts/check-pi-packages.ts`.
3. Tag and publish to npm.
4. End users run `upup plugin install npm:@your-org/your-pkg`.

If your package also exports a chord facet, no extra work is needed — UpUp's bridge picks it up automatically through `packages/pi-resource-composition/src/chord-facet.ts#piPackageToFacet()`.

---

## 5. Tool registration & policy

`pi.tools` is the canonical inventory; `pi.policies` declares fail-closed overrides (e.g. "deny `notify` unless approved"). UpUp defaults to **fail-closed** for the five high-risk tools:

```ts
// scripts/check-pi-side-effects.ts enforces presence in pi.tools + sideEffects.
const FAIL_CLOSED_TOOLS = new Set([
  'config_set',          // persists user settings
  'write_file',          // filesystem mutation
  'mcp_auth_get',        // credential access
  'notify',              // outbound notification
  'place_trade_order',   // real money
]);
```

A plugin may grant or deny individual tools by shipping a `policies/foo.json` referenced from `pi.policies`:

```json
{ "tool": "notify", "defaultMode": "ask", "scopes": ["session-only"] }
```

Policy resolution happens in `pi.policy.audit`; `verify:pi7-final` runs the policy audit as part of the C6 contract.

---

## 6. ACP-compatible plugin output

Plugins that emit Pi events are already ACP-compatible: `@upup/pi-stdio/acp.ts#mapUpupEventToAcpUpdate` maps `tool_start`, `tool_end`, `thinking`, `answer_start`, `done` into `agent_thought_chunk` / `tool_call` / `agent_message_chunk`. No plugin-side work needed — just emit the standard events from your extension.

---

## 7. Lifecycle verification checklist

| Gate | Command | What it proves |
|---|---|---|
| Static manifest contract | `bun run check:pi-packages` | Every declared `pi.tools` entry is reachable and typed |
| Side-effect declaration | `bun run check:pi-side-effects` | `pi.tools` and `pi.sideEffects` agree |
| Lifecycle E2E | `bun run verify:pi-plugin-e2e` | install → settings.json → reload → chord mount → uninstall |
| ACP wire compatibility | `bun run verify:pi-acp` | Events translate cleanly to ACP `session/update` notifications |
| Pi7 acceptance | `bun run verify:pi7-final` | 20+ contracts including policy audit, fail-closed defaults |

If all five are green, the plugin is production-ready.

---

## 8. External tools that don't speak Pi

Two options without modifying the third-party tool:

1. **Wrap it** in a Pi extension that calls the tool's HTTP/gRPC API from inside a `tools.execute`. The wrapper is your plugin; the upstream tool is unchanged.
2. **Bridge via ACP**: tools that already implement ACP can talk to UpUp directly through `upup --acp` — no plugin needed at all.

Both options live in the same microkernel; the plugin lifecycle gates still apply to whichever path you take.

---

## 9. Reference plugins shipped with UpUp

- `@upup/pi-finance-sdk` — sandbox trading + paper orders
- `@upup/pi-market-data` — Tushare / AKShare / financial-datasets bridges
- `@upup/pi-investment-workflow` — `/invest` 5-phase orchestrator
- `@upup/pi-research` — filings reader + perplexity wrapper
- `@upup/pi-browser` — Playwright-bundled browser tool
- `@upup/pi-notify` — Slack/WeChat/Email outbound

All 19 Pi-native UpUp packages are themselves plugins and pass the gates above; treat them as the reference implementation.
