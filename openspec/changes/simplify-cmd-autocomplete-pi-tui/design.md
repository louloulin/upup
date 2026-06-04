# Design: simplify-cmd-autocomplete-pi-tui

## 1. Overview

Replace the in-house slash-command autocomplete stack (3 sources of truth, ~1300 lines) with pi-tui's built-in `CombinedAutocompleteProvider` driven by a 3-line wiring in `cli.ts`. The Editor owns rendering, key handling, and pagination. No custom provider code.

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
│                       AFTER (target, ~5 LOC)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   editor.setAutocompleteProvider(                                │
│     new CombinedAutocompleteProvider(getAllSlashCommands(),      │
│                                       process.cwd()))            │
│   editor.setAutocompleteMaxVisible(8)                            │
│                                                                  │
│   CombinedAutocompleteProvider (UPSTREAM, in pi-tui):            │
│     - getSuggestions() → slash (fuzzyFilter) + file + arg         │
│     - applyCompletion() → inserts "/<name> " into editor lines  │
│     - shouldTriggerFileCompletion() → Tab in non-slash context   │
│                                                                  │
│   Editor (pi-tui, unchanged):                                   │
│     - Renders the popup under the prompt                        │
│     - Handles ↑/↓/Tab/Enter/Esc/←/→ natively                    │
│     - Owns autocompleteState, no shadow state                   │
│                                                                  │
│   unified-registry.ts: thin builder (~30 LOC):                  │
│     - getCommandNames() → wiring uses this                      │
│     - findCommand(name) → executor uses this                    │
│                                                                  │
│   cli.ts: 3 lines to wire, no callbacks                         │
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
  CombinedAutocompleteProvider.getSuggestions()   ◀── UPSTREAM
       │  - extracts prefix "/mo" from line
       │  - fuzzyFilter over getAllSlashCommands()
       │  - returns { items, prefix }
       │
       ▼
  Editor.applyAutocompleteSuggestions()           ◀── built into pi-tui
       │
       ▼
  Editor renders popup under prompt                ◀── built into pi-tui
       │
       ▼
  user presses ↓ → Editor.handleInput(Key.down) → SelectList.moveDown
       │  (all built into pi-tui, no custom code)
       │
       ▼
  user presses Tab → Editor.handleInput(Key.tab)
       │
       ▼
  provider.applyCompletion(lines, cursor, item, prefix)
       │  - returns { lines: ["/morning-brief "], cursorCol: 15 }
       ▼
  Editor applies completion                       ◀── built into pi-tui
       │  (cursor lands after the trailing space)
       ▼
  user types "AAPL" → line becomes "/morning-brief AAPL"
       │
       ▼
  user presses Enter → Editor.onSubmit("/morning-brief AAPL")
       │
       ▼
  cli.handleSlashCommand("morning-brief", "AAPL")  ◀── unchanged
```

## 3. The wiring (3 lines in cli.ts)

The provider is `@earendil-works/pi-tui`'s `CombinedAutocompleteProvider`, used directly. Upup's `SlashCommand` type is structurally compatible with pi-tui's (both have `name` + `description`; upup's extra `category` / `aliases` are ignored by pi-tui). The wiring is:

```ts
// src/cli.ts  (in editor setup section, ~3 lines)
import { CombinedAutocompleteProvider } from '@earendil-works/pi-tui';
import { getAllSlashCommands } from '@upup/commands';

editor.setAutocompleteProvider(
  new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
);
editor.setAutocompleteMaxVisible(8);
```

Key properties:
- **Zero custom provider code** — `CombinedAutocompleteProvider` is upstream-maintained
- **Fuzzy matching built-in** — pi-tui's `fuzzyFilter` (better than prefix-only match)
- **File-path completion built-in** — `@<path>` patterns work out of the box
- **No pagination state** — `setAutocompleteMaxVisible(8)` controls visible items; Editor handles the scroll
- **No category headers / preview panels** — upstream popup is intentionally minimal, matching codex/claude code

### Dynamic commands

`CombinedAutocompleteProvider` snapshots the `commands` array at construction time. New dynamic commands registered after construction won't appear until the provider is reconstructed. Upup's dynamic commands register at startup (via skill / plugin init); runtime additions are rare. **v2 accepts this trade-off** — document in CHANGELOG that adding a new command requires CLI restart. If runtime refresh becomes needed, a 5-line `refreshProvider()` helper is the follow-up.

## 4. Editor wiring (cli.ts, ~5 lines total)

```ts
// src/cli.ts  (only this changes)
import { CombinedAutocompleteProvider } from '@earendil-works/pi-tui';
import { getAllSlashCommands } from '@upup/commands';

