# Tasks: simplify-cmd-autocomplete-pi-tui

> **Scope**: replace the in-house slash-command autocomplete stack (3 sources of truth, ~1300 LOC) with a single `SlashCommandAutocompleteProvider` that drives pi-tui's built-in `AutocompleteProvider` + `CombinedAutocompleteProvider` popup. Net **-830 lines**, behaviorally identical to `codex`/`claude code`.
>
> **Method**: 5 sprints, each independently typecheck + test green. Ship behind a single feature flag (`UPUP_PI_TUI_AUTOCOMPLETE`, default on) so the old path can be toggled for rollback.

---

## Sprint 1 — Provider (foundation, no behavior change yet)

### 1.1 `src/tui/slash-autocomplete-provider.ts` (NEW)

- [x] 1.1.1 Create `SlashCommandAutocompleteProvider` class implementing `AutocompleteProvider` from `@earendil-works/pi-tui` (4 methods: `getSuggestions`, `applyCompletion`, `shouldTriggerFileCompletion`; `getArgumentCompletions` optional).
- [x] 1.1.2 `getSuggestions` returns `null` when `lines[cursorLine]` does not start with `/`, when the line contains a space (already submitted), or when the prefix is empty (unless `force` is set).
- [x] 1.1.3 `getSuggestions` returns prefix-matched items from `getAllSlashCommands()` (which includes dynamic + skill commands), capped at 20, each as `{ value, label: '/<name>', description }`.
- [x] 1.1.4 `applyCompletion` returns `{ lines: ['/<value> '], cursorLine, cursorCol: <value>.length + 2 }` to place cursor after the trailing space.
- [x] 1.1.5 `shouldTriggerFileCompletion` returns true only for lines matching `/^\/\S+\s+(\S*)$/` with `cursorCol` past the command name.
- [x] 1.1.6 Add JSDoc on every public method explaining the contract.

### 1.2 Tests for the provider

- [x] 1.2.1 Create `src/tui/slash-autocomplete-provider.test.ts` with 6+ cases covering each branch of `getSuggestions`, the `applyCompletion` cursor position, and the `shouldTriggerFileCompletion` regex.
- [x] 1.2.2 Run `bun test src/tui/slash-autocomplete-provider.test.ts` — all green.

### 1.3 Feature flag (compiles in both modes)

- [ ] 1.3.1 Add `UPUP_PI_TUI_AUTOCOMPLETE` to `src/agent/feature-gates.ts` with `defaultEnabled: true`, `owner: tui`.
- [ ] 1.3.2 In `src/cli.ts`, when flag is OFF, leave the old wiring in place. When ON, wire the new provider. Both paths coexist for one sprint.

**Sprint 1 done when**: `bun test src/tui/slash-autocomplete-provider.test.ts` is green and the flag can be toggled at runtime.

---

## Sprint 2 — Editor + state cleanup (the core swap)

### 2.1 `src/components/custom-editor.ts`

- [ ] 2.1.1 Delete the `onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashDismiss`, `onSlashExactMatch` callback fields and their JSDoc.
- [ ] 2.1.2 Delete the `if (matchesKey(data, Key.up)) ... else if (Key.down) ... else if (Key.left) ... else if (Key.right) ... else if (Key.tab) ... else if (Key.return) ... else if (Key.escape) ...` slash-routing block (~150 lines).
- [ ] 2.1.3 Delete the `slashActive` getter (it read from `inputSelectors`).
- [ ] 2.1.4 Delete the trailing `wasSlashActive` / `shouldBeActive` block in `handleInput` that fired `onSlashChange` / `onSlashDismiss` after every keystroke.
- [ ] 2.1.5 Delete `canPageLeft` / `canPageRight` (no longer needed).
- [ ] 2.1.6 Keep: Vim/emacs shortcut layer, `getSlashCursor` / `syncCursor` (used by kill-ring), `onEscape` / `onCtrlC`, `addToHistoryWithTruncation` / `getFullText`, `resolveKeybinding`, `dataToKeyEvent`.
- [ ] 2.1.7 Verify `bun run typecheck` green.
- [ ] 2.1.8 Slim `src/components/custom-editor.test.ts` — drop vim/emacs-related slash cases that no longer apply. Keep shortcut, history, kill-ring tests.

### 2.2 `src/tui/state/input-state.ts`

