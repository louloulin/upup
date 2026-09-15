/**
 * Pi-native custom provider registrations.
 *
 * The Pi catalog has no local-inference provider, but UpUp offers one in its
 * provider picker. Instead of shipping a private HTTP client, UpUp registers
 * that provider through Pi's documented extension surface
 * (`pi.registerProvider`), so model resolution, auth, streaming, retries and
 * event mapping all stay inside Pi.
 *
 * A provider registered here is only reachable while the registering Pi
 * extension is loaded, which is exactly how Pi expects custom endpoints to be
 * contributed.
 */

import type { Model } from '@earendil-works/pi-ai';
import type {
  InlineExtension,
  ProviderConfig,
  ProviderModelConfig,
} from '@earendil-works/pi-coding-agent';

export const OLLAMA_PROVIDER_ID = 'ollama';
export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

/**
 * Ollama's OpenAI-compatible endpoint. `OLLAMA_BASE_URL` points at the Ollama
 * root (as it did before UpUp routed local inference through Pi), so the `/v1`
 * suffix is appended here.
 */
export function ollamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  const root = configured.replace(/\/+$/, '');
  return root.endsWith('/v1') ? root : `${root}/v1`;
}

/** UpUp advertises the same conservative context window it always has. */
export const OLLAMA_CONTEXT_WINDOW = 128_000;
export const OLLAMA_MAX_TOKENS = 32_000;

/**
 * Ollama does not understand the OpenAI `developer` role or `reasoning_effort`,
 * so both compatibility switches stay off, as Pi documents for Ollama, vLLM and
 * SGLang style servers.
 */
export const OLLAMA_MODEL_COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
} as const;

const OLLAMA_ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/** Normalise Ollama's `name` field (`llama3.1:latest`) into a model id. */
export function normalizeOllamaModelId(name: string): string {
  return name.trim().replace(/:latest$/, '');
}

/**
 * The Pi `Model` object UpUp passes to Pi for `ollama:<model>` selections.
 * Pi uses it verbatim for streaming, so it must stay in sync with what the
 * registered provider serves.
 */
export function createOllamaModel(
  modelId: string,
  options: { baseUrl?: string; displayName?: string } = {},
): Model<'openai-completions'> {
  const id = normalizeOllamaModelId(modelId);
  return {
    id,
    name: options.displayName ?? `${id} (Ollama)`,
    api: 'openai-completions',
    provider: OLLAMA_PROVIDER_ID,
    baseUrl: options.baseUrl ?? ollamaBaseUrl(),
    reasoning: false,
    input: ['text'],
    cost: { ...OLLAMA_ZERO_COST },
    contextWindow: OLLAMA_CONTEXT_WINDOW,
    maxTokens: OLLAMA_MAX_TOKENS,
    compat: { ...OLLAMA_MODEL_COMPAT },
  };
}

export function isOllamaModelSpec(model: string): boolean {
  return model === OLLAMA_PROVIDER_ID || model.startsWith(`${OLLAMA_PROVIDER_ID}:`);
}

function toProviderModel(name: string): ProviderModelConfig {
  const id = normalizeOllamaModelId(name);
  return {
    id,
    name: `${id} (Ollama)`,
    reasoning: false,
    input: ['text'],
    cost: { ...OLLAMA_ZERO_COST },
    contextWindow: OLLAMA_CONTEXT_WINDOW,
    maxTokens: OLLAMA_MAX_TOKENS,
    compat: { ...OLLAMA_MODEL_COMPAT },
  };
}

interface OllamaTagsResponse {
  readonly models?: readonly { readonly name?: unknown }[];
}

/**
 * Models installed in the local Ollama server, read through Ollama's own
 * `/api/tags`. Failures resolve to an empty list: an unreachable local server is
 * a normal state, not a session-breaking error.
 */
export async function fetchOllamaModels(
  options: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<readonly ProviderModelConfig[]> {
  const apiRoot = (options.baseUrl ?? ollamaBaseUrl()).replace(/\/v1$/, '');
  try {
    const response = await fetch(`${apiRoot}/api/tags`, { signal: options.signal });
    if (!response.ok) return [];
    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models ?? [])
      .map((model) => model?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .map(toProviderModel);
  } catch {
    return [];
  }
}

/**
 * Pi `ProviderConfig` for the local Ollama server. Keyless: Ollama ignores
 * credentials, so a constant placeholder keeps Pi's "apiKey required when
 * defining models" rule satisfied without inventing a secret.
 */
export function createOllamaProviderConfig(
  options: { baseUrl?: string; models?: readonly ProviderModelConfig[] } = {},
): ProviderConfig {
  const baseUrl = options.baseUrl ?? ollamaBaseUrl();
  return {
    name: 'Ollama',
    baseUrl,
    api: 'openai-completions',
    apiKey: OLLAMA_PROVIDER_ID,
    models: [...(options.models ?? [])],
    refreshModels: async ({ signal }) => [...(await fetchOllamaModels({ baseUrl, signal }))],
  };
}

/**
 * Inline Pi extension that makes `ollama:<model>` resolvable inside a Pi
 * session. Pi queues `registerProvider` during initial extension load and
 * applies it once the runner binds its context.
 */
export function createOllamaProviderExtension(
  options: { baseUrl?: string; models?: readonly ProviderModelConfig[] } = {},
): InlineExtension {
  return {
    name: 'upup-ollama-provider',
    factory: (pi) => {
      pi.registerProvider(OLLAMA_PROVIDER_ID, createOllamaProviderConfig(options));
    },
  };
}
