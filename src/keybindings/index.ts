/**
 * Keybinding System — Barrel exports
 */

export type {
  ParsedKeystroke,
  Keybinding,
  KeybindingBlock,
  KeyEvent,
  ResolveResult,
  KeybindingContext,
  KeybindingAction,
} from './types.js';

export {
  parseKeystroke,
  parseChord,
  keyEventToKeystroke,
  keystrokesMatch,
  formatKeystroke,
} from './parser.js';

export {
  resolveKey,
  flattenBindings,
  mergeBindings,
} from './resolver.js';

export { DEFAULT_KEYBINDINGS } from './defaults.js';
