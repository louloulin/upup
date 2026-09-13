import { z, type ZodType } from 'zod';
import { classifyError, isNonRetryableError } from '../../utils/errors.js';
import { error as logError } from '../../utils/logging/logger.js';
import { resolveProvider } from '../../providers.js';
import { runPiPrompt } from './runner.js';
import { DEFAULT_MODEL } from './model-config.js';
import type { PiTool } from './tool.js';

export interface CallLlmOptions {
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly outputSchema?: ZodType<unknown>;
  readonly tools?: readonly PiTool[];
  readonly signal?: AbortSignal;
}

export interface LlmResult {
  readonly response: string | unknown;
}

function providerForModel(modelName: string): string {
  const configured = resolveProvider(modelName).id;
  return ({ moonshot: 'moonshotai', 'moonshot-cn': 'moonshotai-cn' } as Record<string, string>)[configured] ?? configured;
}

function withRetry<T>(fn: () => Promise<T>, provider: string): Promise<T> {
  return (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError('agent', `[${provider} API] ${classifyError(message)} error (attempt ${attempt + 1}/3): ${message}`, error instanceof Error ? error : undefined);
        if (isNonRetryableError(message) || attempt === 2) throw new Error(`[${provider} API] ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw new Error('Unreachable');
  })();
}

function parseJson(text: string): unknown {
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
}

export async function callLlm(prompt: string, options: CallLlmOptions = {}): Promise<LlmResult> {
  if (options.tools?.length) {
    throw new Error('Prompt service does not accept ad-hoc tools; declare a Pi Package and execute through a Pi AgentSession');
  }
  const model = options.model ?? DEFAULT_MODEL;
  const answer = await withRetry(
    () => runPiPrompt(prompt, {
      model,
      systemPrompt: options.systemPrompt,
      signal: options.signal,
      toolFilter: ['__upup_prompt_service_no_tools__'],
    }),
    providerForModel(model),
  );
  return options.outputSchema === undefined ? { response: answer } : { response: options.outputSchema.parse(parseJson(answer)) };
}

export async function callStructuredLlm<T>(
  prompt: string,
  schema: ZodType<T>,
  options: Omit<CallLlmOptions, 'outputSchema'> = {},
): Promise<T> {
  const result = await callLlm(prompt, options);
  return schema.parse(typeof result.response === 'string' ? parseJson(result.response) : result.response);
}

export { DEFAULT_MODEL } from './model-config.js';
export { z };
