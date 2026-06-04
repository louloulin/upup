/**
 * Tests for SlashCommandAutocompleteProvider.
 *
 * Covers SCAP-001 (class shape), SCAP-002 (getSuggestions rules),
 * SCAP-003 (applyCompletion), SCAP-004 (shouldTriggerFileCompletion),
 * SCAP-010 (defensive null returns), SCAP-011 (trailing space invariant).
 */

import { describe, expect, spyOn, test } from 'bun:test';
import * as commands from '@upup/commands';
import { SlashCommandAutocompleteProvider } from './slash-autocomplete-provider.js';

describe('SlashCommandAutocompleteProvider', () => {
  const provider = new SlashCommandAutocompleteProvider();
  const ac = new AbortController();
  const opts = { signal: ac.signal };

  // TC-1: SCAP-002 — non-slash context
  test('returns null when line does not start with /', async () => {
    expect(await provider.getSuggestions(['hello world'], 0, 5, opts)).toBeNull();
  });

  // TC-2: SCAP-002 — line has trailing space
  test('returns null when line is "/mo " (trailing space)', async () => {
    expect(await provider.getSuggestions(['/mo '], 0, 4, opts)).toBeNull();
  });

  // TC-3: SCAP-002 — empty prefix without force
  test('returns null when prefix is empty without force', async () => {
    expect(await provider.getSuggestions(['/'], 0, 1, opts)).toBeNull();
  });

  // TC-4: SCAP-002 — prefix match, lowercased, capped at 20
  test('returns prefix-matched items, lowercased, capped at 20', async () => {
    const result = await provider.getSuggestions(['/mo'], 0, 3, opts);
    expect(result).not.toBeNull();
    expect(result!.items.length).toBeLessThanOrEqual(20);
    expect(result!.items.every((i) => i.value.startsWith('mo'))).toBe(true);
    expect(result!.items.every((i) => i.label === `/${i.value}`)).toBe(true);
    expect(result!.prefix).toBe('mo');
  });

  // TC-5: SCAP-010 — registry throws
  test('returns null and logs when commands source throws (SCAP-010)', async () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const cmdSpy = spyOn(commands, 'getAllSlashCommands').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      const faulty = new SlashCommandAutocompleteProvider();
      const result = await faulty.getSuggestions(['/mo'], 0, 3, opts);
      expect(result).toBeNull();
      expect(errSpy).toHaveBeenCalledTimes(1);
    } finally {
      cmdSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  // TC-6: SCAP-010 — empty registry
  test('returns null when registry is empty (SCAP-010)', async () => {
    const cmdSpy = spyOn(commands, 'getAllSlashCommands').mockReturnValue([]);
    try {
      const empty = new SlashCommandAutocompleteProvider();
      const result = await empty.getSuggestions(['/mo'], 0, 3, opts);
      expect(result).toBeNull();
    } finally {
      cmdSpy.mockRestore();
    }
  });

  // TC-7: SCAP-003 + SCAP-011 — applyCompletion trailing space invariant
  test('applyCompletion returns line with exactly one trailing space (SCAP-011)', () => {
    const r1 = provider.applyCompletion(
      ['/c'],
      0,
      2,
      { value: 'clear', label: '/clear' },
      'c',
    );
    expect(r1.lines[0]).toBe('/clear ');
    expect(r1.cursorCol).toBe(7);
    expect(r1.lines[0].endsWith('  ')).toBe(false);

    const r2 = provider.applyCompletion(
      ['/m'],
      0,
      2,
      { value: 'morning-brief', label: '/morning-brief' },
      'm',
    );
    expect(r2.lines[0]).toBe('/morning-brief ');
    expect(r2.cursorCol).toBe(15);
    expect(r2.lines[0].endsWith('  ')).toBe(false);
  });

  // TC-8: SCAP-004 — shouldTriggerFileCompletion (true iff regex matches + cursor in path token)
  test('shouldTriggerFileCompletion matches spec SCAP-004', () => {
    expect(provider.shouldTriggerFileCompletion(['/read_filings src/'], 0, 18)).toBe(true);
    expect(provider.shouldTriggerFileCompletion(['/read_filings src/components/'], 0, 26)).toBe(true);
    expect(provider.shouldTriggerFileCompletion(['/morning-brief'], 0, 14)).toBe(false);
    expect(provider.shouldTriggerFileCompletion(['/morning-brief arg1'], 0, 19)).toBe(true);
  });
});
