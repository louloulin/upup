/**
 * Agent Scheduler - Agent调度器 (v1.0)
 * 
 * 基于优先级和资源可用性的智能调度:
 * - 优先级队列管理
 * - 资源限制控制
 * - 自动调度决策
 * - 死锁预防
 */

import { info, warn, error as logError } from '../utils/logging/logger.js';
import type { AgentInstance } from './types.js';

export interface SchedulingPolicy {
  /** 最大并发Agent数量 */
  maxConcurrentAgents: number;
  /** 优先级队列大小 */
  maxQueueSize: number;
  /** 允许的Agent类型配额 */
  agentTypeQuota: Record<string, number>;
  /** 资源限制 */
  resourceLimit: {
    maxMemoryMb: number;
    maxCpuPercent: number;
    maxDurationMs: number;
  };
}

export interface QueuedAgent {
  id: string;
  agent: Partial<AgentInstance>;
  priority: number;
  enqueuedAt: number;
  metadata?: Record<string, unknown>;
}

export interface SchedulingDecision {
  action: 'immediate' | 'queued' | 'rejected' | 'deferred';
  reason: string;
  queuePosition?: number;
  estimatedWaitMs?: number;
}

const DEFAULT_POLICY: SchedulingPolicy = {
  maxConcurrentAgents: 10,
  maxQueueSize: 100,
  agentTypeQuota: {
    researcher: 5,
    reviewer: 5,
    debugger: 3,
    coordinator: 2,
    executor: 8,
    analyst: 4,
  },
  resourceLimit: {
    maxMemoryMb: 512,
    maxCpuPercent: 80,
    maxDurationMs: 600000, // 10 minutes
  },
};

/**
 * Agent Scheduler - 智能调度器
 */
export class AgentScheduler {
  private static instance: AgentScheduler | null = null;
  private policy: SchedulingPolicy;
  private queue: QueuedAgent[] = [];
  private activeAgents: Map<string, AgentInstance> = new Map();
  private typeCounters: Map<string, number> = new Map();

  private constructor(policy: Partial<SchedulingPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Get singleton instance
   */
  static getInstance(policy?: Partial<SchedulingPolicy>): AgentScheduler {
    if (!AgentScheduler.instance) {
      AgentScheduler.instance = new AgentScheduler(policy);
    }
    return AgentScheduler.instance;
  }

  /**
   * Request scheduling decision for an agent
   */
  requestScheduling(agent: Partial<AgentInstance>): SchedulingDecision {
    const now = Date.now();
    const agentType = agent.role || 'executor';

    // Check if agent type quota is exceeded
    const currentTypeCount = this.typeCounters.get(agentType) || 0;
    const typeQuota = this.policy.agentTypeQuota[agentType] || 5;

    if (currentTypeCount >= typeQuota) {
      // Check queue capacity
      if (this.queue.length >= this.policy.maxQueueSize) {
        return {
          action: 'rejected',
          reason: `Queue full (${this.policy.maxQueueSize}), type quota exceeded for ${agentType}`,
        };
      }

      // Add to queue with lower priority
      const queuedAgent: QueuedAgent = {
        id: agent.id || crypto.randomUUID(),
        agent,
        priority: 5, // Lower priority
        enqueuedAt: now,
        metadata: { reason: 'type_quota_exceeded' },
      };

      this.queue.push(queuedAgent);
      this.sortQueue();

      return {
        action: 'queued',
        reason: `Type quota exceeded for ${agentType} (${currentTypeCount}/${typeQuota})`,
        queuePosition: this.queue.findIndex(a => a.id === queuedAgent.id) + 1,
        estimatedWaitMs: this.estimateWaitTime(queuedAgent),
      };
    }

    // Check concurrent agent limit
    if (this.activeAgents.size >= this.policy.maxConcurrentAgents) {
      // Check queue capacity
      if (this.queue.length >= this.policy.maxQueueSize) {
        return {
          action: 'rejected',
          reason: `Max concurrent agents (${this.policy.maxConcurrentAgents}) and queue full`,
        };
      }

      // Add to queue
      const priority = this.calculatePriority(agent);
      const queuedAgent: QueuedAgent = {
        id: agent.id || crypto.randomUUID(),
        agent,
        priority,
        enqueuedAt: now,
      };

      this.queue.push(queuedAgent);
      this.sortQueue();

      return {
        action: 'queued',
        reason: 'Max concurrent agents reached',
        queuePosition: this.queue.findIndex(a => a.id === queuedAgent.id) + 1,
        estimatedWaitMs: this.estimateWaitTime(queuedAgent),
      };
    }

    // Can start immediately
    return {
      action: 'immediate',
      reason: 'Resources available, within limits',
    };
  }

  /**
   * Register an active agent
   */
  registerActiveAgent(agent: AgentInstance): void {
    this.activeAgents.set(agent.id, agent);
    
    const agentType = agent.role || 'executor';
    this.typeCounters.set(agentType, (this.typeCounters.get(agentType) || 0) + 1);

    info('scheduler', `Registered active agent: ${agent.name} (${agentType}), total: ${this.activeAgents.size}`);
  }

  /**
   * Unregister an active agent and trigger queue processing
   */
  unregisterActiveAgent(agentId: string): QueuedAgent | null {
    const agent = this.activeAgents.get(agentId);
    if (!agent) return null;

    // Update type counter
    const agentType = agent.role || 'executor';
    const newCount = (this.typeCounters.get(agentType) || 1) - 1;
    if (newCount <= 0) {
      this.typeCounters.delete(agentType);
    } else {
      this.typeCounters.set(agentType, newCount);
    }

    this.activeAgents.delete(agentId);
    info('scheduler', `Unregistered agent: ${agent.name}, remaining: ${this.activeAgents.size}`);

    // Process queue
    return this.processQueue();
  }

  /**
   * Process queue and return next agent if available
   */
  private processQueue(): QueuedAgent | null {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      const decision = this.requestScheduling(next.agent);

      if (decision.action === 'immediate') {
        return next;
      } else if (decision.action === 'queued') {
        // Re-queue with updated position
        continue;
      } else {
        // Rejected, skip this agent
        continue;
      }
    }

    return null;
  }

