# Comet Design Handoff

- Change: simplify-cmd-autocomplete-pi-tui
- Phase: design
- Mode: compact
- Context hash: d5e7fe4f38236062ef6f58adcad3cc58b0bc7e8effad2be151d91ca15fd1779a

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/simplify-cmd-autocomplete-pi-tui/proposal.md

- Source: openspec/changes/simplify-cmd-autocomplete-pi-tui/proposal.md
- Lines: 1-32
- SHA256: 6cf1fa38d4e954147747e1b0cf350001f3cde94cc431da4a89de4e04f528148b

```md
## Why

UpUp's slash-command UX is implemented as a parallel, in-house autocomplete stack on top of the same TUI library that already ships a complete, working one (`@earendil-works/pi-tui`'s `Editor` + `AutocompleteProvider` + `CombinedAutocompleteProvider`). The result is roughly **1,300 lines of shadow state** (`HintBarComponent` 545 lines + `CustomEditor` slash handling ~150 lines + `input-state` suggestion fields + `unified-registry.ts` + cli wiring in `cli.ts`) that re-implements what the upstream library already provides: arrow-key navigation, Tab/Enter/Esc handling, fuzzy match, pagination, and combined slash+file completion. This duplication has already produced a confusing three-flag state model (`inputStore.showingSuggestions` vs `editor.slashActive` vs `hintBar.showingSuggestions` all tracking the same thing), and it pulls the project away from the model that `codex` and `claude code` use (both delegate to the TUI's autocomplete provider, not a custom dropdown). The refactor is to **adopt pi-tui's `AutocompleteProvider` as the single mechanism for slash-command completion**, and let `Editor` own rendering, keys, and pagination. This makes the cmd view behaviorally identical to `codex`/`claude code` with a single thin adapter file (~80 lines) and a measurable reduction in code surface.

## What Changes

- **NEW** `src/tui/slash-autocomplete-provider.ts` — a single `AutocompleteProvider` implementation that adapts `@upup/commands.SLASH_COMMANDS` (plus dynamic + skill commands) to pi-tui's `AutocompleteProvider` interface. Owns the only data flow for completion. ~80 lines.
- **MODIFY** `src/components/custom-editor.ts` — remove the `onSlashChange / onSlashNavigate / onSlashPage / onSlashSelect / onSlashDismiss / onSlashExactMatch` callback surface and the duplicated up/down/Tab/Enter/Esc/left/right logic. Keep Vim/emacs shortcuts and the Cursor-based history logic that are unrelated to autocomplete.
- **MODIFY** `src/tui/state/input-state.ts` — delete the suggestion-related fields (`showingSuggestions`, `suggestions`, `selectedIndex`, `currentPage`, `totalPages`, `pageSize`) and their actions. The Editor is the single source of truth for autocomplete state.
- **MODIFY** `src/commands/unified-registry.ts` — collapse to a thin builder that returns the command list the provider consumes and exposes `findCommand(name)` for the executor. Drop the Fuse index, usage cache, category map, and the duplicated `matchCommands` re-implementation (pi-tui's provider uses prefix + fuzzy natively).
- **MODIFY** `src/cli.ts` — remove the slash-suggestion wiring (`editor.onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashExactMatch`, `hintBar.setSuggestions`, `hintBar.clearSuggestions`, `hintBar.refreshPage`, `hintBar.nextPage`, `hintBar.prevPage`). Replace with one line: `editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider())`. Keep the `handleSlashCommand` executor path unchanged.
- **DELETE** `src/components/hint-bar.ts` — its remaining responsibility (single-line esc/processing/permission hints) moves into a 30-line `StatusHint` component.
- **MODIFY** test fixtures: add `src/tui/slash-autocomplete-provider.test.ts` (5+ cases), update `hint-bar.test.ts` to target the new `StatusHint`, and slim `custom-editor.test.ts` (drop vim/emacs-related slash cases that no longer apply).

No new runtime dependencies. No public API changes to `@upup/commands`. Backward compatible: all existing `/<command>` behavior is preserved.

## Capabilities

### New Capabilities
- `slash-command-autocomplete`: a single, testable `AutocompleteProvider` that maps the upup command registry to pi-tui's built-in slash-command + file-path popup. Owns the only data flow for command completion. Spec covers: provider behavior (prefix, fuzzy, exact-match, dynamic + skill commands), editor integration (`setAutocompleteProvider`, `setAutocompleteMaxVisible`), and the exec path on completion (`applyCompletion` -> `handleSlashCommand`).

### Modified Capabilities
None. No spec-level requirement changes outside the cmd autocomplete scope; the existing 60+ commands keep their definitions and execution semantics.

## Impact

- **Code removed (est.)**: 545 lines (`hint-bar.ts`) + ~180 lines (slash handling in `custom-editor.ts`) + ~60 lines (`input-state` suggestion fields) + ~80 lines (Fuse/category in `unified-registry.ts`) + ~80 lines (slash wiring in `cli.ts`) = **~940 lines net removed**, replaced by **~80 lines** of new provider + **~30 lines** of new status hint. Net **-830 lines** while increasing test coverage and removing three sources of truth.
- **Files touched**: `src/components/hint-bar.ts` (delete), `src/components/custom-editor.ts`, `src/commands/unified-registry.ts`, `src/tui/state/input-state.ts`, `src/cli.ts`. `src/components/select-list.ts` is unchanged (it's the model/approval selector, not the slash path).
- **Tests**: `src/tui/slash-autocomplete-provider.test.ts` (new), `src/components/custom-editor.test.ts` (slim down), `src/components/hint-bar.test.ts` -> rename/move to status-hint. `bun test` and `bun run typecheck` must remain green.
- **No new external deps**. pi-tui 0.76.0 (already installed) is the only TUI library; `CombinedAutocompleteProvider` from the same package gives us file-path + slash completion in one call.
- **Risk**: low. The provider has a 4-method surface (`getSuggestions` / `applyCompletion` / optional `shouldTriggerFileCompletion`), and pi-tui's `Editor` is the consumer. Behavior is verifiable end-to-end with the existing `bun test` harness and a manual smoke test in `src/index.tsx` (type `/mo<Tab>` -> see `/morning-brief` highlighted -> arrow keys navigate -> Enter runs it).
- **Behavioral parity with codex/claude code**: identical key map (arrow keys navigate, Tab/Enter accept, Esc dismiss, left/right paginate, type-to-filter). Identical visual: a compact, single-column list immediately under the prompt with the current item highlighted in primary color.
```

