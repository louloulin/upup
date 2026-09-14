/**
 * Plugin manifest skills[] type-guard tests (P1.7 — round 2)
 *
 * Verifies validatePluginSkills() rejects malformed skill entries
 * with clear error messages and accepts well-formed ones.
 */

import { describe, expect, test } from 'bun:test';
import { validatePluginSkills } from '../src/manifest.js';

describe('validatePluginSkills (P1.7 round 2)', () => {
  test('accepts an empty array', () => {
    expect(() => validatePluginSkills([])).not.toThrow();
  });

  test('accepts a minimal valid entry', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'foo', description: 'desc', instructions: 'body' },
      ]),
    ).not.toThrow();
  });

  test('accepts a full valid entry with all optional fields', () => {
    expect(() =>
      validatePluginSkills([
        {
          name: 'foo',
          description: 'desc',
          instructions: 'body',
          argumentHint: '<ticker>',
          aliases: ['f', 'fo'],
          model: 'haiku',
          context: 'inline',
          userInvocable: true,
        },
      ]),
    ).not.toThrow();
  });

  test('rejects non-array input', () => {
    expect(() => validatePluginSkills('not an array' as unknown as never)).toThrow(
      'must be an array',
    );
    expect(() => validatePluginSkills(null as unknown as never)).toThrow();
    expect(() => validatePluginSkills({} as unknown as never)).toThrow();
  });

  test('rejects non-object entries', () => {
    expect(() => validatePluginSkills(['string' as unknown as never])).toThrow(
      'is not an object',
    );
    expect(() => validatePluginSkills([null] as unknown as never)).toThrow();
  });

  test('rejects missing or invalid name', () => {
    expect(() =>
      validatePluginSkills([{ description: 'd', instructions: 'i' }]),
    ).toThrow('name must be a non-empty string');
    expect(() =>
      validatePluginSkills([
        { name: '', description: 'd', instructions: 'i' },
      ]),
    ).toThrow('name must be a non-empty string');
    expect(() =>
      validatePluginSkills([
        { name: 42, description: 'd', instructions: 'i' },
      ]),
    ).toThrow('name must be a non-empty string');
  });

  test('rejects missing or invalid description', () => {
    expect(() =>
      validatePluginSkills([{ name: 'x', instructions: 'i' }]),
    ).toThrow('description must be a string');
  });

  test('rejects missing or invalid instructions', () => {
    expect(() =>
      validatePluginSkills([{ name: 'x', description: 'd' }]),
    ).toThrow('instructions must be a string');
  });

  test('rejects invalid argumentHint type', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', argumentHint: 42 },
      ]),
    ).toThrow('argumentHint must be a string');
  });

  test('rejects non-string[] aliases', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', aliases: 'foo' },
      ]),
    ).toThrow('aliases must be string[]');
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', aliases: [1, 2] },
      ]),
    ).toThrow('aliases must be string[]');
  });

  test('rejects invalid model values', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', model: 'gpt-4' },
      ]),
    ).toThrow('model must be sonnet|haiku|opus|default');
  });

  test('rejects invalid context values', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', context: 'swarm' },
      ]),
    ).toThrow('context must be inline|fork');
  });

  test('rejects non-boolean userInvocable', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'x', description: 'd', instructions: 'i', userInvocable: 'yes' },
      ]),
    ).toThrow('userInvocable must be boolean');
  });

  test('error messages include index of the bad entry', () => {
    expect(() =>
      validatePluginSkills([
        { name: 'good', description: 'd', instructions: 'i' },
        { name: '', description: 'd', instructions: 'i' },
      ]),
    ).toThrow(/skill\[1\]/);
  });
});
