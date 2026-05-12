/**
 * @upup/sdk - 权限管理器
 *
 * 管理工具使用权限，支持多种权限模式和自定义检查器
 */

import type {
  PermissionMode,
  PermissionResult,
  CanUseTool,
  PermissionContext,
} from './types.js'

/**
 * 权限管理器配置
 */
export interface PermissionManagerConfig {
  /** 权限模式 */
  mode?: PermissionMode
  /** 允许的工具列表 */
  allowedTools?: string[]
  /** 禁止的工具列表 */
  disallowedTools?: string[]
  /** 工具使用检查器 */
  canUseTool?: CanUseTool
}

/**
 * 权限管理器
 *
 * @example
 * ```typescript
 * const pm = new PermissionManager({
 *   mode: 'acceptEdits',
 *   allowedTools: ['bash', 'read', 'edit'],
 *   disallowedTools: ['rm', 'sudo'],
 * })
 *
 * const result = await pm.checkPermission('bash', { command: 'ls' })
 * // result: { behavior: 'allow' }
 * ```
 */
export class PermissionManager {
  private mode: PermissionMode
  private allowedTools: Set<string>
  private disallowedTools: Set<string>
  private canUseTool?: CanUseTool
  private abortController: AbortController

  constructor(config: PermissionManagerConfig = {}) {
    this.mode = config.mode ?? 'default'
    this.allowedTools = new Set(config.allowedTools ?? [])
    this.disallowedTools = new Set(config.disallowedTools ?? [])
    this.canUseTool = config.canUseTool
    this.abortController = new AbortController()
  }

  /**
   * 检查工具使用权限
   */
  async checkPermission(
    toolName: string,
    input: Record<string, unknown>,
    context?: Partial<PermissionContext>
  ): Promise<PermissionResult> {
    // 1. 检查禁止列表
    if (this.disallowedTools.has(toolName)) {
      return {
        behavior: 'deny',
        message: `${toolName} is not allowed (in disallowed list)`,
      }
    }

    // 2. 检查允许列表 (如果配置了)
    if (this.allowedTools.size > 0 && !this.allowedTools.has(toolName)) {
      return {
        behavior: 'deny',
        message: `${toolName} is not in the allowed list`,
      }
    }

    // 3. 检查权限模式
    switch (this.mode) {
      case 'bypassPermissions':
        // 绕过所有权限检查
        return { behavior: 'allow' }

      case 'plan':
        // 计划模式，只读
        return {
          behavior: 'deny',
          message: 'Planning mode: no tools allowed',
        }

      case 'acceptEdits':
        // 接受编辑操作，拒绝危险操作
        if (this.isDangerousTool(toolName, input)) {
          return {
            behavior: 'deny',
            message: `${toolName} is considered dangerous`,
          }
        }
        return { behavior: 'allow' }

      case 'default':
      default:
        // 使用默认逻辑
        break
    }

    // 4. 调用自定义检查器
    if (this.canUseTool) {
      try {
        const result = await this.canUseTool(toolName, input, {
          signal: this.abortController.signal,
        })
        return result
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            behavior: 'deny',
            message: 'Permission check was aborted',
          }
        }
        return {
          behavior: 'deny',
          message: `Permission check failed: ${error}`,
        }
      }
    }

    // 5. 默认允许
    return { behavior: 'allow' }
  }

  /**
   * 判断是否为危险工具
   */
  private isDangerousTool(
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    // rm 命令
    if (toolName === 'bash' || toolName === 'shell') {
      const cmd = (input.command as string) || (input.cmd as string) || ''
      if (/^rm\s+-rf\s+/i.test(cmd) || /rm\s+-\s*r\s+-\s*f/i.test(cmd)) {
        return true
      }
      // 其他危险命令
      if (/^(sudo|dd|mkfs|fdisk)\s+/i.test(cmd)) {
        return true
      }
    }

    // 文件系统危险操作
    if (toolName === 'write' || toolName === 'edit') {
      const path = (input.path as string) || ''
      // 危险路径
      if (/^(\/etc\/|\/System\/|\/usr\/)/.test(path)) {
        return true
      }
    }

    return false
  }

  /**
   * 设置权限模式
   */
  setMode(mode: PermissionMode): void {
    this.mode = mode
  }

  /**
   * 获取当前权限模式
   */
  getMode(): PermissionMode {
    return this.mode
  }

  /**
   * 添加允许的工具
   */
  allowTool(toolName: string): void {
    this.allowedTools.add(toolName)
  }

  /**
   * 添加禁止的工具
   */
  disallowTool(toolName: string): void {
    this.disallowedTools.add(toolName)
  }

  /**
   * 移除允许的工具
   */
  removeAllowedTool(toolName: string): void {
    this.allowedTools.delete(toolName)
  }

  /**
   * 移除禁止的工具
   */
  removeDisallowedTool(toolName: string): void {
    this.disallowedTools.delete(toolName)
  }

  /**
   * 设置工具使用检查器
   */
  setCanUseTool(checker: CanUseTool | undefined): void {
    this.canUseTool = checker
  }

  /**
   * 中止所有权限检查
   */
  abort(): void {
    this.abortController.abort()
    this.abortController = new AbortController()
  }

  /**
   * 更新配置
   */
  updateConfig(config: PermissionManagerConfig): void {
    if (config.mode !== undefined) {
      this.mode = config.mode
    }
    if (config.allowedTools !== undefined) {
      this.allowedTools = new Set(config.allowedTools)
    }
    if (config.disallowedTools !== undefined) {
      this.disallowedTools = new Set(config.disallowedTools)
    }
    if (config.canUseTool !== undefined) {
      this.canUseTool = config.canUseTool
    }
  }
}
