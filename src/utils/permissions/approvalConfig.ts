/**
 * Approval Configuration Module
 *
 * 授权相关配置，支持可配置的授权超时、选项等
 */

import type { ApprovalDecision } from '../../agent/types.js'

// ============================================================================
// Types
// ============================================================================

/**
 * 授权选项
 */
export interface ApprovalOption {
  value: ApprovalDecision
  label: string
  description?: string
  shortcut?: string
}

/**
 * 授权超时配置
 */
export interface ApprovalTimeoutConfig {
  enabled: boolean
  defaultMs: number
  warningMs?: number
  perToolOverrides?: Record<string, number>
}

/**
 * 授权 UI 配置
 */
export interface ApprovalUIConfig {
  showDangerWarning: boolean
  enableFeedback: boolean
  showRuleExplanation: boolean
  showPreview: boolean
  shortcuts: {
    allowOnce: string
    allowSession: string
    deny: string
    feedback: string
  }
}

/**
 * 完整授权配置
 */
export interface ApprovalConfig {
  timeout: ApprovalTimeoutConfig
  options: ApprovalOption[]
  ui: ApprovalUIConfig
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * 默认超时配置（60秒）
 */
export const DEFAULT_TIMEOUT_MS = 60000

/**
 * 默认超时警告（50秒）
 */
export const DEFAULT_WARNING_MS = 50000

/**
 * 默认授权选项
 */
export const DEFAULT_APPROVAL_OPTIONS: ApprovalOption[] = [
  {
    value: 'allow-once',
    label: '1. Yes',
    description: 'Allow this operation once',
    shortcut: '1',
  },
  {
    value: 'allow-session',
    label: '2. Yes, allow all edits this session',
    description: 'Allow all edit operations for this session',
    shortcut: '2',
  },
  {
    value: 'deny',
    label: '3. No',
    description: 'Deny this operation',
    shortcut: '3',
  },
]

/**
 * 默认 UI 配置
 */
export const DEFAULT_UI_CONFIG: ApprovalUIConfig = {
  showDangerWarning: true,
  enableFeedback: false,
  showRuleExplanation: true,
  showPreview: true,
  shortcuts: {
    allowOnce: '1',
    allowSession: '2',
    deny: '3',
    feedback: 'Tab',
  },
}

/**
 * 默认超时配置
 */
export const DEFAULT_TIMEOUT_CONFIG: ApprovalTimeoutConfig = {
  enabled: true,
  defaultMs: DEFAULT_TIMEOUT_MS,
  warningMs: DEFAULT_WARNING_MS,
  perToolOverrides: {
    Bash: 120000,       // Bash 命令给更多时间
    Write: 30000,       // 文件写入更快超时
    Edit: 30000,        // 编辑也更快
    Read: 15000,        // 读取可以更快
  },
}

/**
 * 默认完整配置
 */
export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  timeout: DEFAULT_TIMEOUT_CONFIG,
  options: DEFAULT_APPROVAL_OPTIONS,
  ui: DEFAULT_UI_CONFIG,
}

// ============================================================================
// Configuration Manager
// ============================================================================

let globalConfig: ApprovalConfig = { ...DEFAULT_APPROVAL_CONFIG }

/**
 * 获取当前授权配置
 */
export function getApprovalConfig(): ApprovalConfig {
  return { ...globalConfig }
}

/**
 * 设置授权配置
 */
export function setApprovalConfig(config: Partial<ApprovalConfig>): void {
  globalConfig = {
    timeout: config.timeout ? { ...globalConfig.timeout, ...config.timeout } : globalConfig.timeout,
    options: config.options || globalConfig.options,
    ui: config.ui ? { ...globalConfig.ui, ...config.ui } : globalConfig.ui,
  }
}

/**
 * 重置为默认配置
 */
export function resetApprovalConfig(): void {
  globalConfig = { ...DEFAULT_APPROVAL_CONFIG }
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): void {
  // 超时配置
  const timeoutEnv = process.env.UPUP_APPROVAL_TIMEOUT_MS
  if (timeoutEnv) {
    const timeout = parseInt(timeoutEnv, 10)
    if (!isNaN(timeout) && timeout > 0) {
      globalConfig.timeout.defaultMs = timeout
    }
  }

  // 启用/禁用超时
  const timeoutEnabled = process.env.UPUP_APPROVAL_TIMEOUT_ENABLED
  if (timeoutEnabled !== undefined) {
    globalConfig.timeout.enabled = timeoutEnabled !== 'false'
  }

  // 危险警告
  const showWarning = process.env.UPUP_SHOW_DANGER_WARNING
  if (showWarning !== undefined) {
    globalConfig.ui.showDangerWarning = showWarning !== 'false'
  }

  // 反馈功能
  const enableFeedback = process.env.UPUP_ENABLE_FEEDBACK
  if (enableFeedback !== undefined) {
    globalConfig.ui.enableFeedback = enableFeedback === 'true'
  }
}

/**
 * 从 settings.json 加载配置
 */
export function loadConfigFromSettings(settings: Record<string, unknown>): void {
  const approval = settings.approval as Record<string, unknown> | undefined
  if (!approval) return

  // 超时
  if (approval.timeoutMs !== undefined) {
    globalConfig.timeout.defaultMs = approval.timeoutMs as number
  }

  if (approval.timeoutEnabled !== undefined) {
    globalConfig.timeout.enabled = approval.timeoutEnabled as boolean
  }

  // UI 配置
  if (approval.showDangerWarning !== undefined) {
    globalConfig.ui.showDangerWarning = approval.showDangerWarning as boolean
  }

  if (approval.enableFeedback !== undefined) {
    globalConfig.ui.enableFeedback = approval.enableFeedback as boolean
  }

  // 自定义选项
  if (Array.isArray(approval.options)) {
    globalConfig.options = (approval.options as ApprovalOption[]).map(opt => ({
      value: opt.value as ApprovalDecision,
      label: opt.label,
      description: opt.description,
      shortcut: opt.shortcut,
    }))
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 获取工具的超时时间
 */
export function getTimeoutForTool(toolName: string): number {
  const { timeout } = globalConfig

  // 检查工具特定覆盖
  if (timeout.perToolOverrides?.[toolName]) {
    return timeout.perToolOverrides[toolName]!
  }

  return timeout.defaultMs
}

/**
 * 检查是否应该显示超时警告
 */
export function shouldShowTimeoutWarning(elapsedMs: number): boolean {
  if (!globalConfig.timeout.enabled || !globalConfig.timeout.warningMs) {
    return false
  }

  return elapsedMs >= globalConfig.timeout.warningMs
}

/**
 * 获取工具的危险级别描述
 */
export function getToolDangerLevel(toolName: string): 'low' | 'medium' | 'high' {
  switch (toolName) {
    case 'Bash':
      return 'high'
    case 'Write':
    case 'Edit':
      return 'medium'
    case 'Read':
    case 'Grep':
    case 'Glob':
      return 'low'
    default:
      return 'medium'
  }
}

// ============================================================================
// Export
// ============================================================================

// All constants are exported inline