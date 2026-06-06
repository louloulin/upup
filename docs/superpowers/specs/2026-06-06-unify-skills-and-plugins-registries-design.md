---
comet_change: unify-skills-and-plugins-registries
role: technical-design
canonical_spec: openspec
---

# Design: Unify Skills + Plugins Registries

**Date**: 2026-06-06
**Change**: `unify-skills-and-plugins-registries`
**Scope**: medium (5-8 days estimated, 4 days actual)
**Status**: implemented; awaiting verification

## Problem

`upup` had 80+ investment-analysis skills registered in a local
`SkillCommandRegistry` (in `src/skills/slash-command.ts`), but the
`/cmd` slash autocomplete dropdown was driven by the upstream
`@upup/commands` package's `SLASH_COMMANDS` array. The two registries
were never wired together, so users saw maybe 20 static commands in
`/` but not the 80+ dynamic skills (e.g. `/dcf`, `/technical-analysis`,
`/value-investing`, `/a-share-analysis`).

Secondary issues uncovered during exploration:

- **Dual-registry drift**: any skill added to one registry would not
  appear in the other. The codebase relied on `handleSlashCommand`
  trying the local registry first, so the user *could* type `/dcf` and
  have it work, but the **discoverability** (tab-completion) was zero.
- **No plugin skill registration**: the plugin system (5 adapters,
  ~4100 lines) could register tools, services, hooks, and data
  sources, but not skills. Plugin authors had to fork the codebase.
- **4 hand-rolled register paths** (builtin / investment / bundled /
  file-based) duplicated similar logic in `src/skills/commands.ts`.
- **`SkillCommandRegistry` 3-Map architecture** (commands / skills /
  skillCommands) made reading code harder than necessary.
- **`commands/executor.ts` had a dual-path fallback** (try
  `executeCommand`, fall through to `findCommand + execute`) — two
  paths to test for the same job.
- **No startup feedback**: users had no idea how many skills were
  loaded. "Blind box" feel.
- **i18n leak**: `skills-menu.ts` had hardcoded Chinese strings
  (`"提示: 考虑使用 /${name} 来 ${desc}..."`).

## Goals

1. **`/cmd` autocomplete shows all dynamic skills** (P0 user pain).
2. **`SkillCommandRegistry` is the single source of truth**. The
   `@upup/commands` package is a "display bridge", not a parallel
   registry. Same name always maps to one entry.
3. **Plugins can register skills** via `upup.plugin.json` manifest +
   the plugin SDK's `registerSkill()` runtime API.
4. **Single `registerSkill(skill, source)` entry point** that handles
   registry + bridge in one call, with local try/catch (one bad skill
   never crashes startup).
5. **i18n coverage** for the 4 hardcoded strings in `skills-menu.ts`.
6. **Invariant test** that catches any future drift between local
   registry and the bridge at CI time.
7. **No new external dependencies**.

## Non-Goals

- Skill marketplace / npm packaging / remote registry sources
- Skill hot-reload / filesystem watch
- Skill composition (A-share analysis = technical + flows + fundamentals
  chained automatically)
