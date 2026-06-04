# Design: Remove the Dead `src/tui/` Abstraction Layer

## Goal

After Sprint v6 (`simplify-cmd-autocomplete-pi-tui`) deleted the in-house slash autocomplete stack, the parallel `src/tui/` abstraction layer is dead — 0 external imports of any of its `components/`, `hooks/`, `overlays/`, `keybindings/`, `renderer/`, `main/`, `cli-integration/`, `focus-manager/`, `overlay-coordinator/`, or 4 of 6 `state/` files. This change removes the dead layer and leaves only the 4 files that the CLI actually depends on, so `rg src/tui/` no longer surfaces 46 dead hits.

## Non-Goals

- No behavioral change at runtime (the dead code was unreachable).
- No new abstraction, no new tests, no new docs.
- No openspec spec delta (canonical specs are unchanged).
- No refactor of the 4 surviving files beyond what is required to make them stand alone.

## Why the Layer is Dead

The `src/tui/` directory was an early in-house TUI abstraction layer that pre-dated the migration to Ink + pi-tui. It shipped a parallel world — its own `InputState`, `AppState`, `HistoryStore`, `ToolEventStore`, `QueryGuard`, hook system (`useInput`, `useStore`, `useApproval`, …), overlay coordinator, focus manager, incremental renderer, and a custom set of components that wrap pi-tui primitives but add no functionality the CLI uses.

After v6 collapsed the slash-autocomplete path onto pi-tui's `CombinedAutocompleteProvider` directly, the abstraction layer stopped being load-bearing: nothing imports from it any more except a 4-file tail. The audit that proves this is the same one used to plan v6:

```bash
rg -rE "from ['\"]\.{1,2}/.*tui/" src/ packages/ --type ts --type tsx \
  | grep -v '^src/tui/'
```

Returns **0** results, both before and after the v6 fix (`38e35e5e fix(custom-editor): stop intercepting up/down`). The 46 dead files are therefore genuinely orphaned — they have no callers, internal or external.

## What's Alive (KEEP)

Verified by `rg`:

| File | External consumer | Notes |
|------|-------------------|-------|
| `src/tui/state/input-state.ts` | `src/cli.ts:87`, `src/components/custom-editor.ts:3` | Single store for input text + cursor position |
| `src/tui/state/store.ts` | `src/tui/state/input-state.ts:10` (internal) | Generic `createStore<T>()` primitive used by `input-state.ts` |
| `src/tui/state/store.test.ts` | (test for `store.ts`) | 8-test file, exercises `setState` / `subscribe` / `getState` |
| `src/tui/utils/cursor.ts` | `src/components/custom-editor.ts:4` | `Cursor` class for cursor-position math |

After deletion, these 4 files are isolated utilities — they no longer form an "abstraction layer" in any meaningful sense. The name `src/tui/` lingers as a directory name, but the contents are just two stores and one cursor helper. Future work that needs TUI state should add to `src/hooks/` or `src/state/`, not re-grow the layer.

## What's Dead (DELETE)

46 files, ~3000 LOC. Grouped:

### `src/tui/components/` (12 files)
```
chat-log.ts               command-categories.ts   command-groups.ts
command-history.ts        command-preview.ts      command-registry.ts
editor.ts                 hint-bar.ts             index.ts
tool-event.ts             updatable-select.ts     virtual-container.ts
```

### `src/tui/hooks/` (9 files)
```
index.ts                  use-approval.ts         use-cli-integration.ts
use-input.ts              use-query.ts            use-reactive-render.ts
use-scroll-quantum.ts     use-store.ts            use-streaming.ts
use-sync-store.ts
```

### `src/tui/overlays/` (5 files)
```
approval-overlay.ts       confirm-dialog.ts       index.ts
model-selector.ts         session-selector.ts
```

### `src/tui/utils/` (6 files; keep `cursor.ts`)
```
component-pool.ts         format.ts               fuzzy-search.ts
index.ts                  keybindings.ts          theme.ts
```

### `src/tui/state/` (6 files; keep `input-state.ts`, `store.ts`, `store.test.ts`)
```
app-state.ts              history-store.ts        index.ts
query-guard.ts            query-guard.test.ts     tool-event-store.ts
```

