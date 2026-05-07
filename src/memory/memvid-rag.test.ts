import { describe, expect, test } from 'bun:test';
import { resolveMemvidRagSettings, toMemvidModelSpec } from './memvid-rag.js';

describe('memvid RAG settings', () => {
  test('disables RAG by default', () => {
    const settings = resolveMemvidRagSettings({ flag: undefined, modelId: 'gpt-5.4', providerId: 'openai' });
    expect(settings.enabled).toBe(false);
    expect(settings.reason).toContain('disabled');
  });

  test('resolves openai model spec when enabled', () => {
    const settings = resolveMemvidRagSettings({ flag: true, modelId: 'gpt-5.4', providerId: 'openai' });
    expect(settings.enabled).toBe(true);
    expect(settings.supported).toBe(true);
    expect(settings.model).toBe('openai:gpt-5.4');
    expect(settings.mode).toBe('lex');
  });

  test('marks unsupported providers clearly', () => {
    const settings = resolveMemvidRagSettings({ flag: true, modelId: 'ollama:llama3.1', providerId: 'ollama' });
    expect(settings.enabled).toBe(true);
    expect(settings.supported).toBe(false);
    expect(settings.reason).toContain('Unsupported provider');
  });

  test('normalizes prefixed model IDs', () => {
    expect(toMemvidModelSpec('claude-sonnet-4-5', 'anthropic')).toBe('anthropic:claude-sonnet-4-5');
    expect(toMemvidModelSpec('openrouter:openai/gpt-4o-mini', 'openai')).toBe('openai:openai/gpt-4o-mini');
  });
});
