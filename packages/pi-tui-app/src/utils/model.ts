import {
  findPiModelAcrossProviders,
  getPiModelInfo,
  listPiModels,
} from '@upup/pi-runtime/model-registry';
import { PROVIDERS as PROVIDER_DEFS } from '@upup/utils';

export interface Model {
  id: string;
  displayName: string;
}

interface Provider {
  displayName: string;
  providerId: string;
  models: Model[];
}

/**
 * Curated ordering only. The model list itself comes from the Pi catalog —
 * these ids are moved to the top so the common choices stay one keystroke away,
 * and any id missing from Pi is skipped instead of being offered.
 */
const RECOMMENDED_MODELS: Record<string, readonly string[]> = {
  openai: ['gpt-5.4', 'gpt-4.1'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-7'],
  google: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
  xai: ['grok-4.6', 'grok-4.5'],
  moonshot: ['kimi-k2.5'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
};

/** Providers whose model list is supplied at runtime rather than from the catalog. */
const DYNAMIC_MODEL_PROVIDERS = new Set(['ollama', 'openrouter']);

function catalogModelsForProvider(providerId: string): Model[] {
  const recommended = RECOMMENDED_MODELS[providerId] ?? [];
  const seen = new Set<string>();
  const models: Model[] = [];

  for (const id of recommended) {
    const info = getPiModelInfo(providerId, id);
    if (!info || seen.has(info.id)) continue;
    seen.add(info.id);
    models.push({ id: info.id, displayName: info.name });
  }

  for (const info of listPiModels(providerId)) {
    if (seen.has(info.id)) continue;
    seen.add(info.id);
    models.push({ id: info.id, displayName: info.name });
  }

  return models;
}

export const PROVIDERS: Provider[] = PROVIDER_DEFS.map((provider) => ({
  displayName: provider.displayName,
  providerId: provider.id,
  models: DYNAMIC_MODEL_PROVIDERS.has(provider.id) ? [] : catalogModelsForProvider(provider.id),
}));

export function getModelsForProvider(providerId: string): Model[] {
  const provider = PROVIDERS.find((entry) => entry.providerId === providerId);
  return provider?.models ?? [];
}

export function getModelIdsForProvider(providerId: string): string[] {
  return getModelsForProvider(providerId).map((model) => model.id);
}

export function getDefaultModelForProvider(providerId: string): string | undefined {
  const models = getModelsForProvider(providerId);
  return models[0]?.id;
}

export function getModelDisplayName(modelId: string): string {
  const normalizedId = modelId.replace(/^(ollama|openrouter):/, '');

  for (const provider of PROVIDERS) {
    const model = provider.models.find((entry) => entry.id === normalizedId || entry.id === modelId);
    if (model) {
      return model.displayName;
    }
  }

  const catalogMatch = findPiModelAcrossProviders(normalizedId);
  return catalogMatch?.name ?? normalizedId;
}
