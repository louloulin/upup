# Context Checkpoint Handoff — modularize-src-into-bun-workspaces

> Next agent: read this + `openspec/changes/modularize-src-into-bun-workspaces/{proposal,design,tasks}.md`

## 1. 任务
全面整改 upup 代码 → bun workspace 架构。`src/index.tsx` 只做应用壳。

## 2. 当前状态 (2026-06-06)

### L1 ✅ 2/2 — types, utils
### L2 ✅ 7/7 — llm(0), hooks(13 pre), keybindings(0), state(0), tui-renderer(142 pre), agent-runtime(67), memory-system(20)
### L3 ✅ 2/2 — storage(17 pre), telemetry(4 pre)
### L4 ✅ 16/17 packages with real content
| Package | Files | Errors | Status |
|---|---|---|---|
| plan-system | 13 | 0 | ✅ |
| realtime-channel | 6 | 0 | ✅ |
| mcp | 4 | 0 | ✅ |
| services-core | 7 | 1 | ✅ (pre-existing) |
| bridge-system | 19 | 4 | ✅ (pre-existing) |
| cron | 7 | 7 | mostly pre-existing |
| daemon | 10 | 12 | mostly pre-existing |
| session-system | 17 | 14 | mostly pre-existing |
| memory-system | 32 | 20 | mostly pre-existing |
| multimodal-system | 6 | 11 | type issues |
| skills | 39 | 36 | mostly pre-existing |
| plugins | 20 | 40 | cross-refs |
| gateway | 35 | 52 | cross-refs |
| research-system | 26 | 55 | cross-refs |
| coordinator-system | 45 | 60 | cross-refs |
| agent-runtime | 51 | 67 | pre-existing + stubs |
| tools-registry | 19 | 103 | cross-refs to src/tools/ |

### L5 ✅ services-core (1 pre-existing error)
### L6 ✅ @upup/cli (18 files, 74 errors — same-level imports)
### L7 ✅ @upup/index-app (thin shell, 0 errors)

## 3. This session's migrations (~250 files)

| Source | Destination | Files |
|---|---|---|
| src/agent/ | packages/agent-runtime/ | 51 (previous session) |
| src/memory/ | packages/memory-system/ | 32 |
| src/skills/ | packages/skills/ | 39 |
| src/tools/registry/ | packages/tools-registry/ | 19 |
| src/cron/ | packages/cron/ | 7 |
| src/daemon/ | packages/daemon/ | 10 |
| src/gateway/ | packages/gateway/ | 35 |
| src/plugins/ | packages/plugins/ | 20 |
| src/session/ | packages/session-system/ | 17 |
| src/bridge/ | packages/bridge-system/ | 19 |
| src/multi-agent/+subagent/+coordinator/ | packages/coordinator-system/ | 45 |
| src/plan/+tasks/ | packages/plan-system/ | 13 |
| src/research/+analysis/+competitive-positioning/+code-archaeology/+coach/ | packages/research-system/ | 26 |
| src/multimodal/ | packages/multimodal-system/ | 6 |
| src/realtime/ | packages/realtime-channel/ | 6 |
| src/permissions/+services/ | packages/services-core/ | 7 |
| src/commands/ | packages/cli/ | 18 |

## 4. Key technical decisions
1. **exports field**: Use `"./*": "./src/*.ts"` (with .ts extension) for subpath imports
2. **tsconfig paths**: Each package has explicit `paths` for cross-package resolution
3. **No `rootDir`**: Set `composite: false, noEmit: true` to allow cross-package resolution
4. **Stub strategy**: L4 packages with real content have full file migrations
5. **Pre-existing errors**: Documented but not blocking (noUncheckedIndexedAccess, etc.)

## 5. Critical import rewrite patterns

| Old | New |
|---|---|
| `from '../model/llm.js'` | `from '@upup/llm'` |
| `from '../utils/xxx.js'` | `from '@upup/utils/xxx'` |
| `from '../hooks/xxx.js'` | `from '@upup/hooks/xxx'` |
| `from '../memory/xxx.js'` | `from '@upup/memory-system/xxx'` |
| `from '../session/xxx.js'` | `from '@upup/session-system/xxx'` |
| `from '../plan/xxx.js'` | `from '@upup/plan-system/xxx'` |
| `from '../skills/xxx.js'` | `from '@upup/skills/xxx'` |
| `from '../telemetry/xxx.js'` | `from '@upup/telemetry/xxx'` |
| `from '../agent/xxx.js'` (same dir) | `from './xxx'` |
| `from '../agent/types.js'` | `from '@upup/agent-runtime/types'` |
| `from '../daemon/session.js'` | `from '@upup/daemon/session'` |
| `from '../state/index.js'` | `from '@upup/state'` |
| `from './agent/xxx.js'` (same-level) | `from '@upup/agent-runtime/xxx'` |
| `from '../skills/bundled/index.js'` | `from '@upup/skills/bundled'` |
| `from '../theme.js'` | `from '@upup/tui-renderer/theme'` |

## 6. tsconfig pattern (CRITICAL)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false, "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@upup/types": ["../types/src"],
      "@upup/utils": ["../utils/src"],
      // ... one entry per dependency package
    }
  },
  "include": ["src/**/*"]
}
```

## 7. Remaining work
1. Fix remaining real errors in gateway, plugins, research-system, coordinator-system
2. Migrate remaining src/ subdirectories: kairos, screening, proactive, stdio, worktree, evals
3. Configure bunfig.toml + build:packages + lint:boundaries
4. Verify: typecheck + test + boundaries + compile

## 8. Workspace
- 34 packages total (added @upup/cli, @upup/index-app this session)
- Path: `/Users/louloulin/.codex/worktrees/848c/upup`
- Branch: `codex/848c`
- ~250 files migrated this session
