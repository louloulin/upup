/**
 * @upup/sdk - Tool Runner
 *
 * Claude SDK 风格的工具执行循环
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { MessagesClient, Message, MessageParam } from './messages.js'
import type { Tool } from './tools/index.js'
import {
  ToolError,
  ToolNotFoundError,
  ToolTimeoutError,
  ToolAbortedError,
} from './tool-error.js'

// ============ Types ============

/**
 * 工具运行参数
 */
export interface ToolRunnerParams {
  messages: MessageParam[]
  tools: Tool[]
  model?: string
  maxTokens?: number
  maxIterations?: number
  stream?: boolean
}

/**
 * 可运行工具
 */
export interface RunnableTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  run: (input: Record<string, unknown>, context?: ToolContext) => Promise<unknown>
}

/**
 * 工具上下文
 */
export interface ToolContext {
  signal?: AbortSignal
  toolName: string
}

/**
 * 工具响应
 */
export interface ToolResponse {
  role: 'user'
  content: ToolResultContent[]
}

/**
 * 工具结果内容
 */
export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

/**
 * 运行结果
 */
export interface RunResult {
  message: Message
  iterations: number
  toolsUsed: number
}

// ============ ToolRunner ============

/**
 * 工具运行器
 *
 * 自动处理多轮工具调用循环
 *
 * @example
 * ```typescript
 * const runner = ToolRunner.create({
 *   messages: [{ role: 'user', content: 'What is 2 + 2?' }],
 *   tools: [calculatorTool],
 *   maxIterations: 10,
 * })
 *
 * const result = await runner.runUntilDone()
 * console.log(result.message.content)
 * ```
 */
export class ToolRunner {
  protected messages: MessageParam[]
  protected tools: Tool[] | RunnableTool[]
  protected model?: string
  protected maxTokens: number
  protected maxIterations: number
  private abortController: AbortController | null = null
  private currentMessage: Message | null = null
  private _done = false

  constructor(params: ToolRunnerParams) {
    this.messages = [...params.messages]
    this.tools = params.tools
    this.model = params.model
    this.maxTokens = params.maxTokens || 1024
    this.maxIterations = params.maxIterations || 10
  }

  /**
   * 创建 ToolRunner 实例
   */
  static create(params: ToolRunnerParams): ToolRunner {
    return new ToolRunner(params)
  }

  /**
   * 运行直到没有更多工具调用
   */
  async runUntilDone(): Promise<RunResult> {
    let iterations = 0
    let toolsUsed = 0

    while (iterations < this.maxIterations) {
      this.abortController = new AbortController()

      const message = await this.sendMessage()

      this.currentMessage = message

      if (message.stopReason !== 'tool_use') {
        this._done = true
        return {
          message,
          iterations,
          toolsUsed,
        }
      }

      const toolUses = message.content.filter(
        (c) => c.type === 'tool_use'
      ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

      if (toolUses.length === 0) {
        this._done = true
        return {
          message,
          iterations,
          toolsUsed,
        }
      }

      // 执行工具并添加结果
      for (const toolUse of toolUses) {
        try {
          const result = await this.executeTool(toolUse)
          this.messages.push({
            role: 'assistant',
            content: message.content,
          })
          this.messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            }],
          })
          toolsUsed++
        } catch (error) {
          // 工具执行失败，返回错误
          this.messages.push({
            role: 'assistant',
            content: message.content,
          })
          this.messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          })
          toolsUsed++
        }
      }

      iterations++
    }

    // 达到最大迭代次数，返回最后一条消息
    this._done = true
    return {
      message: this.currentMessage!,
      iterations,
      toolsUsed,
    }
  }

  /**
   * 发送消息（需要子类实现或传入 MessagesClient）
   */
  protected async sendMessage(): Promise<Message> {
    throw new Error('ToolRunner requires a messagesClient to be set')
  }

  /**
   * 执行单个工具
   */
  async executeTool(toolUse: {
    name: string
    input: Record<string, unknown>
    id: string
  }): Promise<unknown> {
    const tool = this.findTool(toolUse.name)

    if (!tool) {
      throw new ToolNotFoundError(toolUse.name)
    }

    // 检查是否是 RunnableTool
    if ('run' in tool) {
      const context: ToolContext = {
        signal: this.abortController?.signal,
        toolName: tool.name,
      }

      try {
        const result = await this.runWithTimeout(
          () => tool.run(toolUse.input, context),
          60000 // 1 分钟超时
        )
        return result
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ToolAbortedError(toolUse.name)
        }
        throw new ToolError(
          error instanceof Error ? error.message : String(error),
          toolUse.name,
          toolUse.input
        )
      }
    }

    // JSON Schema 工具 - 返回未实现的提示
    return `Tool ${toolUse.name} requires a RunnableTool implementation`
  }

  /**
   * 查找工具
   */
  private findTool(name: string): Tool | RunnableTool | undefined {
    return this.tools.find((t) => {
      if ('name' in t) {
        return t.name === name
      }
      return false
    }) as Tool | RunnableTool | undefined
  }

  /**
   * 带超时的执行
   */
  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ToolTimeoutError('unknown', timeoutMs))
      }, timeoutMs)

      fn()
        .then((result) => {
          clearTimeout(timeout)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })

      // 监听中止信号
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new ToolAbortedError('unknown'))
      })
    })
  }

  /**
   * 添加消息到上下文
   */
  pushMessages(messages: MessageParam[]): void {
    this.messages.push(...messages)
  }

  /**
   * 获取当前消息
   */
  getCurrentMessage(): Message | null {
    return this.currentMessage
  }

  /**
   * 检查是否完成
   */
  get isDone(): boolean {
    return this._done
  }

  /**
   * 中止运行
   */
  abort(): void {
    this.abortController?.abort()
    this._done = true
  }

  /**
   * 生成工具响应（用于手动迭代）
   */
  async generateToolResponse(): Promise<ToolResponse | null> {
    const message = this.currentMessage

    if (!message || message.stopReason !== 'tool_use') {
      return null
    }

    const toolUses = message.content.filter(
      (c) => c.type === 'tool_use'
    ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

    const results: ToolResultContent[] = []

    for (const toolUse of toolUses) {
      try {
        const result = await this.executeTool(toolUse)
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        })
      } catch (error) {
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }

    return {
      role: 'user',
      content: results,
    }
  }

  /**
   * 获取最终结果（等待完成后）
   */
  async getFinalResult(): Promise<RunResult> {
    if (!this._done) {
      return this.runUntilDone()
    }
    return {
      message: this.currentMessage!,
      iterations: 0,
      toolsUsed: 0,
    }
  }

  /**
   * 异步迭代器支持
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Message> {
    while (!this._done) {
      const result = await this.runUntilDone()
      yield result.message
      if (result.message.stopReason !== 'tool_use') {
        break
      }
    }
  }
}

// ============ ClientToolRunner ============

/**
 * 使用 MessagesClient 的 ToolRunner
 */
export class ClientToolRunner extends ToolRunner {
  constructor(
    private messagesClient: MessagesClient,
    params: ToolRunnerParams
  ) {
    super(params)
  }

  protected async sendMessage(): Promise<Message> {
    return this.messagesClient.create({
      model: this.model,
      maxTokens: this.maxTokens,
      messages: this.messages,
    })
  }
}