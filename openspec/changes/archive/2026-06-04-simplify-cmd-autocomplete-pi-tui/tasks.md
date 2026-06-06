# Tasks: simplify-cmd-autocomplete-pi-tui

> **Scope (v2)**: replace the in-house slash-command autocomplete stack (3 sources of truth, ~1,300 LOC) with a 3-line wiring of pi-tui's built-in `CombinedAutocompleteProvider`. **No custom provider code** — the upstream provider already implements slash completion, `@`-prefixed file completion, fuzzy filter, and `/<cmd> <arg>` parameter completion. Net **-1,222 lines**, behaviorally identical to `codex`/`claude code` (modulo the Enter-submits behavioral delta — SCAP-012).
>
> **Method**: 1 sprint of atomic refactors + 1 close-out sprint. No feature flag — provider is a pure pass-through, blast radius is internal state only.

---

## Sprint 1 — Atomic refactor (5 commits, ~0.3 turn)

### 1.1 `src/components/custom-editor.ts` (delete slash callbacks)

- [ ] 1.1.1 Delete fields: `onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashDismiss`, `onSlashExactMatch` and their JSDoc.
- [ ] 1.1.2 Delete the `if (matchesKey(data, Key.up)) ... else if (Key.down) ... else if (Key.left) ... else if (Key.right) ... else if (Key.tab) ... else if (Key.return) ... else if (Key.escape) ...` slash-routing block (~150 lines).
- [ ] 1.1.3 Delete the `slashActive` getter (it read from `inputSelectors`).
- [ ] 1.1.4 Delete the trailing `wasSlashActive` / `shouldBeActive` block in `handleInput` that fired `onSlashChange` / `onSlashDismiss` after every keystroke.
- [ ] 1.1.5 Delete `canPageLeft` / `canPageRight` (no longer needed).
- [ ] 1.1.6 Keep: Vim/emacs shortcut layer, `getSlashCursor` / `syncCursor` (used by kill-ring), `onEscape` / `onCtrlC`, `addToHistoryWithTruncation` / `getFullText`, `resolveKeybinding`, `dataToKeyEvent`, `onApprovalKey` / `onApprovalNavigate` / `onApprovalSelect` / `onSessionListKey`.
- [ ] 1.1.7 Verify `bun run typecheck` green.
- [ ] 1.1.8 Commit: `refactor(custom-editor): remove slash callback surface (~150 LOC)`

### 1.2 `src/tui/state/input-state.ts` (delete suggestion state)

- [ ] 1.2.1 Delete fields: `showingSuggestions`, `suggestions`, `selectedIndex`, `currentPage`, `totalPages`, `pageSize`.
- [ ] 1.2.2 Delete actions: `setSuggestions`, `showSuggestions`, `hideSuggestions`, `selectNext`, `selectPrev`, `nextPage`, `prevPage`.
- [ ] 1.2.3 Delete selectors: `isShowingSuggestions`, `getSuggestions`, `getSelectedIndex`, `getPageInfo`, `getSelectedSuggestion`, `getCurrentPageSuggestions` (slash-specific), `getGroupedSuggestions`.
- [ ] 1.2.4 Update call sites: `grep -rn "inputActions.setSuggestions\|inputActions.hideSuggestions\|inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions" src/` must return 0 hits. Migrate any remaining callers to `editor.isShowingAutocomplete()` or remove them.
- [ ] 1.2.5 Keep: `text`, `cursorPosition`, `inputMode`, `query`, `usageCount`, `history`, `historyIndex`, and all history/mode action methods.
- [ ] 1.2.6 Verify `bun run typecheck` green.
- [ ] 1.2.7 Commit: `refactor(input-state): remove shadow suggestion state (~80 LOC)`

### 1.3 `src/commands/unified-registry.ts` (collapse to thin builder)

- [ ] 1.3.1 Delete the `UnifiedCommandRegistry` class, `fuzzySearch`, `searchByPrefix`, `getSuggestions`, `inferCategory`, `recordCommandUsage`, `getCommandUsage`, `getCommandCount`, `getUnifiedCommandRegistry`, `resetUnifiedCommandRegistry`, `getCliCommands` (replaced by the upstream provider), the `Fuse` import, and the `CATEGORY_MAP`.
- [ ] 1.3.2 Replace with: `listAllCommands()` (returns `getAllSlashCommands()`) and `findCommand(name)` (delegates to `@upup/commands.findCommand`). ~30 lines total.
- [ ] 1.3.3 Grep for usages of removed exports (`grep -rn "fuzzySearch\|searchByPrefix\|getUnifiedCommandRegistry\|getCliCommands\|recordCommandUsage\|getCommandUsage\|getCommandCount\|UnifiedCommand" src/ packages/`). For each usage, either delete the caller (if it was slash-related) or migrate to the thin builder.
- [ ] 1.3.4 Verify `bun run typecheck` green.
- [ ] 1.3.5 Commit: `refactor(unified-registry): collapse to thin builder (~370 LOC removed)`