## openspec/changes/simplify-cmd-autocomplete-pi-tui/design.md

- Source: openspec/changes/simplify-cmd-autocomplete-pi-tui/design.md
- Lines: 1-334
- SHA256: 7649b269777cf50fb4e195938f9b1d762814e907cf617e55da4653c854512576

[TRUNCATED]

```md
# Design: simplify-cmd-autocomplete-pi-tui

## 1. Overview

Replace the in-house slash-command autocomplete stack (3 sources of truth, ~1300 lines) with pi-tui's built-in `AutocompleteProvider` + `CombinedAutocompleteProvider` driven by a single thin adapter. The Editor owns rendering, key handling, and pagination. A new `SlashCommandAutocompleteProvider` owns the *data* (where commands come from). The CLI wires them with one line.

```
┌──────────────────────────────────────────────────────────────────┐
│                     BEFORE (current, ~1300 LOC)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   editor.handleInput ──> onSlashChange ──> inputStore.set ─┐     │
│         │                                                  │     │
│         ├─> onSlashNavigate (up/down) ──> inputStore ─┐    │     │
│         ├─> onSlashPage (left/right) ──> hintBar ─┐   │    │     │
│         └─> onSlashSelect (Tab/Enter) ──> handleSlashCommand
│                                                            │    │
│   hintBar.render <── inputStore.get <─────────────────────┘    │
│   (545 lines: pagination, category headers, preview)            │
│                                                                  │
│   input-state.ts: 6 suggestion fields + 6 actions               │
│   unified-registry.ts: Fuse index, category map, usage cache    │
│   cli.ts: ~80 lines of slash wiring                             │
│                                                                  │
│   ⚠️  Three sources of truth: editor.slashActive,                │
│       inputStore.showingSuggestions, hintBar.showingSuggestions │
└──────────────────────────────────────────────────────────────────┘

                                │
                                ▼

