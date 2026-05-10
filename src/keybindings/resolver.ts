/**
 * Keybinding Resolver
 *
 * Pure function: key event + active contexts + bindings → action.
 * Supports "last binding wins" for user overrides.
 *
 * Reference: Loucode's keybindings/resolver.ts
 */

import type {
  ParsedKeystroke,
  KeyEvent,
  Keybinding,
  ResolveResult,
  KeybindingBlock,
} from './types.js';
import { parseKeystroke, keyEventToKeystroke, keystrokesMatch } from './parser.js';

/**
 * Resolve a key event against a set of bindings and active contexts.
 *
 * Priority: last defined binding wins (user overrides default).
 * Context priority: explicit context > Global.
 */
export function resolveKey(
  event: KeyEvent,
  activeContexts: string[],
  bindings: Keybinding[],
): ResolveResult {
  const eventKs = keyEventToKeystroke(event);

  // Search bindings in reverse order (last wins)
  let match: Keybinding | null = null;

  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i];

    // Check if binding's context is active
    if (binding.context !== 'Global' && !activeContexts.includes(binding.context)) {
      continue;
    }

    if (keystrokesMatch(eventKs, binding.chord)) {
      match = binding;
      break;
    }
  }

  if (!match) {
    return { type: 'none' };
  }

  if (match.action === null as unknown as string) {
    return { type: 'unbound' };
  }

  return { type: 'match', action: match.action };
}

/**
 * Flatten keybinding blocks into a flat array of Keybinding objects.
 */
export function flattenBindings(blocks: KeybindingBlock[]): Keybinding[] {
  const result: Keybinding[] = [];

  for (const block of blocks) {
    for (const [keyStr, action] of Object.entries(block.bindings)) {
      const chord = parseKeystroke(keyStr);
      result.push({
        chord,
        action: action ?? '',
        context: block.context,
      });
    }
  }

  return result;
}

/**
 * Merge two binding arrays (user overrides default).
 * User bindings are appended after defaults (so they win via "last wins").
 */
export function mergeBindings(
  defaults: Keybinding[],
  userOverrides: Keybinding[],
): Keybinding[] {
  return [...defaults, ...userOverrides];
}
