/**
 * Tests for Keybinding Resolver, Parser, and Defaults
 */

import { describe, it, expect } from 'bun:test';
import {
  parseKeystroke,
  parseChord,
  keyEventToKeystroke,
  keystrokesMatch,
  formatKeystroke,
} from './parser';
import {
  resolveKey,
  flattenBindings,
  mergeBindings,
} from './resolver';
import { DEFAULT_KEYBINDINGS } from './defaults';
import type { KeyEvent, Keybinding } from './types';

// ============================================================================
// Parser Tests
// ============================================================================

describe('parseKeystroke', () => {
  it('parses a simple key', () => {
    const ks = parseKeystroke('enter');
    expect(ks).toEqual({ key: 'enter', ctrl: false, alt: false, shift: false, meta: false });
  });

  it('parses ctrl+c', () => {
    const ks = parseKeystroke('ctrl+c');
    expect(ks).toEqual({ key: 'c', ctrl: true, alt: false, shift: false, meta: false });
  });

  it('parses ctrl+shift+k', () => {
    const ks = parseKeystroke('ctrl+shift+k');
    expect(ks).toEqual({ key: 'k', ctrl: true, alt: false, shift: true, meta: false });
  });

  it('parses alt+b (word backward)', () => {
    const ks = parseKeystroke('alt+b');
    expect(ks).toEqual({ key: 'b', ctrl: false, alt: true, shift: false, meta: false });
  });

  it('parses meta/alt/opt modifiers', () => {
    expect(parseKeystroke('cmd+s').meta).toBe(true);
    expect(parseKeystroke('meta+s').meta).toBe(true);
    expect(parseKeystroke('opt+b').alt).toBe(true);
    expect(parseKeystroke('option+b').alt).toBe(true);
  });

  it('normalizes aliases', () => {
    expect(parseKeystroke('return').key).toBe('enter');
    expect(parseKeystroke('esc').key).toBe('escape');
    expect(parseKeystroke('del').key).toBe('delete');
    expect(parseKeystroke('arrowup').key).toBe('up');
    expect(parseKeystroke('arrowdown').key).toBe('down');
    expect(parseKeystroke('pgup').key).toBe('pageup');
  });

  it('handles case insensitivity', () => {
    const ks = parseKeystroke('CTRL+C');
    expect(ks.ctrl).toBe(true);
    expect(ks.key).toBe('c');
  });

  it('parses special function keys', () => {
    expect(parseKeystroke('f1').key).toBe('f1');
    expect(parseKeystroke('f12').key).toBe('f12');
    expect(parseKeystroke('backspace').key).toBe('backspace');
    expect(parseKeystroke('space').key).toBe('space');
  });
});

describe('parseChord', () => {
  it('parses single keystroke', () => {
    const chord = parseChord('ctrl+k');
    expect(chord).toHaveLength(1);
    expect(chord[0].key).toBe('k');
    expect(chord[0].ctrl).toBe(true);
  });

  it('parses multi-key chord', () => {
    const chord = parseChord('ctrl+k ctrl+s');
    expect(chord).toHaveLength(2);
    expect(chord[0].key).toBe('k');
    expect(chord[1].key).toBe('s');
  });
});

describe('keyEventToKeystroke', () => {
  it('converts KeyEvent to ParsedKeystroke', () => {
    const event: KeyEvent = { key: 'c', ctrl: true, alt: false, shift: false, meta: false };
    const ks = keyEventToKeystroke(event);
    expect(ks).toEqual({ key: 'c', ctrl: true, alt: false, shift: false, meta: false });
  });

  it('normalizes key names', () => {
    const event: KeyEvent = { key: 'ArrowUp', ctrl: false, alt: false, shift: false, meta: false };
    const ks = keyEventToKeystroke(event);
    expect(ks.key).toBe('up');
  });
});

describe('keystrokesMatch', () => {
  it('matches identical keystrokes', () => {
    const a = parseKeystroke('ctrl+c');
    const b = parseKeystroke('ctrl+c');
    expect(keystrokesMatch(a, b)).toBe(true);
  });

  it('rejects different keys', () => {
    const a = parseKeystroke('ctrl+c');
    const b = parseKeystroke('ctrl+d');
    expect(keystrokesMatch(a, b)).toBe(false);
  });

  it('rejects different modifiers', () => {
    const a = parseKeystroke('ctrl+c');
    const b = parseKeystroke('shift+c');
    expect(keystrokesMatch(a, b)).toBe(false);
  });
});

