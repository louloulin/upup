/**
 * Pi-native model registry.
 *
 * Single source of truth for UpUp provider + model metadata. Every value is
 * read from the `@earendil-works/pi-ai` catalog, so UpUp never keeps a second,
 * drifting copy of provider ids, model ids, display names, context windows or
 * API-key environment variables.
 *
 * Uses the current catalog reads (`builtinProviders` / `getBuiltinModels`)
 * rather than the deprecated `compat` re-exports of the same functions.
 */

import { findEnvKeys } from '@earendil-works/pi-ai/compat';
import { builtinProviders, getBuiltinModels } from '@earendil-works/pi-ai/providers/all';

export interface PiModelInfo {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  readonly reasoning: boolean;
  readonly input: readonly string[];
}

export interface PiProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly envKeys: readonly string[];
  readonly modelCount: number;
}

/**
 * UpUp-facing provider ids that predate the Pi catalog and map onto a Pi
 * provider id. Keeps previously saved `settings.json` values working.
 */
export const PI_PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  moonshot: 'moonshotai',
  kimi: 'moonshotai',
  gemini: 'google',
  grok: 'xai',
};

/** Map an UpUp provider alias to its canonical Pi provider id. */
export function canonicalPiProviderId(providerId: string): string {
  return PI_PROVIDER_ALIASES[providerId] ?? providerId;
}

/**
 * Detect the canonical Pi provider id from a model id that does not carry an
 * explicit `provider:` prefix. Mirrors the heuristic the Pi catalog uses to
 * resolve bare model ids. The result is canonicalised (no legacy aliases);
 * pass it through `canonicalPiProviderId` if you need the legacy mapping.
 *
 * Kept here so it lives next to the catalog metadata; previously lived in
 * `@upup/pi-event-adapter/pi-model-bridge`, which now re-exports it.
 */
export function detectPiProvider(modelId: string): string {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('gpt-')) return 'openai';
  if (modelId.startsWith('kimi-')) return 'moonshotai';
  if (modelId.startsWith('grok-')) return 'xai';
  if (modelId.startsWith('MiniMax-') || modelId.startsWith('MiniMax')) return 'minimax';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
  if (modelId.includes('/')) return 'openrouter';
  return 'openai';
}

function piCatalogProviders(): readonly { id: string; name: string }[] {
  return builtinProviders() as unknown as readonly { id: string; name: string }[];
}

/** Every provider id in the Pi catalog. */
export function listPiProviderIds(): readonly string[] {
  return piCatalogProviders().map((provider) => provider.id);
}

export function isPiProvider(providerId: string): boolean {
  const canonical = canonicalPiProviderId(providerId);
  return piCatalogProviders().some((provider) => provider.id === canonical);
}

/**
 * Environment variable names Pi resolves an API key from, in priority order.
 *
 * `findEnvKeys` only reports variables that are currently *set*, so UpUp probes
 * Pi with a recording `env` object: every name Pi reads is captured, whether or
 * not the variable exists. That keeps UpUp's docs, doctor output and onboarding
 * prompts aligned with the names Pi actually consults.
 */
export function piProviderEnvKeys(providerId: string): readonly string[] {
  const canonical = canonicalPiProviderId(providerId);
  if (!isPiProvider(canonical)) return [];
  const probed = new Set<string>();
  const recorder = new Proxy({} as Record<string, string>, {
    get: (_target, property) => {
      if (typeof property === 'string') probed.add(property);
      return undefined;
    },
  });
  findEnvKeys(canonical as never, recorder);
  return [...probed];
}

/** Whether a plausible (non-placeholder) credential is present for this provider. */
export function hasPiProviderApiKey(providerId: string): boolean {
  return piProviderEnvKeys(providerId).some((key) => {
    const value = process.env[key];
    return Boolean(value && value.trim() && !value.trim().startsWith('your-'));
  });
}

export function listPiModels(providerId: string): readonly PiModelInfo[] {
  const canonical = canonicalPiProviderId(providerId);
  if (!isPiProvider(canonical)) return [];
  const models = getBuiltinModels(canonical as never) as unknown as readonly PiModelInfo[];
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: Boolean(model.reasoning),
    input: model.input ?? [],
  }));
}

export function getPiModelInfo(providerId: string, modelId: string): PiModelInfo | undefined {
  return listPiModels(providerId).find((model) => model.id === modelId);
}

/**
 * Providers checked first by {@link findPiModelAcrossProviders}. An id such as
 * `gpt-5.4` is published by several gateway providers, and the first-party
 * provider is the useful answer.
 */
const PREFERRED_LOOKUP_ORDER: readonly string[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'moonshotai',
  'deepseek',
  'openrouter',
];

/** Locate a model id without knowing its provider (exact match only). */
export function findPiModelAcrossProviders(modelId: string): PiModelInfo | undefined {
  const rest = listPiProviderIds().filter((providerId) => !PREFERRED_LOOKUP_ORDER.includes(providerId));
  for (const providerId of [...PREFERRED_LOOKUP_ORDER, ...rest]) {
    const match = getPiModelInfo(providerId, modelId);
    if (match) return match;
  }
  return undefined;
}

/** Provider metadata for one provider id, or `undefined` when unknown to Pi. */
export function getPiProviderInfo(providerId: string): PiProviderInfo | undefined {
  const canonical = canonicalPiProviderId(providerId);
  const provider = piCatalogProviders().find((candidate) => candidate.id === canonical);
  if (!provider) return undefined;
  return {
    id: provider.id,
    name: provider.name,
    envKeys: piProviderEnvKeys(provider.id),
    modelCount: listPiModels(provider.id).length,
  };
}
