/**
 * Default Keybindings
 *
 * Defines the default keybinding table for UpUp.
 * Users can override these via ~/.upup/keybindings.json.
 *
 * Reference: Loucode's keybindings/defaultBindings.ts
 */

import type { KeybindingBlock } from './types.js';

export const DEFAULT_KEYBINDINGS: KeybindingBlock[] = [
  {
    context: 'Global',
    bindings: {
      'ctrl+c': 'app:interrupt',
      'ctrl+d': 'app:exit',
      'ctrl+l': 'app:clear',
      'ctrl+o': 'app:toggleVerbose',
      'ctrl+t': 'app:toggleTodos',
      'ctrl+slash': 'app:help',
    },
  },
  {
    context: 'Chat',
    bindings: {
      'enter': 'chat:submit',
      'escape': 'chat:cancel',
      'up': 'chat:historyPrev',
      'down': 'chat:historyNext',
      'ctrl+b': 'task:background',
      'ctrl+k': 'chat:clearInput',
      'ctrl+p': 'chat:modelPicker',
    },
  },
  {
    context: 'Editor',
    bindings: {
      'ctrl+a': 'editor:home',
      'ctrl+e': 'editor:end',
      'ctrl+k': 'editor:killLine',
      'ctrl+u': 'editor:killLineBackward',
      'ctrl+w': 'editor:killWord',
      'alt+b': 'editor:wordBackward',
      'alt+f': 'editor:wordForward',
      'ctrl+y': 'editor:yank',
    },
  },
  {
    context: 'Approval',
    bindings: {
      'y': 'approval:allow',
      'n': 'approval:deny',
      'a': 'approval:allowSession',
      'escape': 'approval:deny',
    },
  },
  {
    context: 'Selection',
    bindings: {
      'up': 'selection:prev',
      'down': 'selection:next',
      'enter': 'selection:confirm',
      'escape': 'selection:cancel',
    },
  },
];
