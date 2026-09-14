/**
 * Keybinding Types
 * Minimal type definitions for the keybinding system.
 */

export interface ParsedKeystroke {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  super?: boolean;
}

export interface Keybinding {
  chord: ParsedKeystroke;
  action: string;
  context: string;
}

export interface KeybindingBlock {
  context: string;
  bindings: Record<string, string | null>;
}

export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type ResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' };

export type KeybindingContext = 'Global' | 'Chat' | 'Editor' | 'Approval' | 'Selection';
export type KeybindingAction = string;

export interface ParsedBinding {
  context: string;
  keys: ParsedKeystroke[];
  action: string;
}
