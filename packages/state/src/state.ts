/**
 * State Management - Centralized state store for UpUp
 *
 * Provides a simple, reactive state management system:
 * - AppState: Central state store with subscriptions
 * - CostTracker: Token usage and cost tracking
 * - SessionManager: Session management and history
 *
 * Based on Loucode's AppState architecture but simplified for UpUp.
 */

import { EventEmitter } from 'eventemitter3';

// ============================================================================
// AppState Types
// ============================================================================

export interface AppState {
  // Session info
  sessionId: string;
  sessionStartedAt: number;

  // Model info
  model: string;
  provider: string;

  // Token usage
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;

  // Cost tracking
  totalCostUSD: number;

  // Tool usage
  totalToolCalls: number;
  totalToolErrors: number;

  // Context
  messageCount: number;
  compactionCount: number;

  // MCP
  mcpServersConnected: number;
  mcpToolsRegistered: number;

  // Proactive mode
  proactiveActive: boolean;
  proactiveEventsCount: number;
}

export interface AppStateListeners {
  stateChange: (newState: AppState, oldState: AppState) => void;
}

// ============================================================================
// AppState Store
// ============================================================================

const DEFAULT_STATE: AppState = {
  sessionId: '',
  sessionStartedAt: Date.now(),
  model: 'gpt-5.4',
  provider: 'openai',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalCostUSD: 0,
  totalToolCalls: 0,
  totalToolErrors: 0,
  messageCount: 0,
  compactionCount: 0,
  mcpServersConnected: 0,
  mcpToolsRegistered: 0,
  proactiveActive: false,
  proactiveEventsCount: 0,
};

export class AppStateStore {
  private state: AppState;
  private listeners: Map<string, Set<(state: AppState) => void>> = new Map();
  private emitter = new EventEmitter();

  constructor(initialState?: Partial<AppState>) {
    this.state = {
      ...DEFAULT_STATE,
      ...initialState,
      sessionId: initialState?.sessionId ?? this.generateSessionId(),
    };
  }

