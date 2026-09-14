/**
 * Permissions Core Module
 *
 * 核心权限检查逻辑，基于 Claude Code 的 permissions.ts 设计
 */

import type {
  PermissionRule,
  PermissionBehavior,
  PermissionCheckResult,
  PermissionRequest,
  PermissionDecision,
  PermissionRuleValue,
} from './types.js'
import { getPermissionMode } from '@upup/pi-session'
import {
  loadAllPermissionRulesFromDisk,
  findMatchingRules,
  getRulesForBehavior,
} from './permissionsLoader.js'
import {
  matchesRuleContent,
  permissionRuleValueFromString,
} from './permissionRuleParser.js'
import { isHardDenyCommand } from './permissionSetup.js'
import { checkPermissionWithHardDeny } from '../../tools/bash/permission-mode.js'

// ============================================================================
// Permission Checker
// ============================================================================

/**
 * 权限检查器
 */
export class PermissionChecker {
  private rules: PermissionRule[] | null = null

  /**
   * 加载权限规则
   */
  loadRules(): void {
    this.rules = loadAllPermissionRulesFromDisk()
  }

  /**
   * 获取当前规则
   */
  getRules(): PermissionRule[] {
    if (!this.rules) {
      this.loadRules()
    }
    return this.rules!
  }

  /**
   * 检查工具使用权限
   */
  async hasPermissionsToUseTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionCheckResult> {
    // 获取当前权限模式
    const mode = getPermissionMode()

    // 检查是否是危险模式
    if (mode === 'bypassPermissions' || mode === 'dangerously') {
      return { decision: 'allow', bypass: true }
    }

    // 加载规则
    const allRules = this.getRules()

    // 1. 检查 deny 规则
    const denyResult = this.findDenyRule(allRules, toolName, input)
    if (denyResult) {
      return {
        decision: 'deny',
        reason: denyResult.reason,
        ruleSource: denyResult.rule?.source,
      }
    }

    // 2. 检查 allow 规则
    const allowResult = this.findAllowRule(allRules, toolName, input)
    if (allowResult) {
      return {
        decision: 'allow',
        reason: allowResult.reason,
        ruleSource: allowResult.rule?.source,
      }
    }

    // 3. 工具特定检查
    const toolSpecificResult = this.checkToolSpecificRules(toolName, input)
    if (toolSpecificResult) {
      return toolSpecificResult
    }

    // 4. 安全检查
    const securityResult = this.runSecurityChecks(toolName, input)
    if (securityResult.decision === 'deny') {
      return securityResult
    }

    // 5. 返回需要询问的默认结果
    return {
      decision: 'ask',
      reason: `No matching rule for tool: ${toolName}`,
      suggestions: this.generateSuggestions(toolName, input),
    }
  }

  /**
   * 检查基于规则的权限
   */
  checkRuleBasedPermissions(
    toolName: string,
    content?: string
  ): PermissionCheckResult {
    const allRules = this.getRules()

    // 检查 deny 规则
    const denyRule = this.findDenyRule(allRules, toolName, { content })
    if (denyRule) {
      return {
        decision: 'deny',
        reason: denyRule.reason,
        ruleSource: denyRule.rule?.source,
      }
    }

    // 检查 allow 规则
    const allowRule = this.findAllowRule(allRules, toolName, { content })
    if (allowRule) {
      return {
        decision: 'allow',
        reason: allowRule.reason,
        ruleSource: allowRule.rule?.source,
      }
    }

    // 默认询问
    return {
      decision: 'ask',
      reason: `No matching rule for tool: ${toolName}`,
    }
  }

  /**
   * 查找匹配的 deny 规则
   */
  findDenyRule(
    rules: PermissionRule[],
    toolName: string,
    input: Record<string, unknown>
  ): { rule?: PermissionRule; reason: string } | null {
    const denyRules = getRulesForBehavior(rules, 'deny')

    for (const rule of denyRules) {
      if (this.ruleMatches(rule, toolName, input)) {
        return {
          rule,
          reason: rule.description || `Denied by rule from ${rule.source}`,
        }
      }
    }

    return null
  }

