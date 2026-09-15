/**
 * Permission Setup Module
 * 
 * 处理 CLI 参数解析和权限模式初始化
 * 基于 Claude Code 的 permissionSetup.ts 设计
 * Phase 5: 统一 CLI / config / session 入口
 */

import type {
  PermissionMode,
  PermissionCliArgs,
  SecurityCheckResult
} from './types'
import { 
  DEFAULT_PERMISSION_MODE, 
  EXTERNAL_PERMISSION_MODES 
} from './types'

// ============================================================================
// Permission Mode Source Tracking
// ============================================================================

/**
 * Permission mode source tracking
 * Identifies where the permission mode was configured from
 */
export type PermissionModeSource = 
  | 'cli'        // From CLI flag (highest priority)
  | 'env'        // From environment variable
  | 'settings'   // From persisted settings.json
  | 'default'    // Default fallback

/**
 * Result of initial permission mode resolution
 */
export interface InitialPermissionModeResult {
  mode: PermissionMode
  source: PermissionModeSource
  notification?: string
}

// ============================================================================
// Settings Integration
// ============================================================================

/**
 * Get permission mode from persisted settings
 * Checks both top-level permissionMode and nested permissions.defaultMode
 * Returns null if no valid mode is found in settings
 */
function getPermissionModeFromSettings(): { mode: PermissionMode; source: PermissionModeSource } | null {
  try {
    // Lazy import to avoid circular dependencies
    // config.js may import from here, so we defer the import
    const configModule = require('../config.js')
    const getSetting: <T>(key: string, defaultValue: T) => T = configModule.getSetting
    
    if (!getSetting) {
      return null
    }
    
    // Check top-level permissionMode
    const topLevelMode = getSetting<PermissionMode | undefined>('permissionMode', undefined)
    if (topLevelMode && isValidPermissionMode(topLevelMode)) {
      return { mode: topLevelMode, source: 'settings' }
    }
    
    // Check nested permissions.defaultMode
    const permissions = getSetting<Record<string, unknown>>('permissions', {})
    const nestedMode = permissions?.defaultMode as PermissionMode | undefined
    if (nestedMode && isValidPermissionMode(nestedMode)) {
      return { mode: nestedMode, source: 'settings' }
    }
    
    return null
  } catch {
    // If settings reading fails (circular dep, missing file, etc), fall back
    return null
  }
}

// ============================================================================
// Security Checks
// ============================================================================

/**
 * 检查是否以 root/管理员权限运行
 */
export function isRunningAsRoot(): boolean {
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process')
      execSync('net session', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  return process.geteuid?.() === 0 || (process as any).uid === 0
}

/**
 * 检查是否在沙箱环境中运行
 */
export function isInSandbox(): boolean {
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
  
  if (process.env.HOSTNAME && /\.docker\.internal$/i.test(process.env.HOSTNAME)) {
    return true
  }
  
  try {
    const { readFileSync } = require('fs')
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8')
    if (cgroup.includes('docker') || cgroup.includes('kubepods')) {
      return true
    }
  } catch {
    // ignore
  }
  
  return false
}

/**
 * 检查是否应该允许 bypassPermissions 模式
 */
export function shouldAllowBypassPermissionsMode(): boolean {
  if (isInSandbox()) {
    return true
  }
  if (process.env.UPUP_ALLOW_BYPASS_OUTSIDE_SANDBOX === 'true') {
    return true
  }
  if (process.env.UPUP_DISABLE_BYPASS === 'true') {
    return false
  }
  return true
}

/**
 * 运行所有安全检查
 */
export function runSecurityChecks(): SecurityCheckResult[] {
  const results: SecurityCheckResult[] = []
  
  if (isRunningAsRoot()) {
    results.push({
      passed: true,
      reason: 'Running as root user - some operations may be restricted',
      severity: 'warning'
    })
  }
  
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
    if (value === 'true') {
      if (envVar === 'UPUP_DANGEROUSLY_MODE') return 'dangerously'
      if (envVar === 'UPUP_BYPASS_MODE') return 'bypassPermissions'
    }
  }
  
  return null
}

/**
 * 从 CLI 参数解析初始权限模式
 * 
 * Priority: CLI flag > env > settings > default
 */
export function initialPermissionModeFromCLI(
  args: PermissionCliArgs
): InitialPermissionModeResult {
  
  // Priority: dangerouslySkipPermissions > permissionMode > env > settings > default
  if (args.dangerouslySkipPermissions) {
    if (!shouldAllowBypassPermissionsMode()) {
      return {
        mode: 'default',
        source: 'cli',
        notification: 'bypassPermissions mode is disabled outside sandbox'
      }
    }
    return {
      mode: 'bypassPermissions',
      source: 'cli',
      notification: 'All permission checks have been bypassed'
    }
  }
  
  if (args.permissionMode) {
    const mode = args.permissionMode as PermissionMode
    
    if (isValidPermissionMode(mode)) {
      if (mode === 'bypassPermissions' && !shouldAllowBypassPermissionsMode()) {
        return {
          mode: 'default',
          source: 'cli',
          notification: 'bypassPermissions mode is disabled outside sandbox'
        }
      }
      return { mode, source: 'cli' }
    }
    
    console.warn(`Invalid permission mode: ${mode}, falling back to default`)
  }
  
  // 环境变量检查
  const envMode = getPermissionModeFromEnv()
  if (envMode) {
    return { mode: envMode, source: 'env' }
  }
  
  // Persisted settings check
  const settingsMode = getPermissionModeFromSettings()
  if (settingsMode) {
    return settingsMode
  }
  
  // 默认模式
  return { mode: DEFAULT_PERMISSION_MODE, source: 'default' }
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
  if (!ruleContent) return true
  
  const dangerousPatterns = [
    /^python/i,
    /^node/i,
    /^perl/i,
    /^ruby/i,
    /^php/i,
    /^bash/i,
    /^sh\s+-c/i,
    /\|.*sh$/i,
    /\$\(/,
    /`[^`]+`/,
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
  /:\(\)\{:\|:&\};:/,
  /^rm\s+-rf\s+\/+/,
  /^mkfs\b/,
  /^dd\s+.*of=\/dev\//,
  /^fdisk\b/,
  /^mount\s+-o\s+rw\s+\//,
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

export const DEFAULT_CLI_ARGS: PermissionCliArgs = {
  dangerouslySkipPermissions: false,
  permissionMode: undefined,
  allowedTools: undefined,
  deniedTools: undefined,
}
