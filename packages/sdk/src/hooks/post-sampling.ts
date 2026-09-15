/**
 * @upup/sdk - PostSampling Hooks
 *
 * 对齐 Claude Agent SDK 的采样后 Hook
 * 在模型生成响应后进行拦截和处理
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { HookExecutor } from './executor'
import type { HookEvent, HookInput, HookOutput, HookCallback } from './types'
import type { ContentBlock, Message } from '../messages'

// ============ PostSampling 事件类型 ============

/**
 * PostSampling 事件
 *
 * 在模型生成完整响应后触发
 * 可用于修改响应、记录日志、添加上下文等
 */
export interface PostSamplingInput extends Omit<HookInput, 'message'> {
  /** 生成的完整消息 */
  message: Message
  /** 原始请求参数 */
  request_params: {
    model: string
    max_tokens: number
    messages: Array<{ role: string; content: string | ContentBlock[] }>
    system?: string
  }
}

/**
 * PostSampling 输出
 */
export interface PostSamplingOutput extends HookOutput {
  /** 修改后的消息 (如果需要修改响应) */
  modified_message?: Message
  /** 要插入的额外消息 */
  additional_messages?: Array<{ role: string; content: string }>
  /** 要添加的工具调用结果 */
  tool_results?: Array<{
    tool_use_id: string
    content: string
  }>
  /** 继续生成更多内容 */
  continue_generation?: boolean
  /** 采样的元数据 */
  sampling_metadata?: Record<string, unknown>
}

/**
 * PostSampling 回调
 */
export type PostSamplingCallback = (
  input: PostSamplingInput,
  options?: { signal?: AbortSignal }
) => Promise<PostSamplingOutput | void>

// ============ PostSampling Hook 配置 ============

/**
 * PostSampling Hook 配置
 */
export interface PostSamplingConfig {
  /** 是否启用 */
  enabled?: boolean
  /** 匹配的模型 (可选) */
  modelPattern?: string
  /** 匹配的内容类型 (text/tool_use) */
  contentTypes?: Array<'text' | 'tool_use'>
  /** 最大执行时间 (ms) */
  timeout?: number
}

// ============ PostSampling Hooks 管理器 ============

/**
 * PostSampling Hooks 管理器
 *
 * @example
 * ```typescript
 * const postSampling = new PostSamplingHooks()
 *
 * // 添加后处理 Hook
 * postSampling.register(async (input) => {
 *   console.log('Response received:', input.message.content)
 *
 *   // 可以修改响应
 *   return {
 *     modified_message: {
 *       ...input.message,
 *       content: [...input.message.content, { type: 'text', text: ' [augmented]' }]
 *     }
 *   }
 * })
 *
 * // 在 ToolRunner 中使用
 * const result = await toolRunner.runUntilDone()
 * const processed = await postSampling.execute(result.message, { request_params: {...} })
 * ```
 */
export class PostSamplingHooks {
  private hooks: PostSamplingCallback[] = []
  private config: Required<PostSamplingConfig>

