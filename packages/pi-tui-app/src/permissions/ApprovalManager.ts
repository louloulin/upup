/**
 * Approval Manager Module
 *
 * 授权状态管理改进
 */

import type { ApprovalDecision } from '@upup/pi-event-adapter'
import type { ApprovalRequestData } from '../components/approval-requests/BaseApprovalRequest.js'

// ============================================================================
// Types
// ============================================================================

export interface ApprovalState {
  isPending: boolean
  currentRequest: ApprovalRequestData | null
  currentDecision: ApprovalDecision | null
  history: ApprovalRecord[]
}

export interface ApprovalRecord {
  toolName: string
  decision: ApprovalDecision
  timestamp: number
  feedback?: string
}

export type ApprovalListener = (state: ApprovalState) => void

// ============================================================================
// Approval Manager
// ============================================================================

export class ApprovalManager {
  private state: ApprovalState = {
    isPending: false,
    currentRequest: null,
    currentDecision: null,
    history: [],
  }

  private listeners: Set<ApprovalListener> = new Set()
  private currentResolve: ((decision: ApprovalDecision) => void) | null = null

  /**
   * 获取当前状态
   */
  getState(): ApprovalState {
    return { ...this.state }
  }

  /**
   * 请求授权
   */
  requestApproval(request: ApprovalRequestData): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      // 保存之前的 resolve
      const previousResolve = this.currentResolve

      // 取消之前的授权请求
      if (previousResolve) {
        previousResolve('deny')
      }

      // 设置新状态
      this.state = {
        ...this.state,
        isPending: true,
        currentRequest: request,
        currentDecision: null,
      }

      this.currentResolve = resolve
      this.notifyListeners()
    })
  }

  /**
   * 响应授权
   */
  respond(decision: ApprovalDecision, feedback?: string): void {
    if (!this.state.isPending || !this.state.currentRequest) {
      return
    }

    // 记录历史
    this.state.history.push({
      toolName: this.state.currentRequest.toolName,
      decision,
      timestamp: Date.now(),
      feedback,
    })

    // 限制历史大小
    if (this.state.history.length > 100) {
      this.state.history.shift()
    }

    // 更新状态
    this.state = {
      ...this.state,
      isPending: false,
      currentDecision: decision,
    }

    // 调用 resolve
    if (this.currentResolve) {
      this.currentResolve(decision)
      this.currentResolve = null
    }

    this.notifyListeners()
  }

  /**
   * 添加监听器
   */
  addListener(listener: ApprovalListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    const state = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 获取历史
   */
  getHistory(): ApprovalRecord[] {
    return [...this.state.history]
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.state.history = []
    this.notifyListeners()
  }

  /**
   * 检查状态一致性
   */
  checkConsistency(): { consistent: boolean; issues: string[] } {
    const issues: string[] = []

    if (this.state.isPending && !this.currentResolve) {
      issues.push('State shows pending but no resolve function')
    }

    if (!this.state.isPending && this.currentResolve) {
      issues.push('State shows not pending but resolve function exists')
    }

    return {
      consistent: issues.length === 0,
      issues,
    }
  }
}

// ============================================================================
// Global Manager
// ============================================================================

let globalManager: ApprovalManager | null = null

export function getApprovalManager(): ApprovalManager {
  if (!globalManager) {
    globalManager = new ApprovalManager()
  }
  return globalManager
}

// ============================================================================
// Export
// ============================================================================

// All classes and functions are exported inline