  /**
   * 查找匹配的 allow 规则
   */
  findAllowRule(
    rules: PermissionRule[],
    toolName: string,
    input: Record<string, unknown>
  ): { rule?: PermissionRule; reason: string } | null {
    const allowRules = getRulesForBehavior(rules, 'allow')

    for (const rule of allowRules) {
      if (this.ruleMatches(rule, toolName, input)) {
        return {
          rule,
          reason: rule.description || `Allowed by rule from ${rule.source}`,
        }
      }
    }

    return null
  }

  /**
   * 规则是否匹配
   */
  private ruleMatches(
    rule: PermissionRule,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    // 工具名必须匹配
    if (rule.ruleValue.toolName !== toolName) {
      return false
    }

    // 检查内容匹配
    if (rule.ruleValue.ruleContent !== undefined) {
      const content = this.extractContent(input)
      return matchesRuleContent(rule.ruleValue.ruleContent, content)
    }

    return true
  }

  /**
   * 从输入中提取内容
   */
  private extractContent(input: Record<string, unknown>): string {
    // 尝试多个可能的字段
    const contentFields = ['command', 'content', 'path', 'filePath', 'file', 'target']

    for (const field of contentFields) {
      if (typeof input[field] === 'string') {
        return input[field] as string
      }
    }

    return ''
  }

  /**
   * 工具特定规则检查
   */
  private checkToolSpecificRules(
    toolName: string,
    input: Record<string, unknown>
  ): PermissionCheckResult | null {
    // Bash 工具特殊处理
    if (toolName === 'Bash') {
      const command = input.command as string

      // 硬拒绝命令检查
      if (isHardDenyCommand(command)) {
        return {
          decision: 'deny',
          reason: 'Command blocked: extremely dangerous operation',
        }
      }

      // 使用现有的 permission-mode 检查
      const result = checkPermissionWithHardDeny(command)
      if (!result.allowed) {
        return {
          decision: 'deny',
          reason: result.reason || 'Command not allowed',
        }
      }

      if (result.mode === 'bypass' || result.mode === 'allow') {
        return {
          decision: 'allow',
          reason: result.reason,
        }
      }
    }

    return null
  }

  /**
   * 运行安全检查
   */
  private runSecurityChecks(
    toolName: string,
    input: Record<string, unknown>
  ): PermissionCheckResult {
    // 检查危险模式
    const mode = getPermissionMode()

    if (mode === 'plan') {
      return {
        decision: 'deny',
        reason: 'Plan mode: read-only operations only',
      }
    }

    // 所有安全检查通过
    return {
      decision: 'ask',
      reason: 'Security checks passed',
    }
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    toolName: string,
    input: Record<string, unknown>
  ): string[] {
    const suggestions: string[] = []

    // 允许此类工具的建议
    suggestions.push(`Add "Allow ${toolName}" to your settings`)

    // 允许具体内容的建议
    if (input.command) {
      const command = input.command as string
      const baseCommand = command.split(' ')[0]
      suggestions.push(`Add "Allow Bash(${baseCommand})" to bypass prompt`)
    }

    return suggestions
  }

  /**
   * 清除缓存并重新加载规则
   */
  reloadRules(): void {
    this.rules = null
    this.loadRules()
  }
}

// 全局权限检查器实例
let globalPermissionChecker: PermissionChecker | null = null

/**
 * 获取全局权限检查器
 */
export function getPermissionChecker(): PermissionChecker {
  if (!globalPermissionChecker) {
    globalPermissionChecker = new PermissionChecker()
    globalPermissionChecker.loadRules()
  }
  return globalPermissionChecker
}

/**
 * 重新加载权限规则
 */
