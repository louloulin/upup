/**
 * Tests for the channel profile registry. The registry chooses how the
 * agent tailors its responses to the channel (CLI vs WhatsApp) and
 * provides a CLI fallback for unknown channels.
 */

import { describe, expect, test } from 'bun:test';
import { getChannelProfile } from './channels';

describe('getChannelProfile', () => {
  test('returns the CLI profile by default and when the channel is "cli"', () => {
    const defaultProfile = getChannelProfile();
    const cliProfile = getChannelProfile('cli');
    expect(defaultProfile.label).toBe('CLI');
    expect(cliProfile.label).toBe('CLI');
    expect(defaultProfile).toBe(cliProfile);
  });

  test('returns the WhatsApp profile when the channel is "whatsapp"', () => {
    const profile = getChannelProfile('whatsapp');
    expect(profile.label).toBe('WhatsApp');
    expect(profile.tables).toBeNull();
    // WhatsApp profile forbids markdown headers and tables in the response
    // format guidance — keep the contract observable in this assertion so
    // that any future loosening of the channel rules is intentional.
    expect(profile.responseFormat.some((rule) => /no markdown headers/i.test(rule))).toBe(true);
    expect(profile.responseFormat.some((rule) => /no tables/i.test(rule))).toBe(true);
  });

  test('falls back to the CLI profile for unknown channel identifiers', () => {
    const fallback = getChannelProfile('unknown-channel');
    expect(fallback.label).toBe('CLI');
  });

  test('CLI profile permits markdown tables while WhatsApp does not', () => {
    expect(getChannelProfile('cli').tables).toContain('markdown tables');
    expect(getChannelProfile('whatsapp').tables).toBeNull();
  });
});
