/**
 * Permission Update Module
 *
 * 权限规则更新和持久化管理
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  PermissionRule,
  PermissionUpdate as PermissionUpdateType,
  PermissionUpdateDestination,
  PermissionRuleValue,
  PermissionBehavior,
} from './types'
import { permissionRuleValueFromString } from './permissionRuleParser'

// ============================================================================
// Constants
// ============================================================================

/**
 * 权限配置文件路径
 */
export const PERMISSION_CONFIG_DIR = join(process.env.HOME || '', '.upup')
export const PERMISSION_CONFIG_FILE = join(PERMISSION_CONFIG_DIR, 'permissions.json')
export const SESSION_CONFIG_FILE = join(PERMISSION_CONFIG_DIR, 'session-permissions.json')

/**
 * 最大规则数
 */
export const MAX_RULES = 1000

/**
 * 最大规则长度
 */
export const MAX_RULE_LENGTH = 500

// ============================================================================
// Types
// ============================================================================

/**
 * 权限规则存储格式
 */
export interface PermissionStorage {
  version: number
  lastUpdated: string
  rules: StoredRule[]
  metadata?: Record<string, unknown>
}

/**
 * 存储的规则格式
 */
export interface StoredRule {
  toolName: string
  behavior: PermissionBehavior
  content?: string
  source: string
  description?: string
  createdAt: string
  hitCount?: number
  lastHitAt?: string
}

/**
 * 更新结果
 */
export interface UpdateResult {
  success: boolean
  added?: number
  removed?: number
  errors?: string[]
  warnings?: string[]
}

// ============================================================================
// Permission Config Manager
// ============================================================================

/**
 * 权限配置管理器
 */
export class PermissionConfigManager {
  private configPath: string
  private rules: Map<string, StoredRule> = new Map()
  private listeners: Set<() => void> = new Set()

  constructor(configPath: string = PERMISSION_CONFIG_FILE) {
    this.configPath = configPath
    this.load()
  }

  /**
   * 加载配置
   */
  load(): void {
    try {
      if (!existsSync(this.configPath)) {
        return
      }

      const content = readFileSync(this.configPath, 'utf-8')
      const storage: PermissionStorage = JSON.parse(content)

      this.rules.clear()
      for (const rule of storage.rules) {
        const key = this.getRuleKey(rule.toolName, rule.content)
        this.rules.set(key, rule)
      }
    } catch (error) {
      // 加载失败，使用空配置
      console.error('Failed to load permission config:', error)
    }
  }

