import {
  findPiModelAcrossProviders,
  getPiModelInfo,
  listPiModels,
} from '@upup/pi-runtime/model-registry';
import { PROVIDERS as PROVIDER_DEFS, RECOMMENDED_MODELS } from '@upup/utils';

export interface Model {
  id: string;
  displayName: string;
}

interface Provider {
  displayName: string;
  providerId: string;
  models: Model[];
}

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
  return getModelsForProvider(providerId)[0]?.id;
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
