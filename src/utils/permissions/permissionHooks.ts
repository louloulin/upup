/**
 * Permission Hooks Module
 *
 * Hook 安全增强
 */

import { getPermissionChecker } from './permissions.js'
import type { PermissionCheckResult } from './types.js'

// ============================================================================
// Types
// ============================================================================

export interface PermissionHook {
  name: string
  beforeCheck?: (toolName: string, args: Record<string, unknown>) => void
  afterCheck?: (result: PermissionCheckResult) => void
  onError?: (error: Error) => void
}

export interface HookConfig {
  timeout: number
  logErrors: boolean
  failOpen: boolean
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_HOOK_CONFIG: HookConfig = {
  timeout: 5000,   // 5 秒超时
  logErrors: true,
  failOpen: false, // Hook 失败时默认关闭（更安全）
}

// ============================================================================
// Hook Manager
// ============================================================================

const hooks: PermissionHook[] = []
let hookConfig: HookConfig = { ...DEFAULT_HOOK_CONFIG }

export function registerHook(hook: PermissionHook): void {
  hooks.push(hook)
}

export function unregisterHook(name: string): void {
  const index = hooks.findIndex(h => h.name === name)
  if (index !== -1) {
    hooks.splice(index, 1)
  }
}

export function setHookConfig(config: Partial<HookConfig>): void {
  hookConfig = { ...hookConfig, ...config }
}

export function getHookConfig(): HookConfig {
  return { ...hookConfig }
}

// ============================================================================
// Hook Execution
// ============================================================================

/**
 * 执行所有 beforeCheck hooks
 */
export async function executeBeforeHooks(
  toolName: string,
  args: Record<string, unknown>
): Promise<void> {
  for (const hook of hooks) {
    if (hook.beforeCheck) {
      await executeHookWithTimeout(
        () => hook.beforeCheck!(toolName, args),
        hook.name,
        'beforeCheck'
      )
    }
  }
}

/**
 * 执行所有 afterCheck hooks
 */
export async function executeAfterHooks(
  result: PermissionCheckResult
): Promise<void> {
  for (const hook of hooks) {
    if (hook.afterCheck) {
      await executeHookWithTimeout(
        () => hook.afterCheck!(result),
        hook.name,
        'afterCheck'
      )
    }
  }
}

/**
 * 带超时的 hook 执行
 */
async function executeHookWithTimeout(
  fn: () => void,
  hookName: string,
  methodName: string
): Promise<void> {
  const timeout = hookConfig.timeout

  try {
    await Promise.race([
      Promise.resolve(fn()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Hook ${hookName}.${methodName} timed out`)), timeout)
      ),
    ])
  } catch (error) {
    if (hookConfig.logErrors) {
      console.error(`[permission-hooks] Error in ${hookName}.${methodName}:`, error)
    }

    // 在 failOpen 模式下忽略错误
    if (!hookConfig.failOpen) {
      // 重新抛出错误
      throw error
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 带 Hook 执行的权限检查
 */
export async function checkPermissionWithHooks(
  toolName: string,
  args: Record<string, unknown>
): Promise<PermissionCheckResult> {
  try {
    // 执行 before hooks
    await executeBeforeHooks(toolName, args)

    // 执行权限检查
    const checker = getPermissionChecker()
    const result = await checker.hasPermissionsToUseTool(toolName, args)

    // 执行 after hooks
    await executeAfterHooks(result)

    return result
  } catch (error) {
    // Hook 执行失败
    const hookError = error instanceof Error ? error : new Error(String(error))

    // 调用 onError hooks
    for (const hook of hooks) {
      if (hook.onError) {
        try {
          hook.onError(hookError)
        } catch {
          // 忽略 onError 错误
        }
      }
    }

    // 根据配置决定行为
    if (hookConfig.failOpen) {
      // failOpen: 返回允许
      return {
        decision: 'allow',
        reason: 'Hook failed, configured to allow',
      }
    } else {
      // failClosed: 返回询问（更安全）
      return {
        decision: 'ask',
        reason: `Hook error: ${hookError.message}`,
      }
    }
  }
}

// ============================================================================
// Built-in Hooks
// ============================================================================

/**
 * 日志 hook
 */
export function createLoggingHook(): PermissionHook {
  return {
    name: 'logging-hook',
    afterCheck: (result) => {
      console.log('[permission-hooks] Decision:', result.decision, result.reason || '')
    },
    onError: (error) => {
      console.error('[permission-hooks] Error:', error.message)
    },
  }
}

/**
 * 调试 hook
 */
export function createDebugHook(): PermissionHook {
  return {
    name: 'debug-hook',
    beforeCheck: (toolName, args) => {
      console.log('[permission-hooks] Before check:', toolName, Object.keys(args))
    },
    afterCheck: (result) => {
      console.log('[permission-hooks] After check:', result)
    },
  }
}

// ============================================================================
// Export
// ============================================================================

// All functions are exported inline