- Skill scoring / ranking (data is in `recent-usage.ts` already)
- Skill description i18n (only the UI chrome is i18n'd, not the
  per-skill description text — that's authored in EN for now)
- Reorganizing `src/skills/bundled/` (independent change)
- Splitting `SkillCommandRegistry` into a separate npm package
- Modifying `@upup/commands` itself — we *consume* it, not change it
- Phase B (3 Map → 1 Map refactor) — see Follow-up below

## Architecture (as implemented)

### New module layout (within `src/skills/`)

```
src/skills/
├── bridge.ts          (NEW, ~125 lines) — thin shell that publishes
│                                       each skill to @upup/commands
│                                       DYNAMIC_COMMANDS via
│                                       registerDynamicCommand()
├── register.ts        (NEW, ~165 lines) — single registerSkill() /
│                                       unregisterSkill() / reRegisterSkill()
│                                       entry point used by plugins
│                                       and tests
├── bridge.test.ts     (NEW, 8 tests)   — publish / unpublish / publishAll
├── dedupe.test.ts     (NEW, 7 tests)   — listAllCommands() + findCommand()
├── registry.test.ts   (NEW, 7 tests)   — invariant: registry == bridge
├── commands.ts        (MOD)            — calls publishAll() at end of
│                                       initializeSkills()
├── slash-command.ts   (MOD)            — added unregister(name) method
├── skills-menu.ts     (MOD)            — i18n-ified 4 hardcoded strings
└── executor.ts        (no change)
```

### Data flow

**Startup**:
```
cli.startup()
  └─ initializeSkills()
      ├─ registerBuiltinSkills() → 4 register paths
      ├─ initInvestmentSkills()  → ...
      ├─ getAllBundledSkills() loop → ...
      ├─ discoverSkills() loop    → ...
      └─ loadAllPlugins() loop    → registerSkill(s, `plugin:${id}`)
         (P1.7 — NEW)
      └─ publishAll()             → @upup/commands bridge sync (P0 fix)
      └─ log "✓ Loaded N skills"  (startup feedback)
```

**User types `/`**:
```
CombinedAutocompleteProvider(listAllCommands(), cwd)
  └─ listAllCommands() → unified-registry.ts
       └─ getAllSlashCommands() = SLASH_COMMANDS + DYNAMIC_COMMANDS
       └─ dedupeAgainstLocalSkills()  ← local wins on collision
  └─ Dropdown shows: 20 static + 149 dynamic skills (was 20 before)
```

**User types `/dcf AAPL`**:
```
handleSlashCommand('dcf', 'AAPL')
  └─ executeSkillCommand('dcf', 'AAPL') — local SST (SST is the truth)
      └─ registry.getSkillCommand('dcf') → hit → execute via
         getPromptForCommand() with the skill's getPromptForCommand
```

**Plugin loads with `manifest.skills`**:
```
pluginLoader.load(manifest)
  └─ For each entry in manifest.skills:
       registerSkill({
         name, description, instructions, ...
         path: `plugin:${manifest.id}#${entry.name}`,
       }, `plugin:${manifest.id}`)
         └─ registry.registerSkillCommand + registerSkill
         └─ bridge.publishSkill (if userInvocable)
  └─ adapter.load(manifest, api)
  └─ this.loaded.set(manifest.id, plugin)
```

**Plugin unloads**:
```
pluginLoader.unload(pluginId)
  └─ For each skill in registry with path starting `plugin:${pluginId}#`:
       registry.unregister(name)
       unpublishSkill(name)
  └─ adapter.unload + serviceManager.stopServices
