import { Type, type TSchema } from 'typebox';
import { z, type ZodType } from 'zod';

export interface PiMcpTool<TInput extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodType<TInput>;
  readonly parameters: TSchema;
  invoke(input: TInput, options?: { signal?: AbortSignal }): Promise<string>;
}

export function createPiMcpTool<TInput extends Record<string, unknown>>(
  config: {
    name: string;
    description: string;
    schema: ZodType<TInput>;
    parameters?: TSchema;
    execute(input: TInput, signal?: AbortSignal): Promise<string>;
  },
): PiMcpTool<TInput> {
  return {
    ...config,
    parameters: config.parameters ?? Type.Unsafe<TSchema>({ type: 'object', additionalProperties: true }),
    async invoke(input, options) {
      if (options?.signal?.aborted) throw new DOMException('The MCP tool call was aborted', 'AbortError');
      return config.execute(config.schema.parse(input), options?.signal);
    },
  };
}

export { z };
