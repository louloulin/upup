/**
 * @upup/sdk - Beta Tool Helpers
 *
 * 对齐 Claude Agent SDK 的 betaTool 和 betaZodTool
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { Tool } from './tools/index'
import type { RunnableTool } from './tool-runner'
import { ToolValidationError } from './tool-error'

// ============ JSON Schema Tool ============

/**
 * JSON Schema 工具选项
 */
export interface BetaToolOptions {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description?: string
  /** JSON Schema 输入定义 */
  input_schema: JsonSchema
  /** 执行函数 */
  run: (input: unknown, context?: ToolContext) => Promise<unknown> | unknown
}

/**
 * JSON Schema 类型
 */
export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  description?: string
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  items?: JsonSchema
  additionalProperties?: boolean | JsonSchema
}

/**
 * JSON Schema 属性
 */
export interface JsonSchemaProperty {
  type?: string
  description?: string
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  items?: JsonSchema
}

/**
 * 工具上下文
 */
export interface ToolContext {
  signal?: AbortSignal
  toolName: string
}

/**
 * 创建 JSON Schema 工具
 *
 * @example
 * ```typescript
 * import { betaTool } from '@upup/sdk'
 *
 * const calculatorTool = betaTool({
 *   name: 'calculator',
 *   description: 'Perform arithmetic operations',
 *   input_schema: {
 *     type: 'object',
 *     properties: {
 *       operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
 *       a: { type: 'number' },
 *       b: { type: 'number' },
 *     },
 *     required: ['operation', 'a', 'b'],
 *   },
 *   run: (input) => {
 *     const { operation, a, b } = input as any
 *     switch (operation) {
 *       case 'add': return String(a + b)
 *       case 'subtract': return String(a - b)
 *       case 'multiply': return String(a * b)
 *       case 'divide': return b === 0 ? 'Error: Division by zero' : String(a / b)
 *     }
 *   },
 * })
 * ```
 */
export function betaTool(options: BetaToolOptions): BetaTool {
  const { name, description, input_schema, run } = options

  // 创建 Tool 定义
  const tool: Tool = {
    name,
    description: description || '',
    input_schema,
  }

  return {
    ...tool,
    run,
  }
}

/**
 * BetaTool - JSON Schema 工具类型
 */
export interface BetaTool extends Tool, RunnableTool {
  run: (input: unknown, context?: ToolContext) => Promise<unknown> | unknown
}

// ============ Zod Tool (Optional) ============

/**
 * Zod Schema 类型 (简化版本)
 * 实际使用时需要 zod 库
 */
export type ZodSchema = {
  _def?: {
    typeName?: string
    shape?: () => Record<string, unknown>
  }
  parse?: (input: unknown) => unknown
}

/**
 * Zod 工具选项
 */
export interface BetaZodToolOptions {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description?: string
  /** Zod Schema */
  inputSchema: ZodSchema
  /** 执行函数 (输入类型从 Zod Schema 推断) */
  run: (input: unknown, context?: ToolContext) => Promise<unknown> | unknown
}

/**
 * Zod 推断的工具输入类型
 */
export type Infer<T extends ZodSchema> = unknown

/**
 * 创建 Zod Schema 工具
 *
 * @example
 * ```typescript
 * import { betaZodTool } from '@upup/sdk'
 * import { z } from 'zod'
 *
 * const weatherTool = betaZodTool({
 *   name: 'get_weather',
 *   description: 'Get the weather for a location',
 *   inputSchema: z.object({
 *     location: z.string().describe('City and state'),
 *     unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
 *   }),
 *   run: async (input) => {
 *     // input is typed based on Zod schema
 *     const { location, unit } = input as { location: string; unit: 'celsius' | 'fahrenheit' }
 *     return `Weather in ${location}: 72°F`
 *   },
 * })
 * ```
 */
export function betaZodTool<T extends ZodSchema>(
  options: BetaZodToolOptions
): BetaTool {
  const { name, description, inputSchema, run } = options

  // 从 Zod Schema 转换为 JSON Schema
  const input_schema = zodToJsonSchema(inputSchema)

  // 创建 Tool 定义
  const tool: Tool = {
    name,
    description: description || '',
    input_schema,
  }

  return {
    ...tool,
    run: async (input: unknown, context?: ToolContext) => {
      // 如果 Zod Schema 可用，先验证输入
      if (inputSchema.parse) {
        try {
          input = inputSchema.parse(input)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Validation failed'
          throw new ToolValidationError(
            message,
            name,
            input as Record<string, unknown>
          )
        }
      }
      return run(input, context)
    },
  }
}

/**
 * 将 Zod Schema 转换为 JSON Schema
 */
function zodToJsonSchema(zodSchema: ZodSchema): JsonSchema {
  // 简化实现 - 实际需要更复杂的转换逻辑
  const schema: JsonSchema = {
    type: 'object',
    properties: {},
  }

  if (zodSchema._def?.shape) {
    const shape = zodSchema._def.shape()
    for (const [key, value] of Object.entries(shape)) {
      schema.properties = schema.properties || {}
      schema.properties[key] = zodTypeToJsonSchema(value as ZodSchema)
    }
  }

  return schema
}

/**
 * 将 Zod 类型转换为 JSON Schema 属性
 */
function zodTypeToJsonSchema(zodType: ZodSchema): JsonSchemaProperty {
  const typeName = zodType._def?.typeName

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' }
    case 'ZodNumber':
      return { type: 'number' }
    case 'ZodBoolean':
      return { type: 'boolean' }
    case 'ZodArray':
      return {
        type: 'array',
        items: zodType._def?.shape ? zodTypeToJsonSchema(zodType._def.shape() as unknown as ZodSchema) : undefined,
      }
    case 'ZodEnum': {
      const enumValues = (zodType as unknown as { _def: { values: unknown[] } })._def?.values
      return { type: 'string', enum: enumValues }
    }
    default:
      return { type: 'string' }
  }
}

// ============ Exports ============

export type {
  BetaToolOptions,
  JsonSchema,
  JsonSchemaProperty,
  ToolContext,
  BetaZodToolOptions,
  ZodSchema,
  Infer,
}