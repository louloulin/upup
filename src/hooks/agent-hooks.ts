/**
 * Agent Hooks - Reactive utility modules for the agent loop
 *
 * Provides 8 hooks that enhance agent behavior:
 * - useMemoryUsage: Monitor and react to memory pressure
 * - useMergedClients: Merge multiple MCP client connections
 * - useCommandQueue: Manage command queuing and batching
 * - useDynamicConfig: Hot-reload configuration changes
 * - useSessionBackgrounding: Background session management
 * - useToolMetrics: Track tool execution metrics (count, timing, success/failure)
 * - useSessionRecovery: Auto-save and recover session state
 * - useContextWatchdog: Monitor context window usage and warn before overflow
 *
 * Reference: Claude Code's 89 hooks (simplified for Dexter's architecture)
 */

import { EventEmitter } from 'events';

// ============================================================================
// useMemoryUsage - Memory monitoring hook
// ============================================================================

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  timestamp: number;
}

export interface MemoryThreshold {
  /** Heap usage percentage (0-1) that triggers warning */
  warningThreshold: number;
  /** Heap usage percentage (0-1) that triggers critical */
  criticalThreshold: number;
}

const DEFAULT_MEMORY_THRESHOLD: MemoryThreshold = {
  warningThreshold: 0.75,
  criticalThreshold: 0.9,
};

export class MemoryMonitor extends EventEmitter {
  private stats: MemoryStats | null = null;
  private threshold: MemoryThreshold;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(threshold?: Partial<MemoryThreshold>) {
    super();
    this.threshold = { ...DEFAULT_MEMORY_THRESHOLD, ...threshold };
  }

  start(pollIntervalMs: number = 5000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.poll(), pollIntervalMs);
    this.poll();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getStats(): MemoryStats | null {
    return this.stats;
  }

  isWarning(): boolean {
    if (!this.stats) return false;
    const usage = this.stats.heapUsed / this.stats.heapTotal;
    return usage >= this.threshold.warningThreshold;
  }

  isCritical(): boolean {
    if (!this.stats) return false;
    const usage = this.stats.heapUsed / this.stats.heapTotal;
    return usage >= this.threshold.criticalThreshold;
  }

  private poll(): void {
    const mem = process.memoryUsage();
    this.stats = {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      timestamp: Date.now(),
    };

    const usage = mem.heapUsed / mem.heapTotal;
    if (usage >= this.threshold.criticalThreshold) {
      this.emit('critical', this.stats);
      useHookEventBus().emitEvent({ type: 'memory:critical', source: 'useMemoryUsage', payload: this.stats });
    } else if (usage >= this.threshold.warningThreshold) {
      this.emit('warning', this.stats);
      useHookEventBus().emitEvent({ type: 'memory:warning', source: 'useMemoryUsage', payload: this.stats });
    }
  }
}

export function useMemoryUsage(threshold?: Partial<MemoryThreshold>): MemoryMonitor {
  return new MemoryMonitor(threshold);
}

// ============================================================================
// useMergedClients - MCP client merging
// ============================================================================

export interface MergedClient {
  name: string;
  tools: string[];
  connected: boolean;
}

export class MergedClientRegistry {
  private clients: Map<string, MergedClient> = new Map();

  register(name: string, tools: string[]): void {
    this.clients.set(name, { name, tools, connected: true });
  }

  unregister(name: string): void {
    const client = this.clients.get(name);
    if (client) {
      client.connected = false;
    }
  }

  getMergedTools(): string[] {
    const allTools: Set<string> = new Set();
    for (const client of this.clients.values()) {
      if (client.connected) {
        for (const tool of client.tools) {
          allTools.add(tool);
        }
      }
    }
    return [...allTools].sort();
  }

  getClients(): MergedClient[] {
    return [...this.clients.values()];
  }

  getClient(name: string): MergedClient | undefined {
    return this.clients.get(name);
  }

  getConnectedCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.connected) count++;
    }
    return count;
  }
}

let mergedRegistry: MergedClientRegistry | null = null;

export function useMergedClients(): MergedClientRegistry {
  if (!mergedRegistry) {
    mergedRegistry = new MergedClientRegistry();
  }
  return mergedRegistry;
}

// ============================================================================
// useCommandQueue - Command queuing and batching
// ============================================================================

export interface QueuedCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
  enqueuedAt: number;
  priority: number;
}

export class CommandQueue {
  private queue: QueuedCommand[] = [];
  private counter: number = 0;

