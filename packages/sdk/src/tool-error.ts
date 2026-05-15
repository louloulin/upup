/**
 * @upup/sdk - Tool Error 处理
 *
 * 对齐 Claude Agent SDK 的 ToolError 错误处理
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import { SDKError, ErrorCode } from './errors.js'

/**
 * 工具错误基类
 */
export class ToolError extends SDKError {
  constructor(
    message: string,
    public readonly toolName?: string,
    public readonly toolInput?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.TOOL_ERROR, options)
    this.name = 'ToolError'
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.toolName,
      toolInput: this.toolInput,
    }
  }
}

/**
 * 工具使用错误 - 执行工具前发生的错误
 */
export class ToolUseError extends ToolError {
  constructor(
    message: string,
    toolName: string,
    toolInput?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, toolName, toolInput, options)
    this.name = 'ToolUseError'
  }
}

/**
 * 工具结果错误 - 工具执行后返回的错误
 */
export class ToolResultError extends ToolError {
  constructor(
    message: string,
    toolName: string,
    toolInput?: Record<string, unknown>,
    public readonly result?: unknown,
    options?: ErrorOptions
  ) {
    super(message, toolName, toolInput, options)
    this.name = 'ToolResultError'
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      result: this.result,
    }
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, toolName)
    this.name = 'ToolNotFoundError'
  }
}

/**
 * 工具执行超时错误
 */
export class ToolTimeoutError extends ToolError {
  constructor(
    toolName: string,
    public readonly timeoutMs: number
  ) {
    super(`Tool execution timeout after ${timeoutMs}ms`, toolName)
    this.name = 'ToolTimeoutError'
  }
}

/**
 * 工具权限被拒绝错误
 */
export class ToolPermissionDeniedError extends ToolError {
  constructor(
    toolName: string,
    public readonly reason?: string
  ) {
    super(
      reason ? `Permission denied for tool ${toolName}: ${reason}` : `Permission denied for tool ${toolName}`,
      toolName
    )
    this.name = 'ToolPermissionDeniedError'
  }
}

/**
 * 工具中止错误 - 用户主动中止工具执行
 */
export class ToolAbortedError extends ToolError {
  constructor(toolName: string) {
    super(`Tool execution aborted: ${toolName}`, toolName)
    this.name = 'ToolAbortedError'
  }
}

/**
 * 工具输入验证错误
 */
export class ToolValidationError extends ToolError {
  constructor(
    message: string,
    toolName: string,
    toolInput?: Record<string, unknown>,
    public readonly validationErrors?: Array<{ path: string; message: string }>
  ) {
    super(message, toolName, toolInput)
    this.name = 'ToolValidationError'
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    }
  }
}

/**
 * 检查错误是否是工具相关错误
 */
export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError
}

/**
 * 从任意错误创建 ToolError
 */
export function toToolError(
  error: unknown,
  toolName?: string,
  toolInput?: Record<string, unknown>
): ToolError {
  if (error instanceof ToolError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new ToolError(message, toolName, toolInput, {
    cause: error instanceof Error ? error : undefined,
  })
}