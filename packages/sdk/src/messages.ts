/**
 * @upup/sdk - Messages API
 *
 * 对齐 Claude Agent SDK 的 client.messages.create API
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { Transport } from './transport/index'
import type { Tool } from './tools/index'

// ============ Types ============

/**
 * 消息参数
 */
export interface MessageParam {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

/**
 * 内容块
 */
export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock

/**
 * 文本内容块
 */
export interface TextContentBlock {
  type: 'text'
  text: string
}

/**
 * 工具使用内容块
 */
export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * 工具结果内容块
 */
export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ErrorContent
}

/**
 * 错误内容
 */
export interface ErrorContent {
  type: 'error'
  error: string
}

/**
 * 消息创建参数
 */
export interface MessageCreateParams {
  model?: string
  maxTokens: number
  messages: MessageParam[]
  system?: string
  tools?: Tool[]
  stream?: boolean
}

/**
 * 消息响应
 */
export interface Message {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: ContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'stop_sequence'
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Token 计数
 */
export interface TokenCount {
  inputTokens: number
  outputTokens?: number
}

/**
 * 流式事件类型
 */
export type StreamEvent =
  | { type: 'message_start'; message: Message }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: TextDelta | InputJsonDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: ' message_delta'; delta: { stop_reason?: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'error'; error: string }

/**
 * 文本增量
 */
export interface TextDelta {
  type: 'text_delta'
  text: string
}

/**
 * 输入 JSON 增量
 */
export interface InputJsonDelta {
  type: 'input_json_delta'
  partial_json: string
}

// ============ RpcTransport Interface ============

/**
 * 支持 RPC 请求的 Transport 接口
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

// ============ MessagesClient ============

/**
 * Messages 客户端
 */
export class MessagesClient {
  constructor(
    private transport: RpcTransport,
    private config: MessagesClientConfig = {}
  ) {}

  /**
   * 创建消息
   */
  async create(params: MessageCreateParams): Promise<Message> {
    const response = await this.transport.request('messages.create', {
      model: params.model || this.config.defaultModel,
      max_tokens: params.maxTokens,
      messages: params.messages,
      system: params.system,
      tools: params.tools,
    })

    return this.parseMessageResponse(response)
  }

  /**
   * 创建流式消息
   */
  async *stream(params: MessageCreateParams): AsyncGenerator<StreamEvent> {
    for await (const event of this.transport.stream('messages.create', {
      model: params.model || this.config.defaultModel,
      max_tokens: params.maxTokens,
      messages: params.messages,
      system: params.system,
      tools: params.tools,
    })) {
      yield this.parseStreamEvent(event)
    }
  }

  /**
   * 计算 Token 数量
   */
  async countTokens(params: CountTokensParams): Promise<TokenCount> {
    const response = await this.transport.request('messages.count_tokens', {
      text: params.text,
      model: params.model || this.config.defaultModel,
    }) as { input_tokens?: number; output_tokens?: number }

    return {
      inputTokens: response.input_tokens || 0,
      outputTokens: response.output_tokens || 0,
    }
  }

  /**
   * 解析消息响应
   */
  private parseMessageResponse(response: unknown): Message {
    const r = response as Record<string, unknown>

    const content: ContentBlock[] = []

    if (Array.isArray(r.content)) {
      for (const block of r.content) {
        const b = block as Record<string, unknown>
        if (b.type === 'text') {
          content.push({
            type: 'text',
            text: String(b.text || ''),
          })
        } else if (b.type === 'tool_use') {
          content.push({
            type: 'tool_use',
            id: String(b.id || ''),
            name: String(b.name || ''),
            input: (b.input as Record<string, unknown>) || {},
          })
        } else if (b.type === 'tool_result') {
          content.push({
            type: 'tool_result',
            tool_use_id: String(b.tool_use_id || ''),
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
          })
        }
      }
    }

    const usage = r.usage as Record<string, unknown> || {}

    return {
      id: String(r.id || ''),
      type: 'message',
      role: 'assistant',
      model: String(r.model || ''),
      content,
      stopReason: (r.stop_reason as Message['stopReason']) || 'end_turn',
      usage: {
        inputTokens: Number(usage.input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
      },
    }
  }

  /**
   * 解析流式事件
   */
  private parseStreamEvent(event: unknown): StreamEvent {
    const e = event as Record<string, unknown>

    switch (e.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: this.parseMessageResponse(e.message),
        }

      case 'content_block_start':
        return {
          type: 'content_block_start',
          index: Number(e.index) || 0,
          content_block: (e.content_block as ContentBlock) || { type: 'text', text: '' },
        }

      case 'content_block_delta':
        if ((e.delta as Record<string, unknown>)?.type === 'text_delta') {
          return {
            type: 'content_block_delta',
            index: Number(e.index) || 0,
            delta: {
              type: 'text_delta',
              text: String((e.delta as Record<string, unknown>)?.text || ''),
            },
          }
        }
        return {
          type: 'content_block_delta',
          index: Number(e.index) || 0,
          delta: {
            type: 'input_json_delta',
            partial_json: String((e.delta as Record<string, unknown>)?.partial_json || ''),
          },
        }

      case 'content_block_stop':
        return {
          type: 'content_block_stop',
          index: Number(e.index) || 0,
        }

      case 'message_delta':
        return {
          type: ' message_delta',
          delta: {
            stop_reason: String((e.delta as Record<string, unknown>)?.stop_reason || ''),
          },
          usage: {
            output_tokens: Number((e.usage as Record<string, unknown>)?.output_tokens) || 0,
          },
        }

      case 'message_stop':
        return { type: 'message_stop' }

      case 'error':
        return {
          type: 'error',
          error: String(e.error || 'Unknown error'),
        }

      default:
        return {
          type: 'error',
          error: `Unknown event type: ${e.type}`,
        }
    }
  }
}

/**
 * Messages 客户端配置
 */
export interface MessagesClientConfig {
  defaultModel?: string
}

/**
 * CountTokens 参数
 */
export interface CountTokensParams {
  text: string
  model?: string
}