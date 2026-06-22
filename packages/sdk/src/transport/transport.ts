/**
 * @upup/sdk - Transport Interface
 *
 * Transport 接口定义了 SDK 与 upup 进程通信的抽象
 * 支持多种通信方式：stdio、HTTP、WebSocket 等
 */

import type { Readable, Writable } from 'stream'

// ============ Transport 配置类型 ============

export interface TransportConfig {
  /** 工作目录 */
  cwd?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 执行超时 (ms) */
  timeout?: number
  /** 是否调试 */
  debug?: boolean
}

export interface StdioTransportConfig extends TransportConfig {
  /** 可执行文件路径 */
  executablePath?: string
  /** 运行时: 'bun' | 'node' */
  runtime?: 'bun' | 'node'
  /** upup 参数 */
  args?: string[]
}

// ============ Transport 接口 ============

/**
 * Transport 接口 - 通信层抽象
 *
 * 定义了 SDK 与 Agent 进程通信的标准接口
 */
export interface Transport {
  /** 是否已连接 */
  readonly connected: boolean

  /** 二进制来源 */
  readonly binarySource: string

  /**
   * 连接/初始化
   * 子类实现具体的连接逻辑
   */
  connect(): Promise<void>

  /**
   * 发送消息
   * @param message 要发送的消息对象
   */
  send(message: object): Promise<void>

  /**
   * 接收消息流
   * @returns 消息异步生成器
   */
  messages(): AsyncGenerator<object, void>

  /**
   * 设置中止信号
   * 用于取消正在进行的请求
   */
  setSignal(signal: AbortSignal): void

  /**
   * 中断当前请求
   * 发送中断信号但不关闭连接
   */
  interrupt(): Promise<void>

  /**
   * 优雅关闭连接
   */
  close(): Promise<void>
}

/**
 * RpcTransport 接口 - 支持 RPC 请求的 Transport
 *
 * 扩展基础 Transport，支持:
 * - request(): 发送 RPC 请求并等待响应
 * - stream(): 发送 RPC 流式请求
 *
 * 用于 HTTP Transport 和未来的 WebSocket Transport
 */
export interface RpcTransport extends Transport {
  /**
   * 发送 RPC 请求并等待响应
   */
  request(method: string, params?: Record<string, unknown>): Promise<unknown>

  /**
   * 发送 RPC 流式请求
   */
  stream(method: string, params?: Record<string, unknown>): AsyncGenerator<unknown>
}

// ============ 消息类型 ============

/**
 * SDK 消息基类
 */
export interface SDKMessage {
  type: string
  [key: string]: unknown
}

/**
 * 用户消息
 */
export interface UserMessage extends SDKMessage {
  type: 'user'
  prompt: string
  options?: {
    model?: string
    systemPrompt?: string
    tools?: object[]
    maxTurns?: number
    [key: string]: unknown
  }
}

/**
 * 助手消息
 */
export interface AssistantMessage extends SDKMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: ContentBlock[]
  }
  parent_tool_use_id: string | null
}

/**
 * 内容块
 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  content?: string
}

/**
 * 结果消息
 */
export interface ResultMessage extends SDKMessage {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution'
  duration_ms: number
  result: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  permission_denials: string[]
}

/**
 * 系统消息
 */
export interface SystemMessage extends SDKMessage {
  type: 'system'
  subtype: 'init'
  apiKeySource: string
  tools: string[]
  model: string
}

/**
 * 控制请求 (用于 hooks、权限等)
 */
export interface ControlRequest extends SDKMessage {
  type: 'control_request'
  request: {
    subtype: 'can_use_tool' | 'hook_callback'
    tool_name?: string
    hook_event_name?: string
    callback_id?: string
    input?: Record<string, unknown>
    [key: string]: unknown
  }
  request_id: string
}

/**
 * 控制响应
 */
export interface ControlResponse extends SDKMessage {
  type: 'control_response'
  response: {
    request_id: string
    subtype: 'success' | 'error'
    continue?: boolean
    behavior?: 'allow' | 'deny'
    message?: string
    hookSpecificOutput?: Record<string, unknown>
    [key: string]: unknown
  }
}

/**
 * 事件通知
 */
export interface EventNotification extends SDKMessage {
  type: 'event'
  event: {
    type: string
    [key: string]: unknown
  }
}


// ============ 消息和事件类型 ============

export interface TransportMessage {
  type: string
  payload?: unknown
  [key: string]: unknown
}

export type EventHandler = (event: TransportMessage) => void
// ============ 工厂函数类型 ============

export type TransportFactory = (config?: StdioTransportConfig) => Transport
