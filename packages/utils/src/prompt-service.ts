/**
 * LLM Prompt Service — Pi Runtime bridge.
 *
 * Thin wrapper that runs structured / unstructured prompts through the root
 * `@upup/pi-session` prompt runner (Pi AgentSession.prompt). The package is the single
 * place where the runner is exposed; packages depending on `@upup/utils` can
 * call this through dynamic import and avoid hard-coding the runner path.
 */

import { z, type ZodType } from 'zod';
import { classifyError, isNonRetryableError } from './errors';
import { error as logError } from './logging/logger';
import { resolveProvider } from './providers';
import { DEFAULT_MODEL } from './model-defaults';
export interface PiPromptOptions {
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly signal?: AbortSignal;
  readonly sessionKey?: string;
  readonly toolFilter?: readonly string[];
}

export type PromptRunner = (prompt: string, options?: PiPromptOptions) => Promise<string>;

export interface CallLlmOptions {
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly outputSchema?: ZodType<unknown>;
  readonly signal?: AbortSignal;
  readonly runner?: PromptRunner;
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

export async function runPiPrompt(prompt: string, options: PiPromptOptions & { runner: PromptRunner }): Promise<string> {
  if (!options.runner) throw new Error('Pi prompt runner must be injected');
  const { runner, ...runnerOptions } = options;
  return withRetry(() => runner(prompt, runnerOptions), providerForModel(options.model ?? DEFAULT_MODEL));
}

export async function callLlm(prompt: string, options: CallLlmOptions = {}): Promise<LlmResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const runner = options.runner;
  if (!runner) throw new Error('Pi prompt runner must be injected');
  const answer = await withRetry(
    () => runner(prompt, {
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

export { DEFAULT_MODEL };
export { z };
