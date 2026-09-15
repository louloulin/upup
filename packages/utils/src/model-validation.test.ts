import { describe, expect, test } from 'bun:test';
import {
  canonicalPiProviderId,
  getPiModelInfo,
  listPiProviderIds,
  listPiModels,
} from '@upup/pi-runtime/model-registry';
import { OLLAMA_PROVIDER_ID } from '@upup/pi-runtime/custom-providers';
import {
  coerceModelSpec,
  validateModelForProvider,
  validateModelSpec,
  __testing,
  type ModelValidationError,
  type ModelValidationResult,
} from './model-validation';

/** Pick any known provider that ships at least one model in the Pi catalog. */
function pickProviderWithModels(): string {
  const candidates = listPiProviderIds().filter((id) => listPiModels(id).length > 0);
  if (candidates.length === 0) throw new Error('Pi catalog has no providers with models');
  return candidates[0]!;
}

function pickModel(providerId: string): string {
  const models = listPiModels(providerId);
  if (models.length === 0) throw new Error(`No models for provider ${providerId}`);
  return models[0]!.id;
}

describe('@upup/utils — model-validation (Pi catalog contract)', () => {
  test('validates a real provider+model pair against the Pi catalog', () => {
    const providerId = pickProviderWithModels();
    const modelId = pickModel(providerId);
    const result = validateModelForProvider(providerId, modelId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerId).toBe(providerId);
      expect(result.modelId).toBe(modelId);
    }
  });

  test('returns unknown-model error with the catalog available-models list', () => {
    const providerId = pickProviderWithModels();
    const result = validateModelForProvider(providerId, '__definitely_not_a_model__');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-model');
      expect(result.requestedModelId).toBe('__definitely_not_a_model__');
      expect(result.availableModels.length).toBeGreaterThan(0);
      expect(result.availableModels).toContain(pickModel(providerId));
    }
  });

  test('returns empty error for an empty model id', () => {
    const providerId = pickProviderWithModels();
    const result = validateModelForProvider(providerId, '   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty');
      expect(result.availableModels).toEqual([]);
    }
  });

  test('returns unknown-provider error for an unrecognized provider id', () => {
    const result = validateModelForProvider('__not_a_real_provider__', 'any-model');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-provider');
      expect(result.availableModels).toEqual([]);
    }
  });

  test('Ollama accepts any non-empty model id (custom-managed provider)', () => {
    const result = validateModelForProvider(OLLAMA_PROVIDER_ID, 'qwen2.5-coder:32b');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerId).toBe(OLLAMA_PROVIDER_ID);
      expect(result.modelId).toBe('qwen2.5-coder:32b');
    }
  });

  test('legacy provider aliases (moonshot/kimi/gemini/grok) validate against the canonical catalog', () => {
    const canonical = canonicalPiProviderId('moonshot');
    expect(canonical).toBe('moonshotai');
    const modelId = listPiModels('moonshotai')[0]?.id;
    if (!modelId) throw new Error('Expected at least one moonshotai model');
    const result = validateModelForProvider('moonshot', modelId);
    expect(result.ok).toBe(true);
  });

  test('validateModelSpec parses provider:model format', () => {
    const providerId = pickProviderWithModels();
    const modelId = pickModel(providerId);
    const result = validateModelSpec(`${providerId}:${modelId}`, providerId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerId).toBe(providerId);
      expect(result.modelId).toBe(modelId);
    }
  });

  test('validateModelSpec uses defaultProviderId when model id has no provider prefix', () => {
    const providerId = pickProviderWithModels();
    const modelId = pickModel(providerId);
    const result = validateModelSpec(modelId, providerId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerId).toBe(providerId);
      expect(result.modelId).toBe(modelId);
    }
  });

  test('coerceModelSpec returns the normalised model id for valid input', () => {
    const providerId = pickProviderWithModels();
    const modelId = pickModel(providerId);
    expect(coerceModelSpec(`${providerId}:${modelId}`, providerId)).toBe(modelId);
    expect(coerceModelSpec(modelId, providerId)).toBe(modelId);
  });

  test('coerceModelSpec returns null for invalid input', () => {
    const providerId = pickProviderWithModels();
    expect(coerceModelSpec(undefined, providerId)).toBeNull();
    expect(coerceModelSpec('', providerId)).toBeNull();
    expect(coerceModelSpec('__not_a_model__', providerId)).toBeNull();
  });

  test('__testing exposes the format helpers', () => {
    expect(__testing.splitProviderAndModel('openai:gpt-5.4')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.4',
    });
    expect(__testing.splitProviderAndModel('gpt-5.4')).toEqual({
      providerId: '',
      modelId: 'gpt-5.4',
    });
    expect(__testing.stripProviderPrefix('openai:gpt-5.4')).toBe('gpt-5.4');
    expect(__testing.OLLAMA_MODEL_PREFIX).toBe('ollama:');
  });

  test('error shape includes the canonical Pi provider id (legacy alias resolved)', () => {
    const providerId = pickProviderWithModels();
    const modelId = pickModel(providerId);
    const result: ModelValidationResult = validateModelForProvider(providerId, '__missing__');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result as ModelValidationError;
      expect(err.providerId).toBe(providerId);
      // availableModels should match what the Pi catalog reports
      expect(err.availableModels.length).toBe(listPiModels(providerId).length);
    }
    // sanity: getPiModelInfo for the real model succeeds
    expect(getPiModelInfo(providerId, modelId)).toBeDefined();
  });
});
