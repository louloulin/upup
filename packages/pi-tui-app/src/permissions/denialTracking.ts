/**
 * Denial Tracking Module
 *
 * 跟踪权限拒绝，防止无限拒绝循环
 *
 * 基于 Claude Code 的 denialTracking.ts 设计
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 拒绝记录
 */
export interface DenialRecord {
  toolName: string
  content?: string
  timestamp: number
  reason?: string
}

/**
 * 成功记录
 */
export interface SuccessRecord {
  toolName: string
  content?: string
  timestamp: number
}

/**
 * 拒绝跟踪状态
 */
export interface DenialTrackingState {
  consecutiveDenials: number
  totalDenials: number
  totalSuccesses: number
  recentDenials: DenialRecord[]
  recentSuccesses: SuccessRecord[]
  lastDenialTime: number | null
  lastSuccessTime: number | null
}

/**
 * 拒绝限制配置
 */
export interface DenialLimits {
  consecutive: number
  total: number
  timeWindowMs: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认拒绝限制
 */
export const DENIAL_LIMITS: DenialLimits = {
  consecutive: 5,      // 连续拒绝上限
  total: 50,           // 总拒绝上限
  timeWindowMs: 5 * 60 * 1000,  // 5 分钟时间窗口
}

/**
 * 恢复建议
 */
export const RECOVERY_SUGGESTIONS = [
  'Add the tool to your allow list in settings',
  'Use --dangerously-skip-permissions for testing',
  'Check if there are permission rules blocking the operation',
  'Try running with --permission-mode bypassPermissions',
]

// ============================================================================
// Denial Tracker
// ============================================================================

/**
 * 拒绝跟踪器
 */
export class DenialTracker {
  private state: DenialTrackingState
  private limits: DenialLimits
  private listeners: Set<(state: DenialTrackingState) => void> = new Set()

  constructor(limits: DenialLimits = DENIAL_LIMITS) {
    this.limits = limits
    this.state = this.createInitialState()
  }

  /**
   * 创建初始状态
   */
  private createInitialState(): DenialTrackingState {
    return {
      consecutiveDenials: 0,
      totalDenials: 0,
      totalSuccesses: 0,
      recentDenials: [],
      recentSuccesses: [],
      lastDenialTime: null,
      lastSuccessTime: null,
    }
  }

  /**
   * 记录拒绝
   */
  recordDenial(toolName: string, content?: string, reason?: string): void {
    const now = Date.now()

    // 创建记录
    const record: DenialRecord = {
      toolName,
      content,
      timestamp: now,
      reason,
    }

    // 更新状态
    this.state.consecutiveDenials++
    this.state.totalDenials++
    this.state.lastDenialTime = now
    this.state.recentDenials.push(record)

    // 清理旧记录（在时间窗口外的）
    this.cleanupOldRecords(now)

    // 限制数组大小
    if (this.state.recentDenials.length > 100) {
      this.state.recentDenials.shift()
    }

    // 通知监听器
    this.notifyListeners()
  }

  /**
   * 记录成功
   */
  recordSuccess(toolName: string, content?: string): void {
    const now = Date.now()

    // 创建记录
    const record: SuccessRecord = {
      toolName,
      content,
      timestamp: now,
    }

    // 更新状态
    this.state.consecutiveDenials = 0  // 重置连续拒绝计数
    this.state.totalSuccesses++
    this.state.lastSuccessTime = now
    this.state.recentSuccesses.push(record)

    // 限制数组大小
    if (this.state.recentSuccesses.length > 100) {
      this.state.recentSuccesses.shift()
    }

    // 通知监听器
    this.notifyListeners()
  }

  /**
   * 检查是否应该回退到提示模式
   */
  shouldFallbackToPrompting(): boolean {
    // 检查连续拒绝（重置后应该不触发）
    if (this.state.consecutiveDenials >= this.limits.consecutive) {
      return true
    }

    // 检查总拒绝
    if (this.state.totalDenials >= this.limits.total) {
      return true
    }

    return false
  }

  /**
   * 获取当前状态
   */
  getState(): DenialTrackingState {
    return { ...this.state }
  }

  /**
   * 获取拒绝统计
   */
  getStats(): {
    consecutiveDenials: number
    totalDenials: number
    totalSuccesses: number
    denialRate: number
    averageTimeBetweenDenials: number | null
  } {
    const total = this.state.totalDenials + this.state.totalSuccesses
    const denialRate = total > 0 ? this.state.totalDenials / total : 0

    // 计算平均拒绝间隔
    let avgTime: number | null = null
    if (this.state.recentDenials.length >= 2) {
      const sorted = [...this.state.recentDenials].sort((a, b) => a.timestamp - b.timestamp)
      const intervals: number[] = []

      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp)
      }

