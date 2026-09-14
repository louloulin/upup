/**
 * Pi model resolution sub-module.
 *
 * Lives separately from the main `@upup/pi-event-adapter` entry so that
 * consumers that only need the lightweight event helpers do not pull in
 * the full `@earendil-works/pi-ai` model catalog.
 */

import type { Model } from '@earendil-works/pi-ai';
import { getModel as piGetModel, getModels as piGetModels } from '@earendil-works/pi-ai/compat';

const DEFAULT_MODEL = 'deepseek-v4-flash';

/**
 * Detect the provider prefix from a model id.
 */
export function detectPiProvider(modelId: string): string {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('gpt-')) return 'openai';
  if (modelId.startsWith('kimi-')) return 'moonshotai';
  if (modelId.startsWith('grok-')) return 'xai';
  if (modelId.includes('/')) return 'openrouter';
  return 'deepseek';
}

export interface ResolvePiModelOptions {
  /** Caller-provided model id (overrides `DEFAULT_MODEL` env). */
  modelName?: string;
  /** Optional override for the default model when nothing is configured. */
  fallback?: string;
}

/**
 * Resolve a Pi `Model` object from an optional model id.
 */
export function resolvePiModel(options: ResolvePiModelOptions = {}): Model<any> | undefined {
  const configured = options.modelName ?? process.env.DEFAULT_MODEL ?? options.fallback ?? DEFAULT_MODEL;
  const explicitSeparator = configured.indexOf(':');
  const explicitProvider = explicitSeparator > 0 ? configured.slice(0, explicitSeparator) : undefined;
  const model = explicitProvider ? configured.slice(explicitSeparator + 1) : configured;
  const provider = explicitProvider ?? detectPiProvider(model);
  const models = piGetModels(provider as never) as readonly { id: string }[];
  const direct = models.find((candidate) => candidate.id === model) as unknown as Model<any> | undefined;
  if (direct) return direct;
  const stripped = model.replace(/^openrouter:/, '');
  const fallback = models.find((candidate) => candidate.id === stripped) as unknown as Model<any> | undefined;
  if (fallback) return fallback;
  return piGetModel(provider as never, (models[0]?.id ?? '') as never) as Model<any> | undefined;
}
