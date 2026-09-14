import { getProviderById, resolveProvider } from '../providers.js';

export type MemvidRagMode = 'auto' | 'lex' | 'sem';

export type MemvidRagFlag = boolean | {
  enabled?: boolean;
  model?: string;
  mode?: MemvidRagMode;
  k?: number;
  contextOnly?: boolean;
};

export interface ResolvedMemvidRagSettings {
  enabled: boolean;
  supported: boolean;
  providerId: string;
  model: string;
  mode: MemvidRagMode;
  k: number;
  contextOnly: boolean;
  apiKeyEnvVar?: string;
  reason?: string;
}

const SUPPORTED_MEMVID_RAG_PROVIDERS = new Set(['openai', 'anthropic', 'google', 'xai']);

export function toMemvidModelSpec(modelId: string, providerId?: string): string {
  const resolvedProvider = providerId ?? resolveProvider(modelId).id;

  if (!SUPPORTED_MEMVID_RAG_PROVIDERS.has(resolvedProvider)) {
    throw new Error(`Memvid RAG does not support provider \"${resolvedProvider}\"`);
  }

  if (modelId.includes(':')) {
    const [, rawModel] = modelId.split(/:(.+)/, 2);
    return `${resolvedProvider}:${rawModel ?? modelId}`;
  }

  return `${resolvedProvider}:${modelId}`;
}

export function resolveMemvidRagSettings(input: {
  flag?: MemvidRagFlag;
  modelId: string;
  providerId?: string;
}): ResolvedMemvidRagSettings {
  const rawFlag = input.flag;
  const flag = typeof rawFlag === 'object' && rawFlag !== null ? rawFlag : undefined;
  const enabled = rawFlag === true || (typeof rawFlag === 'object' && rawFlag.enabled !== false);
  const providerId = input.providerId ?? resolveProvider(input.modelId).id;
  const apiKeyEnvVar = getProviderById(providerId)?.apiKeyEnvVar;

  if (!enabled) {
    return {
      enabled: false,
      supported: SUPPORTED_MEMVID_RAG_PROVIDERS.has(providerId),
      providerId,
      model: '',
      mode: flag?.mode ?? 'lex',
      k: flag?.k ?? 6,
      contextOnly: flag?.contextOnly ?? false,
      apiKeyEnvVar,
      reason: 'memory.memvidRag is disabled',
    };
  }

  if (!SUPPORTED_MEMVID_RAG_PROVIDERS.has(providerId)) {
    return {
      enabled: true,
      supported: false,
      providerId,
      model: '',
      mode: flag?.mode ?? 'lex',
      k: flag?.k ?? 6,
      contextOnly: flag?.contextOnly ?? false,
      apiKeyEnvVar,
      reason: `Unsupported provider for Memvid RAG: ${providerId}`,
    };
  }

  return {
    enabled: true,
    supported: true,
    providerId,
    model: flag?.model ?? toMemvidModelSpec(input.modelId, providerId),
    mode: flag?.mode ?? 'lex',
    k: flag?.k ?? 6,
    contextOnly: flag?.contextOnly ?? false,
    apiKeyEnvVar,
  };
}