      avgTime = intervals.reduce((a, b) => a + b, 0) / intervals.length
    }

    return {
      consecutiveDenials: this.state.consecutiveDenials,
      totalDenials: this.state.totalDenials,
      totalSuccesses: this.state.totalSuccesses,
      denialRate,
      averageTimeBetweenDenials: avgTime,
    }
  }

  /**
   * 获取恢复建议
   */
  getRecoverySuggestions(): string[] {
    const suggestions: string[] = []

    // 根据拒绝原因提供建议
    const recentDenials = this.state.recentDenials.slice(-5)

    for (const denial of recentDenials) {
      if (denial.toolName === 'Bash') {
        suggestions.push(`Bash command blocked: ${denial.content || 'unknown'}`)
      } else {
        suggestions.push(`Tool "${denial.toolName}" was denied`)
      }
    }

    suggestions.push(...RECOVERY_SUGGESTIONS)

    return suggestions
  }

  /**
   * 重置跟踪状态
   */
  reset(): void {
    this.state = this.createInitialState()
    this.notifyListeners()
  }

  /**
   * 添加状态变化监听器
   */
  addListener(listener: (state: DenialTrackingState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 清理旧记录
   */
  private cleanupOldRecords(now: number): void {
    const cutoff = now - this.limits.timeWindowMs

    this.state.recentDenials = this.state.recentDenials.filter(
      (d) => d.timestamp > cutoff
    )

    this.state.recentSuccesses = this.state.recentSuccesses.filter(
      (s) => s.timestamp > cutoff
    )
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState())
      } catch {
        // 忽略监听器错误
      }
    }
  }

  /**
   * 序列化状态（用于持久化）
   */
  serialize(): string {
    return JSON.stringify(this.state)
  }

  /**
   * 从序列化状态恢复
   */
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data)
      this.state = {
        ...this.createInitialState(),
        ...parsed,
      }
    } catch {
      // 恢复失败，使用初始状态
    }
  }
}

// ============================================================================
// Global Tracker Instance
// ============================================================================

let globalTracker: DenialTracker | null = null

/**
 * 获取全局拒绝跟踪器
 */
export function getDenialTracker(): DenialTracker {
  if (!globalTracker) {
    globalTracker = new DenialTracker()
  }
  return globalTracker
}

/**
 * 重置全局跟踪器
 */
export function resetDenialTracker(): void {
  if (globalTracker) {
    globalTracker.reset()
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 快速记录拒绝
 */
export function trackDenial(toolName: string, content?: string, reason?: string): void {
  getDenialTracker().recordDenial(toolName, content, reason)
}

/**
 * 快速记录成功
 */
export function trackSuccess(toolName: string, content?: string): void {
  getDenialTracker().recordSuccess(toolName, content)
}

/**
 * 检查是否应该提示
 */
export function shouldPrompt(): boolean {
  return getDenialTracker().shouldFallbackToPrompting()
}

/**
 * 获取跟踪统计
 */
export function getDenialStats() {
  return getDenialTracker().getStats()
}

/**
 * 获取恢复建议
 */
export function getDenialRecoverySuggestions(): string[] {
  return getDenialTracker().getRecoverySuggestions()
}

// ============================================================================
// Denial Prevention Middleware
// ============================================================================

import type { PermissionCheckResult } from './types'

/**
 * 创建带拒绝跟踪的权限检查包装器
 */
export function withDenialTracking(
  checker: () => Promise<PermissionCheckResult>
): () => Promise<PermissionCheckResult> {
  return async () => {
    const tracker = getDenialTracker()

    // 如果应该回退到提示模式，添加警告
    if (tracker.shouldFallbackToPrompting()) {
      const result = await checker()

      if (result.decision === 'deny') {
        tracker.recordDenial(
          result.ruleSource || 'unknown',
          undefined,
          result.reason
        )
      } else if (result.decision === 'allow') {
        tracker.recordSuccess(result.ruleSource || 'unknown')
      }

      return result
    }

    const result = await checker()

    // 跟踪结果
    if (result.decision === 'deny') {
      tracker.recordDenial(
        result.ruleSource || 'unknown',
        undefined,
        result.reason
      )
    } else if (result.decision === 'allow') {
      tracker.recordSuccess(result.ruleSource || 'unknown')
    }

    return result
  }
}