export function reloadPermissionRules(): void {
  if (globalPermissionChecker) {
    globalPermissionChecker.reloadRules()
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 检查是否有权限使用工具
 */
export async function checkToolPermission(
  toolName: string,
  input: Record<string, unknown>
): Promise<PermissionCheckResult> {
  const checker = getPermissionChecker()
  return checker.hasPermissionsToUseTool(toolName, input)
}

/**
 * 快速检查权限（不加载规则）
 */
export function quickCheckPermission(
  toolName: string,
  content?: string
): PermissionCheckResult {
  const checker = getPermissionChecker()
  return checker.checkRuleBasedPermissions(toolName, content)
}

/**
 * 检查是否应该提示用户
 */
export function shouldPromptForTool(
  toolName: string,
  input: Record<string, unknown>
): boolean {
  const mode = getPermissionMode()

  // 特殊模式不需要提示
  if (mode === 'bypassPermissions' || mode === 'dangerously' || mode === '.accept-all') {
    return false
  }

  // Plan 模式永远需要提示
  if (mode === 'plan') {
    return true
  }

  // 执行权限检查
  const checker = getPermissionChecker()
  const content = input.command as string | undefined
  const result = checker.checkRuleBasedPermissions(toolName, content)

  return result.decision === 'ask'
}

/**
 * 创建权限请求
 */
export function createPermissionRequest(
  toolName: string,
  input: Record<string, unknown>
): PermissionRequest {
  return {
    toolName,
    input,
    context: {
      projectPath: process.cwd(),
    },
  }
}

/**
 * 格式化权限结果为人类可读文本
 */
export function formatPermissionResult(result: PermissionCheckResult): string {
  switch (result.decision) {
    case 'allow':
      return result.reason || 'Permission granted'
    case 'deny':
      return result.reason || 'Permission denied'
    case 'ask':
      return result.reason || 'Confirmation required'
    default:
      return 'Unknown permission state'
  }
}

/**
 * 获取权限决策标签
 */
export function getDecisionLabel(decision: PermissionDecision): string {
  switch (decision) {
    case 'allow':
      return 'Allowed'
    case 'deny':
      return 'Denied'
    case 'ask':
      return 'Needs Confirmation'
    default:
      return 'Unknown'
  }
}

// ============================================================================
// Permission Mode Helpers
// ============================================================================

import { getPermissionMode as getSessionMode, isDangerousMode } from '@upup/pi-session'

/**
 * 检查当前模式是否允许操作
 */
export function isOperationAllowedInCurrentMode(operation: string): boolean {
  const mode = getSessionMode()

  switch (mode) {
    case 'bypassPermissions':
    case 'dangerously':
    case '.accept-all':
      return true

    case 'plan':
      // Plan 模式只允许只读操作
      const readOnlyOps = ['Read', 'Grep', 'Glob', 'WebSearch']
      return readOnlyOps.includes(operation)

    case 'acceptEdits':
      // 只允许编辑操作
      const editOps = ['Write', 'Edit', 'Bash']
      return editOps.includes(operation)

    case 'dontAsk':
      // 不询问但仍需规则匹配
      return true

    default:
      // default 模式需要检查规则
      return false
  }
}

/**
 * 获取当前模式的权限级别
 */
export function getModeSecurityLevel(mode?: string): 'high' | 'medium' | 'low' {
  const currentMode = mode || getSessionMode()

  switch (currentMode) {
    case 'bypassPermissions':
    case 'dangerously':
      return 'low'
    case 'plan':
    case 'dontAsk':
      return 'medium'
    default:
      return 'high'
  }
}

/**
 * 检查操作是否安全
 */
export function isOperationSafe(
  toolName: string,
  input: Record<string, unknown>
): { safe: boolean; reason: string } {
  // 检查危险命令
  if (toolName === 'Bash' && input.command) {
    if (isHardDenyCommand(input.command as string)) {
      return {
        safe: false,
        reason: 'Command matches hard-deny pattern',
      }
    }
  }

  return {
    safe: true,
    reason: 'Operation appears safe',
  }
}

// ============================================================================
// Export
// ============================================================================

// All functions are exported inline