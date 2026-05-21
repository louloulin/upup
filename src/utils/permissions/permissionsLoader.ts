/**
 * Permissions Loader Module
 *
 * 从多个来源加载权限规则，支持优先级合并
 *
 * 基于 Claude Code 的 permissionsLoader.ts 设计
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  PermissionRule,
  PermissionRuleSource,
  PermissionBehavior,
  PermissionUpdate,
  PermissionRuleValue,
} from './types.js'
import { permissionRuleValueFromString } from './permissionRuleParser.js'
import { globalUpupPath } from '../storage-paths.js'

// ============================================================================
// Settings Path Helper
// ============================================================================

/**
 * 获取设置文件路径
 */
function getSettingsFilePath(source: PermissionRuleSource): string | null {
  switch (source) {
    case 'userSettings':
      return globalUpupPath('settings.json')
    case 'projectSettings':
      return join(process.cwd(), '.upup', 'settings.json')
    case 'localSettings':
      return join(process.cwd(), '.upup', 'local-settings.json')
    default:
      return null
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 规则来源优先级（数字越小优先级越高）
 */
export const RULE_SOURCE_PRIORITY: Record<PermissionRuleSource, number> = {
  builtin: 0,
  cliArg: 1,
  flagSettings: 2,
  policySettings: 3,
  session: 4,
  userSettings: 5,
  projectSettings: 6,
  localSettings: 7,
  command: 8,  // 命令级规则
}

/**
 * 规则类型对应的来源
 */
export const BEHAVIOR_TO_SOURCE: Record<PermissionBehavior, PermissionRuleSource> = {
  allow: 'userSettings',
  deny: 'userSettings',
  ask: 'userSettings',
}

// ============================================================================
// Settings Format
// ============================================================================

/**
 * 权限设置格式（来自 settings.json）
 */
export interface PermissionSettings {
  defaultMode?: string
  allow?: string[]
  ask?: string[]
  deny?: string[]
}

/**
 * 完整权限配置
 */
export interface PermissionConfig {
  defaultMode: string
  allowRules: PermissionRule[]
  askRules: PermissionRule[]
  denyRules: PermissionRule[]
  source: PermissionRuleSource
}

// ============================================================================
// Loading Functions
// ============================================================================

/**
 * 从磁盘加载所有权限规则
 *
 * 按优先级顺序加载:
 * 1. 内置规则 (builtin)
 * 2. CLI 参数规则 (cliArg)
 * 3. 标志设置 (flagSettings)
 * 4. 策略设置 (policySettings)
 * 5. 会话规则 (session)
 * 6. 用户设置 (userSettings)
 * 7. 项目设置 (projectSettings)
 * 8. 本地设置 (localSettings)
 */
export function loadAllPermissionRulesFromDisk(): PermissionRule[] {
  const rules: PermissionRule[] = []

  // 1. 加载内置规则
  rules.push(...getBuiltInRules())

  // 2. 加载用户设置
  rules.push(...loadRulesFromSettings('userSettings'))

  // 3. 加载项目设置
  rules.push(...loadRulesFromSettings('projectSettings'))

  // 4. 加载本地设置
  rules.push(...loadRulesFromSettings('localSettings'))

  // 按优先级排序
  return sortRulesByPriority(rules)
}

/**
 * 获取内置权限规则
 */
export function getBuiltInRules(): PermissionRule[] {
  return [
    // 总是允许安全命令
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'pwd' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'echo' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'true' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'false' } },

    // 只读命令
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'ls' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'cat' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'grep' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'find' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'ps' } },

    // Git 只读操作
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'git', ruleContent: 'log' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'git', ruleContent: 'show' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'git', ruleContent: 'diff' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'git', ruleContent: 'status' } },
    { source: 'builtin', ruleBehavior: 'allow', ruleValue: { toolName: 'git', ruleContent: 'branch' } },

    // 总是拒绝危险命令
    { source: 'builtin', ruleBehavior: 'deny', ruleValue: { toolName: ':', ruleContent: '(){:|:&};:' } },
    { source: 'builtin', ruleBehavior: 'deny', ruleValue: { toolName: 'rm', ruleContent: '-rf /' } },
    { source: 'builtin', ruleBehavior: 'deny', ruleValue: { toolName: 'mkfs' } },
    { source: 'builtin', ruleBehavior: 'deny', ruleValue: { toolName: 'dd', ruleContent: 'of=/dev/' } },
  ]
}

