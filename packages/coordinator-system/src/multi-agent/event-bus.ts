/**
 * Agent Event Bus - Agent事件总线 (v1.0)
 * 
 * 提供Agent间的发布-订阅事件系统:
 * - 发布/订阅模式
 * - 事件过滤
 * - 异步处理
 * - 事件历史
 */

import { info, warn, error as logError } from '@upup/utils/logging';

export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

export interface AgentEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: string;
  /** Event source (agent ID) */
  source: string;
  /** Event target (optional) */
  target?: string;
  /** Event payload */
  payload: T;
  /** Event priority */
  priority: EventPriority;
  /** Event timestamp */
  timestamp: number;
  /** Whether event should bubble to parent */
  bubbles: boolean;
  /** Event metadata */
  metadata?: Record<string, unknown>;
}

export type EventFilter = {
  type?: string | string[];
  source?: string;
  target?: string;
  priority?: EventPriority;
};

export type EventHandler<T = unknown> = (event: AgentEvent<T>) => void | Promise<void>;

export interface Subscription {
  id: string;
  handler: EventHandler;
  filter: EventFilter;
  once: boolean;
}

/**
 * Agent Event Bus - 发布-订阅事件系统
 */
export class AgentEventBus {
  private static instance: AgentEventBus | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number = 1000;
  private processingQueue: AgentEvent[] = [];
  private isProcessing: boolean = false;

  private constructor() {}

  static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  /**
   * Subscribe to events
   */
  subscribe<T = unknown>(
    handler: EventHandler<T>,
    filter: EventFilter = {},
    once: boolean = false
  ): () => void {
    const id = crypto.randomUUID();
    
    const subscription: Subscription = {
      id,
      handler: handler as EventHandler,
      filter,
      once,
    };

    this.subscriptions.set(id, subscription);
    
    info('event-bus', `Subscribed: ${id} for ${JSON.stringify(filter)}`);
    
    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
      info('event-bus', `Unsubscribed: ${id}`);
    };
  }

  /**
   * Subscribe once (auto-unsubscribe after first event)
   */
  subscribeOnce<T = unknown>(
    handler: EventHandler<T>,
    filter: EventFilter = {}
  ): () => void {
    return this.subscribe(handler, filter, true);
  }

  /**
   * Publish an event
   */
  async publish<T = unknown>(
    type: string,
    source: string,
    payload: T,
    options: {
      target?: string;
      priority?: EventPriority;
      bubbles?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const event: AgentEvent<T> = {
      id: crypto.randomUUID(),
      type,
      source,
      target: options.target,
      payload,
      priority: options.priority || 'normal',
      timestamp: Date.now(),
      bubbles: options.bubbles ?? true,
      metadata: options.metadata,
    };

    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Queue for processing
    this.queueEvent(event);
  }

  /**
   * Queue event for async processing
   */
  private queueEvent(event: AgentEvent): void {
    // Sort by priority
    const priorityOrder: Record<EventPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const insertIndex = this.processingQueue.findIndex(
      e => priorityOrder[e.priority] > priorityOrder[event.priority]
    );

    if (insertIndex === -1) {
      this.processingQueue.push(event);
    } else {
      this.processingQueue.splice(insertIndex, 0, event);
    }

    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process queued events
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const event = this.processingQueue.shift()!;
      await this.deliverEvent(event);
    }

    this.isProcessing = false;
  }

  /**
   * Deliver event to matching subscribers
   */
  private async deliverEvent(event: AgentEvent): Promise<void> {
    for (const [id, subscription] of this.subscriptions) {
      if (!this.matchesFilter(event, subscription.filter)) {
        continue;
      }

      try {
        await subscription.handler(event);
        
        // Remove if once subscription
        if (subscription.once) {
          this.subscriptions.delete(id);
        }
      } catch (e) {
        logError('event-bus', `Handler error for ${id}`, e instanceof Error ? e : undefined);
      }
    }
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: AgentEvent, filter: EventFilter): boolean {
    // Type filter
    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      if (!types.includes(event.type)) {
        return false;
      }
    }

    // Source filter
    if (filter.source && event.source !== filter.source) {
      return false;
    }

    // Target filter
    if (filter.target && event.target !== filter.target && event.target !== '*') {
      return false;
    }

    // Priority filter
    if (filter.priority) {
      const priorityOrder: Record<EventPriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      
      const filterPriority = priorityOrder[filter.priority];
      const eventPriority = priorityOrder[event.priority];
      
      // Only match if event priority >= filter priority
      if (eventPriority > filterPriority) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get event history
   */
  getHistory(filter?: EventFilter, limit?: number): AgentEvent[] {
    let events = this.eventHistory;
    
    if (filter) {
      events = events.filter(e => this.matchesFilter(e, filter));
    }
    
    if (limit) {
      events = events.slice(-limit);
    }
    
    return events;
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Reset event bus
   */
  reset(): void {
    this.subscriptions.clear();
    this.eventHistory = [];
    this.processingQueue = [];
    this.isProcessing = false;
    info('event-bus', 'Event bus reset');
  }

  /**
   * Static reset
   */
  static reset(): void {
    if (AgentEventBus.instance) {
      AgentEventBus.instance.reset();
    }
    AgentEventBus.instance = null;
  }
}

/**
 * Get event bus instance
 */
export function getEventBus(): AgentEventBus {
  return AgentEventBus.getInstance();
}

// Predefined event types
export const AgentEvents = {
  // Agent lifecycle
  AGENT_CREATED: 'agent:created',
  AGENT_STARTED: 'agent:started',
  AGENT_RUNNING: 'agent:running',
  AGENT_COMPLETED: 'agent:completed',
  AGENT_FAILED: 'agent:failed',
  AGENT_TERMINATED: 'agent:terminated',
  
  // Team events
  TEAM_CREATED: 'team:created',
  TEAM_MEMBER_ADDED: 'team:member_added',
  TEAM_MEMBER_REMOVED: 'team:member_removed',
  
  // Message events
  MESSAGE_SENT: 'message:sent',
  MESSAGE_RECEIVED: 'message:received',
  
  // Skill events
  SKILL_INVOKED: 'skill:invoked',
  SKILL_COMPLETED: 'skill:completed',
} as const;