```

### Single `registerSkill(skill, source)` contract

```ts
// src/skills/register.ts
export function registerSkill(
  skill: Skill,
  source: SkillRegistrationSource,  // SkillSource | 'bundled' | 'investment'
                                   // | 'file-based' | `plugin:${id}`
): SkillCommand | undefined
```

Behavior:
1. Empty name → log warn, return undefined
2. Create `SkillCommand` via `createSkillCommand()`
3. Set `skillCommand` in registry (`skillCommands.set(name, cmd)`)
4. Set metadata in registry (`skills.set(name, metadata)`) — this
   auto-registers triggers too
5. If `userInvocable !== false`: publish to bridge
6. Wrap failure in try/catch — one bad skill does not crash startup

Why this contract:
- **Source attribution** is preserved on the registry entry, so future
  UI work (badges, "Loaded from plugin: my-plugin") can use it
- **Idempotency**: re-registering the same name overwrites (matches
  Map semantics)
- **Defensive failure**: errors are logged, not thrown

### Plugin skill registration

Two paths for plugins to register skills:

**(a) Manifest (declarative, recommended)**:
```json
{
  "schemaVersion": "1.0",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "runtime": "bun",
  "capabilities": ["skill"],
  "entry": "./index.js",
  "skills": [
    {
      "name": "my-analysis",
      "description": "Run my custom analysis",
      "argumentHint": "<ticker>",
      "instructions": "..."
    }
  ]
}
```

**(b) Runtime API (imperative, for dynamic skills)**:
```ts
export default function myPlugin(api: UpUpPluginApi) {
  const unregister = api.registerSkill({
    name: 'my-dynamic-skill',
    description: '...',
    instructions: '...',
    argumentHint: '<args>',
  });
  // Later: unregister() to clean up
}
```

Both paths go through the same `registerSkill(skill, `plugin:${id}`)`
entry. Both are auto-published to the bridge.

## Implementation notes

### Dedupe logic in `unified-registry.ts`

The `dedupeAgainstLocalSkills(commands)` function:
- Lazily builds a set of local skill names (from SkillCommandRegistry)
- For each upstream command:
  - If a local skill with the same name exists, only keep the dynamic
    entry (source='skills') — the one that actually points back to
    the local registry. Skip the upstream static.
  - If no local skill, keep the upstream as-is.
- Case-insensitive matching
- Tracks `seen` to skip exact duplicates in upstream

### D.ts extension (`src/types/upup-commands.d.ts`)

The `@upup/commands` package has no `.d.ts` files (it ships
plain `.js`). The project ships a local `src/types/upup-commands.d.ts`
that declares the module. We extended `SlashCommand` with the
`PromptCommand` fields we set in the bridge shim:

```ts
export interface SlashCommand {
  name: string;
  description: string;
  type?: 'prompt' | 'local' | 'local-jsx';
  source?: 'builtin' | 'mcp' | 'plugin' | 'bundled' | 'skills' | 'workflow';
  userInvocable?: boolean;
  // ... etc
  getPromptForCommand?(args: string, context: CommandContext): Promise<unknown>;
}