  /**
   * 保存配置
   */
  save(): void {
    try {
      // 确保目录存在
      const dir = this.configPath.substring(0, this.configPath.lastIndexOf('/'))
      mkdirSync(dir, { recursive: true })

      const storage: PermissionStorage = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        rules: Array.from(this.rules.values()),
      }

      writeFileSync(this.configPath, JSON.stringify(storage, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save permission config:', error)
    }
  }

  /**
   * 添加规则
   */
  addRule(
    toolName: string,
    behavior: PermissionBehavior,
    content?: string,
    description?: string
  ): UpdateResult {
    const key = this.getRuleKey(toolName, content)

    // 检查规则数限制
    if (this.rules.size >= MAX_RULES && !this.rules.has(key)) {
      return {
        success: false,
        errors: [`Maximum rules limit (${MAX_RULES}) reached`],
      }
    }

    const rule: StoredRule = {
      toolName,
      behavior,
      content,
      source: 'userSettings',
      description,
      createdAt: new Date().toISOString(),
    }

    this.rules.set(key, rule)
    this.save()
    this.notifyListeners()

    return { success: true, added: 1 }
  }

  /**
   * 移除规则
   */
  removeRule(toolName: string, content?: string): UpdateResult {
    const key = this.getRuleKey(toolName, content)

    if (this.rules.has(key)) {
      this.rules.delete(key)
      this.save()
      this.notifyListeners()
      return { success: true, removed: 1 }
    }

    return { success: true, removed: 0 }
  }

  /**
   * 获取规则
   */
  getRule(toolName: string, content?: string): StoredRule | undefined {
    const key = this.getRuleKey(toolName, content)
    return this.rules.get(key)
  }

  /**
   * 获取所有规则
   */
  getAllRules(): StoredRule[] {
    return Array.from(this.rules.values())
  }

  /**
   * 清除所有规则
   */
  clear(): void {
    this.rules.clear()
    this.save()
    this.notifyListeners()
  }

  /**
   * 应用更新
   */
  applyUpdate(update: PermissionUpdateType): UpdateResult {
    const result: UpdateResult = {
      success: true,
      added: 0,
      removed: 0,
      errors: [],
      warnings: [],
    }

    switch (update.type) {
      case 'addRules':
        for (const rule of update.rules) {
          const addResult = this.addRule(
            rule.ruleValue.toolName,
            rule.ruleBehavior,
            rule.ruleValue.ruleContent,
            rule.description
          )
          if (addResult.success && addResult.added) {
            result.added = (result.added || 0) + 1
          } else if (addResult.errors) {
            result.errors!.push(...addResult.errors!)
          }
        }
        break

      case 'removeRules':
        for (const pattern of update.patterns) {
          const removeResult = this.removeRuleByPattern(pattern)
          result.removed = (result.removed || 0) + removeResult.count
        }
        break

      case 'replaceRules':
        // 清除现有规则并添加新规则
        this.clear()
        for (const rule of update.rules) {
          const addResult = this.addRule(
            rule.ruleValue.toolName,
            rule.ruleBehavior,
            rule.ruleValue.ruleContent,
            rule.description
          )
          if (addResult.success && addResult.added) {
            result.added = (result.added || 0) + 1
          }
        }
        break
    }

    return result
  }

  /**
   * 按模式移除规则
   */
  private removeRuleByPattern(pattern: string): { count: number } {
    let count = 0
    const keysToRemove: string[] = []

    for (const [key, rule] of this.rules.entries()) {
      const ruleString = this.ruleToString(rule)
      if (ruleString === pattern || ruleString.includes(pattern)) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      this.rules.delete(key)
      count++
    }

    if (count > 0) {
      this.save()
      this.notifyListeners()
    }

    return { count }
  }

  /**
   * 获取规则键
   */
  private getRuleKey(toolName: string, content?: string): string {
    return `${toolName}${content ? `:${content}` : ''}`
  }

  /**
   * 规则转字符串
   */
  private ruleToString(rule: StoredRule): string {
    return `${rule.toolName}${rule.content ? `(${rule.content})` : ''}`
  }

  /**
   * 添加监听器
   */
  addListener(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 导出规则
   */
  exportRules(): StoredRule[] {
    return this.getAllRules()
  }

  /**
   * 导入规则
   */
  importRules(rules: StoredRule[], merge = true): UpdateResult {
    if (!merge) {
      this.clear()
    }

    const result: UpdateResult = {
      success: true,
      added: 0,
    }

    for (const rule of rules) {
      this.addRule(rule.toolName, rule.behavior, rule.content, rule.description)
      result.added = (result.added || 0) + 1
    }

    return result
  }
}

// ============================================================================
// Global Manager Instance
// ============================================================================

let globalManager: PermissionConfigManager | null = null

/**
 * 获取全局配置管理器
 */
export function getPermissionConfigManager(): PermissionConfigManager {
  if (!globalManager) {
    globalManager = new PermissionConfigManager()
  }
  return globalManager
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 添加允许规则
 */
export function addAllowRule(toolName: string, content?: string): UpdateResult {
  return getPermissionConfigManager().addRule(toolName, 'allow', content)
}

/**
 * 添加拒绝规则
 */
export function addDenyRule(toolName: string, content?: string): UpdateResult {
  return getPermissionConfigManager().addRule(toolName, 'deny', content)
}

/**
 * 添加询问规则
 */
export function addAskRule(toolName: string, content?: string): UpdateResult {
  return getPermissionConfigManager().addRule(toolName, 'ask', content)
}

/**
 * 移除规则
 */
export function removeRule(toolName: string, content?: string): UpdateResult {
  return getPermissionConfigManager().removeRule(toolName, content)
}

/**
 * 检查规则是否存在
 */
export function hasRule(toolName: string, content?: string): boolean {
  return getPermissionConfigManager().getRule(toolName, content) !== undefined
}

/**
 * 获取所有规则
 */
export function listRules(): StoredRule[] {
  return getPermissionConfigManager().getAllRules()
}

/**
 * 清除所有规则
 */
export function clearAllRules(): void {
  getPermissionConfigManager().clear()
}

/**
 * 从字符串添加规则
 */
export function addRuleFromString(
  ruleString: string,
  behavior: PermissionBehavior = 'allow'
): UpdateResult {
  try {
    const ruleValue = permissionRuleValueFromString(ruleString)
    return getPermissionConfigManager().addRule(
      ruleValue.toolName,
      behavior,
      ruleValue.ruleContent
    )
  } catch (error) {
    return {
      success: false,
      errors: [`Invalid rule string: ${error instanceof Error ? error.message : 'Unknown error'}`],
    }
  }
}

/**
 * 从字符串批量添加规则
 */
export function addRulesFromStrings(
  ruleStrings: string[],
  behavior: PermissionBehavior = 'allow'
): UpdateResult {
  const result: UpdateResult = {
    success: true,
    added: 0,
    errors: [],
  }

  for (const ruleString of ruleStrings) {
    const addResult = addRuleFromString(ruleString, behavior)
    if (addResult.success && addResult.added) {
      result.added = (result.added || 0) + 1
    } else if (addResult.errors) {
      result.errors!.push(...addResult.errors!)
    }
  }

  return result
}

// ============================================================================
// Export
// ============================================================================

// All classes and functions are exported inline