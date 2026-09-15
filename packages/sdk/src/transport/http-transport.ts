/**
 * @upup/sdk - HTTP Transport
 *
 * 通过 HTTP 与远程 upup 服务通信
 * 实现 RpcTransport 接口支持 Beta API
 */

import type { Transport, RpcTransport } from './transport'

/**
 * Transport 消息类型
 */
export interface TransportMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
  type?: string
  event?: Record<string, unknown>
}

/**
 * 事件处理器类型
 */
export type EventHandler = (data?: unknown) => void

/**
 * HTTP Transport 配置
 */
export interface HttpTransportConfig {
  /** 服务端点 URL */
  url: string
  /** API Key (Bearer token) */
  apiKey?: string
  /** 超时时间 (ms) */
  timeout?: number
  /** 是否输出调试信息 */
  debug?: boolean
}

/**
 * HTTP Transport
 *
 * 通过 HTTP 与远程 upup 服务通信，支持:
 * - 单次请求/响应
 * - Server-Sent Events (SSE) 流式响应
 * - 会话管理
 *
 * @example
 * ```typescript
 * const transport = new HttpTransport({
 *   url: 'https://api.upup.dev/v1',
 *   apiKey: process.env.UPUP_API_KEY,
 * })
 *
 * await transport.connect()
 *
 * // 单次请求
 * const result = await transport.request('run', { prompt: 'Hello' })
 *
 * // 流式请求
 * for await (const msg of transport.stream('run', { prompt: 'Hello' })) {
 *   console.log(msg)
 * }
 *
 * await transport.close()
 * ```
 */
export class HttpTransport implements RpcTransport {
  readonly binarySource: string = 'http'

  private config: { url: string; apiKey: string; timeout: number; debug: boolean }
  private _connected = false
  private abortController: AbortController | null = null
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private messageId = 0

  constructor(config: HttpTransportConfig) {
    this.config = {
      url: config.url,
      apiKey: config.apiKey ?? '',
      timeout: config.timeout ?? 30000,
      debug: config.debug ?? false,
    }
  }

  /** 是否已连接 */
  get connected(): boolean {
    return this._connected
  }

  /**
   * 连接到服务端
   */
  async connect(_config?: Record<string, unknown>): Promise<void> {
    if (this._connected) {
      return
    }

    // HTTP Transport 不需要像 StdioTransport 那样启动进程
    // 只是验证端点可用性
    try {
      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      this._connected = true
      this.debugLog('Connected to', this.config.url)
    } catch {
      // 健康检查失败不影响连接（服务端可能没有 /health 端点）
      this._connected = true
      this.debugLog('Connected (health check skipped)')
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.messageId
    const payload: TransportMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    this.debugLog('Request:', method, id)

    const response = await fetch(`${this.config.url}/rpc`, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }),
      body: JSON.stringify(payload),
      signal: this.getAbortSignal(),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json() as TransportMessage
    this.debugLog('Response:', method, id)

    // 触发事件
    this.emit('response', result)

    return result
  }

  /**
   * 发送流式请求 (SSE) - RpcTransport.stream()
   */
  async *stream(
    method: string,
    params: Record<string, unknown>
  ): AsyncGenerator<unknown> {
    const id = ++this.messageId
    const payload: TransportMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    this.debugLog('Stream request:', method, id)

    this.abortController = new AbortController()

    const response = await fetch(`${this.config.url}/stream`, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(payload),
      signal: this.abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              this.debugLog('Stream complete:', method, id)
              return
            }

            try {
              const msg = JSON.parse(data) as TransportMessage
              yield msg as unknown

              // 触发事件处理器
              this.emit('message', msg)
            } catch {
              // 忽略无效 JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
      this.abortController = null
    }
  }

  /**
   * 发送消息（不等待响应）
   */
  async send(_message: object): Promise<void> {
    // HTTP Transport 不支持 fire-and-forget
    // 使用 request() 方法发送 RPC 请求
    this.debugLog('Send: use request() for HTTP Transport')
  }

  /**
   * 获取消息流
   */
  messages(): AsyncGenerator<object> {
    // HTTP Transport 使用 stream() 方法
    throw new Error('Use stream() method for HTTP Transport')
  }

  /**
   * 设置中止信号
   */
  setSignal(_signal?: AbortSignal): void {
    // HTTP Transport 使用 AbortController
  }

  /**
   * 注册事件处理器
   */
  on(event: string, handler: EventHandler): void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)
  }

  /**
   * 移除事件处理器
   */
  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  /**
   * 中断当前请求
   */
  async interrupt(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
      this.debugLog('Request interrupted')
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.interrupt()
    this._connected = false
    this.eventHandlers.clear()
    this.debugLog('Connection closed')
  }

  /**
   * 获取中止信号
   */
  private getAbortSignal(): AbortSignal {
    if (typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(this.config.timeout)
    }
    // 降级：使用简单的超时
    const controller = new AbortController()
    setTimeout(() => controller.abort(), this.config.timeout)
    return controller.signal
  }

  /**
   * 获取请求头
   */
  private getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      ...extra,
    }

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }

    return headers
  }

  /**
   * 触发事件
   */
  private emit(event: string, data?: unknown): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error)
        }
      }
    }
  }

  /**
   * 调试日志
   */
  private debugLog(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[upup/http]', ...args)
    }
  }
}

/**
 * 创建 HTTP Transport 实例
 */
export function createHttpTransport(config: HttpTransportConfig): HttpTransport {
  return new HttpTransport(config)
}