### 1.4 `src/components/hint-bar.ts` → `src/components/status-hint.ts`

- [ ] 1.4.1 Create `src/components/status-hint.ts` (~30 lines) — a thin `Text` wrapper that renders the single-line esc/processing/permission-mode hint. Takes the same `HintBarUpdateState` shape as the old class.
- [ ] 1.4.2 Move the `update()` method logic (`leftHint` / `rightHint` / `permissionIndicator` composition) to the new file. Drop the suggestion / pagination / preview / category-grouping code.
- [ ] 1.4.3 Update imports in `src/cli.ts` from `HintBarComponent` to `StatusHintComponent`.
- [ ] 1.4.4 `git rm src/components/hint-bar.ts`.
- [ ] 1.4.5 Rename `src/components/hint-bar.test.ts` → `src/components/status-hint.test.ts`. Slim to test the new component only.
- [ ] 1.4.6 Verify `bun run typecheck` green.
- [ ] 1.4.7 Commit: `refactor(hint-bar): split to status-hint + delete suggestion UI (~515 LOC removed)`

### 1.5 `src/cli.ts` (3-line wiring + delete 80 lines)

- [ ] 1.5.1 Delete the `editor.onSlashChange = async (text) => ...` block (~10 lines, including the `getCliCommands` import).
- [ ] 1.5.2 Delete the `editor.onSlashExactMatch = (text) => ...` block (~15 lines).
- [ ] 1.5.3 Delete the `editor.onSlashNavigate = (direction) => ...` block (~10 lines, including the `hintBar.refreshPage` call).
- [ ] 1.5.4 Delete the `editor.onSlashPage = (direction) => ...` block (~12 lines, including `hintBar.nextPage` / `hintBar.prevPage`).
- [ ] 1.5.5 Delete the `editor.onSlashSelect = () => ...` block's autocomplete-specific branches. **Important**: confirm `onSubmit` already handles the line (it does — `editor.getText().trim()` → `handleSlashCommand`). Verify with smoke test.
- [ ] 1.5.6 Delete the `editor.onSlashDismiss` callback.
- [ ] 1.5.7 In the `updateView()` function, delete the `hintBar.setSuggestions` / `hintBar.clearSuggestions` branches (~10 lines). The non-suggestion path (`hintBar.update({ ... })`) becomes `statusHint.update({ ... })`.
- [ ] 1.5.8 After the editor is created, add the wiring (3 lines):
  ```ts
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
  );
  editor.setAutocompleteMaxVisible(8);
  ```
- [ ] 1.5.9 Verify `bun run typecheck` + `bun test` are green.
- [ ] 1.5.10 Commit: `refactor(cli): wire CombinedAutocompleteProvider, remove slash callbacks (~75 LOC removed)`

**Sprint 1 done when**: all 5 commits land, `bun run typecheck` and `bun test` are green, and 9-step smoke test passes.

---

## Sprint 2 — Close-out (verification + docs)

### 2.1 Add integration test

- [ ] 2.1.1 Add 1 test case to `src/components/custom-editor.test.ts` (or create the file) verifying:
  - `editor.autocompleteProvider` is the `CombinedAutocompleteProvider` instance after `setAutocompleteProvider`
  - `editor.getAutocompleteMaxVisible()` returns 8 after `setAutocompleteMaxVisible(8)`
- [ ] 2.1.2 Verify `bun test` green.

### 2.2 Code-size gate