  enqueue(command: string, args: Record<string, unknown> = {}, priority: number = 0): string {
    const id = `cmd-${++this.counter}`;
    this.queue.push({ id, command, args, enqueuedAt: Date.now(), priority });
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    return id;
  }

  dequeue(): QueuedCommand | undefined {
    return this.queue.shift();
  }

  dequeueBatch(maxBatchSize: number = 10): QueuedCommand[] {
    const batch = this.queue.splice(0, maxBatchSize);
    return batch;
  }

  peek(): QueuedCommand | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
  }

  findByCommand(command: string): QueuedCommand[] {
    return this.queue.filter(c => c.command === command);
  }

  remove(id: string): boolean {
    const index = this.queue.findIndex(c => c.id === id);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }
}

export function useCommandQueue(): CommandQueue {
  return new CommandQueue();
}

// ============================================================================
// useDynamicConfig - Hot-reload configuration
// ============================================================================

export type ConfigValue = string | number | boolean | Record<string, unknown> | unknown[];

export interface ConfigEntry {
  key: string;
  value: ConfigValue;
  updatedAt: number;
}

export class DynamicConfig {
  private config: Map<string, ConfigEntry> = new Map();
  private watchers: Map<string, Set<(key: string, value: ConfigValue, oldValue: ConfigValue | undefined) => void>> = new Map();

  get(key: string, defaultValue?: ConfigValue): ConfigValue | undefined {
    const entry = this.config.get(key);
    return entry?.value ?? defaultValue;
  }

  set(key: string, value: ConfigValue): void {
    const oldValue = this.config.get(key)?.value;
    this.config.set(key, { key, value, updatedAt: Date.now() });
    this.notifyWatchers(key, value, oldValue);
  }

  delete(key: string): boolean {
    const existed = this.config.delete(key);
    if (existed) {
      this.notifyWatchers(key, undefined, undefined);
    }
    return existed;
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  keys(): string[] {
    return [...this.config.keys()];
  }

  getAll(): Record<string, ConfigValue> {
    const result: Record<string, ConfigValue> = {};
    for (const [key, entry] of this.config) {
      result[key] = entry.value;
    }
    return result;
  }

  watch(key: string, callback: (key: string, value: ConfigValue, oldValue: ConfigValue | undefined) => void): () => void {
    let watchers = this.watchers.get(key);
    if (!watchers) {
      watchers = new Set();
      this.watchers.set(key, watchers);
    }
    watchers.add(callback);

    return () => {
      watchers!.delete(callback);
    };
  }

  watchAll(callback: (key: string, value: ConfigValue, oldValue: ConfigValue | undefined) => void): () => void {
    const unsubscribes: (() => void)[] = [];
    // Watch a special wildcard pattern
    for (const key of this.config.keys()) {
      unsubscribes.push(this.watch(key, callback));
    }
    return () => unsubscribes.forEach(fn => fn());
  }

  private notifyWatchers(key: string, value: ConfigValue | undefined, oldValue: ConfigValue | undefined): void {
    const watchers = this.watchers.get(key);
    if (watchers) {
      for (const watcher of watchers) {
        try {
          watcher(key, value as ConfigValue, oldValue);
        } catch {
          // Watcher errors should not propagate
        }
      }
    }
  }
}

let dynamicConfig: DynamicConfig | null = null;

export function useDynamicConfig(): DynamicConfig {
  if (!dynamicConfig) {
    dynamicConfig = new DynamicConfig();
  }
  return dynamicConfig;
}

// ============================================================================
// useSessionBackgrounding - Background session management
// ============================================================================

export type SessionStatus = 'active' | 'backgrounded' | 'suspended' | 'restored';

export interface SessionState {
  id: string;
  status: SessionStatus;
  lastActiveAt: number;
  backgroundedAt: number | null;
  metadata: Record<string, unknown>;
}

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private activeSessionId: string | null = null;

  create(id: string, metadata: Record<string, unknown> = {}): SessionState {
    const state: SessionState = {
      id,
      status: 'active',
      lastActiveAt: Date.now(),
      backgroundedAt: null,
      metadata,
    };
    this.sessions.set(id, state);
    this.activeSessionId = id;
    return state;
  }