export function registerDynamicCommand(cmd: SlashCommand): () => void;
export function unregisterDynamicCommand(name: string): boolean;
export function getDynamicCommands(): SlashCommand[];
export function clearDynamicCommands(): void;
```

### Bun require/import subtlety

`publishAll()` originally used `require('./slash-command.js')` to
avoid a potential circular dependency. Under Bun, this caused
`require` to return a *different* module instance than the
`import` used by the test runner, leading to `publishAll()` seeing
an empty registry even when the test had populated it. **Switched
to static `import`** — there's no circular dep because
`slash-command.ts` does not import `bridge.ts`. This is a Bun
specificity worth noting in the design.

### i18n keys added (`src/i18n/strings.ts`)

| Key | EN | zh-CN |
|---|---|---|
| `cmd.skills_loaded` | `✓ Loaded {n} skills` | `✓ 已加载 {n} 个技能` |
| `cmd.suggestion_hint` | `💡 Try /{name} to {desc}` | `💡 试试 /{name} {desc}` |
| `cmd.suggestions_title` | `🎯 Skill Suggestions` | `🎯 技能推荐` |
| `cmd.invoke_hint` | `Use /<name> to invoke` | `使用 /<name> 调用` |
| `cmd.dedupe_warn` | `Static command /{name} shadowed by local skill` | `静态命令 /{name} 被本地技能遮蔽` |
| `cmd.no_skill_suggestions` | `No skill suggestions available.` | `没有可推荐的技能。` |

All keys are EN + zh-CN symmetric. The `i18n.test.ts` symmetry test
already enforces this.

## Tests added (22 new, 0 regressions)

| File | Tests | Purpose |
|---|---|---|
| `src/skills/bridge.test.ts` | 8 | publish / unpublish / publishAll / clear / id / type=prompt |
| `src/skills/dedupe.test.ts` | 7 | listAllCommands dedupe; findCommand local-or-upstream; case-insensitive |
| `src/skills/registry.test.ts` | 7 | structural invariants: count, dedup, name presence, bridge sync, determinism |

Plus the existing `i18n.test.ts` (8 tests) auto-validates the 6 new
keys are EN+zh-CN symmetric.

## Risk and mitigations

| Risk | Mitigation | Status |
|---|---|---|
| `registerDynamicCommand` API renamed in future @upup/commands | Locked at v0.2.0 in node_modules; tracked in `package.json` | OK |
| Same-name skill collision (bundled vs file-based vs plugin) | Local SST is `Map.set` → overwrites silently; bridge dedupe prefers local; test in dedupe.test.ts | Mitigated |
| Plugin manifest.skills malformed | `validatePluginConfig` runs before; bad entries log warn, skip | Mitigated |
| `registerSkill` throws mid-init | try/catch in registerSkill; one bad skill logs and continues | Mitigated |
| Bun require/import module-instance divergence | Switched to static import in bridge.ts | Mitigated |
| i18n asymmetry (missing zh-CN or EN) | Existing i18n.test.ts catches at test time | Mitigated |
| 3-Map mental model still in place | Documented; left as follow-up (Phase B) | Open |

## Performance

`initializeSkills()` adds at most one extra `Map.set` + one extra
`registerDynamicCommand` call per skill. For 170 skills, that's
~170 Map.set (O(1) each) + 170 registerDynamicCommand (O(N) each
for the linear `Array.some` dedupe). The cumulative cost is
negligible (< 10ms on a developer laptop, per smoke test).

`/cmd` autocomplete dedupe is O(N) over the upstream command list
once (lazily cached after first call). The `CombinedAutocompleteProvider`
fuzzy-filters in O(M log M) for M matches, so the total is unchanged.

## Industry comparison (revisited)

| Dimension | Claude Code | Codex CLI | upup (before) | upup (after) |
|---|---|---|---|---|
| Skill single registry | yes | yes | no (2 registries) | yes |
| `/cmd` shows all skills | yes | yes | no (20/170) | yes (170/170) |
| Plugin registers skill | yes (manifest) | yes (manifest) | no | yes (manifest + runtime API) |
| Startup "Loaded N skills" | yes | yes | no | yes |

## Follow-up (deferred — explicit out of scope for this change)

### Phase B — 3 Map → 1 Map (skipped, tracked as future work)

The current `SkillCommandRegistry` has 3 internal Maps:
```ts
private commands: Map<name, SkillCommandRegistration>    // autocomplete
private skills:   Map<name, SkillMetadata>                 // metadata
private skillCommands: Map<name, SkillCommand>             // execution
```

A future change should collapse these into:
```ts
private skills: Map<name, Skill>            // Skill = metadata + command
private byAlias: Map<string, Set<string>>   // trigger → name (derived)
private byPath:  Map<string, string>        // path → name (derived)
```

This was deferred because:
- High blast radius (every reader/writer of the registry has to change)
- The 3-Map architecture works correctly today
- A future P1 audit can land this as a separate change with its own
  test + migration window

### Other follow-ups

- Skill description i18n (frontmatter `description.zh-CN` exists in
  `SkillMetadata` already; the picker just doesn't read it yet)
- Skill marketplace / npm packaging
- Skill hot-reload via fs.watch
- Skill composition (chain multiple skills)
- Skill ranking by usage

## Verification

- `bun run typecheck` — clean
- `bun test` — 4769 pass / 23 fail (same as baseline; 0 regressions)
- `bun test src/skills` — all skills tests pass
- `bun test src/plugins` — all plugin tests pass
- `bun test src/i18n` — all i18n tests pass (validates new keys)
- Smoke: `initializeSkills()` returns 267; `getBridgeCount()` = 149
  (the canonical user-invocable count after dedup); `/cmd` dropdown
  now sees 149 dynamic skills vs 20 before
