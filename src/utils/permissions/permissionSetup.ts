/**
 * Permission Setup Module
 * 
 * 处理 CLI 参数解析和权限模式初始化
 * 基于 Claude Code 的 permissionSetup.ts 设计
 */

import type {
  PermissionMode,
  PermissionCliArgs,
  SecurityCheckResult
} from './types.js'
import { 
  DEFAULT_PERMISSION_MODE, 
  EXTERNAL_PERMISSION_MODES 
} from './types.js'

// ============================================================================
// Security Checks
// ============================================================================

/**
 * 检查是否以 root/管理员权限运行
 */
export function isRunningAsRoot(): boolean {
  if (process.platform === 'win32') {
    // Windows: 检查是否有管理员权限
    try {
      const { execSync } = require('child_process')
      execSync('net session', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  
  // Unix: 检查 EUID
  return process.geteuid?.() === 0 || (process as any).uid === 0
}

/**
 * 检查是否在沙箱环境中运行
 */
export function isInSandbox(): boolean {
  // 检查常见沙箱环境变量
  const sandboxEnvVars = [
    'UPUP_SANDBOX',
    'IS_SANDBOX',
    'SANDBOX_SESSION',
    'DOCKER_CONTAINER',
  ]
  
  for (const envVar of sandboxEnvVars) {
    if (process.env[envVar]) {
      return true
    }
  }
  
  // 检查 Docker 环境
  if (process.env.HOSTNAME && /\.docker\.internal$/i.test(process.env.HOSTNAME)) {
    return true
  }
  
  // 检查 cgroup
  try {
    const { readFileSync } = require('fs')
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8')
    if (cgroup.includes('docker') || cgroup.includes('kubepods')) {
      return true
    }
  } catch {
    // 忽略错误
  }
  
  return false
}

/**
 * 检查是否应该允许 bypassPermissions 模式
 * 
 * Claude Code 的安全策略: 在非沙箱环境中使用 bypassPermissions 需要特殊确认
 */
export function shouldAllowBypassPermissionsMode(): boolean {
  // 在沙箱环境中始终允许
  if (isInSandbox()) {
    return true
  }
  
  // 检查环境变量强制启用
  if (process.env.UPUP_ALLOW_BYPASS_OUTSIDE_SANDBOX === 'true') {
    return true
  }
  
  // 检查是否禁用了 bypass 模式
  if (process.env.UPUP_DISABLE_BYPASS === 'true') {
    return false
  }
  
  // 默认: 在非沙箱环境中也允许（UpUp 设计决策）
  // 如果需要更严格的策略，可以改为 return false
  return true
}

/**
 * 运行所有安全检查
 */
export function runSecurityChecks(): SecurityCheckResult[] {
  const results: SecurityCheckResult[] = []
  
  // 检查 root 权限
  if (isRunningAsRoot()) {
    results.push({
      passed: true,
      reason: 'Running as root user - some operations may be restricted',
      severity: 'warning'
    })
  }
  
  // 检查沙箱环境
  if (!isInSandbox()) {
    results.push({
      passed: true,
      reason: 'Not running in sandbox environment',
      severity: 'info'
    })
  }
  
  return results
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * 从 CLI 参数解析初始权限模式
 * 
 * @param args CLI 参数对象
 * @returns 解析后的权限模式和通知信息
 */
export function initialPermissionModeFromCLI(
  args: PermissionCliArgs
): { mode: PermissionMode; notification?: string } {
  
  // 优先级: dangerouslySkipPermissions > permissionMode > 环境变量 > 默认
  if (args.dangerouslySkipPermissions) {
    // 检查是否可以安全使用 bypassPermissions
    if (!shouldAllowBypassPermissionsMode()) {
      return {
        mode: 'default',
        notification: 'bypassPermissions mode is disabled outside sandbox'
      }
    }
    return {
      mode: 'bypassPermissions',
      notification: 'All permission checks have been bypassed'
    }
  }
  
  // 指定模式
  if (args.permissionMode) {
    const mode = args.permissionMode as PermissionMode
    
    // 验证模式是否有效
    if (isValidPermissionMode(mode)) {
      // 特殊模式需要检查
      if (mode === 'bypassPermissions' && !shouldAllowBypassPermissionsMode()) {
        return {
          mode: 'default',
          notification: 'bypassPermissions mode is disabled outside sandbox'
        }
      }
      return { mode }
    }
    
    console.warn(`Invalid permission mode: ${mode}, falling back to default`)
  }
  
  // 环境变量检查
  const envMode = getPermissionModeFromEnv()
  if (envMode) {
    return { mode: envMode }
  }
  
  // 默认模式
  return { mode: DEFAULT_PERMISSION_MODE }
}

/**
 * 检查权限模式是否有效
 */
export function isValidPermissionMode(mode: string): mode is PermissionMode {
  return EXTERNAL_PERMISSION_MODES.includes(mode as any) || 
         mode === 'auto' || 
         mode === 'bubble' ||
         mode === '.accept-all'
}

/**
 * 从环境变量获取权限模式
 */
export function getPermissionModeFromEnv(): PermissionMode | null {
  // 检查多个可能的环境变量
  const envVars = [
    'UPUP_PERMISSION_MODE',
    'UPUP_DANGEROUSLY_MODE',
    'UPUP_BYPASS_MODE',
  ]
  
  for (const envVar of envVars) {
    const value = process.env[envVar]
    if (value && isValidPermissionMode(value)) {
      return value as PermissionMode
    }
    
    // 处理布尔值环境变量
    if (value === 'true') {
      if (envVar === 'UPUP_DANGEROUSLY_MODE') return 'dangerously'
      if (envVar === 'UPUP_BYPASS_MODE') return 'bypassPermissions'
    }
  }
  
  return null
}

// ============================================================================
// Mode Transition
// ============================================================================

/**
 * 权限模式切换时需要的通知信息
 */
export function getPermissionModeNotification(mode: PermissionMode): string | undefined {
  switch (mode) {
    case 'bypassPermissions':
      return 'Permission checks have been bypassed. All operations will proceed without confirmation.'
    case 'dangerously':
      return 'Dangerous mode enabled. All operations including potentially dangerous ones are allowed.'
    case 'acceptEdits':
      return 'Edit operations will be automatically accepted without prompts.'
    case 'plan':
      return 'Plan mode enabled. Only read operations are allowed.'
    case 'dontAsk':
      return "Don't ask mode enabled. No permission prompts will be shown."
    default:
      return undefined
  }
}

/**
 * 获取模式的简短描述
 */
export function getPermissionModeLabel(mode: PermissionMode): string {
  switch (mode) {
    case 'default':
      return ''
    case 'bypassPermissions':
      return '[BYPASS]'
    case 'dangerously':
      return '[DANGEROUS]'
    case 'plan':
      return '[PLAN]'
    case 'acceptEdits':
      return '[AUTO-EDIT]'
    case 'dontAsk':
      return '[NO-PROMPT]'
    case 'auto':
      return '[AUTO]'
    case 'bubble':
      return '[BUBBLE]'
    case '.accept-all':
      return '[ACCEPT-ALL]'
  }
}

// ============================================================================
// Dangerous Command Detection
// ============================================================================

/**
 * 危险的 Bash 权限模式
 */
export function isDangerousBashPermission(
  toolName: string,
  ruleContent: string | undefined
): boolean {
  if (toolName !== 'Bash') return false
  if (!ruleContent) return true // 允许所有 Bash 命令是危险的
  
  // 危险的命令模式
  const dangerousPatterns = [
    /^python/i,
    /^node/i,
    /^perl/i,
    /^ruby/i,
    /^php/i,
    /^bash/i,
    /^sh\s+-c/i,
    /\|.*sh$/i,
    /\$\(/,  // 命令替换
    /`[^`]+`/,  // 反引号命令替换
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(ruleContent)) {
      return true
    }
  }
  
  return false
}

/**
 * 危险的命令（即使在 dangerously 模式也阻止）
 */
export const HARD_DENY_PATTERNS = [
  /:\(\)\{:\|:&\};:/,           // Fork bomb
  /^rm\s+-rf\s+\/+/,            // 根目录递归删除
  /^mkfs\b/,                    // 创建文件系统
  /^dd\s+.*of=\/dev\//,         // 直接磁盘写入
  /^fdisk\b/,                  // 磁盘分区
  /^mount\s+-o\s+rw\s+\//,     // 重新挂载根目录
]

/**
 * 检查命令是否硬拒绝
 */
export function isHardDenyCommand(command: string): boolean {
  for (const pattern of HARD_DENY_PATTERNS) {
    if (pattern.test(command)) {
      return true
    }
  }
  return false
}

// ============================================================================
// Constants
// ============================================================================

/**
 * CLI 参数默认值
 */
export const DEFAULT_CLI_ARGS: PermissionCliArgs = {
  dangerouslySkipPermissions: false,
  permissionMode: undefined,
  allowedTools: undefined,
  deniedTools: undefined,
}
