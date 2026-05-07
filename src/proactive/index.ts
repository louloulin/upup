/**
 * Proactive Mode - Event-driven background processing
 *
 * Provides a proactive event system that allows Dexter to:
 * - Process events in the background
 * - Trigger actions based on events
 * - Maintain awareness of system state
 *
 * Based on Loucode's proactive architecture.
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Core event types for proactive mode
 */
export type ProactiveEventType =
  | 'tick'
  | 'task:fired'
  | 'task:completed'
  | 'task:failed'
  | 'assistant:dream'
  | 'cron:triggered'
  | 'mcp:connected'
  | 'mcp:disconnected'
  | 'memory:updated'
  | 'system:idle'
  | 'system:busy';

/**
 * Proactive event structure
 */
export interface ProactiveEvent {
  type: ProactiveEventType;
  timestamp: Date;
  data?: Record<string, unknown>;
  source?: string;
}

// ============================================================================
// Event Bus
// ============================================================================

/**
 * Event listener callback
 */
export type EventListener = (event: ProactiveEvent) => void | Promise<void>;

/**
 * Event bus for pub/sub communication
 */
class EventBus {
  private listeners: Map<ProactiveEventType, Set<EventListener>> = new Map();
  private wildcardListeners: Set<EventListener> = new Set();
  private eventHistory: ProactiveEvent[] = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType: ProactiveEventType, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events (wildcard)
   */
  subscribeAll(listener: EventListener): () => void {
    this.wildcardListeners.add(listener);
    return () => {
      this.wildcardListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  async emit(event: ProactiveEvent): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      await Promise.all(
        Array.from(typeListeners).map(listener =>
          this.safeInvoke(listener, event)
        )
      );
    }

    // Notify wildcard listeners
    await Promise.all(
      Array.from(this.wildcardListeners).map(listener =>
        this.safeInvoke(listener, event)
      )
    );
  }

  /**
   * Safely invoke a listener, catching any errors
   */
  private async safeInvoke(listener: EventListener, event: ProactiveEvent): Promise<void> {
    try {
      await listener(event);
    } catch (error) {
      console.error('[Proactive] Event listener error:', error);
    }
  }

  /**
   * Get recent event history
   */
  getHistory(limit?: number): ProactiveEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: ProactiveEventType): ProactiveEvent[] {
    return this.eventHistory.filter(e => e.type === type);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }
}

// ============================================================================
// Proactive State
// ============================================================================

/**
 * Proactive mode state
 */
export interface ProactiveState {
  active: boolean;
  paused: boolean;
  contextBlocked: boolean;
  lastTickAt: Date | null;
  nextTickAt: Date | null;
  tickIntervalMs: number;
}

/**
 * Proactive state change listener
 */
export type StateChangeListener = (state: ProactiveState) => void;

// ============================================================================
// Proactive Controller
// ============================================================================

/**
 * Main proactive mode controller
 */
export class ProactiveController {
  private state: ProactiveState = {
    active: false,
    paused: false,
    contextBlocked: false,
    lastTickAt: null,
    nextTickAt: null,
    tickIntervalMs: 60000, // 1 minute default
  };

  private eventBus: EventBus;
  private stateListeners: Set<StateChangeListener> = new Set();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private idleCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || new EventBus();
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  /**
   * Get current proactive state
   */
  getState(): ProactiveState {
    return { ...this.state };
  }

  /**
   * Check if proactive mode is active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Check if proactive mode is paused
   */
  isPaused(): boolean {
    return this.state.paused;
  }

