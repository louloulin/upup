/**
 * @upup/sdk - Hook 执行器
 *
 * 管理 Hook 的注册和执行
 */

import { HookRegistry, type HookEvent, type HookInput, type HookOutput, type HookCallback, type HookMatcher } from './types.js'

/**
 * Hook 执行器配置
 */
export interface HookExecutorConfig {
  /** 是否在 Hook 出错时继续执行 */
  continueOnError?: boolean
  /** 默认返回结果 */
  defaultOutput?: HookOutput
}

/**
 * Hook 执行结果
 */
export interface HookExecutionResult {
  /** 是否继续执行 */
  continue: boolean
  /** 输出结果 */
  output?: HookOutput
  /** 执行的 Hook 数量 */
  executedCount: number
  /** 错误数量 */
  errorCount: number
  /** 错误列表 */
  errors: Error[]
}

/**
 * Hook 执行器
 *
 * @example
 * ```typescript
 * const executor = new HookExecutor()
 *
 * executor.register('PreToolUse', {
 *   matcher: 'bash*',
 *   hooks: [async (input) => {
 *     console.log(`Using tool: ${input.tool_name}`)
 *     return { continue: true }
 *   }]
 * })
 *
 * const result = await executor.execute('PreToolUse', {
 *   tool_name: 'bash',
 *   tool_input: { command: 'ls' }
 * })
 *
 * console.log(result.continue) // true
 * ```
 */
export class HookExecutor {
  private registry: HookRegistry
  private continueOnError: boolean
  private defaultOutput: HookOutput
  private abortController: AbortController

  constructor(config: HookExecutorConfig = {}) {
    this.registry = new HookRegistry()
    this.continueOnError = config.continueOnError ?? true
    this.defaultOutput = config.defaultOutput ?? { continue: true }
    this.abortController = new AbortController()
  }

  /**
   * 注册 Hook
   */
  register(event: HookEvent, matcher: HookMatcher): void {
    this.registry.register(event, matcher)
  }

  /**
   * 批量注册 Hooks
   */
  registerAll(hooksMap: Partial<Record<HookEvent, HookMatcher[]>>): void {
    for (const [event, matchers] of Object.entries(hooksMap)) {
      for (const matcher of matchers) {
        this.register(event as HookEvent, matcher)
      }
    }
  }

  /**
   * 执行 Hook
   */
  async execute(
    event: HookEvent,
    input: HookInput,
    options?: { signal?: AbortSignal }
  ): Promise<HookExecutionResult> {
    const matchers = this.registry.get(event)
    let executedCount = 0
    let errorCount = 0
    const errors: Error[] = []
    let finalOutput: HookOutput = { ...this.defaultOutput }

    for (const matcher of matchers) {
      // 检查是否匹配
      if (matcher.matcher && !this.matches(input, matcher.matcher)) {
        continue
      }

      // 执行每个 Hook
      for (const hook of matcher.hooks) {
        try {
          // 检查是否中止
          if (this.abortController.signal.aborted) {
            break
          }

          // 执行 Hook
          const result = await hook(input, { signal: options?.signal })

          // 更新输出
          if (result) {
            finalOutput = this.mergeOutput(finalOutput, result)

            // 如果 Hook 返回 continue: false，停止执行
            if (result.continue === false) {
              return {
                continue: false,
                output: finalOutput,
                executedCount: executedCount + 1,
                errorCount,
                errors,
              }
            }
          }

          executedCount++
        } catch (error) {
          errorCount++
          const err = error instanceof Error ? error : new Error(String(error))
          errors.push(err)

          if (!this.continueOnError) {
            return {
              continue: false,
              output: { ...finalOutput, continue: false },
              executedCount,
              errorCount,
              errors,
            }
          }
        }
      }
    }

    return {
      continue: finalOutput.continue !== false,
      output: finalOutput,
      executedCount,
      errorCount,
      errors,
    }
  }

  /**
   * 检查输入是否匹配模式
   */
  private matches(input: HookInput, pattern: string): boolean {
    const toolName = input.tool_name || ''

    // glob 风格匹配
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return regex.test(toolName)
    }

    // 精确匹配
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.slice(1, -1))
        return regex.test(toolName)
      } catch {
        return false
      }
    }

    // 子串匹配
    return toolName.includes(pattern)
  }

  /**
   * 合并多个 Hook 输出
   */
  private mergeOutput(base: HookOutput, update: HookOutput): HookOutput {
    const merged: HookOutput = { ...base }

    if (update.continue !== undefined) {
      merged.continue = update.continue
    }
    if (update.suppressOutput !== undefined) {
      merged.suppressOutput = update.suppressOutput
    }
    if (update.stopReason !== undefined) {
      merged.stopReason = update.stopReason
    }
    if (update.decision !== undefined) {
      merged.decision = update.decision
    }
    if (update.systemMessage !== undefined) {
      merged.systemMessage = update.systemMessage
    }
    if (update.permissionDecision !== undefined) {
      merged.permissionDecision = update.permissionDecision
    }
    if (update.updatedInput !== undefined) {
      merged.updatedInput = update.updatedInput
    }
    if (update.expandedMessage !== undefined) {
      merged.expandedMessage = update.expandedMessage
    }
    if (update.hookSpecificOutput !== undefined) {
      merged.hookSpecificOutput = {
        ...merged.hookSpecificOutput,
        ...update.hookSpecificOutput,
      }
    }

    return merged
  }

  /**
   * 获取 Hook 注册表
   */
  getRegistry(): HookRegistry {
    return this.registry
  }

  /**
   * 清空所有 Hooks
   */
  clear(): void {
    this.registry.clear()
  }

  /**
   * 中止所有 Hook 执行
   */
  abort(): void {
    this.abortController.abort()
    this.abortController = new AbortController()
  }

  /**
   * 检查是否有注册的 Hook
   */
  hasHooks(event: HookEvent): boolean {
    return this.registry.has(event)
  }
}
