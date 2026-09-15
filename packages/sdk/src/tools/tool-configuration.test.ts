import { describe, expect, test } from 'bun:test';
import { ToolConfiguration } from './types';

describe('ToolConfiguration', () => {
  test('binds enabled tools once and deduplicates by name', () => {
    const configuration = new ToolConfiguration([
      { name: 'quote', description: 'old', input_schema: { type: 'object' } },
      { name: 'quote', description: 'new', input_schema: { type: 'object' } },
      { name: 'disabled', description: 'ignored', disabled: true, input_schema: { type: 'object' } },
    ]);

    expect(configuration.getNames()).toEqual(['quote']);
    expect(configuration.get('quote')?.description).toBe('new');
    expect(configuration.has('disabled')).toBe(false);
    expect(configuration.size()).toBe(1);
  });

  test('returns snapshots and exposes no mutation registry methods', () => {
    const configuration = new ToolConfiguration([
      { name: 'quote', description: 'quote', input_schema: { type: 'object' } },
    ]);

    const tools = configuration.getAll();
    tools.push({ name: 'fake', description: 'fake', input_schema: { type: 'object' } });

    expect(configuration.getNames()).toEqual(['quote']);
    expect('register' in configuration).toBe(false);
    expect('unregister' in configuration).toBe(false);
    expect('clear' in configuration).toBe(false);
  });
});
