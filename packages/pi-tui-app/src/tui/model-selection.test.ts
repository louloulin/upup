import { describe, expect, test } from 'bun:test';
import type { ModelSelectionDependencies } from './model-selection.js';
import { ModelSelectionController } from './model-selection.js';

function createDependencies(overrides: Partial<ModelSelectionDependencies> = {}) {
  const settings = new Map<string, unknown>([
    ['provider', 'deepseek'],
    ['modelId', 'deepseek-v4-flash'],
  ]);
  const savedKeys = new Set<string>();
  const calls = { ollama: 0, saved: [] as Array<[string, string]> };
  const dependencies: ModelSelectionDependencies = {
    getSetting: <T>(key: string, defaultValue: T) => (settings.get(key) as T | undefined) ?? defaultValue,
    setSetting: (key, value) => {
      settings.set(key, value);
      return true;
    },
    checkApiKeyExistsForProvider: (providerId) => savedKeys.has(providerId),
    getProviderDisplayName: (providerId) => providerId,
    saveApiKeyForProvider: (providerId, apiKey) => {
      savedKeys.add(providerId);
      calls.saved.push([providerId, apiKey]);
      return true;
    },
    getOllamaModels: async () => {
      calls.ollama++;
      return ['llama3.2'];
    },
    promptRunner: async () => 'fixture summary',
    ...overrides,
  };
  return { dependencies, settings, savedKeys, calls };
}

describe('ModelSelectionController', () => {
  test('switches a provider with an existing key and persists the selected model', async () => {
    const { dependencies, settings, savedKeys } = createDependencies();
    savedKeys.add('openai');
    const controller = new ModelSelectionController(() => {}, dependencies);

    controller.startSelection();
    expect(controller.state.appState).toBe('provider_select');
    await controller.handleProviderSelect('openai');
    expect(controller.state.appState).toBe('model_select');
    controller.handleModelSelect('gpt-5.4');

    expect(controller.provider).toBe('openai');
    expect(controller.model).toBe('gpt-5.4');
    expect(settings.get('provider')).toBe('openai');
    expect(settings.get('modelId')).toBe('gpt-5.4');
    expect(controller.state.appState).toBe('idle');
  });

  test('supports Ollama discovery and custom OpenRouter model input', async () => {
    const { dependencies, calls, savedKeys } = createDependencies();
    savedKeys.add('ollama');
    const controller = new ModelSelectionController(() => {}, dependencies);

    await controller.handleProviderSelect('ollama');
    expect(calls.ollama).toBe(1);
    expect(controller.state.pendingModels.map(({ id }) => id)).toEqual(['llama3.2']);
    controller.handleModelSelect('llama3.2');
    expect(controller.model).toBe('ollama:llama3.2');

    await controller.handleProviderSelect('openrouter');
    expect(controller.state.appState).toBe('model_input');
    savedKeys.add('openrouter');
    controller.handleModelInputSubmit('custom-model');
    expect(controller.model).toBe('openrouter:custom-model');
  });

  test('requires and saves a missing provider key, while cancellation resets pending state', async () => {
    const errors: string[] = [];
    const { dependencies, calls } = createDependencies();
    const controller = new ModelSelectionController((message) => errors.push(message), dependencies);

    await controller.handleProviderSelect('anthropic');
    controller.handleModelSelect('claude-sonnet-4-6');
    expect(controller.state.appState).toBe('api_key_confirm');
    controller.handleApiKeyConfirm(true);
    expect(controller.state.appState).toBe('api_key_input');
    controller.handleApiKeySubmit('secret');

    expect(calls.saved).toEqual([['anthropic', 'secret']]);
    expect(controller.provider).toBe('anthropic');
    expect(controller.model).toBe('claude-sonnet-4-6');
    expect(errors).toEqual([]);

    controller.startSelection();
    controller.cancelSelection();
    expect(controller.state).toMatchObject({
      appState: 'idle',
      pendingProvider: null,
      pendingModels: [],
    });
  });
});
