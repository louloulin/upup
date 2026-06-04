# remove-tui-dead-abstraction

Remove the unused src/tui/ abstraction layer (components, hooks, overlays, utils/keybindings, main, etc.) — verified 0 external imports from the main CLI. The only surviving tui/ files are state/input-state.ts (used by cli.ts), state/store.ts (used by input-state.ts), and utils/cursor.ts (used by custom-editor.ts).
