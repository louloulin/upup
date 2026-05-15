/**
 * @upup/sdk - SDK 错误类型
 *
 * 完整的错误类型体系，对齐 Claude Agent SDK
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // SDK 基础错误
  UNKNOWN = 'UNKNOWN',
  SDK_ERROR = 'SDK_ERROR',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',

  // 会话错误
  SESSION_ERROR = 'SESSION_ERROR',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_CLOSED = 'SESSION_CLOSED',

  // 传输错误
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
  TRANSPORT_NOT_CONNECTED = 'TRANSPORT_NOT_CONNECTED',
  TRANSPORT_TIMEOUT = 'TRANSPORT_TIMEOUT',

  // 工具错误
  TOOL_ERROR = 'TOOL_ERROR',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  TOOL_PERMISSION_DENIED = 'TOOL_PERMISSION_DENIED',
  TOOL_VALIDATION_ERROR = 'TOOL_VALIDATION_ERROR',

  // 内存错误
  MEMORY_ERROR = 'MEMORY_ERROR',
  MEMORY_NOT_FOUND = 'MEMORY_NOT_FOUND',
  MEMORY_STORAGE_ERROR = 'MEMORY_STORAGE_ERROR',

  // 验证错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // 权限错误
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // 钩子错误
  HOOK_ERROR = 'HOOK_ERROR',
  HOOK_ABORTED = 'HOOK_ABORTED',

  // 消息错误
  MESSAGE_ERROR = 'MESSAGE_ERROR',
  MESSAGE_STREAM_ERROR = 'MESSAGE_STREAM_ERROR',
}

/**
 * SDK 错误基类
 */
export class SDKError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.SDK_ERROR,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'SDKError'
  }

  /**
   * 错误是否可恢复
   */
  get isRecoverable(): boolean {
    return this.code === ErrorCode.TRANSPORT_TIMEOUT
      || this.code === ErrorCode.SESSION_EXPIRED
      || this.code === ErrorCode.CONNECTION_ERROR
  }

  /**
   * 转换为 JSON 对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause,
    }
  }
}

/**
 * 会话错误
 */
export class SessionError extends SDKError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SESSION_ERROR,
    public readonly sessionId?: string,
    options?: ErrorOptions
  ) {
    super(message, code, options)
    this.name = 'SessionError'
  }
}

/**
 * 传输错误
 */
export class TransportError extends SDKError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.TRANSPORT_ERROR,
    options?: ErrorOptions
  ) {
    super(message, code, options)
    this.name = 'TransportError'
  }
}

/**
 * 内存错误
 */
export class MemoryError extends SDKError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.MEMORY_ERROR,
    public readonly memoryId?: string,
    options?: ErrorOptions
  ) {
    super(message, code, options)
    this.name = 'MemoryError'
  }
}

/**
 * 验证错误
 */
export class ValidationError extends SDKError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.VALIDATION_ERROR, options)
    this.name = 'ValidationError'
  }
}

/**
 * 权限错误
 */
export class PermissionError extends SDKError {
  constructor(
    message: string,
    public readonly toolName?: string,
    public readonly reason?: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.PERMISSION_DENIED, options)
    this.name = 'PermissionError'
  }
}

/**
 * 网络错误
 */
export class NetworkError extends SDKError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.CONNECTION_ERROR, options)
    this.name = 'NetworkError'
  }
}

/**
 * 初始化错误
 */
export class InitializationError extends SDKError {
  constructor(
    message: string,
    public readonly config?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, ErrorCode.INITIALIZATION_ERROR, options)
    this.name = 'InitializationError'
  }
}

/**
 * 检查错误类型
 */
export function isSDKError(error: unknown): error is SDKError {
  return error instanceof SDKError
}

/**
 * 检查是否是会话错误
 */
export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError
}

/**
 * 检查是否是传输错误
 */
export function isTransportError(error: unknown): error is TransportError {
  return error instanceof TransportError
}

/**
 * 转换为 SDKError
 */
export function toSDKError(error: unknown, defaultCode: ErrorCode = ErrorCode.UNKNOWN): SDKError {
  if (error instanceof SDKError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new SDKError(message, defaultCode, {
    cause: error instanceof Error ? error : undefined,
  })
}

/**
 * 尝试恢复错误
 */
export function tryRecoverError(error: unknown): SDKError | null {
  const sdkError = toSDKError(error)
  return sdkError.isRecoverable ? sdkError : null
}