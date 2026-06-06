/**
 * UpUp Permission Types - 统一权限类型定义
 * 
 * 基于 Claude Code 权限架构设计，统一管理所有权限相关类型
 */

// ============================================================================
// Permission Modes (Session 级别)
// ============================================================================

/**
 * 外部可见的权限模式
 */
export const EXTERNAL_PERMISSION_MODES = [
  'default',
  '.accept-all',
  'acceptEdits',
  'bypassPermissions',
  'dangerously',
  'dontAsk',
  'plan',
] as const

export type ExternalPermissionMode = (typeof EXTERNAL_PERMISSION_MODES)[number]

/**
 * 内部权限模式（包含扩展模式）
 */
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'

/**
 * 完整的权限模式类型
 */
export type PermissionMode = InternalPermissionMode

/**
 * 权限模式配置元数据
 */
export interface PermissionModeConfig {
  title: string
  symbol: string
  color: string
  description: string
}

/**
 * 权限模式配置表
 */
export const PERMISSION_MODE_CONFIG: Record<PermissionMode, PermissionModeConfig> = {
  'default': {
    title: 'Default',
    symbol: '',
    color: 'text',
    description: 'Standard permission checks with confirmation prompts'
  },
  'acceptEdits': {
    title: 'Accept Edits',
    symbol: '✓',
    color: 'autoAccept',
    description: 'Automatically accept edit operations'
  },
  'bypassPermissions': {
    title: 'Bypass Permissions',
    symbol: '⏵⏵',
    color: 'warning',
    description: 'Bypass all permission checks'
  },
  'dangerously': {
    title: 'Dangerously',
    symbol: '⚠',
    color: 'error',
    description: 'Allow all operations including dangerous ones'
  },
  'dontAsk': {
    title: "Don't Ask",
    symbol: '⏵⏵',
    color: 'error',
    description: 'Never ask for permission'
  },
  'plan': {
    title: 'Plan Mode',
    symbol: '⏵⏵',
    color: 'planMode',
    description: 'Read-only planning mode'
  },
  'auto': {
    title: 'Auto Mode',
    symbol: '🤖',
    color: 'info',
    description: 'AI-assisted permission decisions'
  },
  'bubble': {
    title: 'Bubble Mode',
    symbol: '🫧',
    color: 'info',
    description: 'Bubble up permission prompts'
  },
  '.accept-all': {
    title: 'Accept All',
    symbol: '✓',
    color: 'success',
    description: 'Accept all permission prompts'
  }
}

// ============================================================================
// Bash Tool Permission Modes (工具级别)
// ============================================================================

/**
 * Bash 工具的权限模式
 */
export type BashPermissionMode = 'bypass' | 'allow' | 'ask' | 'deny'

/**
 * Bash 权限模式行为配置
 */
export const BASH_PERMISSION_BEHAVIORS: Record<BashPermissionMode, {
  allows: boolean
  requiresConfirmation: boolean
  persists: boolean
}> = {
  bypass: {
    allows: true,
    requiresConfirmation: false,
    persists: false,
  },
  allow: {
    allows: true,
    requiresConfirmation: false,
    persists: true,
  },
  ask: {
    allows: false,
    requiresConfirmation: true,
    persists: false,
  },
  deny: {
    allows: false,
    requiresConfirmation: false,
    persists: true,
  },
}

// ============================================================================
// Permission Rules
// ============================================================================

/**
 * 权限行为类型
 */
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

/**
 * 规则来源类型
 */
export type PermissionRuleSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'
  | 'command'
  | 'session'
  | 'builtin'

/**
 * 权限规则值
 */
export interface PermissionRuleValue {
  toolName: string
  ruleContent?: string
}

/**
 * 权限规则
 */
export interface PermissionRule {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
  description?: string
}

/**
 * 内置 Bash 规则
 */
export interface BashBuiltInRule {
  pattern: RegExp
  mode: BashPermissionMode
  description: string
}

// ============================================================================
// Permission Decision
// ============================================================================

/**
 * 权限决策类型
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask'

/**
 * 权限结果
 */
export interface PermissionCheckResult {
  decision: PermissionDecision
  reason?: string
  ruleSource?: PermissionRuleSource
  suggestions?: string[]
  bypass?: boolean
}

/**
 * 权限请求
 */
export interface PermissionRequest {
  toolName: string
  input: Record<string, unknown>
  context?: PermissionContext
}

/**
 * 权限上下文
 */
export interface PermissionContext {
  sessionId?: string
  userId?: string
  projectPath?: string
  isSandboxed?: boolean
}

// ============================================================================
// Permission Update
// ============================================================================

/**
 * 权限更新目标位置
 */
export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'

/**
 * 权限更新操作
 */
export type PermissionUpdate =
  | { type: 'addRules'; destination: PermissionUpdateDestination; rules: PermissionRule[] }
  | { type: 'removeRules'; destination: PermissionUpdateDestination; patterns: string[] }
  | { type: 'replaceRules'; destination: PermissionUpdateDestination; rules: PermissionRule[] }

// ============================================================================
// CLI Arguments
// ============================================================================

/**
 * CLI 权限参数
 */
export interface PermissionCliArgs {
  dangerouslySkipPermissions?: boolean
  permissionMode?: string
  allowedTools?: string[]
  deniedTools?: string[]
}

// ============================================================================
// Security Checks
// ============================================================================

/**
 * 安全检查结果
 */
export interface SecurityCheckResult {
  passed: boolean
  reason?: string
  severity: 'error' | 'warning' | 'info'
}

/**
 * 安全检查函数类型
 */
export type SecurityCheck = () => SecurityCheckResult

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认权限模式
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default'

/**
 * Bash 默认模式
 */
export const DEFAULT_BASH_MODE: BashPermissionMode = 'ask'

/**
 * 无需确认的模式
 */
export const NO_CONFIRMATION_MODES: BashPermissionMode[] = ['bypass', 'allow']

/**
 * 阻塞模式
 */
export const BLOCKING_MODES: BashPermissionMode[] = ['ask', 'deny']

/**
 * 需要危险模式才能使用的模式
 */
export const DANGEROUS_MODES: PermissionMode[] = ['dangerously', 'bypassPermissions']