- [ ] 2.2.1 `wc -l src/components/hint-bar.ts` — file deleted.
- [ ] 2.2.2 `wc -l src/components/custom-editor.ts` — ~250 lines (was 489).
- [ ] 2.2.3 `wc -l src/tui/state/input-state.ts` — ~500 lines (was 579; only suggestion-related code removed).
- [ ] 2.2.4 `wc -l src/commands/unified-registry.ts` — ~30 lines (was 399).
- [ ] 2.2.5 `wc -l src/components/status-hint.ts` — ~30 lines (new).
- [ ] 2.2.6 `ls src/tui/slash-autocomplete-provider.ts` — file does not exist.
- [ ] 2.2.7 `ls src/tui/slash-autocomplete-provider.test.ts` — file does not exist.
- [ ] 2.2.8 Net change: target **-1,222 lines** (more aggressive than v1's -830 estimate because no custom provider).

### 2.3 Grep verification (must be 0 hits)

- [ ] 2.3.1 `grep -rn "showingSuggestions\|inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|inputActions.nextPage\|inputActions.prevPage\|inputSelectors.isShowingSuggestions\|inputSelectors.getSuggestions\|inputSelectors.getSelectedIndex\|inputSelectors.getPageInfo\|editor.onSlash\|HintBarComponent" src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts' | grep -v 'status-hint'` → 0 hits
- [ ] 2.3.2 `grep -rn "fuzzySearch\|searchByPrefix\|getUnifiedCommandRegistry\|recordCommandUsage\|getCommandUsage\|getCommandCount\|UnifiedCommand\|getCliCommands" src/ packages/ --include='*.ts' --include='*.tsx' | grep -v unified-registry.ts | grep -v '\.test\.ts'` → 0 hits

### 2.4 Smoke test (manual, all 9 steps must pass)

- [ ] 2.4.1 `bun run start`, type `/` — popup opens with all 60+ commands.
- [ ] 2.4.2 Type `/mo` — popup narrows to `morning-brief`, `model`, `monitor`, `memory` (fuzzy match).
- [ ] 2.4.3 Press ↓ — highlight moves down (verify visually).
- [ ] 2.4.4 Press Tab — `/morning-brief ` is inserted (cursor at end), popup closes, editor ready for args.
- [ ] 2.4.5 Type `AAPL` — line becomes `/morning-brief AAPL`.
- [ ] 2.4.6 Press Enter — `handleSlashCommand` runs with args (verifies SCAP-012 Enter-submits behavior).
- [ ] 2.4.7 Press Esc — popup closes (if currently showing).
- [ ] 2.4.8 Type `@src/components/` — file-path popup appears (verifies `CombinedAutocompleteProvider` native file completion).
- [ ] 2.4.9 Confirm the `StatusHint` line (`/ for commands` / `Enter to send` / `esc to stop`) renders correctly above the prompt in all states (empty / input / processing).

### 2.5 Documentation

- [ ] 2.5.1 Update `CLAUDE.md` and `AGENTS.md` "Tools" section: remove references to `hint-bar.ts`, `unified-registry.ts`, slash wiring in `cli.ts`. Add: "Slash autocomplete is delegated to pi-tui's `CombinedAutocompleteProvider` via `editor.setAutocompleteProvider()` in `cli.ts`."
- [ ] 2.5.2 Update `docs/ARCHITECTURE.md` and `docs/CODE-MAP.md` if they mention the deleted components.

### 2.6 CHANGELOG + archive

- [ ] 2.6.1 Add a `## v6` entry to `openspec/CHANGELOG.md` summarising the refactor (one-liner: "wire pi-tui `CombinedAutocompleteProvider`; remove in-house slash UI stack (~-1,222 LOC); Enter on selected completion now submits (matches codex / claude code)").
- [ ] 2.6.2 `openspec archive simplify-cmd-autocomplete-pi-tui` (after Sprint 2 is verified).
- [ ] 2.6.3 Commit + push (with user confirmation).

**Sprint 2 done when**: all gates green, docs updated, change archived, no regressions in `bun test` / `bun run typecheck` / `bun run dev`.

---

## Out of scope (deferred)

- **Runtime dynamic command refresh** — `CombinedAutocompleteProvider` snapshots the commands array at construction. If users need to register new commands at runtime, expose a 5-line `refreshProvider()` helper in a follow-up.
- **Fuzzy-search algorithm tuning** — pi-tui's `fuzzyFilter` is the default; if a particular command name doesn't surface well, we can add `getArgumentCompletions` to upup's `SlashCommand` later.
- **Multi-line command arguments** — current scope is single-line `/cmd args`. Multi-line is a separate change.
- **Custom popup themes** — pi-tui's `EditorTheme.selectList` is used as-is. If we want the category badge back, it's a one-line theme change.
- **Usage-frequency-based sorting in the popup** — `command-usage` data is still tracked in `@upup/commands`; surfacing it in the popup requires pi-tui to expose a sort hook, which it doesn't today. Parked.