- [ ] 2.2.1 Delete fields: `showingSuggestions`, `suggestions`, `selectedIndex`, `currentPage`, `totalPages`, `pageSize`.
- [ ] 2.2.2 Delete actions: `setSuggestions`, `showSuggestions`, `hideSuggestions`, `selectNext`, `selectPrev`, `nextPage`, `prevPage`.
- [ ] 2.2.3 Update `setSuggestions` call sites (in `cli.ts` and `custom-editor.ts`) — they should no longer exist after Sprint 2.1, but `grep -r "inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|inputActions.nextPage\|inputActions.prevPage"` must return 0 hits.
- [ ] 2.2.4 Update `inputSelectors` — remove `isShowingSuggestions`, `getSuggestions`, `getSelectedIndex`, `getPageInfo`, `selectNext`, `selectPrev`, `nextPage`, `prevPage`. Grep for usages and replace with the pi-tui editor equivalents (or remove the caller if the feature is gone).
- [ ] 2.2.5 Keep: `text`, `cursorPosition`, `inputMode`, `query`, `usageCount`, `history`, `historyIndex`, and the actions that mutate them.
- [ ] 2.2.6 Verify `bun run typecheck` green.

**Sprint 2 done when**: `custom-editor.ts` is ~250 lines (down from 489), `input-state.ts` is ~80 lines (down from ~160), and `bun run typecheck` + `bun test` are green with the feature flag ON.

---

## Sprint 3 — Registry collapse + hint bar replacement

### 3.1 `src/commands/unified-registry.ts`

- [ ] 3.1.1 Delete the `UnifiedCommandRegistry` class, `fuzzySearch`, `searchByPrefix`, `getSuggestions`, `inferCategory`, `recordCommandUsage`, `getCommandUsage`, `getCommandCount`, `getUnifiedCommandRegistry`, `resetUnifiedCommandRegistry`, `getCliCommands` (replaced by the provider), the `Fuse` import, and the `CATEGORY_MAP`.
- [ ] 3.1.2 Replace with: `listAllCommands()` (returns `getAllSlashCommands()`) and `findCommand(name)` (delegates to `@upup/commands.findCommand`). ~30 lines total.
- [ ] 3.1.3 Grep for usages of removed exports (`grep -rn "fuzzySearch\|searchByPrefix\|getUnifiedCommandRegistry\|getCliCommands\|recordCommandUsage\|getCommandUsage\|getCommandCount\|UnifiedCommand" src/ packages/`). For each usage, either delete the caller (if it was slash-related) or migrate to the thin builder.
- [ ] 3.1.4 Verify `bun run typecheck` green.

### 3.2 `src/components/hint-bar.ts` → `src/components/status-hint.ts`

- [ ] 3.2.1 Create `src/components/status-hint.ts` (~30 lines) — a thin `Text` wrapper that renders the single-line esc/processing/permission-mode hint. Takes the same `HintBarUpdateState` shape as the old class.
- [ ] 3.2.2 Move the `update()` method logic (`leftHint` / `rightHint` / `permissionIndicator` composition) to the new file. Drop the suggestion / pagination / preview / category-grouping code.
- [ ] 3.2.3 Update imports in `src/cli.ts` from `HintBarComponent` to `StatusHintComponent`.
- [ ] 3.2.4 Delete `src/components/hint-bar.ts`.
- [ ] 3.2.5 Rename `src/components/hint-bar.test.ts` → `src/components/status-hint.test.ts`. Slim to test the new component only.
- [ ] 3.2.6 Verify `bun run typecheck` green.

**Sprint 3 done when**: `unified-registry.ts` is ~30 lines, `hint-bar.ts` is gone, and `bun run typecheck` + `bun test` are green with the feature flag ON.

---

## Sprint 4 — CLI wiring (the final swap)

### 4.1 `src/cli.ts` slash wiring

- [ ] 4.1.1 Delete the `editor.onSlashChange = async (text) => ...` block (~10 lines, including the `getCliCommands` import).
- [ ] 4.1.2 Delete the `editor.onSlashExactMatch = (text) => ...` block (~15 lines).
- [ ] 4.1.3 Delete the `editor.onSlashNavigate = (direction) => ...` block (~10 lines, including the `hintBar.refreshPage` call).
- [ ] 4.1.4 Delete the `editor.onSlashPage = (direction) => ...` block (~12 lines, including `hintBar.nextPage` / `hintBar.prevPage`).
- [ ] 4.1.5 Delete the `editor.onSlashSelect = () => ...` block's autocomplete-specific branches (keep the fallback to `handleSlashCommand(editorText)`).
- [ ] 4.1.6 Delete the `editor.onSlashDismiss` callback.
- [ ] 4.1.7 In the `updateView()` function, delete the `hintBar.setSuggestions` / `hintBar.clearSuggestions` branches (~10 lines). The non-suggestion path (`hintBar.update({ ... })`) becomes `statusHint.update({ ... })`.
- [ ] 4.1.8 After the editor is created, add: `editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider()); editor.setAutocompleteMaxVisible(8);`
- [ ] 4.1.9 Verify `bun run typecheck` + `bun test` are green with the feature flag ON.