┌──────────────────────────────────────────────────────────────────┐
│                       AFTER (target, ~80 LOC)                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider())
│                                                                  │
│   SlashCommandAutocompleteProvider (NEW, ~80 LOC):               │
│     - getSuggestions() → SLASH_COMMANDS filtered by prefix       │
│     - applyCompletion() → inserts "/<name> " into editor lines  │
│     - shouldTriggerFileCompletion() → delegates to file path     │
│                                                                  │
│   Editor (pi-tui, unchanged):                                   │
│     - Renders the popup under the prompt                        │
│     - Handles ↑/↓/Tab/Enter/Esc/←/→ natively                    │
│     - Owns autocompleteState, no shadow state                   │
│                                                                  │
│   unified-registry.ts: thin builder (~30 LOC):                  │
│     - getCommandNames() → provider uses this                    │
│     - findCommand(name) → executor uses this                    │
│                                                                  │
│   cli.ts: one line to wire, no callbacks                        │
│                                                                  │
│   handleSlashCommand(name, args): unchanged, fires on submit    │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Data flow

```
  user types "/mo"
       │
       ▼
  Editor.handleInput("mo")
       │  (pi-tui, unchanged)
       ▼
  Editor.tryTriggerAutocomplete()                 ◀── debounced 100ms
       │
       ▼
  provider.getSuggestions(lines=["/mo"], cursor, {signal, force})
       │
       ▼
  SlashCommandAutocompleteProvider.getSuggestions()
       │  - extracts prefix "/mo" from line
       │  - SLASH_COMMANDS.filter(c => c.name.startsWith("mo"))
       │  - returns { items: [{value:"morning-brief",label:"/morning-brief",description:"…"}],
       │               prefix:"mo" }
       │
       ▼
  Editor.applyAutocompleteSuggestions()           ◀── built into pi-tui
```

Full source: openspec/changes/simplify-cmd-autocomplete-pi-tui/design.md

## openspec/changes/simplify-cmd-autocomplete-pi-tui/tasks.md

- Source: openspec/changes/simplify-cmd-autocomplete-pi-tui/tasks.md
- Lines: 1-154
- SHA256: be6502783a69453d350b50dfa15fc05301fa1f8f9c3ddc762910a6a550b73816

[TRUNCATED]

```md
# Tasks: simplify-cmd-autocomplete-pi-tui

> **Scope**: replace the in-house slash-command autocomplete stack (3 sources of truth, ~1300 LOC) with a single `SlashCommandAutocompleteProvider` that drives pi-tui's built-in `AutocompleteProvider` + `CombinedAutocompleteProvider` popup. Net **-830 lines**, behaviorally identical to `codex`/`claude code`.
>
> **Method**: 5 sprints, each independently typecheck + test green. Ship behind a single feature flag (`UPUP_PI_TUI_AUTOCOMPLETE`, default on) so the old path can be toggled for rollback.

---

## Sprint 1 — Provider (foundation, no behavior change yet)

### 1.1 `src/tui/slash-autocomplete-provider.ts` (NEW)

- [ ] 1.1.1 Create `SlashCommandAutocompleteProvider` class implementing `AutocompleteProvider` from `@earendil-works/pi-tui` (4 methods: `getSuggestions`, `applyCompletion`, `shouldTriggerFileCompletion`; `getArgumentCompletions` optional).
- [ ] 1.1.2 `getSuggestions` returns `null` when `lines[cursorLine]` does not start with `/`, when the line contains a space (already submitted), or when the prefix is empty (unless `force` is set).
- [ ] 1.1.3 `getSuggestions` returns prefix-matched items from `getAllSlashCommands()` (which includes dynamic + skill commands), capped at 20, each as `{ value, label: '/<name>', description }`.
- [ ] 1.1.4 `applyCompletion` returns `{ lines: ['/<value> '], cursorLine, cursorCol: <value>.length + 2 }` to place cursor after the trailing space.
- [ ] 1.1.5 `shouldTriggerFileCompletion` returns true only for lines matching `/^\/\S+\s+(\S*)$/` with `cursorCol` past the command name.
- [ ] 1.1.6 Add JSDoc on every public method explaining the contract.

### 1.2 Tests for the provider

- [ ] 1.2.1 Create `src/tui/slash-autocomplete-provider.test.ts` with 6+ cases covering each branch of `getSuggestions`, the `applyCompletion` cursor position, and the `shouldTriggerFileCompletion` regex.
- [ ] 1.2.2 Run `bun test src/tui/slash-autocomplete-provider.test.ts` — all green.

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
```

Full source: openspec/changes/simplify-cmd-autocomplete-pi-tui/tasks.md

## openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md

- Source: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
- Lines: 1-179
- SHA256: a7c6100f1d616b1087e34444e4937fedecf862137419db9690843c95e089f273

[TRUNCATED]

