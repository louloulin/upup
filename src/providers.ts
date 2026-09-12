/**
 * Canonical provider registry — single source of truth for all provider metadata.
 * When adding a new provider, add a single entry here; all other modules derive from this.
 *
 * Provider metadata facade backed by the Pi runtime provider catalog.
 */

export interface ProviderDef {
  id: string;
  displayName: string;
  modelPrefix: string;
  apiKeyEnvVar?: string;
  fastModel?: string;
  contextWindow?: number;
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'openai', displayName: 'OpenAI', modelPrefix: '', apiKeyEnvVar: 'OPENAI_API_KEY', fastModel: 'gpt-4.1', contextWindow: 1_047_576 },
  { id: 'anthropic', displayName: 'Anthropic', modelPrefix: 'claude-', apiKeyEnvVar: 'ANTHROPIC_API_KEY', fastModel: 'claude-haiku-4-5', contextWindow: 200_000 },
  { id: 'google', displayName: 'Google', modelPrefix: 'gemini-', apiKeyEnvVar: 'GOOGLE_API_KEY', fastModel: 'gemini-3-flash-preview', contextWindow: 1_000_000 },
  { id: 'xai', displayName: 'xAI', modelPrefix: 'grok-', apiKeyEnvVar: 'XAI_API_KEY', fastModel: 'grok-4-1-fast-reasoning', contextWindow: 131_072 },
  { id: 'moonshot', displayName: 'Moonshot', modelPrefix: 'kimi-', apiKeyEnvVar: 'MOONSHOT_API_KEY', fastModel: 'kimi-k2-5', contextWindow: 131_072 },
  { id: 'deepseek', displayName: 'DeepSeek', modelPrefix: 'deepseek-', apiKeyEnvVar: 'DEEPSEEK_API_KEY', fastModel: 'deepseek-v4-flash', contextWindow: 1_000_000 },
  { id: 'openrouter', displayName: 'OpenRouter', modelPrefix: 'openrouter:', apiKeyEnvVar: 'OPENROUTER_API_KEY', fastModel: 'openrouter:openai/gpt-4o-mini', contextWindow: 128_000 },
  { id: 'ollama', displayName: 'Ollama', modelPrefix: 'ollama:', contextWindow: 128_000 },
];

export function resolveProvider(modelName: string): ProviderDef {
  return PROVIDERS.find((provider) => provider.modelPrefix && modelName.startsWith(provider.modelPrefix)) ?? PROVIDERS[0];
}

export function getProviderById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
