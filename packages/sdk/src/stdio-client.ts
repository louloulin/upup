/**
 * @upup/sdk - Stdio Client
 * 通过 stdio JSON-RPC 与 Agent 进程通信
 */

import { spawn, ChildProcess } from 'child_process'
import type {
  RunParams,
  RunResult,
  StreamEvent,
  Message,
  ToolDefinition,
  HookHandler,
} from './types.js'

// ============ JSON-RPC 类型 ============

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ============ StdioAgentClient ============

export class StdioAgentClient {
  private proc: ChildProcess | null = null
  private requestId = 0
  private pending = new Map<number, (res: JsonRpcResponse) => void>()
  private eventHandlers: Map<string, Set<(event: unknown) => void>> = new Map()
  private _connected = false

  get connected(): boolean {
    return this._connected
  }

  /**
   * 连接 Agent 进程
   */
  static async connect(
    command: string,
    args: string[],
    options?: { env?: Record<string, string> }
  ): Promise<StdioAgentClient> {
    const client = new StdioAgentClient()

    client.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options?.env },
    })

    // 设置 stdout 处理
    client.proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as
            | JsonRpcResponse
            | JsonRpcNotification
          client.handleMessage(msg)
        } catch {
          // 忽略解析错误
        }
      }
    })

    // 处理 stderr
    client.proc.stderr?.on('data', (data: Buffer) => {
      console.error('[upup-agent stderr]', data.toString())
    })

    // 进程退出处理
    client.proc.on('exit', (code) => {
      client._connected = false
      console.log(`[upup-agent exited with code ${code}]`)
    })

    // 初始化
    try {
      await client.request('initialize', {
        clientName: '@upup/sdk',
        clientVersion: '1.0.0',
        capabilities: { streaming: true, tools: true },
      })
      client._connected = true
    } catch (err) {
      client.proc.kill()
      throw new Error(`Failed to initialize agent: ${err}`)
    }

    return client
  }

  /**
   * 注册事件处理器
   */
  on(event: string, handler: (event: unknown) => void): void {
    const handlers = this.eventHandlers.get(event) || new Set()
    handlers.add(handler)
    this.eventHandlers.set(event, handlers)
  }

  /**
   * 移除事件处理器
   */
  off(event: string, handler: (event: unknown) => void): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.proc?.stdin) {
      throw new Error('Agent process not running')
    }

    const id = ++this.requestId
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, (res) => {
        if (res.error) {
          reject(new Error(`${res.error.code}: ${res.error.message}`))
        } else {
          resolve(res.result)
        }
      })

      try {
        this.proc!.stdin!.write(JSON.stringify(msg) + '\n')
      } catch (err) {
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(
    msg: JsonRpcResponse | JsonRpcNotification
  ): void {
    // 响应处理
    if ('id' in msg && msg.id !== undefined) {
      const resolve = this.pending.get(msg.id)
      if (resolve) {
        this.pending.delete(msg.id)
        resolve(msg)
      }
      return
    }

    // 通知处理
    if ('method' in msg) {
      const eventName = msg.method
      const handlers = this.eventHandlers.get(eventName)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.params)
          } catch (err) {
            console.error(`Handler error for ${eventName}:`, err)
          }
        }
      }
    }
  }

  /**
   * 运行 Agent（非流式）
   */
  async run(params: RunParams): Promise<RunResult> {
    const result = await this.request('run', params as Record<string, unknown>)
    return result as RunResult
  }

  /**
   * 流式运行 Agent
   */
  async *streamRun(
    params: RunParams
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // 发送流式请求
    const response = await this.request('stream', params as Record<string, unknown>)

    // 通过事件收集流式数据
    const events: StreamEvent[] = []
    const eventPromise = new Promise<void>((resolve) => {
      const handler = (data: unknown) => {
        events.push(data as StreamEvent)
      }
      this.on('event', handler)
      // 假设完成事件后结束
      const doneHandler = (data: unknown) => {
        if ((data as Record<string, unknown>)['done'] === true) {
          this.off('event', handler)
          this.off('stream_done', doneHandler)
          resolve()
        }
      }
      this.on('stream_done', doneHandler)
    })

    await eventPromise

    for (const event of events) {
      yield event
    }
  }

  /**
   * 发送取消请求
   */
  async cancel(runId: string): Promise<void> {
    await this.request('cancel', { runId })
  }

  /**
   * 关闭连接
   */
  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown')
    } catch {
      // 忽略错误
    }
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this._connected = false
  }
}

// ============ 便捷函数 ============

export async function createAgentProcess(
  command: string = 'npx',
  args: string[] = ['upup-agent']
): Promise<StdioAgentClient> {
  return StdioAgentClient.connect(command, args)
}