// ... inside the existing root = Container([...]) setup:
const editor = new CustomEditor(/* existing args */);
editor.setAutocompleteProvider(
  new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
);
editor.setAutocompleteMaxVisible(8);
// editor.onSlashChange / onSlashNavigate / onSlashPage / onSlashSelect / onSlashDismiss / onSlashExactMatch: ALL GONE
```

Everything else in `cli.ts` stays. `editor.onSubmit`, `editor.onEscape`, `editor.onCtrlC` are unchanged. The `handleSlashCommand(name, args)` executor is unchanged. The `handleSubmit` path is unchanged.

## 5. Editor internal cleanup (`src/components/custom-editor.ts`)

The base `Editor` from pi-tui already handles:

| Key               | Behavior (built-in)              |
|-------------------|----------------------------------|
| ↑ / ↓             | navigate popup (SelectList)     |
| Tab               | accept current item (no submit)  |
| Enter             | accept + submit (slash context)  |
| Esc               | dismiss popup                    |
| ← / →             | move cursor (and paginate)       |
| printable         | type-to-filter (fuzzy)           |

So we **delete** from `CustomEditor`:

- `onSlashChange`, `onSlashNavigate`, `onSlashPage`, `onSlashSelect`, `onSlashDismiss`, `onSlashExactMatch` (the callback surface)
- the ~150 lines of `if (matchesKey(data, Key.up)) ... else if (matchesKey(data, Key.down)) ...` slash logic
- the `slashActive` getter that read from `inputStore`
- the `setText` post-hooks that called `onSlashChange` after every keystroke
- the `Cursor` sync that was added to support slash pagination
- `canPageLeft` / `canPageRight` (no longer needed)

We **keep** (these are unrelated to autocomplete):

- The Vim/emacs shortcut layer (Ctrl+A/E/K/U/W/Y, Alt+B/F/D/Y)
- `getSlashCursor()` / `syncCursor()` (used by kill-ring/yank)
- `onEscape` / `onCtrlC` (general editor concerns)
- `addToHistoryWithTruncation` / `getFullText` (multi-line paste support)
- `resolveKeybinding` (extension hook used by other features)
- The `dataToKeyEvent` helper (used by `resolveKeybinding`)
- `onApprovalKey` / `onApprovalNavigate` / `onApprovalSelect` / `onSessionListKey` (approval / session modes)

Net effect: `custom-editor.ts` shrinks from 489 lines to ~250 lines.

## 6. State cleanup (`src/tui/state/input-state.ts`)

Delete these fields, actions, and selectors from `InputState` (and equivalents in `inputActions` / `inputSelectors`):

| Field            | Replaced by                            |
|------------------|----------------------------------------|
| `showingSuggestions` | `editor.isShowingAutocomplete()`   |
| `suggestions`    | (only `editor` knows them)             |
| `selectedIndex`  | (only `editor` knows it)               |
| `currentPage`    | (only `editor` knows it)               |
| `totalPages`     | (only `editor` knows it)               |
| `pageSize`       | `editor.setAutocompleteMaxVisible()`   |

| Action / Selector           | Replaced by                                |
|-----------------------------|--------------------------------------------|
| `setSuggestions`            | (provider returns them; editor applies)    |
| `showSuggestions`           | (same)                                     |
| `hideSuggestions`           | `editor.cancelAutocomplete()` (or Esc)     |
| `selectNext` / `selectPrev` | (down/up arrow; editor internal)           |
| `nextPage` / `prevPage`     | (right/left arrow at boundary; editor)     |
| `isShowingSuggestions()`    | `editor.isShowingAutocomplete()`          |
| `getSuggestions()` etc.     | (only `editor` knows them)                 |

`input-state.ts` keeps: `text`, `cursorPosition`, `inputMode`, `query`, `usageCount`, `history`, `historyIndex`, and all history/mode action methods. The text sync that some consumers depend on (`editor.updateInputState`) is preserved.

## 7. Registry collapse (`src/commands/unified-registry.ts`)

```ts
// src/commands/unified-registry.ts  (~30 LOC, down from 399)
import { getAllSlashCommands, findCommand as upstreamFindCommand, type SlashCommand } from '@upup/commands';

/** Used by cli.ts wiring to feed CombinedAutocompleteProvider. */
export function listAllCommands(): SlashCommand[] {
  return getAllSlashCommands();
}

