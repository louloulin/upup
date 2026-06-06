# slash-command-autocomplete Specification

## Purpose
TBD - created by archiving change simplify-cmd-autocomplete-pi-tui. Update Purpose after archive.
## Requirements
### Requirement: SCAP-005 — Editor integration
`src/cli.ts` SHALL, immediately after constructing the `CustomEditor` (or `Editor`), call:
- `editor.setAutocompleteProvider(new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()))`
- `editor.setAutocompleteMaxVisible(8)`

#### Scenario: Provider is wired
- GIVEN the CLI starts
- WHEN the editor is constructed
- THEN `editor.autocompleteProvider` is the `CombinedAutocompleteProvider` instance
- AND `editor.autocompleteMaxVisible` is 8

#### Scenario: Type safety
- GIVEN the wiring code passes upup's `SlashCommand[]` (with `name`, `description`, `category`, `aliases?`) to `CombinedAutocompleteProvider`
- WHEN the TypeScript compiler runs
- THEN the assignment compiles (upup's `SlashCommand` is structurally compatible with pi-tui's `SlashCommand`; extra `category` / `aliases` fields are ignored by pi-tui)

### Requirement: SCAP-006 — Backward compatibility
The refactor SHALL NOT change the behavior of any existing `/<command>` execution path. Specifically:

- All commands registered in `@upup/commands.ALL_COMMANDS` SHALL remain executable via `/<name> [args]`.
- Dynamic commands registered via `registerDynamicCommand` (at startup) SHALL appear in the popup.
- Skill commands registered via `getSkillCommandRegistry()` SHALL appear in the popup.
- Aliases registered via `COMMAND_ALIASES` SHALL be resolved by the executor (the popup shows canonical names; the executor handles alias resolution as before).
- `handleSlashCommand(name, args)` in `src/cli.ts` SHALL remain unchanged.

#### Scenario: Existing command still works
- GIVEN the user types `/morning-brief AAPL` and presses Enter
- WHEN the command fires
- THEN the morning-brief CLI runs with `args = "AAPL"`
- AND no regression in output

#### Scenario: Dynamic command appears
- GIVEN a plugin registers `/foo` via `registerDynamicCommand` at startup
- WHEN the user types `/`
- THEN `foo` appears in the popup alongside the built-in commands

### Requirement: SCAP-007 — No shadow state
After the refactor, there SHALL be exactly one source of truth for "is the slash popup showing and which item is selected": the `Editor` instance (via `editor.isShowingAutocomplete()`).

- The fields `showingSuggestions`, `suggestions`, `selectedIndex`, `currentPage`, `totalPages`, `pageSize` SHALL be removed from `src/tui/state/input-state.ts`.
- The actions `setSuggestions`, `showSuggestions`, `hideSuggestions`, `selectNext`, `selectPrev`, `nextPage`, `prevPage` SHALL be removed from `inputActions`.
- The selectors `isShowingSuggestions`, `getSuggestions`, `getSelectedIndex`, `getPageInfo` SHALL be removed from `inputSelectors`.
- The fields `onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashDismiss`, `onSlashExactMatch` SHALL be removed from `CustomEditor`.
- The `slashActive` getter on `CustomEditor` SHALL be removed.

#### Scenario: Grep for shadow state
- GIVEN the refactor is complete
- WHEN `grep -rn "showingSuggestions\|inputActions.setSuggestions\|inputActions.hideSuggestions\|inputActions.selectNext\|inputActions.selectPrev\|editor.onSlash" src/` is run
- THEN zero hits remain in non-test code

### Requirement: SCAP-008 — Test coverage
- `src/components/custom-editor.test.ts` SHALL contain at least 1 integration test case verifying that `setAutocompleteProvider` correctly wires `CombinedAutocompleteProvider` and that `setAutocompleteMaxVisible(8)` is reflected.
- `src/components/status-hint.test.ts` SHALL contain test cases for the new `StatusHint` component (empty state, processing hint, esc-pending-clear, permission mode badge, input state, approval state).
- `bun test` SHALL be green.
- `bun run typecheck` SHALL be green.
- `bun run dev` SHALL start without console errors.

#### Scenario: CI green
- GIVEN the refactor is complete
- WHEN `bun run typecheck && bun test` runs in CI
- THEN both commands exit 0

### Requirement: SCAP-009 — No new external dependencies
The refactor SHALL NOT add any new entries to `package.json` `dependencies` or `devDependencies`. The implementation uses only:

- `@earendil-works/pi-tui` (already installed, version 0.76.0) — uses `CombinedAutocompleteProvider` (upstream)
- `@upup/commands` (already installed, internal) — uses `getAllSlashCommands` to feed the provider

#### Scenario: package.json unchanged
- GIVEN the refactor is complete
- WHEN `git diff package.json` is run
- THEN the diff is empty (or contains only version-bump noise unrelated to this change)

### Requirement: SCAP-012 — Enter submits slash completion (behavioral delta)
After the refactor, pressing `Enter` while the slash popup is showing SHALL apply the selected completion AND submit the line to `onSubmit`, triggering `handleSlashCommand`. This matches the behavior of `codex` and `claude code` (Tab accepts without submitting; Enter accepts AND submits). The previous upup behavior ("Enter only applies, no submit") is intentionally replaced.

- Pressing `Tab` while the popup is showing SHALL apply the selected completion and leave the cursor in the editor (no submit). This allows the user to type args and submit manually.
- Pressing `Enter` while the popup is showing SHALL apply the selected completion (e.g., `/morning-brief `) AND call `onSubmit` with the line. `onSubmit` in `cli.ts` already calls `handleSlashCommand` (with `getText().trim()` to strip the trailing space), so command execution is unchanged.
- The trailing space in the applied completion (`/morning-brief `) is tolerated by `onSubmit` (uses `trim()`).

#### Scenario: Tab accepts, no submit
- GIVEN the user types `/mo` and the popup shows `morning-brief`
- WHEN the user presses `Tab`
- THEN the line becomes `/morning-brief ` with cursor at position 15
- AND the popup closes
- AND `onSubmit` is NOT called (user can continue typing args)

#### Scenario: Enter accepts AND submits
- GIVEN the user types `/mo` and the popup shows `morning-brief`
- WHEN the user presses `Enter`
- THEN `applyCompletion` inserts `/morning-brief ` (trailing space)
- AND the popup closes
- AND `onSubmit` IS called with `/morning-brief ` (trimmed to `/morning-brief`)
- AND `handleSlashCommand("morning-brief", "")` runs the morning-brief command

#### Scenario: Type-to-filter with fuzzy
- GIVEN the user types `/mbrf`
- WHEN the popup is shown
- THEN `morning-brief` appears in the list (fuzzy match, not just prefix match)
- AND it is highlighted as the best match (per pi-tui's `getBestAutocompleteMatchIndex`)

### Requirement: SCAP-013 — No new files
The refactor SHALL NOT add new TypeScript files under `src/tui/` or `src/components/` beyond the following single new file:

- `src/components/status-hint.ts` (~30 lines, replaces hint-bar.ts's single-line hint responsibility)

`src/tui/slash-autocomplete-provider.ts` and its test file SHALL NOT be created — pi-tui's `CombinedAutocompleteProvider` is used directly. This keeps the change minimal and delegates to upstream.

#### Scenario: File count
- GIVEN the refactor is complete
- WHEN `find src/tui src/components -name '*.ts' -newer package.json` is run
- THEN only `src/components/status-hint.ts` is listed as a new file
- AND `src/tui/slash-autocomplete-provider.ts` does not exist

