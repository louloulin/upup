/**
 * Keystroke Parser
 *
 * Parses human-readable key strings like "ctrl+shift+k" into structured data.
 * Reference: Loucode's keybindings/parser.ts
 */

import type { ParsedKeystroke, KeyEvent } from './types';

/**
 * Parse a keystroke string like "ctrl+shift+k" into a ParsedKeystroke.
 *
 * Supported modifiers: ctrl, alt, opt, shift, meta, cmd, super
 * Special keys: enter, return, tab, escape, esc, space, backspace, delete,
 *   up, down, left, right, home, end, pageup, pagedown, f1-f12
 */
export function parseKeystroke(str: string): ParsedKeystroke {
  const parts = str.toLowerCase().split('+').map(s => s.trim());
  const result: ParsedKeystroke = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
      case 'opt':
      case 'option':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'super':
        result.meta = true;
        break;
      default:
        result.key = normalizeKey(part);
        break;
    }
  }

  return result;
}

/**
 * Parse a chord string like "ctrl+k ctrl+s" into an array of keystrokes.
 */
export function parseChord(str: string): ParsedKeystroke[] {
  return str.split(/\s+/).filter(Boolean).map(parseKeystroke);
}

/**
 * Convert a KeyEvent to a ParsedKeystroke for comparison.
 */
export function keyEventToKeystroke(event: KeyEvent): ParsedKeystroke {
  return {
    key: normalizeKey(event.key),
    ctrl: event.ctrl,
    alt: event.alt,
    shift: event.shift,
    meta: event.meta,
  };
}

/**
 * Check if two keystrokes match.
 */
export function keystrokesMatch(a: ParsedKeystroke, b: ParsedKeystroke): boolean {
  return (
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

/**
 * Format a keystroke back to a human-readable string.
 */
export function formatKeystroke(ks: ParsedKeystroke): string {
  const parts: string[] = [];
  if (ks.ctrl) parts.push('ctrl');
  if (ks.alt) parts.push('alt');
  if (ks.shift) parts.push('shift');
  if (ks.meta) parts.push('cmd');
  parts.push(ks.key);
  return parts.join('+');
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Normalize key names to a canonical form.
 */
function normalizeKey(key: string): string {
  const aliases: Record<string, string> = {
    'return': 'enter',
    'esc': 'escape',
    'del': 'delete',
    'bs': 'backspace',
    'spc': 'space',
    ' ': 'space',
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    'pgup': 'pageup',
    'pgdown': 'pagedown',
  };

  const lower = key.toLowerCase();
  return aliases[lower] ?? lower;
}