/** Used by handleSlashCommand to resolve names + aliases. */
export function findCommand(name: string): SlashCommand | undefined {
  return upstreamFindCommand(name);
}
```

That's it. `fuzzySearch`, `searchByPrefix`, `getSuggestions`, `inferCategory`, `recordCommandUsage`, `getCommandUsage`, `getCommandCount`, the Fuse import, the CATEGORY_MAP, and the global singleton — all deleted. They were only consumed by the deleted `HintBarComponent` and the deleted slash callbacks in `cli.ts`.

`@upup/commands` already has `getCommandUsage` and `getCommandRank` if anyone needs usage data later; we just don't surface it in the popup.

## 8. Visual layout (matches codex / claude code)

```
> /mo█
  ┌──────────────────────────────────────────────┐
  │  › /morning-brief      Early morning brief…  │  ← highlighted (primary)
  │    /model             Switch the active mo… │
  │    /monitor           Tail logs and metri…  │
  │    /memory            Open the memory edi…  │
  │  …                                           │  ← scroll indicator if >8
  └──────────────────────────────────────────────┘
  esc to dismiss · enter to run · ↑↓ to navigate
```

- **No category headers** — the upstream popup doesn't render them, and codex/claude code don't either.
- **No preview panel** — the user can read the description inline; Tab/Enter is one keystroke away.
- **No "Page X / Y" footer** — the upstream popup shows a `…` overflow indicator instead.
- **No permission-mode badge in the popup** — the existing `StatusHint` (the surviving 30-line part of `HintBarComponent`) shows it on the line above the prompt, which is where it already lives.

## 9. Test strategy

### New tests

`src/components/custom-editor.test.ts` (+1 case, ~10 LOC):

- editor's `autocompleteProvider` is set after `setAutocompleteProvider`
- editor's `autocompleteMaxVisible` is set after `setAutocompleteMaxVisible`

No provider unit tests — `CombinedAutocompleteProvider` is upstream-tested.

### Updated tests

- `src/components/hint-bar.test.ts` → `src/components/status-hint.test.ts`: target the surviving 30-line `StatusHint`. Cases: empty state, processing hint, esc-pending-clear, permission mode badge.
- `src/components/custom-editor.test.ts` (new file if doesn't exist): add the 1 integration case above. Keep vim/emacs / kill-ring / history tests.

### Smoke test (manual, documented in commit message)

1. `bun run start`
2. type `/` → popup opens with all 60+ commands
3. type `/mo` → popup narrows to `morning-brief`, `model`, `monitor`, `memory`
4. press ↓ → highlight moves down
5. press Tab → `/morning-brief ` inserted (cursor after space); popup closes
6. type `AAPL` → editor shows `/morning-brief AAPL`
7. press Enter → `handleSlashCommand` runs with args
8. press Esc → popup closes
9. type `@src/components/` → file-path popup appears (verifies `CombinedAutocompleteProvider` path)

### CI gate

`bun run typecheck` and `bun test` must remain green. No new external deps.

## 10. Risk + rollback

**Risk: low.** The change is local to the slash UI. The wiring is 3 lines; `handleSlashCommand` is unchanged; `@upup/commands` API is unchanged; `Editor` is unchanged.

**Behavioral delta**:
- Enter on a selected slash completion now **submits immediately** (previously: only applied, no submit). This matches codex / claude code and is the intentional design target (SCAP-012). `handleSlashCommand` still parses the line and resolves the command.
- dynamic commands registered after CLI startup require a restart to appear in the popup (v2 trade-off; rare in practice).

**Failure modes + mitigations:**

1. *Provider returns wrong items.* Caught by smoke test #2-4; `CombinedAutocompleteProvider` is upstream-tested.
2. *Editor doesn't trigger popup.* Caught by smoke test #2; pi-tui's `tryTriggerAutocomplete` is well-tested upstream.
3. *Submission path broken.* Caught by smoke test #7; `applyCompletion` is upstream-implemented and `handleSlashCommand` is unchanged.
4. *File-path completion missing.* Caught by smoke test #9; `CombinedAutocompleteProvider` provides this natively.

**Rollback:** the change is one commit. Reverting restores the previous behavior. The `unified-registry.ts` export surface is a strict subset of the old one, so any external caller that imported the old functions will fail at typecheck, which is the desired signal to migrate.

## 11. What this does NOT do

- **No new commands** — the 60+ existing commands are unchanged.
- **No new keybindings** — we use pi-tui's defaults (matches codex / claude code).
- **No custom provider code** — we delegate to `CombinedAutocompleteProvider` from pi-tui.
- **No visual redesign** — the popup looks the same as before (single column, highlighted item, description to the right).
- **No API changes to `@upup/commands`** — `SLASH_COMMANDS`, `getAllSlashCommands`, `findCommand`, `registerDynamicCommand`, `unregisterDynamicCommand` all keep their signatures.
- **No runtime dynamic command refresh** — restart CLI to see new commands (v2 trade-off).