  /**
   * Calculate priority for an agent (higher = more important)
   */
  private calculatePriority(agent: Partial<AgentInstance>): number {
    let priority = 5; // Base priority

    // Coordinators have higher priority
    if (agent.role === 'coordinator') priority += 3;

    // Reviewers have medium-high priority
    if (agent.role === 'reviewer') priority += 2;

    // Researchers have medium priority
    if (agent.role === 'researcher') priority += 1;

    // Debuggers have high priority for quick tasks
    if (agent.role === 'debugger') priority += 2;

    // Swarm context agents have higher priority
    if ((agent as any).context === 'swarm') priority += 2;

    // Inline context agents have lower priority
    if ((agent as any).context === 'inline') priority -= 1;

    return Math.max(1, Math.min(10, priority));
  }

  /**
   * Sort queue by priority (highest first), then by enqueue time (oldest first)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  /**
   * Estimate wait time for a queued agent
   */
  private estimateWaitTime(agent: QueuedAgent): number {
    // Estimate based on average agent duration
    const avgDuration = 60000; // 1 minute average
    const position = this.queue.findIndex(a => a.id === agent.id);
    return avgDuration * position;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeCount: number;
    typeCounters: Record<string, number>;
    nextInQueue?: QueuedAgent;
  } {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeAgents.size,
      typeCounters: Object.fromEntries(this.typeCounters),
      nextInQueue: this.queue[0],
    };
  }

  /**
   * Cancel a queued agent
   */
  cancelQueued(agentId: string): boolean {
    const index = this.queue.findIndex(a => a.id === agentId);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    info('scheduler', `Cancelled queued agent: ${agentId}`);
    return true;
  }

  /**
   * Update scheduling policy
   */
  updatePolicy(updates: Partial<SchedulingPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    info('scheduler', 'Updated scheduling policy');
  }

  /**
   * Get current policy
   */
  getPolicy(): SchedulingPolicy {
    return { ...this.policy };
  }

  /**
   * Check if agent can be started
   */
  canStartAgent(agentType?: string): boolean {
    if (this.activeAgents.size >= this.policy.maxConcurrentAgents) {
      return false;
    }

    if (agentType) {
      const current = this.typeCounters.get(agentType) || 0;
      const quota = this.policy.agentTypeQuota[agentType] || 5;
      if (current >= quota) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reset scheduler
   */
  reset(): void {
    this.queue = [];
    this.activeAgents.clear();
    this.typeCounters.clear();
    info('scheduler', 'Scheduler reset');
  }

  /**
   * Static reset
   */
  static reset(): void {
    if (AgentScheduler.instance) {
      AgentScheduler.instance.reset();
    }
    AgentScheduler.instance = null;
  }
}

/**
 * Get scheduler instance
 */
export function getAgentScheduler(): AgentScheduler {
  return AgentScheduler.getInstance();
}
