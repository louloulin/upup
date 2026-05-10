/**
 * Session Persistence — Cross-session memory for UpUp
 *
 * Maintains state across sessions:
 * - Session history with timestamps
 * - Research context persistence
 * - Learned patterns
 * - User preferences
 *
 * This extends the existing memory system with cross-session awareness.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getUpupDir } from '../utils/paths.js';
import { info, warn } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Research record from a session
 */
export interface ResearchRecord {
  id: string;
  query: string;
  tickers: string[];
  timestamp: number;
  findings: ResearchFinding[];
  decisions: string[];
}

/**
 * Research finding
 */
export interface ResearchFinding {
  type: 'positive' | 'negative' | 'neutral' | 'warning';
  category: string;
  title: string;
  description: string;
  source?: string;
}

/**
 * Learned investment pattern
 */
export interface LearnedPattern {
  id: string;
  name: string;
  description: string;
  trigger: string;
  confidence: number;
  examples: string[];
  timestamp: number;
}

/**
 * User investment preferences
 */
export interface UserPreferences {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  investmentHorizon: 'short' | 'medium' | 'long';
  sectors: string[];
  preferredStrategies: string[];
  watchlist: string[];
}

/**
 * Session state
 */
export interface SessionState {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  projectContext: string[];
  researchHistory: ResearchRecord[];
  preferences: UserPreferences;
  patterns: LearnedPattern[];
}

/**
 * Session summary for storage
 */
export interface SessionSummary {
  sessionId: string;
  date: string;
  duration: number;
  researchCount: number;
  decisions: string[];
  keyTopics: string[];
}

// ============================================================================
// Session Persistence Manager
// ============================================================================

const SESSION_DIR = 'sessions';

export class SessionPersistence {
  private static instance: SessionPersistence | null = null;
  private state: SessionState;
  private dirty = false;

  private constructor() {
    this.state = this.createDefaultState();
  }

  static getInstance(): SessionPersistence {
    if (!SessionPersistence.instance) {
      SessionPersistence.instance = new SessionPersistence();
    }
    return SessionPersistence.instance;
  }

  /**
   * Load state from disk
   */
  async load(): Promise<void> {
    try {
      const statePath = this.getStatePath();
      const content = await readFile(statePath, 'utf-8');
      const loaded = JSON.parse(content) as Partial<SessionState>;
      this.state = { ...this.createDefaultState(), ...loaded };
      info('agent', `Loaded session state: ${this.state.researchHistory.length} research records`);
    } catch {
      // State file doesn't exist yet, use defaults
      info('agent', 'No existing session state, starting fresh');
    }
  }

  /**
   * Save state to disk
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    try {
      await this.ensureDirectoryExists();
      const statePath = this.getStatePath();
      await writeFile(statePath, JSON.stringify(this.state, null, 2), 'utf-8');
      this.dirty = false;
      info('agent', 'Session state saved');
    } catch (e) {
      warn('agent', `Failed to save session state: ${e}`);
    }
  }

  /**
   * Start a new session
   */
  startSession(sessionId: string): void {
    this.state.sessionId = sessionId;
    this.state.lastActiveAt = Date.now();
    this.dirty = true;
    info('agent', `Started session: ${sessionId}`);
  }

  /**
   * Update last active time
   */
  touch(): void {
    this.state.lastActiveAt = Date.now();
    this.dirty = true;
  }

  /**
   * Add research to history
   */
  addResearch(record: Omit<ResearchRecord, 'id' | 'timestamp'>): void {
    const researchRecord: ResearchRecord = {
      ...record,
      id: `research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    this.state.researchHistory.push(researchRecord);

    // Keep only last 100 research records
    if (this.state.researchHistory.length > 100) {
      this.state.researchHistory = this.state.researchHistory.slice(-100);
    }

    this.dirty = true;
  }

  /**
   * Get recent research
   */
  getRecentResearch(limit = 10): ResearchRecord[] {
    return this.state.researchHistory.slice(-limit).reverse();
  }

  /**
   * Find research by ticker
   */
  findResearchByTicker(ticker: string): ResearchRecord[] {
    return this.state.researchHistory.filter(r =>
      r.tickers.some(t => t.toUpperCase() === ticker.toUpperCase())
    );
  }

  /**
   * Add learned pattern
   */
  addPattern(pattern: Omit<LearnedPattern, 'id' | 'timestamp'>): void {
    const learnedPattern: LearnedPattern = {
      ...pattern,
      id: `pattern-${Date.now()}`,
      timestamp: Date.now(),
    };
    this.state.patterns.push(learnedPattern);
    this.dirty = true;
  }

  /**
   * Get patterns
   */
  getPatterns(): LearnedPattern[] {
    return this.state.patterns;
  }

  /**
   * Update preferences
   */
  updatePreferences(prefs: Partial<UserPreferences>): void {
    this.state.preferences = { ...this.state.preferences, ...prefs };
    this.dirty = true;
  }

  /**
   * Get preferences
   */
  getPreferences(): UserPreferences {
    return { ...this.state.preferences };
  }

  /**
   * Add to project context
   */
  addProjectContext(context: string): void {
    if (!this.state.projectContext.includes(context)) {
      this.state.projectContext.push(context);
      // Keep last 50 context items
      if (this.state.projectContext.length > 50) {
        this.state.projectContext = this.state.projectContext.slice(-50);
      }
      this.dirty = true;
    }
  }

  /**
   * Get project context
   */
  getProjectContext(): string[] {
    return [...this.state.projectContext];
  }

  /**
   * Get session summary
   */
  getSummary(): SessionSummary {
    const sessionDuration = this.state.lastActiveAt - this.state.startedAt;
    const uniqueTickers = new Set(
      this.state.researchHistory.flatMap(r => r.tickers)
    );

    return {
      sessionId: this.state.sessionId,
      date: new Date(this.state.startedAt).toISOString().split('T')[0],
      duration: sessionDuration,
      researchCount: this.state.researchHistory.length,
      decisions: this.state.researchHistory.flatMap(r => r.decisions).slice(-10),
      keyTopics: [...uniqueTickers].slice(0, 5),
    };
  }

  /**
   * Get current state
   */
  getState(): SessionState {
    return { ...this.state };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private createDefaultState(): SessionState {
    return {
      sessionId: '',
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      projectContext: [],
      researchHistory: [],
      preferences: {
        riskTolerance: 'moderate',
        investmentHorizon: 'medium',
        sectors: [],
        preferredStrategies: [],
        watchlist: [],
      },
      patterns: [],
    };
  }

  private getStatePath(): string {
    return join(getUpupDir(), SESSION_DIR, 'state.json');
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = join(getUpupDir(), SESSION_DIR);
    await mkdir(dir, { recursive: true });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function getSessionPersistence(): SessionPersistence {
  return SessionPersistence.getInstance();
}

export async function loadSessionState(): Promise<void> {
  const session = SessionPersistence.getInstance();
  await session.load();
}

export async function saveSessionState(): Promise<void> {
  const session = SessionPersistence.getInstance();
  await session.save();
}
