/**
 * @upup/sdk - Token Counter
 *
 * Token 计数工具
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { MessageParam } from './messages.js'

// ============ Types ============

/**
 * Token 计数结果
 */
export interface TokenCount {
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens?: number
  /** 许可证 token 数 */
  cachedTokens?: number
}

/**
 * Token 计数选项
 */
export interface CountTokensOptions {
  /** 文本内容 */
  text?: string
  /** 消息列表 */
  messages?: MessageParam[]
  /** 模型名称 */
  model?: string
}

// ============ Token Counter ============

/**
 * Token 计数器
 *
 * 用于计算文本或消息的 token 数量
 */
export class TokenCounter {
  /**
   * 计算文本的 token 数
   *
   * @param text 文本内容
   * @param model 模型名称 (影响 tokenization)
   * @returns token 计数
   */
  static async countText(text: string, model?: string): Promise<TokenCount> {
    // 估算方式：中文约 1.5-2 tokens/字符，英文约 0.25 tokens/字符
    const tokens = this.estimateTokens(text)
    return {
      inputTokens: tokens,
    }
  }

  /**
   * 计算消息的 token 数
   *
   * @param messages 消息列表
   * @param model 模型名称
   * @returns token 计数
   */
  static async countMessages(
    messages: MessageParam[],
    model?: string
  ): Promise<TokenCount> {
    let totalTokens = 0

    for (const message of messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content)
      totalTokens += this.estimateTokens(content)
      // 每条消息需要额外的 overhead
      totalTokens += 4 // 角色标签
    }

    // 消息列表的 overhead
    totalTokens += 3

    return {
      inputTokens: totalTokens,
    }
  }

  /**
   * 估算 token 数量
   *
   * 使用简化的估算方法
   * 实际 token 数应通过 API 获取
   */
  static estimateTokens(text: string): number {
    if (!text) return 0

    let count = 0
    let i = 0

    while (i < text.length) {
      // 检测中文字符
      if (text.charCodeAt(i) > 127) {
        count += 1.5 // 中文约 1.5 tokens
        i += 3 // UTF-8 中文字符通常占3字节
      } else {
        // ASCII 字符
        count += 0.25
        i++
      }
    }

    // 四舍五入
    return Math.ceil(count)
  }

  /**
   * 计算最大可用 token 数
   *
   * @param model 模型名称
   * @param maxTokens 最大生成 token 数
   * @returns 可用于输入的 token 数
   */
  static getAvailableContextTokens(
    model: string,
    maxTokens: number = 4096
  ): number {
    // 常见模型的上下文窗口大小
    const contextWindows: Record<string, number> = {
      'claude-3-5-sonnet': 200000,
      'claude-3-5-haiku': 200000,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku': 200000,
      'claude-2': 100000,
      'claude-instant': 100000,
      'deepseek-chat': 64000,
      'gpt-4': 128000,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 16385,
    }

    const contextSize = contextWindows[model] || 4096
    return contextSize - maxTokens
  }
}

/**
 * 便捷函数：计算文本 token
 */
export async function countTokens(
  text: string,
  model?: string
): Promise<TokenCount> {
  return TokenCounter.countText(text, model)
}

/**
 * 便捷函数：计算消息 token
 */
export async function countMessageTokens(
  messages: MessageParam[],
  model?: string
): Promise<TokenCount> {
  return TokenCounter.countMessages(messages, model)
}