  background(id: string): SessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.status = 'backgrounded';
    session.backgroundedAt = Date.now();
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    return session;
  }

  restore(id: string): SessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.status = 'restored';
    session.lastActiveAt = Date.now();
    session.backgroundedAt = null;
    this.activeSessionId = id;
    return session;
  }

  suspend(id: string): SessionState | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.status = 'suspended';
    return session;
  }

  getActive(): SessionState | undefined {
    if (!this.activeSessionId) return undefined;
    return this.sessions.get(this.activeSessionId);
  }

  get(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  list(): SessionState[] {
    return [...this.sessions.values()];
  }

  listBackgrounded(): SessionState[] {
    return [...this.sessions.values()].filter(s => s.status === 'backgrounded');
  }

  remove(id: string): boolean {
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    return this.sessions.delete(id);
  }

  size(): number {
    return this.sessions.size;
  }
}

let sessionManager: SessionManager | null = null;

export function useSessionBackgrounding(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

// ============================================================================
// useToolMetrics - Track tool execution metrics
// ============================================================================

export interface ToolStats {
  calls: number;
  successes: number;
  avgMs: number;
}

export interface ToolMetrics {
  totalCalls: number;
  successRate: number;
  avgDuration: number;
  byTool: Map<string, ToolStats>;
}

export class ToolMetricsCollector extends EventEmitter {
  private byTool: Map<string, ToolStats> = new Map();
  private totalCalls: number = 0;
  private totalSuccesses: number = 0;
  private totalDuration: number = 0;
  private callThreshold: number;
  private reportInterval: ReturnType<typeof setInterval> | null = null;

  constructor(callThreshold: number = 100) {
    super();
    this.callThreshold = callThreshold;
  }

  start(reportIntervalMs: number = 10000): void {
    if (this.reportInterval) return;
    this.reportInterval = setInterval(() => this.report(), reportIntervalMs);
  }

  stop(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  recordExecution(tool: string, duration: number, success: boolean): void {
    this.totalCalls++;
    this.totalDuration += duration;
    if (success) this.totalSuccesses++;

    let stats = this.byTool.get(tool);
    if (!stats) {
      stats = { calls: 0, successes: 0, avgMs: 0 };
      this.byTool.set(tool, stats);
    }
    stats.calls++;
    if (success) stats.successes++;
    // Running average
    stats.avgMs = stats.avgMs + (duration - stats.avgMs) / stats.calls;

    if (stats.calls > this.callThreshold) {
      this.emit('threshold_exceeded', { tool, calls: stats.calls });
    }
  }

  getMetrics(): ToolMetrics {
    return {
      totalCalls: this.totalCalls,
      successRate: this.totalCalls > 0 ? this.totalSuccesses / this.totalCalls : 0,
      avgDuration: this.totalCalls > 0 ? this.totalDuration / this.totalCalls : 0,
      byTool: new Map(this.byTool),
    };
  }

  private report(): void {
    const metrics = this.getMetrics();
    this.emit('metrics_report', metrics);
  }
}

let toolMetricsCollector: ToolMetricsCollector | null = null;

export function useToolMetrics(callThreshold?: number): ToolMetricsCollector {
  if (!toolMetricsCollector) {
    toolMetricsCollector = new ToolMetricsCollector(callThreshold);
  }
  return toolMetricsCollector;
}

// ============================================================================
// useSessionRecovery - Auto-save and recover session state
// ============================================================================

export interface SavedSession {
  id: string;
  state: Record<string, unknown>;
  savedAt: number;
}

export class SessionRecovery extends EventEmitter {
  private sessions: Map<string, SavedSession> = new Map();
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  private autoSaveMs: number;
  private autoSaveCallback: (() => void) | null = null;

  constructor(autoSaveMs: number = 30000) {
    super();
    this.autoSaveMs = autoSaveMs;
  }

  start(onAutoSave?: () => void): void {
    if (this.autoSaveInterval) return;
    this.autoSaveCallback = onAutoSave ?? null;
    this.autoSaveInterval = setInterval(() => {
      if (this.autoSaveCallback) {
        this.autoSaveCallback();
      }
    }, this.autoSaveMs);
  }

  stop(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      this.autoSaveCallback = null;
    }
  }

  async saveSession(sessionId: string, state: Record<string, unknown>): Promise<void> {
    this.sessions.set(sessionId, {
      id: sessionId,
      state,
      savedAt: Date.now(),
    });
    this.emit('session_saved', { sessionId, savedAt: Date.now() });
  }

  async recoverSession(sessionId: string): Promise<Record<string, unknown> | null> {
    const saved = this.sessions.get(sessionId);
    if (!saved) return null;
    this.emit('session_recovered', { sessionId, recoveredAt: Date.now() });
    return saved.state;
  }

  listSessions(): string[] {
    return [...this.sessions.keys()];
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  getSavedAt(sessionId: string): number | null {
    return this.sessions.get(sessionId)?.savedAt ?? null;
  }
}

let sessionRecovery: SessionRecovery | null = null;

export function useSessionRecovery(autoSaveMs?: number): SessionRecovery {
  if (!sessionRecovery) {
    sessionRecovery = new SessionRecovery(autoSaveMs);
  }
  return sessionRecovery;
}

// ============================================================================
// useContextWatchdog - Monitor context window usage
// ============================================================================

export interface ContextCheckResult {
  usage: number;
  limit: number;
  percent: number;
  status: 'ok' | 'warning' | 'critical';
}

export class ContextWatchdog extends EventEmitter {
  private tokenCount: number = 0;
  private limit: number;
  private warningThreshold: number;
  private criticalThreshold: number;

  constructor(
    limit: number = 200000,
    warningThreshold: number = 0.8,
    criticalThreshold: number = 0.95,
  ) {
    super();
    this.limit = limit;
    this.warningThreshold = warningThreshold;
    this.criticalThreshold = criticalThreshold;
  }

  start(): void {
    // Watchdog is passive; no periodic timer needed.
    // It reacts to explicit token count updates.
  }

  stop(): void {
    this.removeAllListeners();
  }

  getTokenCount(): number {
    return this.tokenCount;
  }

  setTokenCount(count: number): void {
    const previousStatus = this.check().status;
    this.tokenCount = count;
    const currentStatus = this.check().status;

    if (currentStatus === 'critical' && previousStatus !== 'critical') {
      this.emit('critical', this.check());
    } else if (currentStatus === 'warning' && previousStatus !== 'warning') {
      this.emit('warning', this.check());
    }
  }

  setLimit(limit: number): void {
    this.limit = limit;
  }

  getLimit(): number {
    return this.limit;
  }

  check(): ContextCheckResult {
    const percent = this.limit > 0 ? this.tokenCount / this.limit : 0;
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (percent >= this.criticalThreshold) {
      status = 'critical';
    } else if (percent >= this.warningThreshold) {
      status = 'warning';
    }
    return {
      usage: this.tokenCount,
      limit: this.limit,
      percent,
      status,
    };
  }
}

let contextWatchdog: ContextWatchdog | null = null;

export function useContextWatchdog(limit?: number, warningThreshold?: number, criticalThreshold?: number): ContextWatchdog {
  if (!contextWatchdog) {
    contextWatchdog = new ContextWatchdog(limit, warningThreshold, criticalThreshold);
  }
  return contextWatchdog;
}

// ============================================================================
// HookEventBus - Central event bus for inter-hook communication
// ============================================================================

export interface HookEvent {
  type: string;
  source: string;
  payload: unknown;
  timestamp: number;
}

export type HookEventHandler = (event: HookEvent) => void;

/**
 * Central event bus that allows hooks to communicate with each other.
 * Any hook can emit events, and any hook can subscribe to events.
 *
 * Example usage:
 *   bus.on('memory:critical', (e) => { ... });
 *   bus.emit({ type: 'memory:critical', source: 'useMemoryUsage', payload: stats });
 */
export class HookEventBus extends EventEmitter {
  private history: HookEvent[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 100) {
    super();
    this.maxHistory = maxHistory;
  }

  /**
   * Emit a typed hook event to all listeners.
   */
  emitEvent(event: Omit<HookEvent, 'timestamp'>): void {
    const fullEvent: HookEvent = {
      ...event,
      timestamp: Date.now(),
    };
    this.history.push(fullEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.emit(event.type, fullEvent);
    this.emit('*', fullEvent); // Wildcard listener
  }

  /**
   * Subscribe to events of a specific type, or '*' for all events.
   */
  onEvent(type: string, handler: HookEventHandler): () => void {
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  /**
   * Get recent event history (optionally filtered by type).
   */
  getHistory(type?: string): HookEvent[] {
    if (type) {
      return this.history.filter(e => e.type === type);
    }
    return [...this.history];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history = [];
  }
}

let hookEventBus: HookEventBus | null = null;

export function useHookEventBus(maxHistory?: number): HookEventBus {
  if (!hookEventBus) {
    hookEventBus = new HookEventBus(maxHistory);
  }
  return hookEventBus;
}

// ============================================================================
// Module Exports
// ============================================================================