/**
 * 从 settings 文件加载规则
 */
function loadRulesFromSettings(source: PermissionRuleSource): PermissionRule[] {
  try {
    const settingsPath = getSettingsFilePath(source)
    if (!settingsPath || !existsSync(settingsPath)) {
      return []
    }

    const content = readFileSync(settingsPath, 'utf-8')
    const settings: PermissionSettings = JSON.parse(content)

    return settingsJsonToRules(settings, source)
  } catch (error) {
    // 静默处理加载错误
    return []
  }
}

/**
 * 将 settings JSON 转换为规则数组
 */
export function settingsJsonToRules(
  settings: PermissionSettings,
  source: PermissionRuleSource
): PermissionRule[] {
  const rules: PermissionRule[] = []

  // 处理 allow 规则
  if (settings.allow) {
    for (const ruleString of settings.allow) {
      try {
        const ruleValue = permissionRuleValueFromString(ruleString)
        rules.push({
          source,
          ruleBehavior: 'allow',
          ruleValue,
          description: `Allow from ${source}`,
        })
      } catch {
        // 跳过无效规则
      }
    }
  }

  // 处理 ask 规则
  if (settings.ask) {
    for (const ruleString of settings.ask) {
      try {
        const ruleValue = permissionRuleValueFromString(ruleString)
        rules.push({
          source,
          ruleBehavior: 'ask',
          ruleValue,
          description: `Ask from ${source}`,
        })
      } catch {
        // 跳过无效规则
      }
    }
  }

  // 处理 deny 规则
  if (settings.deny) {
    for (const ruleString of settings.deny) {
      try {
        const ruleValue = permissionRuleValueFromString(ruleString)
        rules.push({
          source,
          ruleBehavior: 'deny',
          ruleValue,
          description: `Deny from ${source}`,
        })
      } catch {
        // 跳过无效规则
      }
    }
  }

  return rules
}

// ============================================================================
// Rule Retrieval
// ============================================================================

/**
 * 根据来源获取规则
 */
export function getPermissionRulesForSource(
  allRules: PermissionRule[],
  source: PermissionRuleSource
): PermissionRule[] {
  return allRules.filter((rule) => rule.source === source)
}

/**
 * 获取特定行为的规则
 */
export function getRulesForBehavior(
  allRules: PermissionRule[],
  behavior: PermissionBehavior
): PermissionRule[] {
  return allRules.filter((rule) => rule.ruleBehavior === behavior)
}

/**
 * 按优先级排序规则
 */
export function sortRulesByPriority(rules: PermissionRule[]): PermissionRule[] {
  return [...rules].sort((a, b) => {
    const priorityA = RULE_SOURCE_PRIORITY[a.source] ?? 100
    const priorityB = RULE_SOURCE_PRIORITY[b.source] ?? 100
    return priorityA - priorityB
  })
}

// ============================================================================
// Rule Matching
// ============================================================================

/**
 * 查找匹配的规则
 */
export function findMatchingRules(
  allRules: PermissionRule[],
  toolName: string,
  content?: string
): PermissionRule[] {
  return allRules.filter((rule) => {
    // 工具名必须匹配
    if (rule.ruleValue.toolName !== toolName) {
      return false
    }

    // 如果规则有内容要求，检查内容匹配
    if (rule.ruleValue.ruleContent !== undefined) {
      return matchContent(rule.ruleValue.ruleContent, content || '')
    }

    // 无内容要求的规则匹配所有内容
    return true
  })
}

/**
 * 内容匹配（支持 glob）
 */
function matchContent(ruleContent: string, content: string): boolean {
  if (!ruleContent) return true
  if (!content) return false

  // 检查是否包含通配符
  if (ruleContent.includes('*')) {
    return globMatch(ruleContent, content)
  }

  return ruleContent === content
}

