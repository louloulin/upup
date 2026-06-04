## Why

After Sprint v6 (`simplify-cmd-autocomplete-pi-tui`, 11 atomic commits) removed the in-house slash autocomplete stack, the parallel `src/tui/` abstraction layer is now a dead branch: 0 external imports of any of its `components/`, `hooks/`, `overlays/`, `keybindings/`, `renderer/`, `main/`, `cli-integration/`, `focus-manager/`, `overlay-coordinator/`, or 4 of 6 `state/` files. The only surviving consumers are:

- `src/tui/state/input-state.ts` — used by `src/cli.ts` and `src/components/custom-editor.ts`
- `src/tui/state/store.ts` — used by `input-state.ts` (internal dep)
- `src/tui/state/store.test.ts` — test for `store.ts`
- `src/tui/utils/cursor.ts` — used by `src/components/custom-editor.ts`

The other 46 files (~3000 LOC) are an internally self-contained, externally orphaned ghost of an earlier in-house TUI design that was never wired into the CLI's actual main path. Leaving them in place hurts the project on three axes:

1. **Code search noise** — `rg src/tui/` returns 46 hits that have to be mentally filtered against the 4 alive files. New contributors can't tell which TUI is "the TUI" (`src/tui/` or pi-tui).
2. **Coupling** — the dead layer still depends on pi-tui primitives (`Container`, `Text`, `Key`, `matchesKey`, etc.) and re-exports overlapping concepts, so renaming a pi-tui symbol risks breaking files nobody can run.
3. **Mental model** — the dead layer models its own "InputState" / "AppState" / "HistoryStore" / "ToolEventStore" / "QueryGuard" / "ReactiveRender" / "FocusManager" / "OverlayCoordinator" — all concepts that the live code (Ink + pi-tui + a few small stores) does not need. Keeping them invites future "I'll just hook into `tui/state/history-store.ts`" mistakes that the dead layer was never designed to serve.

## What Changes

- **DELETE** all 46 dead files in `src/tui/`:
  - `src/tui/components/` (12 files): `chat-log`, `command-categories`, `command-groups`, `command-history`, `command-preview`, `command-registry`, `editor`, `hint-bar`, `index`, `tool-event`, `updatable-select`, `virtual-container`
  - `src/tui/hooks/` (9 files): `index`, `use-approval`, `use-cli-integration`, `use-input`, `use-query`, `use-reactive-render`, `use-scroll-quantum`, `use-store`, `use-streaming`, `use-sync-store`
  - `src/tui/overlays/` (5 files): `approval-overlay`, `confirm-dialog`, `index`, `model-selector`, `session-selector`
  - `src/tui/utils/` (5 files to delete, 1 to keep): `component-pool`, `format`, `fuzzy-search`, `index`, `keybindings`, `theme` (keep `cursor.ts`)
  - `src/tui/state/` (6 files to delete, 2 source + 1 test to keep): `app-state`, `history-store`, `index`, `query-guard`, `query-guard.test`, `tool-event-store` (keep `input-state.ts`, `store.ts`, `store.test.ts`)
  - `src/tui/keybindings/` (2 files): `index`, `keybindings`
  - `src/tui/renderer/incremental-renderer.ts` (1 file)
  - `src/tui/{main,cli-integration,focus-manager,overlay-coordinator,index}.ts` (5 files)
- **KEEP** the 4 alive files (unchanged):
  - `src/tui/state/input-state.ts`
  - `src/tui/state/store.ts`
  - `src/tui/state/store.test.ts`
  - `src/tui/utils/cursor.ts`
- **No new code, no new tests, no API changes** — this is a pure deletion of dead code. `bun run typecheck` and `bun test` must remain green. The CHANGELOG is unchanged (this is internal cleanup, not a user-visible feature).

After deletion, the project no longer has a `src/tui/` *abstraction layer*; the surviving 4 files are isolated utilities used directly by the CLI. Future work that needs TUI state should add to the existing `src/hooks/` or `src/state/` (or just inline it), not re-introduce a parallel layer.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. This change has zero spec-level impact — the canonical spec at `openspec/specs/slash-command-autocomplete/spec.md` is unchanged. The deletion only removes code that no capability references.

## Impact

- **Code removed**: ~3000 LOC across 46 files.
- **Files touched**: 46 deleted, 0 modified, 0 created.
- **External API**: zero change. No exports are removed from any public surface.
- **Tests**: 0 new, 0 deleted, 0 modified. The single test in the deletion set (`src/tui/state/query-guard.test.ts`) tests `query-guard.ts`, which is itself deleted — its removal is therefore consistent.
- **Performance / runtime**: no change at runtime (the dead code was never reachable).
- **Risk**: low. Verified by 0-external-imports audit (`rg "from ['\"]\.{1,2}/.*tui/" src/ packages/ | grep -v '^src/tui/'` returns no results). The 4 surviving files are independently verified to be the only external consumers.
- **No new dependencies, no version bumps**.
- **No openspec spec delta needed** — this is a pure cleanup; the canonical specs at `openspec/specs/` are unchanged.
