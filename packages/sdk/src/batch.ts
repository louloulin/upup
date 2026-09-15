/**
 * @upup/sdk - Batch Processing API
 *
 * 对齐 Claude Agent SDK 的 client.messages.batches API
 * 支持批量处理多个消息请求，节省 50% 成本
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { RpcTransport } from './transport/transport'
import type { MessageParam, Message } from './messages'

// ============ Types ============

/**
 * 批量请求项
 */
export interface BatchRequestItem {
  /** 自定义 ID */
  custom_id: string
  /** 请求参数 */
  params: BatchRequestParams
}

/**
 * 批量请求参数
 */
export interface BatchRequestParams {
  model: string
  max_tokens: number
  messages: MessageParam[]
  system?: string
  tools?: Array<Record<string, unknown>>
}

/**
 * 批量创建参数
 */
export interface BatchCreateParams {
  requests: BatchRequestItem[]
  metadata?: Record<string, string>
}

/**
 * 批量状态
 */
export type BatchProcessingStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled'

/**
 * 批量信息
 */
export interface BatchInfo {
  id: string
  processing_status: BatchProcessingStatus
  request_counts: {
    valid: number
    errors: number
    total: number
  }
  created_at: string
  expires_at: string
  completed_at?: string
  failed_at?: string
  cancelled_at?: string
  metadata?: Record<string, string>
}

/**
 * 批量结果项
 */
export interface BatchResultItem {
  custom_id: string
  result: {
    type: 'succeeded' | 'failed' | 'errored'
    message?: Message
    error?: {
      type: string
      message: string
    }
  }
}

/**
 * 创建批量响应
 */
export interface BatchCreateResponse {
  id: string
  processing_status: BatchProcessingStatus
  created_at: string
  expires_at: string
  metadata?: Record<string, string>
}

// ============ Batch API ============

/**
 * Batch API - 批量消息处理
 *
 * @example
 * ```typescript
 * const batchClient = new BatchClient(transport)
 *
 * // 创建批量
 * const batch = await batchClient.create({
 *   requests: [
 *     { custom_id: 'req-1', params: { model: 'claude-3', max_tokens: 256, messages: [...] } },
 *     { custom_id: 'req-2', params: { model: 'claude-3', max_tokens: 256, messages: [...] } },
 *   ],
 * })
 *
 * // 轮询状态
 * let status = await batchClient.retrieve(batch.id)
 * while (status.processing_status === 'in_progress') {
 *   await sleep(5000)
 *   status = await batchClient.retrieve(batch.id)
 * }
 *
 * // 获取结果
 * for await (const result of batchClient.results(batch.id)) {
 *   console.log(result.custom_id, result.result)
 * }
 * ```
 */
export class BatchClient {
  constructor(private transport: RpcTransport) {}

  /**
   * 创建批量
   */
  async create(params: BatchCreateParams): Promise<BatchCreateResponse> {
    const response = await this.transport.request('messages.batches.create', params as unknown as Record<string, unknown>)
    return response as BatchCreateResponse
  }

  /**
   * 获取批量状态
   */
  async retrieve(batchId: string): Promise<BatchInfo> {
    const response = await this.transport.request('messages.batches.retrieve', { batchId })
    return response as BatchInfo
  }

  /**
   * 获取批量结果
   */
  async *results(batchId: string): AsyncGenerator<BatchResultItem> {
    const results = await this.transport.request('messages.batches.results', { batchId })

    if (Array.isArray(results)) {
      for (const result of results) {
        yield result as BatchResultItem
      }
    } else if (results && typeof results === 'object' && Symbol.asyncIterator in results) {
      // 流式结果
      for await (const result of results as AsyncGenerator<BatchResultItem>) {
        yield result
      }
    }
  }

  /**
   * 列出所有批量
   */
  async *list(limit?: number, after?: string, before?: string): AsyncGenerator<BatchInfo> {
    const response = await this.transport.request('messages.batches.list', {
      limit,
      after,
      before,
    })

    const data = response as { batches?: BatchInfo[]; data?: BatchInfo[] }
    const batches = data.batches || data.data || []

    for (const batch of batches) {
      yield batch
    }
  }

  /**
   * 取消批量
   */
  async cancel(batchId: string): Promise<BatchInfo> {
    const response = await this.transport.request('messages.batches.cancel', { batchId })
    return response as BatchInfo
  }

  /**
   * 删除批量
   */
  async delete(batchId: string): Promise<void> {
    await this.transport.request('messages.batches.delete', { batchId })
  }
}

// ============ Batch Tool Runner ============

/**
 * 批量工具运行器参数
 */
export interface BatchToolRunnerParams {
  /** 批量请求列表 */
  requests: Array<{
    custom_id: string
    messages: MessageParam[]
    tools?: Array<Record<string, unknown>>
    model?: string
    max_tokens?: number
    system?: string
  }>
  /** 默认模型 */
  defaultModel?: string
  /** 默认最大 token */
  defaultMaxTokens?: number
}

/**
 * 批量工具运行器结果
 */
export interface BatchToolRunnerResult {
  custom_id: string
  success: boolean
  message?: Message
  error?: string
  iterations?: number
  toolsUsed?: number
}

/**
 * 批量工具运行器
 *
 * 对多个请求执行工具循环
 */
export class BatchToolRunner {
  constructor(
    private batchClient: BatchClient,
    params: BatchToolRunnerParams
  ) {
    this.params = {
      defaultModel: 'claude-sonnet-4-6',
      defaultMaxTokens: 1024,
      ...params,
    }
  }

  private params: Required<BatchToolRunnerParams>

  /**
   * 执行批量请求
   */
  async run(): Promise<BatchToolRunnerResult[]> {
    // 创建批量
    const batch = await this.batchClient.create({
      requests: this.params.requests.map((req) => ({
        custom_id: req.custom_id,
        params: {
          model: req.model || this.params.defaultModel,
          max_tokens: req.max_tokens || this.params.defaultMaxTokens,
          messages: req.messages,
          system: req.system,
          tools: req.tools,
        },
      })),
    })

    // 轮询完成
    let status = await this.batchClient.retrieve(batch.id)
    while (status.processing_status === 'in_progress') {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      status = await this.batchClient.retrieve(batch.id)
    }

    // 获取结果
    const results: BatchToolRunnerResult[] = []
    for await (const result of this.batchClient.results(batch.id)) {
      results.push({
        custom_id: result.custom_id,
        success: result.result.type === 'succeeded',
        message: result.result.message,
        error: result.result.error?.message,
      })
    }

    return results
  }
}