/**
 * 简单的 glob 匹配
 */
function globMatch(pattern: string, text: string): boolean {
  // 简化实现
  if (pattern === '*') return true

  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')

  try {
    return new RegExp(`^${regexPattern}$`).test(text)
  } catch {
    return pattern === text
  }
}

// ============================================================================
// Permission Updates
// ============================================================================

/**
 * 应用权限更新
 */
export function applyPermissionUpdate(
  allRules: PermissionRule[],
  update: PermissionUpdate
): PermissionRule[] {
  switch (update.type) {
    case 'addRules':
      return [...allRules, ...update.rules]

    case 'removeRules':
      return allRules.filter((rule) => {
        // 检查是否应该移除
        return !update.patterns.some((pattern) => {
          const ruleString = `${rule.ruleValue.toolName}${rule.ruleValue.ruleContent ? `(${rule.ruleValue.ruleContent})` : ''}`
          return ruleString === pattern || ruleString.includes(pattern)
        })
      })

    case 'replaceRules':
      // 移除目标来源的规则，添加新规则
      const filtered = allRules.filter((r) => r.source !== update.destination)
      return [...filtered, ...update.rules]

    default:
      return allRules
  }
}

/**
 * 持久化权限更新到磁盘
 */
export function persistPermissionUpdates(
  update: PermissionUpdate
): void {
  try {
    const settingsPath = getSettingsFilePath(update.destination as PermissionRuleSource)
    if (!settingsPath) return

    // 确保目录存在
    const dir = settingsPath.substring(0, settingsPath.lastIndexOf('/'))
    mkdirSync(dir, { recursive: true })

    // 读取现有设置
    let settings: PermissionSettings = {}
    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8')
        settings = JSON.parse(content)
      } catch {
        // 使用空设置
      }
    }

    // 应用更新
    switch (update.type) {
      case 'addRules':
        for (const rule of update.rules) {
          const ruleString = `${rule.ruleValue.toolName}${rule.ruleValue.ruleContent ? `(${rule.ruleValue.ruleContent})` : ''}`
          if (rule.ruleBehavior === 'allow') {
            settings.allow = settings.allow || []
            if (!settings.allow.includes(ruleString)) {
              settings.allow.push(ruleString)
            }
          } else if (rule.ruleBehavior === 'deny') {
            settings.deny = settings.deny || []
            if (!settings.deny.includes(ruleString)) {
              settings.deny.push(ruleString)
            }
          } else {
            settings.ask = settings.ask || []
            if (!settings.ask.includes(ruleString)) {
              settings.ask.push(ruleString)
            }
          }
        }
        break

      case 'removeRules':
        for (const pattern of update.patterns) {
          settings.allow = settings.allow?.filter((r) => !r.includes(pattern)) || []
          settings.ask = settings.ask?.filter((r) => !r.includes(pattern)) || []
          settings.deny = settings.deny?.filter((r) => !r.includes(pattern)) || []
        }
        break

      case 'replaceRules':
        const newRules = update.rules.reduce(
          (acc, rule) => {
            const ruleString = `${rule.ruleValue.toolName}${rule.ruleValue.ruleContent ? `(${rule.ruleValue.ruleContent})` : ''}`
            if (rule.ruleBehavior === 'allow') {
              acc.allow.push(ruleString)
            } else if (rule.ruleBehavior === 'deny') {
              acc.deny.push(ruleString)
            } else {
              acc.ask.push(ruleString)
            }
            return acc
          },
          { allow: [] as string[], ask: [] as string[], deny: [] as string[] }
        )

        if (update.destination === 'userSettings') {
          settings.allow = newRules.allow
          settings.ask = newRules.ask
          settings.deny = newRules.deny
        }
        break
    }

    // 写回文件
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  } catch (error) {
    // 持久化失败不影响主流程
    console.error('Failed to persist permission updates:', error)
  }
}

// ============================================================================
// Export
// ============================================================================

// All functions are exported inline, no additional export block needed