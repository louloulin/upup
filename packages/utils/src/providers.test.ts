import { describe, expect, test } from 'bun:test';
import {
  getPiModelInfo,
  getPiProviderInfo,
  isPiProvider,
  listPiModels,
  piProviderEnvKeys,
} from '@upup/pi-runtime/model-registry';
import { OLLAMA_PROVIDER_ID, createOllamaProviderConfig } from '@upup/pi-runtime/custom-providers';
import {
  PROVIDERS,
  getDefaultModelIdForProvider,
  getProviderApiKeyEnvVars,
  getProviderById,
  resolveProvider,
} from './providers';
import { RECOMMENDED_MODELS } from './model-defaults';

describe('@upup/utils — provider registry matches the Pi catalog', () => {
  // Ollama is contributed by UpUp via `pi.registerProvider` rather than
  // coming from the Pi catalog; exclude it from catalog-shape assertions.
  const catalogProviders = PROVIDERS.filter(
    (provider) => provider.piProviderId && provider.piProviderId !== 'ollama',
  );

  test('every Pi-backed provider exists in the Pi catalog', () => {
    expect(catalogProviders.length).toBeGreaterThan(0);
    for (const provider of catalogProviders) {
      expect(isPiProvider(provider.piProviderId!)).toBe(true);
    }
  });

  test('display names come from the Pi catalog', () => {
    for (const provider of catalogProviders) {
      expect(provider.displayName).toBe(getPiProviderInfo(provider.piProviderId!)?.name);
    }
  });

  test('API key environment variables match the names Pi resolves', () => {
    for (const provider of catalogProviders) {
      const piKeys = piProviderEnvKeys(provider.piProviderId!);
      const piApiKey = piKeys.find((key) => key.endsWith('_API_KEY')) ?? piKeys[0];
      expect(provider.apiKeyEnvVar).toBe(piApiKey);
      // The primary variable is always the first one advertised.
      expect(getProviderApiKeyEnvVars(provider.id)[0]).toBe(piApiKey);
    }
  });

  test('fast models exist in the Pi catalog and context windows match', () => {
    for (const provider of catalogProviders) {
      if (!provider.fastModel) continue;
      const model = getPiModelInfo(provider.piProviderId!, provider.fastModel);
      expect(model).toBeDefined();
      expect(provider.contextWindow).toBe(model!.contextWindow);
    }
  });

  test('fast models are published by their provider', () => {
    for (const provider of catalogProviders) {
      if (!provider.fastModel) continue;
      const ids = listPiModels(provider.piProviderId!).map((model) => model.id);
      expect(ids).toContain(provider.fastModel);
    }
  });

  test('ollama is contributed to Pi by UpUp instead of coming from the catalog', () => {
    const ollama = getProviderById('ollama');
    // Pi has no ollama entry in its generated catalog...
    expect(isPiProvider('ollama')).toBe(false);
    // ...so UpUp registers it into Pi through the documented provider API.
    expect(ollama?.id).toBe(OLLAMA_PROVIDER_ID);
    expect(createOllamaProviderConfig().api).toBe('openai-completions');
  });
});

describe('@upup/utils — provider lookup', () => {
  test('resolves providers by UpUp id, by legacy alias, and by Pi provider id', () => {
    // Legacy alias `moonshot` resolves to the canonical `moonshotai` entry.
    expect(getProviderById('moonshot')?.displayName).toBe('Moonshot AI');
    // Canonical id resolves to the same entry; the id is now the Pi id.
    expect(getProviderById('moonshotai')?.id).toBe('moonshotai');
    expect(getProviderById('kimi')?.id).toBe('moonshotai');
    expect(getProviderById('gemini')?.id).toBe('google');
    expect(getProviderById('grok')?.id).toBe('xai');
  });

  test('detects providers from a model id prefix', () => {
    expect(resolveProvider('claude-sonnet-4-6').id).toBe('anthropic');
    expect(resolveProvider('grok-4.6').id).toBe('xai');
    expect(resolveProvider('kimi-k2.5').id).toBe('moonshotai');
    expect(resolveProvider('MiniMax-M3').id).toBe('minimax');
    // OpenAI declares no prefix, so an unmatched id falls back to the first entry.
    expect(resolveProvider('gpt-5.4').id).toBe('openai');
  });

  test('advertises the pre-Pi-native Google variable as a fallback', () => {
    expect(getProviderApiKeyEnvVars('google')).toEqual(['GEMINI_API_KEY', 'GOOGLE_API_KEY']);
  });
});

describe('@upup/utils — default model per provider', () => {
  test('curated recommendations exist in the Pi catalog', () => {
    const providers = Object.keys(RECOMMENDED_MODELS);
    expect(providers.length).toBeGreaterThan(0);
    for (const providerId of providers) {
      expect(isPiProvider(providerId)).toBe(true);
      for (const modelId of RECOMMENDED_MODELS[providerId] ?? []) {
        // A renamed/removed Pi model must fail loudly instead of silently
        // degrading the default to whatever the catalog lists first.
        expect(getPiModelInfo(providerId, modelId)).toBeDefined();
      }
    }
  });

  test('prefers the curated head over the catalog order', () => {
    expect(getDefaultModelIdForProvider('openai')).toBe('gpt-5.4');
    expect(getDefaultModelIdForProvider('deepseek')).toBe('deepseek-v4-pro');
  });

  test('falls back to a published model for providers without curation', () => {
    // MiniMax is a real Pi provider with no UpUp curation.
    const minimaxDefault = getDefaultModelIdForProvider('minimax');
    expect(minimaxDefault).toBeDefined();
    expect(listPiModels('minimax').map((model) => model.id)).toContain(minimaxDefault!);
  });

  test('returns undefined for runtime-supplied providers and unknown ids', () => {
    // Ollama models come from the local server, not the catalog.
    expect(getDefaultModelIdForProvider('ollama')).toBeUndefined();
    expect(getDefaultModelIdForProvider('not-a-provider')).toBeUndefined();
  });
});