```md
# slash-command-autocomplete

## Purpose

A single, testable `AutocompleteProvider` that maps the upup command registry to pi-tui's built-in slash-command + file-path popup. The provider is the only place that knows how to translate upup's command definitions into pi-tui's autocomplete items. The Editor (from `@earendil-works/pi-tui`) owns rendering, key handling, and pagination. The CLI is wired with one line: `editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider())`. The result is a cmd view behaviorally identical to `codex` / `claude code` (arrow keys navigate, Tab/Enter accept, Esc dismiss, type-to-filter, file-path completion on `/cmd <path>`), implemented in ~80 lines of new code and a net **-830 lines** of removed shadow state.

## ADDED Requirements

### Requirement: SCAP-001 — Provider implementation
`src/tui/slash-autocomplete-provider.ts` SHALL export a class `SlashCommandAutocompleteProvider` that implements `AutocompleteProvider` from `@earendil-works/pi-tui`.

#### Scenario: Class shape
- WHEN the file is imported
- THEN it exports a class with three public methods: `getSuggestions`, `applyCompletion`, `shouldTriggerFileCompletion`
- AND no other public surface

### Requirement: SCAP-002 — `getSuggestions` rules
The provider's `getSuggestions(lines, cursorLine, _cursorCol, { signal, force })` SHALL:

- Return `null` when `lines[cursorLine]` does not start with `/`.
- Return `null` when `lines[cursorLine]` contains a space (the user is past the command name into arguments).
- Return `null` when the prefix is empty (the text after `/` is empty) AND `force` is not set.
- Otherwise, return `{ items: AutocompleteItem[], prefix: string }` where:
  - `items` is the result of filtering `getAllSlashCommands()` (from `@upup/commands`) by `c.name.startsWith(prefix.toLowerCase())`
  - `items` is capped at 20 entries
  - Each item is `{ value: c.name, label: `/${c.name}`, description: c.description }`

#### Scenario: Empty input
- GIVEN the user types `/`
- WHEN `getSuggestions` is called with `force: false`
- THEN it returns `null` (no popup)

#### Scenario: Prefix match
- GIVEN the user types `/mo`
- WHEN `getSuggestions` is called
- THEN it returns items whose `value` starts with `mo` (case-insensitive), capped at 20
- AND each item has `label: '/<value>'` and `description` from the registry

#### Scenario: Post-argument
- GIVEN the user types `/morning-brief arg1`
- WHEN `getSuggestions` is called
- THEN it returns `null` (slash context is closed)

#### Scenario: Force-open
- GIVEN the user types `/`
- WHEN `getSuggestions` is called with `force: true`
- THEN it returns the full list of commands (capped at 20), not `null`

### Requirement: SCAP-003 — `applyCompletion` rules
The provider's `applyCompletion(_lines, cursorLine, _cursorCol, item, _prefix)` SHALL return `{ lines: ['/<value> '], cursorLine, cursorCol: <value>.length + 2 }`.

#### Scenario: Cursor position
- GIVEN the user is on `/mo` and selects `morning-brief`
- WHEN `applyCompletion` is called with `item.value = 'morning-brief'`
- THEN it returns `{ lines: ['/morning-brief '], cursorLine, cursorCol: 15 }`
- AND the editor places the cursor immediately after the trailing space

### Requirement: SCAP-004 — `shouldTriggerFileCompletion` rules
The provider's `shouldTriggerFileCompletion(lines, cursorLine, cursorCol)` SHALL return `true` if and only if `lines[cursorLine]` matches the regex `/^\/\S+\s+(\S*)$/` AND `cursorCol` is past the command name (i.e., inside the path token).

#### Scenario: File-path popup
- GIVEN the user types `/read_filings src/components/`
- WHEN `shouldTriggerFileCompletion` is called
- THEN it returns `true`

#### Scenario: No path token
- GIVEN the user types `/morning-brief`
- WHEN `shouldTriggerFileCompletion` is called
- THEN it returns `false` (no path yet)

### Requirement: SCAP-005 — Editor integration
`src/cli.ts` SHALL, immediately after constructing the `CustomEditor` (or `Editor`), call:
- `editor.setAutocompleteProvider(new SlashCommandAutocompleteProvider())`
- `editor.setAutocompleteMaxVisible(8)`

#### Scenario: Provider is wired
- GIVEN the CLI starts
- WHEN the editor is constructed
- THEN `editor.autocompleteProvider` is the `SlashCommandAutocompleteProvider` instance
- AND `editor.autocompleteMaxVisible` is 8
```

Full source: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md

