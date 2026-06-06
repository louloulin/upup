# Example Skill Plugin

A minimal reference plugin that demonstrates how to extend UpUp with
custom skills.

## What it does

Declares two skills in `upup.plugin.json`:

| Skill | Slash | Purpose |
|---|---|---|
| `example-greet` | `/greet <name>`, `/hello` | Friendly greeting, useful for verifying the plugin is loaded |
| `example-ping` | `/example-ping` | Returns `pong` — a minimal smoke-test |

Both skills are also localized: the manifest includes
`description.zh-CN`, which `getLocalizedDescription()` picks up when
`UPUP_LOCALE=zh-CN`.

## Try it

```sh
# 1. Copy into your local plugins dir
mkdir -p ~/.upup/plugins
cp -R examples/plugins/example-skill-plugin ~/.upup/plugins/

# 2. Run UpUp and type:
/skills                       # see both example skills in the list
/greet world                  # → "Hello, world! This skill was loaded from the example-skill-plugin."
/example-ping                 # → "pong"
```

## Anatomy

```
example-skill-plugin/
├── upup.plugin.json     ← manifest (capabilities + skills[])
├── index.js             ← entry; default export receives the PluginAPI
└── README.md            ← this file
```

The host loader (`src/plugins/loader.ts:loadPlugin`) reads the
manifest, calls `validatePluginSkills()` (type guard) on the
`skills[]` array, then registers each entry through the unified
`registerSkill()` so the local SkillCommandRegistry + the
`@upup/commands` bridge stay in sync.

You do **not** need to call `api.registerSkill()` manually for static
manifests — the host does it for you. The runtime API is for
dynamic skills (e.g. built from config or user input).

## Build your own

1. Copy this directory and rename it.
2. Change `id`, `name`, `version` in `upup.plugin.json`.
3. Edit the `skills[]` array — at minimum each entry needs
   `name`, `description`, `instructions`.
4. (Optional) Use `api.registerSkill()` in `index.js` for dynamic
   registration.

See `packages/plugin-sdk/` for the full TypeScript shape of
`PluginAPI`.