### `src/tui/keybindings/` (2 files)
```
index.ts                  keybindings.ts
```

### `src/tui/renderer/` (1 file)
```
incremental-renderer.ts
```

### `src/tui/` root (5 files)
```
main.ts                   cli-integration.ts      focus-manager.ts
overlay-coordinator.ts    index.ts
```

## Why Splitting into Multiple Commits is Not Needed

This is a single, atomic, behavior-preserving deletion. Splitting it into 2+ commits would create intermediate states where `bun run typecheck` could fail (e.g., deleting `tui/components/chat-log.ts` while `tui/components/editor.ts` still re-exports it), and the value of "small atomic commits" is reduced for a deletion where every line in the changeset is `git rm`. One commit is correct.

The previous handoff suggested 1–2 commits based on blast radius. After verification, the entire change is ~3000 LOC of pure `git rm` with zero source edits — TypeScript can verify correctness only on the final state, so multi-commit splitting would be cosmetic and add risk. **One commit, no source edits.**

## Execution Plan (atomic)

```bash
# 1. Stage the deletion
git rm -r \
  src/tui/components \
  src/tui/hooks \
  src/tui/overlays \
  src/tui/keybindings \
  src/tui/renderer \
  src/tui/main.ts \
  src/tui/cli-integration.ts \
  src/tui/focus-manager.ts \
  src/tui/overlay-coordinator.ts \
  src/tui/index.ts

# The keep-set in src/tui/utils/ and src/tui/state/ is deleted individually:
git rm \
  src/tui/utils/component-pool.ts \
  src/tui/utils/format.ts \
  src/tui/utils/fuzzy-search.ts \
  src/tui/utils/index.ts \
  src/tui/utils/keybindings.ts \
  src/tui/utils/theme.ts \
  src/tui/state/app-state.ts \
  src/tui/state/history-store.ts \
  src/tui/state/index.ts \
  src/tui/state/query-guard.ts \
  src/tui/state/query-guard.test.ts \
  src/tui/state/tool-event-store.ts

# 2. Verify
bun run typecheck       # must pass
bun test                # must pass; same numbers as v6 (4447 pass, 18 pre-existing investment-workflow timeouts)

# 3. Commit + archive
git commit -m "chore(tui): remove dead abstraction layer (~3000 LOC, 46 files)"
openspec archive remove-tui-dead-abstraction --yes
```

## Verification

Each gate is observable by command, not by intent.

| Gate | Command | Pass criteria |
|------|---------|---------------|
| Typecheck | `bun run typecheck` | Exit 0, 0 errors |
| Tests | `bun test` | Same totals as v6: 4447 pass, 18 fail (all 18 pre-existing investment-workflow / backtest timeouts, unrelated to this change) |
| Dead-code audit | `rg -rE "from ['\"]\.{1,2}/.*tui/" src/ packages/ \| grep -v '^src/tui/'` | Returns only the 4 alive keep-set references (1 from `cli.ts`, 1 from `custom-editor.ts`, 1 from `tui/state/input-state.ts`) |
| File count | `find src/tui -type f \| wc -l` | Returns 4 (matches the keep set) |
| No stragglers | `find src/tui -type d -empty` | Returns 0 (no empty dirs after deletion) |
| CHANGELOG untouched | `git diff openspec/CHANGELOG.md` | Empty (internal cleanup, not a user-visible release) |

The pre-existing 18 test failures are timeouts in `investment-workflow` / `/invest CLI` / `createPhaseHandlers` that handoff already documented. They are unrelated to TUI; they have always been there.

## Out-of-Scope Follow-Ups (not part of this change)

- The 4 surviving `src/tui/` files (`state/{input-state,store,store.test}.ts`, `utils/cursor.ts`) could be renamed / moved to `src/state/` and `src/utils/` respectively to make the directory name honest. This is a separate, larger refactor that touches the public shape of two stores and is left for a future change.
- The `openspec/CHANGELOG.md` for v6 already documents Sprint v6's deletion of `command-input.ts`, `command-state-manager.ts`, `use-slash-input.ts`, `slash-autocomplete-provider.{ts,test.ts}`, and `hint-bar.{ts,test.ts}`. This change does not need a new CHANGELOG entry.
