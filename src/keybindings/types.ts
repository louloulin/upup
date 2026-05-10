/**
 * Keybinding Types
 *
 * Minimal type definitions for the keybinding system.
 * Reference: Loucode's keybindings/types.ts
 */

/** Parsed modifier+key combination */
export interface ParsedKeystroke {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** A single keybinding: chord → action in a context */
export interface Keybinding {
  chord: ParsedKeystroke;
  action: string;
  context: string;
}

/** A block of keybindings for a specific UI context */
export interface KeybindingBlock {
  context: string;
  bindings: Record<string, string | null>;
}

/** Key event from the terminal */
export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** Resolution result for a key event */
export type ResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' };

/** Available UI contexts */
export type KeybindingContext = 'Global' | 'Chat' | 'Editor' | 'Approval' | 'Selection';

/** Available actions */
export type KeybindingAction = string;
