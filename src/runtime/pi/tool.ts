import { z, type ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Type, type TSchema } from 'typebox';

export type PiToolInput = Record<string, unknown>;
export type PiToolResult = string;

export interface PiToolConfig<TInput = PiToolInput> {
  name: string;
  description: string;
  schema?: ZodType<TInput, any, any> | TSchema;
  execute?: (input: TInput, options?: { signal?: AbortSignal; metadata?: Record<string, unknown> }) => Promise<PiToolResult> | PiToolResult;
  /** Compatibility handler for callers that have not adopted execute yet. */
  func?: (input: TInput, options?: { signal?: AbortSignal; metadata?: Record<string, unknown> }) => Promise<PiToolResult> | PiToolResult;
}

export type RunnableConfig = { signal?: AbortSignal; metadata?: Record<string, unknown> };

export class PiTool<TInput = any> {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodType<TInput, any, any> | TSchema;
  readonly parameters: TSchema;
  readonly func: NonNullable<PiToolConfig<TInput>['execute']>;

  constructor(config: PiToolConfig<TInput>) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema ?? Type.Object({});
    this.parameters = isZodSchema(this.schema)
      ? toParameters(this.schema as ZodType<unknown>)
      : this.schema;
    const execute = config.execute ?? config.func;
    if (!execute) throw new Error(`Pi tool ${config.name} requires an execute handler`);
    this.func = execute;
  }

  async invoke(input: TInput, options?: RunnableConfig): Promise<PiToolResult> {
    if (options?.signal?.aborted) throw new DOMException('The Pi tool call was aborted', 'AbortError');
    const parsed = isZodSchema(this.schema) ? this.schema.parse(input as TInput) : input;
    const result = await this.func(parsed as TInput, options);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
}

function isZodSchema(value: ZodType<unknown> | TSchema): value is ZodType<unknown> {
  return Boolean(value) && typeof (value as ZodType<unknown>).parse === 'function';
}

function toParameters(schema: ZodType<unknown>): TSchema {
  return Type.Unsafe<TSchema>(zodToJsonSchema(schema, { $refStrategy: 'none' }) as TSchema);
}

export function createPiTool<TInput = PiToolInput>(config: PiToolConfig<TInput>): PiTool<TInput> {
  return new PiTool(config);
}

export function tool<TInput = PiToolInput>(
  handler: NonNullable<PiToolConfig<TInput>['execute']>,
  config: Omit<PiToolConfig<TInput>, 'execute' | 'func'>,
): PiTool<TInput> {
  return createPiTool({ ...config, execute: handler });
}

export function isPiTool(value: unknown): value is PiTool {
  return Boolean(
    value && typeof value === 'object' &&
    'name' in value && typeof value.name === 'string' &&
    'invoke' in value && typeof value.invoke === 'function' &&
    'parameters' in value,
  );
}

export const isPiStructuredTool = isPiTool;

export { z };