  private generateSessionId(): string {
    return `upup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  setState(updates: Partial<AppState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Emit to all listeners
    this.emitter.emit('stateChange', this.state, oldState);
    this.notifyListeners();
  }

  subscribe(event: string, listener: (state: AppState) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  private notifyListeners(): void {
    const listeners = this.listeners.get('change');
    if (listeners) {
      listeners.forEach(listener => listener(this.state));
    }
  }

  // Convenience methods
  updateModel(model: string, provider: string): void {
    this.setState({ model, provider });
  }

  addTokens(inputTokens: number, outputTokens: number): void {
    this.setState({
      totalInputTokens: this.state.totalInputTokens + inputTokens,
      totalOutputTokens: this.state.totalOutputTokens + outputTokens,
      totalTokens: this.state.totalTokens + inputTokens + outputTokens,
    });
  }

  addCost(costUSD: number): void {
    this.setState({
      totalCostUSD: this.state.totalCostUSD + costUSD,
    });
  }

  incrementToolCalls(): void {
    this.setState({
      totalToolCalls: this.state.totalToolCalls + 1,
    });
  }

  incrementToolErrors(): void {
    this.setState({
      totalToolErrors: this.state.totalToolErrors + 1,
    });
  }

  incrementCompactionCount(): void {
    this.setState({
      compactionCount: this.state.compactionCount + 1,
    });
  }

  incrementMessageCount(): void {
    this.setState({
      messageCount: this.state.messageCount + 1,
    });
  }

  setMCPStatus(servers: number, tools: number): void {
    this.setState({
      mcpServersConnected: servers,
      mcpToolsRegistered: tools,
    });
  }

  setProactiveActive(active: boolean): void {
    this.setState({ proactiveActive: active });
  }

  incrementProactiveEvents(): void {
    this.setState({
      proactiveEventsCount: this.state.proactiveEventsCount + 1,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let appStateInstance: AppStateStore | null = null;

export function getAppState(): AppStateStore {
  if (!appStateInstance) {
    appStateInstance = new AppStateStore();
  }
  return appStateInstance;
}

export function resetAppState(): void {
  appStateInstance = null;
}

// ============================================================================
// Cost Calculator
// ============================================================================

export interface ModelCostConfig {
  inputCostPerMillion: number; // USD per million tokens
  outputCostPerMillion: number; // USD per million tokens
}

// Default pricing (can be updated via config)
const MODEL_COSTS: Record<string, ModelCostConfig> = {
  // OpenAI
  'gpt-5.4': { inputCostPerMillion: 2.5, outputCostPerMillion: 10 },
  'gpt-4.1': { inputCostPerMillion: 15, outputCostPerMillion: 60 },

  // Anthropic
  'claude-sonnet-4-6': { inputCostPerMillion: 3, outputCostPerMillion: 15 },
  'claude-opus-4-7': { inputCostPerMillion: 15, outputCostPerMillion: 75 },

  // Google
  'gemini-3-flash-preview': { inputCostPerMillion: 0.075, outputCostPerMillion: 0.3 },
  'gemini-3.1-pro-preview': { inputCostPerMillion: 1.25, outputCostPerMillion: 5 },

  // xAI
  'grok-4-0709': { inputCostPerMillion: 2, outputCostPerMillion: 10 },
  'grok-4-1-fast-reasoning': { inputCostPerMillion: 5, outputCostPerMillion: 15 },

  // DeepSeek
  'deepseek-v4-pro': { inputCostPerMillion: 0.5, outputCostPerMillion: 2 },
  'deepseek-v4-flash': { inputCostPerMillion: 0.1, outputCostPerMillion: 0.3 },

  // Default (assume GPT-4 pricing)
  'default': { inputCostPerMillion: 15, outputCostPerMillion: 60 },
};

export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const config = MODEL_COSTS[model] ?? MODEL_COSTS['default']!;

  const inputCost = (inputTokens / 1_000_000) * config.inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * config.outputCostPerMillion;

  return inputCost + outputCost;
}

export function formatCost(costUSD: number): string {
  if (costUSD < 0.001) {
    return `$${(costUSD * 1000).toFixed(3)}`;
  } else if (costUSD < 1) {
    return `$${costUSD.toFixed(4)}`;
  } else {
    return `$${costUSD.toFixed(2)}`;
  }
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  } else if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  } else {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
}

// ============================================================================
// Session Manager
// ============================================================================

export interface SessionRecord {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  model: string;
  provider: string;
  totalTokens: number;
  totalCostUSD: number;
  toolCalls: number;
  messageCount: number;
}

export class SessionManager {
  private currentSession: SessionRecord;
  private sessions: SessionRecord[] = [];

  constructor() {
    this.currentSession = this.createNewSession();
  }

  private createNewSession(): SessionRecord {
    return {
      sessionId: `upup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      startedAt: Date.now(),
      model: 'gpt-5.4',
      provider: 'openai',
      totalTokens: 0,
      totalCostUSD: 0,
      toolCalls: 0,
      messageCount: 0,
    };
  }

  getCurrentSession(): SessionRecord {
    return this.currentSession;
  }

  getSessionDuration(): number {
    return Date.now() - this.currentSession.startedAt;
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  updateSession(updates: Partial<SessionRecord>): void {
    this.currentSession = { ...this.currentSession, ...updates };
  }

  endSession(): void {
    this.currentSession.endedAt = Date.now();
    this.sessions.push(this.currentSession);
  }

  startNewSession(): SessionRecord {
    this.endSession();
    this.currentSession = this.createNewSession();
    return this.currentSession;
  }

  getSessions(limit = 10): SessionRecord[] {
    return this.sessions.slice(-limit).reverse();
  }

  getTotalStats(): {
    totalSessions: number;
    totalTokens: number;
    totalCostUSD: number;
    totalToolCalls: number;
  } {
    return this.sessions.reduce(
      (acc, session) => ({
        totalSessions: acc.totalSessions + 1,
        totalTokens: acc.totalTokens + session.totalTokens,
        totalCostUSD: acc.totalCostUSD + session.totalCostUSD,
        totalToolCalls: acc.totalToolCalls + session.toolCalls,
      }),
      { totalSessions: 0, totalTokens: 0, totalCostUSD: 0, totalToolCalls: 0 },
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}

// ============================================================================
// Cost Tracker (enhanced version)
// ============================================================================

export interface CostSnapshot {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export class CostTracker {
  private snapshots: CostSnapshot[] = [];
  private currentSessionStart: number = Date.now();

  getSnapshot(): CostSnapshot {
    const state = getAppState().getState();
    return {
      timestamp: Date.now(),
      inputTokens: state.totalInputTokens,
      outputTokens: state.totalOutputTokens,
      costUSD: state.totalCostUSD,
    };
  }

  recordSnapshot(): void {
    this.snapshots.push(this.getSnapshot());
    // Keep last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots.shift();
    }
  }

  getSnapshots(limit?: number): CostSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }

  getSessionRate(): number {
    const state = getAppState().getState();
    const duration = Date.now() - this.currentSessionStart;
    const hours = duration / (1000 * 60 * 60);
    return hours > 0 ? state.totalCostUSD / hours : 0;
  }

  reset(): void {
    this.snapshots = [];
    this.currentSessionStart = Date.now();
  }
}

// ============================================================================
// Exports
// ============================================================================

export const defaultState = DEFAULT_STATE;
