import {
  completeSimple,
  getModel,
  getModels,
  streamSimple,
  type AssistantMessage,
  type Context,
  type Model,
  type Tool,
} from '@earendil-works/pi-ai/compat';
import type { PiTool } from './tool.js';
import type { TokenUsage } from './legacy-events.js';
import { classifyError, isNonRetryableError } from '../../utils/errors.js';
import { logger } from '../../utils/index.js';
import { resolveProvider } from '../../providers.js';
import { z, type ZodType } from 'zod';
import { PI_DEFAULT_SYSTEM_PROMPT } from './default-prompt.js';

export const DEFAULT_PROVIDER = 'deepseek';
export const DEFAULT_MODEL = 'deepseek-v4-flash';

export function getFastModel(provider: string, fallback: string): string {
  return ({
    anthropic: 'claude-haiku-4-5', google: 'gemini-2.5-flash', openai: 'gpt-4.1-mini',
    deepseek: 'deepseek-v4-flash', moonshot: 'kimi-k2.5', moonshotai: 'kimi-k2.5', xai: 'grok-4.3',
  } as Record<string, string>)[provider] ?? fallback;
}

function providerForModel(modelName: string): string {
  const configured = resolveProvider(modelName).id;
  return ({ moonshot: 'moonshotai', 'moonshot-cn': 'moonshotai-cn' } as Record<string, string>)[configured] ?? configured;
}

export function getPiModel(modelName = DEFAULT_MODEL): Model<any> {
  const provider = providerForModel(modelName);
  const models = getModels(provider as never) as Model<any>[];
  const id = modelName.replace(/^openrouter:/, '');
  const exact = models.find((candidate) => candidate.id === modelName || candidate.id === id);
  if (exact) return exact;
  try {
    return getModel(provider as never, (id || models[0]?.id) as never) as Model<any>;
  } catch {
    if (models[0]) return models[0];
    throw new Error(`Pi does not have a model catalog entry for ${provider}/${modelName}`);
  }
}

export const getChatModel = getPiModel;

interface CallLlmOptions {
  model?: string;
  systemPrompt?: string;
  outputSchema?: ZodType<unknown>;
  tools?: PiTool[];
  signal?: AbortSignal;
}

export interface LlmResult { response: AssistantMessage | string | unknown; usage?: TokenUsage; }

function usageOf(message: AssistantMessage): TokenUsage {
  return { inputTokens: message.usage?.input ?? 0, outputTokens: message.usage?.output ?? 0, totalTokens: message.usage?.totalTokens ?? 0 };
}

function textOf(message: AssistantMessage): string {
  return message.content.filter((part): part is { type: 'text'; text: string } => part.type === 'text').map((part) => part.text).join('');
}

function piTool(tool: PiTool): Tool { return { name: tool.name, description: tool.description, parameters: tool.parameters }; }

export type PiToolCall = Extract<AssistantMessage['content'][number], { type: 'toolCall' }>;

export function getPiToolCalls(message: AssistantMessage): readonly PiToolCall[] {
  return message.content.filter((part): part is PiToolCall => part.type === 'toolCall');
}

function withRetry<T>(fn: () => Promise<T>, provider: string): Promise<T> {
  return (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await fn(); } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[${provider} API] ${classifyError(message)} error (attempt ${attempt + 1}/3): ${message}`);
        if (isNonRetryableError(message) || attempt === 2) throw new Error(`[${provider} API] ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw new Error('Unreachable');
  })();
}

export async function callLlm(prompt: string, options: CallLlmOptions = {}): Promise<LlmResult> {
  const model = getPiModel(options.model);
  const context: Context = { systemPrompt: options.systemPrompt ?? PI_DEFAULT_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt, timestamp: Date.now() }], tools: options.tools?.map(piTool) };
  const result = await withRetry(() => completeSimple(model, context, { signal: options.signal, reasoning: 'medium' }), model.provider);
  if (options.outputSchema) return { response: options.outputSchema.parse(JSON.parse(textOf(result).replace(/^```(?:json)?\s*|\s*```$/g, '').trim())), usage: usageOf(result) };
  return { response: options.tools?.length ? result : textOf(result), usage: usageOf(result) };
}

export async function callStructuredLlm<T>(prompt: string, schema: ZodType<T>, options: Omit<CallLlmOptions, 'outputSchema'> = {}): Promise<T> {
  const result = await callLlm(prompt, options);
  const text = typeof result.response === 'string' ? result.response : result.response && typeof result.response === 'object' && 'content' in result.response ? textOf(result.response as AssistantMessage) : JSON.stringify(result.response);
  return schema.parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()));
}

export { z };
