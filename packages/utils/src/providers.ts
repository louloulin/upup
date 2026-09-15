/**
 * Canonical provider registry — single source of truth for all provider metadata.
 * When adding a new provider, add a single entry here; all other modules derive from this.
 *
 * The values are deliberately small and static so `@upup/utils` stays cheap to
 * bundle. `packages/utils/src/providers.test.ts` asserts every entry against the
 * `@earendil-works/pi-ai` catalog (`@upup/pi-runtime/model-registry`), so the
 * table cannot drift from the providers and environment variables Pi actually
 * uses without failing the test suite.
 */

export interface ProviderDef {
  /** UpUp provider id. Stable: persisted in `.upup/settings.json`. */
  id: string;
  displayName: string;
  modelPrefix: string;
  /** Provider id used by `@earendil-works/pi-ai` (may differ from `id`). */
  piProviderId?: string;
  /** Environment variable Pi resolves first for this provider. */
  apiKeyEnvVar?: string;
  /** Additional environment variables checked, in order. */
  apiKeyEnvVars?: readonly string[];
  fastModel?: string;
  contextWindow?: number;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    modelPrefix: '',
    piProviderId: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    fastModel: 'gpt-4.1',
    contextWindow: 1_047_576,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    modelPrefix: 'claude-',
    piProviderId: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    fastModel: 'claude-haiku-4-5',
    contextWindow: 200_000,
  },
  {
    id: 'google',
    displayName: 'Google',
    modelPrefix: 'gemini-',
    piProviderId: 'google',
    // Pi resolves Google credentials from GEMINI_API_KEY; GOOGLE_API_KEY is the
    // pre-Pi-native name and stays supported for existing `.env` files.
    apiKeyEnvVar: 'GEMINI_API_KEY',
    apiKeyEnvVars: ['GOOGLE_API_KEY'],
    fastModel: 'gemini-3-flash-preview',
    contextWindow: 1_048_576,
  },
  {
    id: 'xai',
    displayName: 'xAI',
    modelPrefix: 'grok-',
    piProviderId: 'xai',
    apiKeyEnvVar: 'XAI_API_KEY',
    fastModel: 'grok-4.6',
    contextWindow: 500_000,
  },
  {
    id: 'moonshot',
    displayName: 'Moonshot AI',
    modelPrefix: 'kimi-',
    piProviderId: 'moonshotai',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    fastModel: 'kimi-k2.5',
    contextWindow: 262_144,
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    modelPrefix: 'deepseek-',
    piProviderId: 'deepseek',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    fastModel: 'deepseek-v4-flash',
    contextWindow: 1_000_000,
  },
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    modelPrefix: 'openrouter:',
    piProviderId: 'openrouter',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    fastModel: 'openai/gpt-4o-mini',
    contextWindow: 128_000,
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    modelPrefix: 'ollama:',
    contextWindow: 128_000,
  },
];

export function resolveProvider(modelName: string): ProviderDef {
  return (
    PROVIDERS.find((provider) => provider.modelPrefix && modelName.startsWith(provider.modelPrefix)) ??
    PROVIDERS[0]
  );
}

/** Look up a provider by UpUp id or by its canonical Pi provider id. */
export function getProviderById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === id || provider.piProviderId === id);
}

/** Every environment variable that can hold this provider's API key, in order. */
export function getProviderApiKeyEnvVars(providerId: string): string[] {
  const provider = getProviderById(providerId);
  if (!provider) return [];
  return [provider.apiKeyEnvVar, ...(provider.apiKeyEnvVars ?? [])].filter(
    (name): name is string => Boolean(name),
  );
}