  /**
   * Check if context is blocked
   */
  isContextBlocked(): boolean {
    return this.state.contextBlocked;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Emit state change to listeners
   */
  private emitStateChange(): void {
    const state = this.getState();
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[Proactive] State listener error:', error);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Control Methods
  // ---------------------------------------------------------------------------

  /**
   * Activate proactive mode
   */
  activate(): void {
    if (this.state.active) return;

    this.state.active = true;
    this.state.paused = false;
    this.state.nextTickAt = null;

    this.emitStateChange();
    this.eventBus.emit({
      type: 'system:busy',
      timestamp: new Date(),
      data: { reason: 'proactive_activated' },
    });

    console.log('[Proactive] Mode activated');
  }

  /**
   * Deactivate proactive mode
   */
  deactivate(): void {
    if (!this.state.active) return;

    this.state.active = false;
    this.state.paused = false;
    this.state.nextTickAt = null;

    this.stopTickTimer();
    this.stopIdleCheck();

    this.emitStateChange();
    this.eventBus.emit({
      type: 'system:idle',
      timestamp: new Date(),
      data: { reason: 'proactive_deactivated' },
    });

    console.log('[Proactive] Mode deactivated');
  }

  /**
   * Pause proactive processing
   */
  pause(): void {
    if (!this.state.active || this.state.paused) return;

    this.state.paused = true;
    this.state.nextTickAt = null;
    this.stopTickTimer();

    this.emitStateChange();
    console.log('[Proactive] Mode paused');
  }

  /**
   * Resume proactive processing
   */
  resume(): void {
    if (!this.state.active || !this.state.paused) return;

    this.state.paused = false;
    this.emitStateChange();
    console.log('[Proactive] Mode resumed');
  }

  /**
   * Set context blocked state
   */
  setContextBlocked(blocked: boolean): void {
    this.state.contextBlocked = blocked;
    this.emitStateChange();
  }

  /**
   * Set tick interval
   */
  setTickInterval(intervalMs: number): void {
    this.state.tickIntervalMs = intervalMs;
    if (this.state.active && !this.state.paused) {
      this.restartTickTimer();
    }
  }

  // ---------------------------------------------------------------------------
  // Event Emission
  // ---------------------------------------------------------------------------

  /**
   * Emit an event
   */
  async emit(type: ProactiveEventType, data?: Record<string, unknown>): Promise<void> {
    await this.eventBus.emit({
      type,
      timestamp: new Date(),
      data,
    });
  }

  /**
   * Subscribe to specific event type
   */
  on(eventType: ProactiveEventType, listener: EventListener): () => void {
    return this.eventBus.subscribe(eventType, listener);
  }

  /**
   * Subscribe to all events
   */
  onAny(listener: EventListener): () => void {
    return this.eventBus.subscribeAll(listener);
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number): ProactiveEvent[] {
    return this.eventBus.getHistory(limit);
  }

  // ---------------------------------------------------------------------------
  // Tick System
  // ---------------------------------------------------------------------------

  /**
   * Start the tick timer
   */
  private startTickTimer(): void {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      if (!this.state.active || this.state.paused || this.state.contextBlocked) {
        return;
      }

      this.state.lastTickAt = new Date();
      this.emit('tick', { timestamp: this.state.lastTickAt.toISOString() });
    }, this.state.tickIntervalMs);
  }

  /**
   * Stop the tick timer
   */
  private stopTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * Restart the tick timer (after interval change)
   */
  private restartTickTimer(): void {
    this.stopTickTimer();
    this.startTickTimer();
  }

  /**
   * Start idle check (for dynamic tick scheduling)
   */
  private startIdleCheck(): void {
    if (this.idleCheckTimer) return;

    // Check every 5 seconds if we should emit a tick
    this.idleCheckTimer = setTimeout(async () => {
      if (this.state.active && !this.state.paused && !this.state.contextBlocked) {
        // Emit idle tick
        this.state.lastTickAt = new Date();
        await this.emit('system:idle', {
          timestamp: this.state.lastTickAt.toISOString(),
        });
      }
      this.startIdleCheck();
    }, 5000);
  }

  /**
   * Stop idle check
   */
  private stopIdleCheck(): void {
    if (this.idleCheckTimer) {
      clearTimeout(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stopTickTimer();
    this.stopIdleCheck();
    this.stateListeners.clear();
    this.eventBus.clearHistory();
    console.log('[Proactive] Controller disposed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultController: ProactiveController | null = null;

/**
 * Get the default proactive controller
 */
export function getProactiveController(): ProactiveController {
  if (!defaultController) {
    defaultController = new ProactiveController();
  }
  return defaultController;
}

/**
 * Reset the default controller (for testing)
 */
export function resetProactiveController(): void {
  if (defaultController) {
    defaultController.dispose();
  }
  defaultController = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Shorthand for getProactiveController().activate()
 */
export function activateProactive(): void {
  getProactiveController().activate();
}

/**
 * Shorthand for getProactiveController().deactivate()
 */
export function deactivateProactive(): void {
  getProactiveController().deactivate();
}

/**
 * Shorthand for getProactiveController().isActive()
 */
export function isProactiveActive(): boolean {
  return getProactiveController().isActive();
}

/**
 * Shorthand for getProactiveController().isPaused()
 */
export function isProactivePaused(): boolean {
  return getProactiveController().isPaused();
}

/**
 * Shorthand for getProactiveController().emit()
 */
export async function emitProactiveEvent(
  type: ProactiveEventType,
  data?: Record<string, unknown>
): Promise<void> {
  await getProactiveController().emit(type, data);
}

/**
 * Shorthand for getProactiveController().on()
 */
export function onProactiveEvent(
  eventType: ProactiveEventType,
  listener: EventListener
): () => void {
  return getProactiveController().on(eventType, listener);
}
