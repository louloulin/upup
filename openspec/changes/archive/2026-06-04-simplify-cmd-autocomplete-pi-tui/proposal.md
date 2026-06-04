## Why

UpUp's slash-command UX is implemented as a parallel, in-house autocomplete stack on top of the same TUI library that already ships a complete, working one (`@earendil-works/pi-tui`'s `Editor` + `AutocompleteProvider` + `CombinedAutocompleteProvider`). The result is roughly **1,300 lines of shadow state** (`HintBarComponent` 545 lines + `CustomEditor` slash handling ~150 lines + `input-state` suggestion fields + `unified-registry.ts` + cli wiring in `cli.ts`) that re-implements what the upstream library already provides: arrow-key navigation, Tab/Enter/Esc handling, fuzzy match, pagination, and combined slash+file completion. This duplication has already produced a confusing three-flag state model (`inputStore.showingSuggestions` vs `editor.slashActive` vs `hintBar.showingSuggestions` all tracking the same thing), and it pulls the project away from the model that `codex` and `claude code` use (both delegate to the TUI's autocomplete provider, not a custom dropdown). The refactor is to **delegate to pi-tui's `CombinedAutocompleteProvider` directly** (zero lines of provider code) and let `Editor` own rendering, keys, and pagination. This makes the cmd view behaviorally identical to `codex`/`claude code` with a single 3-line wiring change in `cli.ts` and a measurable reduction in code surface.

## What Changes

- **NO new provider file** — use `@earendil-works/pi-tui`'s `CombinedAutocompleteProvider` directly. It already implements slash-command completion, `@`-prefixed file completion, fuzzy filter, and `/<cmd> <arg>` parameter completion. Upup's `SlashCommand` type is structurally compatible (has `name` + `description`; extra `category` / `aliases` are ignored).
- **MODIFY** `src/components/custom-editor.ts` — remove the `onSlashChange / onSlashNavigate / onSlashPage / onSlashSelect / onSlashDismiss / onSlashExactMatch` callback surface and the duplicated up/down/Tab/Enter/Esc/left/right logic. Keep Vim/emacs shortcuts and the Cursor-based history logic that are unrelated to autocomplete.
- **MODIFY** `src/tui/state/input-state.ts` — delete the suggestion-related fields (`showingSuggestions`, `suggestions`, `selectedIndex`, `currentPage`, `totalPages`, `pageSize`) and their actions + selectors. The Editor is the single source of truth for autocomplete state.
- **MODIFY** `src/commands/unified-registry.ts` — collapse to a thin builder that returns the command list the provider consumes and exposes `findCommand(name)` for the executor. Drop the Fuse index, usage cache, category map, and the duplicated `matchCommands` re-implementation (pi-tui's `fuzzyFilter` handles this natively).
- **MODIFY** `src/cli.ts` — remove the slash-suggestion wiring (`editor.onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashExactMatch`, `hintBar.setSuggestions`, `hintBar.clearSuggestions`, `hintBar.refreshPage`, `hintBar.nextPage`, `hintBar.prevPage`). Add **3 lines**:
  ```ts
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
  );
  editor.setAutocompleteMaxVisible(8);
  ```
  Keep the `handleSlashCommand` executor path unchanged.
- **DELETE** `src/components/hint-bar.ts` — its remaining responsibility (single-line esc/processing/permission hints) moves into a 30-line `StatusHint` component.
- **MODIFY** test fixtures: rename `hint-bar.test.ts` to `status-hint.test.ts` (slim), add 1 integration test for the editor wiring.

No new runtime dependencies. No public API changes to `@upup/commands`. Backward compatible: all existing `/<command>` behavior is preserved, with the **intentional exception** that Enter on a selected slash completion now submits immediately (matching codex / claude code; previous upup behavior was "apply only, no submit").

## Capabilities

### New Capabilities
- `slash-command-autocomplete`: delegates the cmd popup to `CombinedAutocompleteProvider` from pi-tui (already implemented upstream). Spec covers: editor integration (`setAutocompleteProvider`, `setAutocompleteMaxVisible`), single state source invariant, and the exec path on completion (`applyCompletion` -> `handleSlashCommand` via `onSubmit`).

### Modified Capabilities
None. No spec-level requirement changes outside the cmd autocomplete scope; the existing 60+ commands keep their definitions and execution semantics. **Behavioral delta**: Enter on a selected completion now submits (previously only applied) — this matches codex / claude code and is called out in SCAP-012.

## Impact

- **Code removed (est.)**: 545 lines (`hint-bar.ts`) + ~180 lines (slash handling in `custom-editor.ts`) + ~80 lines (`input-state` suggestion fields) + ~370 lines (Fuse/category/singletons in `unified-registry.ts`) + ~80 lines (slash wiring in `cli.ts`) = **~1,255 lines removed**, replaced by **~30 lines** of new `StatusHint` component + **3 lines** of `setAutocompleteProvider` wiring. Net **-1,222 lines** (more aggressive than v1 design's -830 estimate because we no longer write a custom provider).
- **Files touched**: `src/components/hint-bar.ts` (delete), `src/components/custom-editor.ts`, `src/commands/unified-registry.ts`, `src/tui/state/input-state.ts`, `src/cli.ts`. `src/components/select-list.ts` is unchanged (it's the model/approval selector, not the slash path).
- **Tests**: `src/components/hint-bar.test.ts` -> rename/move to `src/components/status-hint.test.ts`; add 1 integration case to `custom-editor.test.ts`. `bun test` and `bun run typecheck` must remain green.
- **No new external deps**. pi-tui 0.76.0 (already installed) is the only TUI library; `CombinedAutocompleteProvider` from the same package gives us file-path + slash completion in one call.
- **Risk**: low. The wiring is 3 lines; `handleSlashCommand` is unchanged; `@upup/commands` API is unchanged. Behavior is verifiable end-to-end with the existing `bun test` harness and a manual smoke test in `src/index.tsx` (type `/mo<Tab>` -> see `/morning-brief ` inserted -> press Enter to run).
- **Behavioral parity with codex/claude code**: identical key map (arrow keys navigate, Tab accepts without submitting, Enter accepts AND submits, Esc dismisses, type-to-filter with fuzzy, `@` triggers file completion). Identical visual: a compact, single-column list immediately under the prompt with the current item highlighted in primary color.