describe('formatKeystroke', () => {
  it('formats simple key', () => {
    expect(formatKeystroke(parseKeystroke('enter'))).toBe('enter');
  });

  it('formats ctrl+key', () => {
    expect(formatKeystroke(parseKeystroke('ctrl+c'))).toBe('ctrl+c');
  });

  it('formats compound', () => {
    expect(formatKeystroke(parseKeystroke('ctrl+shift+k'))).toBe('ctrl+shift+k');
  });

  it('formats meta as cmd', () => {
    expect(formatKeystroke(parseKeystroke('meta+s'))).toBe('cmd+s');
  });
});

// ============================================================================
// Resolver Tests
// ============================================================================

describe('resolveKey', () => {
  const defaultBindings = flattenBindings(DEFAULT_KEYBINDINGS);

  it('resolves ctrl+c to app:interrupt in Global context', () => {
    const event: KeyEvent = { key: 'c', ctrl: true, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Chat'], defaultBindings);
    expect(result).toEqual({ type: 'match', action: 'app:interrupt' });
  });

  it('resolves enter to chat:submit in Chat context', () => {
    const event: KeyEvent = { key: 'enter', ctrl: false, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Chat'], defaultBindings);
    expect(result).toEqual({ type: 'match', action: 'chat:submit' });
  });

  it('resolves escape to chat:cancel in Chat context', () => {
    const event: KeyEvent = { key: 'escape', ctrl: false, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Chat'], defaultBindings);
    expect(result).toEqual({ type: 'match', action: 'chat:cancel' });
  });

  it('returns none for unmapped key', () => {
    const event: KeyEvent = { key: 'z', ctrl: false, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Chat'], defaultBindings);
    expect(result).toEqual({ type: 'none' });
  });

  it('Global bindings work regardless of active context', () => {
    const event: KeyEvent = { key: 'l', ctrl: true, alt: false, shift: false, meta: false };
    // Even with no explicit contexts, Global should match
    const result = resolveKey(event, [], defaultBindings);
    expect(result).toEqual({ type: 'match', action: 'app:clear' });
  });

  it('context-specific bindings require active context', () => {
    const event: KeyEvent = { key: 'enter', ctrl: false, alt: false, shift: false, meta: false };
    // Without Chat context, enter should not match chat:submit
    const result = resolveKey(event, [], defaultBindings);
    expect(result).toEqual({ type: 'none' });
  });

  it('user overrides win via last-binding-wins', () => {
    const userOverride: Keybinding[] = [{
      chord: parseKeystroke('ctrl+c'),
      action: 'custom:interrupt',
      context: 'Global',
    }];
    const merged = mergeBindings(defaultBindings, userOverride);
    const event: KeyEvent = { key: 'c', ctrl: true, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Chat'], merged);
    expect(result).toEqual({ type: 'match', action: 'custom:interrupt' });
  });

  it('Approval context resolves y/n', () => {
    const yEvent: KeyEvent = { key: 'y', ctrl: false, alt: false, shift: false, meta: false };
    const nEvent: KeyEvent = { key: 'n', ctrl: false, alt: false, shift: false, meta: false };
    expect(resolveKey(yEvent, ['Approval'], defaultBindings)).toEqual({ type: 'match', action: 'approval:allow' });
    expect(resolveKey(nEvent, ['Approval'], defaultBindings)).toEqual({ type: 'match', action: 'approval:deny' });
  });

  it('Editor context resolves ctrl+k', () => {
    const event: KeyEvent = { key: 'k', ctrl: true, alt: false, shift: false, meta: false };
    const result = resolveKey(event, ['Editor'], defaultBindings);
    expect(result).toEqual({ type: 'match', action: 'editor:killLine' });
  });
});

// ============================================================================
// flattenBindings Tests
// ============================================================================

describe('flattenBindings', () => {
  it('produces correct number of bindings', () => {
    const bindings = flattenBindings(DEFAULT_KEYBINDINGS);
    // Count total bindings in DEFAULT_KEYBINDINGS
    let total = 0;
    for (const block of DEFAULT_KEYBINDINGS) {
      total += Object.keys(block.bindings).length;
    }
    expect(bindings.length).toBe(total);
  });

  it('each binding has correct context', () => {
    const bindings = flattenBindings(DEFAULT_KEYBINDINGS);
    const globalBindings = bindings.filter(b => b.context === 'Global');
    expect(globalBindings.length).toBe(Object.keys(DEFAULT_KEYBINDINGS[0].bindings).length);
  });
});

// ============================================================================
// mergeBindings Tests
// ============================================================================

describe('mergeBindings', () => {
  it('appends user bindings after defaults', () => {
    const defaults = flattenBindings(DEFAULT_KEYBINDINGS);
    const user: Keybinding[] = [{
      chord: parseKeystroke('ctrl+x'),
      action: 'custom:test',
      context: 'Global',
    }];
    const merged = mergeBindings(defaults, user);
    expect(merged.length).toBe(defaults.length + 1);
    expect(merged[merged.length - 1].action).toBe('custom:test');
  });
});
