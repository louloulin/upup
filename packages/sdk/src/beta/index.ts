/**
 * @upup/sdk - Beta API
 *
 * 对齐 Claude Agent SDK 的 client.beta.* API
 * 包含 beta.messages.toolRunner 等 Beta 功能
 */

import type { Tool } from '../tools/index'
import type { MessageParam, Message, StreamEvent } from '../messages'
import { ClientToolRunner } from '../tool-runner'
import { MessagesClient, type RpcTransport } from '../messages'

// ============ Types ============

/**
 * Beta Tool Runner 参数
 */
export interface BetaToolRunnerParams {
  /** 模型 ID */
  model: string
  /** 最大生成 token 数 */
  max_tokens: number
  /** 初始消息 */
  messages: MessageParam[]
  /** 工具列表 */
  tools: Array<{
    name: string
    description?: string
    input_schema?: Record<string, unknown>
    run?: (input: unknown) => unknown | Promise<unknown>
  }>
  /** 最大迭代次数 (防止无限循环) */
  max_iterations?: number
  /** 是否流式输出 */
  stream?: boolean
}

/**
 * Beta Message Stream 参数
 */
export interface BetaMessageStreamParams {
  /** 模型 ID */
  model: string
  /** 最大生成 token 数 */
  max_tokens: number
  /** 消息列表 */
  messages: MessageParam[]
  /** 系统提示 */
  system?: string
  /** 工具列表 */
  tools?: Tool[]
}

/**
 * Beta Tool Runner 结果
 */
export interface BetaToolRunnerResult {
  finalMessage: Message
  iterations: number
  toolsUsed: number
}

// ============ Beta Messages API ============

/**
 * Beta Messages API
 *
 * 对齐 Claude Agent SDK 的 client.beta.messages
 */
export class BetaMessagesAPI {
  constructor(private transport: RpcTransport) {}

  /**
   * 工具运行器
   *
   * 对齐 Claude Agent SDK 的 client.beta.messages.toolRunner
   *
   * @example
   * ```typescript
   * const runner = client.beta.messages.toolRunner({
   *   model: 'claude-sonnet-4-6',
   *   max_tokens: 1024,
   *   max_iterations: 10,
   *   messages: [{ role: 'user', content: 'What is 2 + 2?' }],
   *   tools: [calculatorTool],
   * })
   *
   * const result = await runner.done()
   * console.log(result.finalMessage.content)
   * ```
   */
  toolRunner(params: BetaToolRunnerParams): BetaToolRunner {
    const client = new MessagesClient(this.transport, { defaultModel: params.model })
    const runner = new ClientToolRunner(client, {
      messages: params.messages,
      tools: params.tools as Tool[],
      model: params.model,
      maxTokens: params.max_tokens || 1024,
      maxIterations: params.max_iterations || 10,
      stream: params.stream || false,
    })
    return new BetaToolRunner(runner, params)
  }

  /**
   * 创建流式消息
   */
  async *stream(params: BetaMessageStreamParams): AsyncGenerator<StreamEvent> {
    const client = new MessagesClient(this.transport, { defaultModel: params.model })
    yield* client.stream({
      model: params.model,
      maxTokens: params.max_tokens,
      messages: params.messages,
      system: params.system,
      tools: params.tools,
    })
  }
}

// ============ Beta Tool Runner ============

/**
 * Beta Tool Runner
 *
 * 封装 ClientToolRunner 提供 Beta API
 */
export class BetaToolRunner {
  private runner: ClientToolRunner
  private params: BetaToolRunnerParams

  constructor(runner: ClientToolRunner, params: BetaToolRunnerParams) {
    this.runner = runner
    this.params = params
  }

  /**
   * 获取最终消息
   */
  async done(): Promise<BetaToolRunnerResult> {
    const result = await this.runner.runUntilDone()
    return {
      finalMessage: result.message,
      iterations: result.iterations,
      toolsUsed: result.toolsUsed,
    }
  }

  /**
   * 异步迭代器 - 逐步返回消息
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<Message> {
    // 执行第一轮
    const result = await this.runner.runUntilDone()
    yield result.message

    // 如果还有工具调用，继续迭代
    // 注意: 简化版本，完整实现需要更多状态管理
  }

  /**
   * 中止运行
   */
  abort(): void {
    this.runner.abort()
  }
}

// ============ Beta API 命名空间 ============

/**
 * Beta API 命名空间
 *
 * 对齐 Claude Agent SDK 的 client.beta
 */
export class BetaAPI {
  messages: BetaMessagesAPI

  constructor(transport: RpcTransport) {
    this.messages = new BetaMessagesAPI(transport)
  }
}

/**
 * 创建 Beta API 实例
 */
export function createBetaAPI(transport: RpcTransport): BetaAPI {
  return new BetaAPI(transport)
}