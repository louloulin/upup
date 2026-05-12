/**
 * @upup/sdk - 工具类型定义
 */

// ============ JSON Schema ============

/**
 * JSON Schema 定义
 */
export interface JSONSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
}

/**
 * 工具输入模式
 */
export type ToolInputSchema = JSONSchema

// ============ 工具定义 ============

/**
 * 工具定义
 *
 * @example
 * ```typescript
 * const tool: Tool = {
 *   name: 'get_stock_price',
 *   description: '获取股票当前价格',
 *   input_schema: {
 *     type: 'object',
 *     properties: {
 *       ticker: {
 *         type: 'string',
 *         description: '股票代码，如 AAPL、600519'
 *       }
 *     },
 *     required: ['ticker']
 *   }
 * }
 * ```
 */
export interface Tool {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数模式 */
  input_schema: ToolInputSchema
  /** 是否可禁用 */
  disabled?: boolean
  /** 标签 */
  tags?: string[]
}

// ============ 工具使用结果 ============

/**
 * 工具调用结果
 */
export interface ToolUseResult {
  /** 工具名称 */
  toolName: string
  /** 工具输入 */
  input: Record<string, unknown>
  /** 调用结果 */
  result: unknown
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
  /** 执行时长 (ms) */
  durationMs?: number
}

// ============ 工具事件 ============

/**
 * 工具相关事件类型
 */
export type ToolEvent =
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'tool_use_block'

/**
 * 工具开始事件
 */
export interface ToolStartEvent {
  type: 'tool_start'
  toolName: string
  input: Record<string, unknown>
  toolUseId: string
}

/**
 * 工具结束事件
 */
export interface ToolEndEvent {
  type: 'tool_end'
  toolName: string
  toolUseId: string
  result: unknown
  success: boolean
  durationMs?: number
}

/**
 * 工具错误事件
 */
export interface ToolErrorEvent {
  type: 'tool_error'
  toolName: string
  toolUseId: string
  error: string
}

// ============ 工具注册表 ============

/**
 * 工具注册表 - 管理可用工具
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (tool.disabled) {
      return
    }
    this.tools.set(tool.name, tool)
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取工具名称列表
   */
  getNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear()
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size
  }

  /**
   * 转换为 Claude SDK 格式
   */
  toClaudeFormat(): Array<{
    name: string
    description: string
    input_schema: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.input_schema.properties || {},
        required: tool.input_schema.required,
      },
    }))
  }
}
