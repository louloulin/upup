/**
 * Provider registry derived from `@earendil-works/pi-ai` via
 * `@upup/pi-runtime/model-registry`. The Pi catalog is the single source of
 * truth; UpUp only contributes the curated ordering overlay, legacy alias
 * fallbacks for `.env` files predating the Pi-native env names, and the Ollama
 * provider that UpUp registers into Pi itself (not in the Pi catalog).
 */

import {
  detectPiProvider,
  getPiModelInfo,
  getPiProviderInfo,
  listPiModels,
  listPiProviderIds,
  piProviderEnvKeys,
} from '@upup/pi-runtime/model-registry';
import { OLLAMA_PROVIDER_ID } from '@upup/pi-runtime/custom-providers';
import { RECOMMENDED_MODELS } from './model-defaults';

export interface ProviderDef {
  /** UpUp provider id. Stable: persisted in `.upup/settings.json`. */
  id: string;
  /** Human-readable label rendered in TUI selectors, onboarding, doctor. */
  displayName: string;
  /** Provider id used by `@earendil-works/pi-ai`. Same as `id` for catalog entries. */
  piProviderId: string;
  /** Environment variable Pi resolves first for this provider. */
  apiKeyEnvVar?: string;
  /** Additional environment variables checked, in order (legacy aliases). */
  apiKeyEnvVars?: readonly string[];
  /** Recommended model surfaced in `/model` + onboarding. */
  fastModel?: string;
  contextWindow?: number;
  /**
   * Optional human-readable prefix printed in onboarding next to the provider
   * label (e.g. `(claude-)` for Anthropic). Currently unused by the derived
   * registry because the model prefix is already encoded in the model id;
   * retained for backwards compatibility with `selectProvider` callers.
   */
  modelPrefix?: string;
}

/**
 * Curated ordering: these providers get top spots in TUI selectors and
 * onboarding. Everything else from the Pi catalog follows in alphabetical
 * order. Add to this list to promote a Pi catalog entry; you no longer need
 * to duplicate provider data here.
 */
const PREFERRED_ORDER = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'moonshotai',
  'deepseek',
  'openrouter',
  'minimax',
  'minimax-cn',
  'kimi-coding',
] as const;

/**
 * Legacy UpUp env-var aliases for `.env` files predating the Pi-native names.
 * Pi does not read these; we surface them so `checkApiKeyExists` keeps
 * recognising pre-Pi-native `.env` content.
 */
const LEGACY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  google: ['GOOGLE_API_KEY'],
};

function pickFastModel(providerId: string): string | undefined {
  const models = listPiModels(providerId);
  if (models.length === 0) return undefined;
  const fast = models.find(
    (model) =>
      /\b(flash|mini|haiku|nano|lite|fast|small)\b/i.test(model.id) ||
      /\b(flash|mini|haiku|nano|lite|fast|small)\b/i.test(model.name),
  );
  return (fast ?? models[0]).id;
}

function deriveProvider(id: string): ProviderDef | undefined {
  const info = getPiProviderInfo(id);
  if (!info) return undefined;
  const envs = piProviderEnvKeys(id);
  // Pi reports env vars in priority order. Some providers (Anthropic) list
  // `*_AUTH_TOKEN` before `*_API_KEY`; UpUp historically surfaced the API key
  // form, so prefer it when present and fall back to Pi's first choice.
  const apiKeyEnvVar =
    envs.find((name) => name.endsWith('_API_KEY')) ?? envs[0];
  const remainder = envs.filter((name) => name !== apiKeyEnvVar);
  const fast = pickFastModel(id);
  const fastInfo = fast ? getPiModelInfo(id, fast) : undefined;
  return {
    id,
    displayName: info.name,
    piProviderId: id,
    apiKeyEnvVar,
    apiKeyEnvVars: [...remainder, ...(LEGACY_ALIASES[id] ?? [])],
    fastModel: fast,
    contextWindow: fastInfo?.contextWindow,
  };
}

/** Every provider UpUp exposes: Pi catalog entries (curated order) + Ollama. */
export const PROVIDERS: ProviderDef[] = (() => {
  const known = listPiProviderIds();
  const ranked = known
    .filter((id) => id !== OLLAMA_PROVIDER_ID)
    .slice()
    .sort((a, b) => {
      const ai = PREFERRED_ORDER.indexOf(a as (typeof PREFERRED_ORDER)[number]);
      const bi = PREFERRED_ORDER.indexOf(b as (typeof PREFERRED_ORDER)[number]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  const fromCatalog = ranked.flatMap((id) => {
    const derived = deriveProvider(id);
    return derived ? [derived] : [];
  });
  // Ollama is contributed by UpUp via `pi.registerProvider`; not in Pi catalog.
  return [
    ...fromCatalog,
    {
      id: OLLAMA_PROVIDER_ID,
      displayName: 'Ollama',
      piProviderId: OLLAMA_PROVIDER_ID,
      contextWindow: 128_000,
    },
  ];
})();

/**
 * The default model for a provider: the first curated recommendation the Pi
 * catalog actually publishes, else the catalog's first entry.
 *
 * Returns `undefined` for providers whose model list is supplied at runtime
 * (Ollama) — callers must then keep whatever model id they already have.
 */
export function getDefaultModelIdForProvider(providerId: string): string | undefined {
  for (const id of RECOMMENDED_MODELS[providerId] ?? []) {
    if (getPiModelInfo(providerId, id)) return id;
  }
  return listPiModels(providerId)[0]?.id;
}

/** Resolve a model id to its provider by Pi-canonical prefix matching. */
export function resolveProvider(modelName: string): ProviderDef {
  const detected = detectPiProvider(modelName);
  return (
    PROVIDERS.find((provider) => provider.id === detected || provider.piProviderId === detected) ??
    PROVIDERS[0]!
  );
}

import { canonicalPiProviderId } from '@upup/pi-runtime/model-registry';

/** Look up a provider by UpUp id or by its canonical Pi provider id. */
export function getProviderById(id: string): ProviderDef | undefined {
  const canonical = canonicalPiProviderId(id);
  return PROVIDERS.find(
    (provider) => provider.id === canonical || provider.piProviderId === canonical,
  );
}

/** Every environment variable that can hold this provider's API key, in order. */
export function getProviderApiKeyEnvVars(providerId: string): string[] {
  const provider = getProviderById(providerId);
  if (!provider) return [...piProviderEnvKeys(providerId)];
  return [provider.apiKeyEnvVar, ...(provider.apiKeyEnvVars ?? [])].filter(
    (name): name is string => Boolean(name),
  );
}