### 4.2 Flip the feature flag default

- [ ] 4.2.1 In `src/agent/feature-gates.ts`, change `UPUP_PI_TUI_AUTOCOMPLETE` default to `true` permanently.
- [ ] 4.2.2 Remove the `if (flag) { old path } else { new path }` branch from `cli.ts` — keep only the new path.
- [ ] 4.2.3 Delete the `UPUP_PI_TUI_AUTOCOMPLETE` flag itself (no longer needed).

### 4.3 End-to-end smoke test

- [ ] 4.3.1 `bun run start`, type `/` — popup opens with all 60+ commands.
- [ ] 4.3.2 Type `/mo` — popup narrows to `morning-brief`, `model`, `monitor`, `memory`.
- [ ] 4.3.3 Press ↓ — highlight moves down (verify visually).
- [ ] 4.3.4 Press Enter — `/morning-brief` runs (verifies `handleSlashCommand` path unchanged).
- [ ] 4.3.5 Press Esc — popup closes.
- [ ] 4.3.6 Type `@src/components/` — file-path popup appears (verifies `CombinedAutocompleteProvider` path).
- [ ] 4.3.7 Confirm the `StatusHint` line (esc to dismiss · enter to run · ↑↓ to navigate) renders correctly above the prompt.

**Sprint 4 done when**: smoke test passes 7/7 and `bun run typecheck` + `bun test` are green.

---

## Sprint 5 — Verification + close-out

### 5.1 Test + type gate

- [ ] 5.1.1 `bun run typecheck` — green.
- [ ] 5.1.2 `bun test` — green; coverage on `slash-autocomplete-provider.ts` ≥ 80%.
- [ ] 5.1.3 `bun run dev` (watch mode) — no console errors at startup; type `/` — popup opens without warnings.

### 5.2 Code-size gate

- [ ] 5.2.1 `wc -l src/components/hint-bar.ts` — file deleted.
- [ ] 5.2.2 `wc -l src/components/custom-editor.ts` — ~250 lines (was 489).
- [ ] 5.2.3 `wc -l src/tui/state/input-state.ts` — ~80 lines (was ~160).
- [ ] 5.2.4 `wc -l src/commands/unified-registry.ts` — ~30 lines (was ~280).
- [ ] 5.2.5 `wc -l src/tui/slash-autocomplete-provider.ts` — ~80 lines (new).
- [ ] 5.2.6 `wc -l src/components/status-hint.ts` — ~30 lines (new).
- [ ] 5.2.7 Net change: target **-830 lines**.

### 5.3 Documentation

- [ ] 5.3.1 Update `CLAUDE.md` and `AGENTS.md` "Tools" section: remove references to `hint-bar.ts`, `unified-registry.ts`, slash wiring in `cli.ts`. Add: "Slash autocomplete is a `SlashCommandAutocompleteProvider` passed to `editor.setAutocompleteProvider()`."
- [ ] 5.3.2 Update `docs/ARCHITECTURE.md` and `docs/CODE-MAP.md` if they mention the deleted components.

### 5.4 CHANGELOG + archive

- [ ] 5.4.1 Add a `## v6` entry to `openspec/CHANGELOG.md` summarising the refactor.
- [ ] 5.4.2 `openspec archive simplify-cmd-autocomplete-pi-tui` (after Sprint 4 is verified).
- [ ] 5.4.3 Commit + push.

**Sprint 5 done when**: all gates green, docs updated, change archived, no regressions in `bun test` / `bun run typecheck` / `bun run dev`.

---

## Out of scope (deferred)

- Fuzzy-search algorithm tuning — pi-tui's `fuzzyFilter` is the default; if a particular command name doesn't surface well, we can add `getArgumentCompletions` later.
- Multi-line command arguments — current scope is single-line `/cmd args`. Multi-line is a separate change.
- Custom popup themes — pi-tui's `EditorTheme.selectList` is used as-is. If we want the category badge back, it's a one-line theme change.
- Usage-frequency-based sorting in the popup — `command-usage` data is still tracked in `@upup/commands`; surfacing it in the popup requires pi-tui to expose a sort hook, which it doesn't today. Parked.