  constructor(config: PostSamplingConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      modelPattern: config.modelPattern ?? '*',
      contentTypes: config.contentTypes ?? ['text', 'tool_use'],
      timeout: config.timeout ?? 5000,
    }
  }

  /**
   * 注册 PostSampling Hook
   */
  register(callback: PostSamplingCallback): void {
    this.hooks.push(callback)
  }

  /**
   * 批量注册
   */
  registerAll(callbacks: PostSamplingCallback[]): void {
    this.hooks.push(...callbacks)
  }

  /**
   * 执行所有 PostSampling Hooks
   */
  async execute(
    message: Message,
    requestParams: PostSamplingInput['request_params']
  ): Promise<PostSamplingOutput> {
    if (!this.config.enabled || this.hooks.length === 0) {
      return { continue: true }
    }

    const input: PostSamplingInput = {
      hook_event_name: 'PostSampling' as HookEvent,
      message,
      request_params: requestParams,
      session_id: requestParams.messages[0]?.content?.toString(),
    }

    let finalOutput: PostSamplingOutput = { continue: true }
    let modifiedMessage: Message | undefined

    for (const hook of this.hooks) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PostSampling hook timeout')), this.config.timeout)
        )

        const hookPromise = hook(input, {})

        const result = await Promise.race([hookPromise, timeoutPromise])

        if (result) {
          // 合并输出
          if (result.modified_message) {
            modifiedMessage = result.modified_message
          }
          if (result.additional_messages) {
            finalOutput.additional_messages = [
              ...(finalOutput.additional_messages || []),
              ...result.additional_messages,
            ]
          }
          if (result.tool_results) {
            finalOutput.tool_results = [
              ...(finalOutput.tool_results || []),
              ...result.tool_results,
            ]
          }
          if (result.continue !== undefined) {
            finalOutput.continue = result.continue
          }
          if (result.sampling_metadata) {
            finalOutput.sampling_metadata = {
              ...finalOutput.sampling_metadata,
              ...result.sampling_metadata,
            }
          }
        }
      } catch (error) {
        console.error('PostSampling hook error:', error)
      }
    }

    return {
      ...finalOutput,
      modified_message: modifiedMessage,
    }
  }

  /**
   * 转换为基础 Hook 格式 (用于 HookExecutor)
   */
  toHookCallbacks(): HookCallback[] {
    return this.hooks.map((hook) => {
      return async (input: HookInput) => {
        // PostSampling 需要 message 和 request_params
        if (!input.message || !input.request_params) {
          return { continue: true }
        }

        const result = await hook(input as unknown as PostSamplingInput, {})
        return result
      }
    })
  }

  /**
   * 清空所有 Hooks
   */
  clear(): void {
    this.hooks = []
  }

  /**
   * 获取 Hook 数量
   */
  get size(): number {
    return this.hooks.length
  }

  /**
   * 配置
   */
  getConfiguration(): Readonly<Required<PostSamplingConfig>> {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PostSamplingConfig>): void {
    Object.assign(this.config, config)
  }
}

// ============ 内置 PostSampling Hooks ============

/**
 * 内容过滤 Hook
 */
export function createContentFilterHook(
  filterFn: (content: string) => string
): PostSamplingCallback {
  return async (input) => {
    const message = input.message
    const filteredBlocks = message.content.map((block) => {
      if (block.type === 'text') {
        return {
          ...block,
          text: filterFn(block.text),
        }
      }
      return block
    })

    return {
      modified_message: {
        ...message,
        content: filteredBlocks as ContentBlock[],
      },
    }
  }
}

/**
 * 日志记录 Hook
 */
export function createLoggingHook(
  logger: (input: PostSamplingInput) => void
): PostSamplingCallback {
  return async (input) => {
    logger(input)
    return { continue: true }
  }
}

/**
 * 元数据收集 Hook
 */
export function createMetadataHook(): PostSamplingCallback {
  return async (input) => {
    const usage = input.message.usage
    return {
      sampling_metadata: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: input.request_params.model,
        stopReason: input.message.stopReason,
      },
    }
  }
}

/**
 * 响应增强 Hook - 添加后缀
 */
export function createAugmentHook(
  suffix: string,
  condition?: (input: PostSamplingInput) => boolean
): PostSamplingCallback {
  return async (input) => {
    if (condition && !condition(input)) {
      return { continue: true }
    }

    const message = input.message
    const lastTextBlock = message.content.filter((b) => b.type === 'text').pop()

    if (lastTextBlock && lastTextBlock.type === 'text') {
      return {
        modified_message: {
          ...message,
          content: [
            ...message.content.slice(0, -1),
            { type: 'text', text: lastTextBlock.text + suffix },
          ],
        },
      }
    }

    return { continue: true }
  }
}
