/**
 * Agent Lifecycle Manager - Agent生命周期管理器 (v1.0)
 * 
 * 管理Agent的完整生命周期:
 * - 创建 -> 初始化 -> 运行 -> 完成/失败
 * - 生命周期事件
 * - 清理和资源释放
 */

import { info, warn, error as logError } from '@upup/utils/logging';

export type LifecycleEventType = 
  | 'created'
  | 'initializing'
  | 'initialized'
  | 'running'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'terminated';

export interface LifecycleEvent {
  type: LifecycleEventType;
  agentId: string;
  agentName: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type LifecycleListener = (event: LifecycleEvent) => void | Promise<void>;

export interface LifecyclePolicy {
  /** 自动清理超时 (ms) */
  cleanupTimeoutMs: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟 (ms) */
  retryDelayMs: number;
  /** 启用自动清理 */
  enableAutoCleanup: boolean;
}

const DEFAULT_POLICY: LifecyclePolicy = {
  cleanupTimeoutMs: 300000, // 5 minutes
  maxRetries: 3,
  retryDelayMs: 1000,
  enableAutoCleanup: true,
};

/**
 * Lifecycle State Machine
 */
export class AgentLifecycleManager {
  private static instance: AgentLifecycleManager | null = null;
  private policy: LifecyclePolicy;
  private listeners: Set<LifecycleListener> = new Set();
  private agentStates: Map<string, LifecycleEventType> = new Map();
  private agentHistory: Map<string, LifecycleEvent[]> = new Map();
  private retryCounters: Map<string, number> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private constructor(policy: Partial<LifecyclePolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  static getInstance(policy?: Partial<LifecyclePolicy>): AgentLifecycleManager {
    if (!AgentLifecycleManager.instance) {
      AgentLifecycleManager.instance = new AgentLifecycleManager(policy);
    }
    return AgentLifecycleManager.instance;
  }

  /**
   * Register lifecycle listener
   */
  addListener(listener: LifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit lifecycle event
   */
  async emit(event: LifecycleEvent): Promise<void> {
    this.agentStates.set(event.agentId, event.type);
    
    // Add to history
    if (!this.agentHistory.has(event.agentId)) {
      this.agentHistory.set(event.agentId, []);
    }
    this.agentHistory.get(event.agentId)!.push(event);
    
    // Trim history if too long
    const history = this.agentHistory.get(event.agentId)!;
    if (history.length > 100) {
      history.shift();
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (e) {
        logError('lifecycle', `Listener error for ${event.type}`, e instanceof Error ? e : undefined);
      }
    }

    info('lifecycle', `${event.agentName}: ${event.type}`);
  }

  /**
   * Get current state
   */
  getState(agentId: string): LifecycleEventType | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * Get lifecycle history
   */
  getHistory(agentId: string): LifecycleEvent[] {
    return this.agentHistory.get(agentId) || [];
  }

  /**
   * Check if agent can transition to new state
   */
  canTransition(agentId: string, newState: LifecycleEventType): boolean {
    const currentState = this.agentStates.get(agentId);
    
    if (!currentState) {
      // New agent can only go to 'created'
      return newState === 'created';
    }

    // Define valid transitions
    const validTransitions: Record<LifecycleEventType, LifecycleEventType[]> = {
      created: ['initializing', 'cancelled', 'terminated'],
      initializing: ['initialized', 'failed', 'cancelled', 'terminated'],
      initialized: ['running', 'paused', 'cancelled', 'terminated'],
      running: ['paused', 'completed', 'failed', 'cancelled', 'terminated'],
      paused: ['running', 'cancelled', 'terminated'],
      resumed: ['running', 'completed', 'failed', 'cancelled', 'terminated'],
      completed: ['terminated'],
      failed: ['terminated'],
      cancelled: ['terminated'],
      terminated: [],
    };

    return validTransitions[currentState]?.includes(newState) || false;
  }

  /**
   * Transition to new state
   */
  async transition(agentId: string, agentName: string, newState: LifecycleEventType, metadata?: Record<string, unknown>): Promise<boolean> {
    if (!this.canTransition(agentId, newState)) {
      warn('lifecycle', `Invalid transition: ${agentId} ${this.agentStates.get(agentId)} -> ${newState}`);
      return false;
    }

    await this.emit({
      type: newState,
      agentId,
      agentName,
      timestamp: Date.now(),
      metadata,
    });

    // Handle state-specific actions
    if (newState === 'completed' || newState === 'failed' || newState === 'cancelled') {
      this.scheduleCleanup(agentId, agentName);
    }

    return true;
  }

  /**
   * Schedule cleanup for completed agent
   */
  private scheduleCleanup(agentId: string, agentName: string): void {
    if (!this.policy.enableAutoCleanup) return;

    // Clear existing timer if any
    const existingTimer = this.timers.get(agentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.cleanup(agentId, agentName);
    }, this.policy.cleanupTimeoutMs);

    this.timers.set(agentId, timer);
  }

  /**
   * Cleanup agent resources
   */
  cleanup(agentId: string, agentName: string): void {
    // Clear timer
    const timer = this.timers.get(agentId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(agentId);
    }

    // Clear retry counter
    this.retryCounters.delete(agentId);

    info('lifecycle', `Cleaned up: ${agentName}`);
  }

  /**
   * Request retry for failed agent
   */
  shouldRetry(agentId: string): boolean {
    const retries = this.retryCounters.get(agentId) || 0;
    
    if (retries >= this.policy.maxRetries) {
      return false;
    }

    this.retryCounters.set(agentId, retries + 1);
    return true;
  }

  /**
   * Get retry count
   */
  getRetryCount(agentId: string): number {
    return this.retryCounters.get(agentId) || 0;
  }

  /**
   * Get all tracked agents
   */
  getTrackedAgents(): Array<{ agentId: string; state: LifecycleEventType; eventCount: number }> {
    return Array.from(this.agentStates.entries()).map(([agentId, state]) => ({
      agentId,
      state,
      eventCount: this.agentHistory.get(agentId)?.length || 0,
    }));
  }

  /**
   * Update policy
   */
  updatePolicy(updates: Partial<LifecyclePolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  /**
   * Get current policy
   */
  getPolicy(): LifecyclePolicy {
    return { ...this.policy };
  }

  /**
   * Reset manager
   */
  reset(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    this.agentStates.clear();
    this.agentHistory.clear();
    this.retryCounters.clear();
    this.listeners.clear();
    
    info('lifecycle', 'Manager reset');
  }

  /**
   * Static reset
   */
  static reset(): void {
    if (AgentLifecycleManager.instance) {
      AgentLifecycleManager.instance.reset();
    }
    AgentLifecycleManager.instance = null;
  }
}

/**
 * Get lifecycle manager instance
 */
export function getLifecycleManager(): AgentLifecycleManager {
  return AgentLifecycleManager.getInstance();
}
