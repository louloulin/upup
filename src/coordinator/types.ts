/**
 * Coordinator shared types.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 *      openspec/changes/top-tier-investment-assistant/specs/subagent
 */

export type WorkerRole =
  | 'technical-analysis'
  | 'fundamental-analysis'
  | 'capital-flow'
  | 'sentiment-analysis';

export type Phase = 'research' | 'synthesis' | 'implementation' | 'verification';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface Task {
  id: string;
  /** Free-form title shown in the shared list. */
  title: string;
  /** Owning role / worker; null for coordinator-synthesized tasks. */
  assignee?: WorkerRole | 'coordinator';
  status: TaskStatus;
  phase: Phase;
  notes?: string;
  /** Outputs / artifacts written by the worker, surfaced in the shared list. */
  artifacts?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkerConfig {
  role: WorkerRole;
  /** Tools this worker is allowed to call. */
  allowedTools: string[];
  /** Initial prompt seeded into the worker. */
  systemPrompt: string;
  /** Max agent-loop turns for the worker. */
  maxTurns: number;
}

export interface ResearchResult {
  role: WorkerRole;
  symbol: string;
  /** Free-form structured output the worker produced. */
  findings: Record<string, unknown>;
  confidence: number;
  completedAt: number;
}

export interface CoordinatorDeps {
  /** File-based shared task list, persisted to disk. */
  taskList: TaskList;
  /** Optional event bus; emitted when tasks transition. */
  bus?: import('../core/event-bus.js').EventBus;
  /** Default worker templates, overrideable in tests. */
  workers?: Record<WorkerRole, WorkerConfig>;
  /** Default task-list directory. Default `~/.upup/coordinator/tasks/`. */
  rootDir?: string;
  /** Optional clock for tests. */
  now?: () => number;
  /**
   * v2 (Sprint 2.1.3): wrap each successful Worker result in a
   * <task-notification> XML block. The XML appears in
   * `CoordinatorRunResult.researchXml` so the main Agent can inject the
   * blocks into its own conversation context. Off by default so the v1
   * 4-phase flow is unchanged for existing callers.
   */
  wrapInXml?: boolean;
}

/**
 * Minimal file-based task list interface so the coordinator can be exercised
 * without depending on a real filesystem in tests.
 */
export interface TaskList {
  create(task: Omit<Task, 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskStatus }): Promise<Task>;
  update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task>;
  get(id: string): Promise<Task | null>;
  list(filter?: { phase?: Phase; assignee?: WorkerRole | 'coordinator'; status?: TaskStatus }): Promise<Task[]>;
  /** Path on disk; surfaced in artifacts and logs. */
  readonly path: string;
}

export const DEFAULT_WORKER_TEMPLATES: Record<WorkerRole, WorkerConfig> = {
  'technical-analysis': {
    role: 'technical-analysis',
    allowedTools: [
      'financial_search',
      'get_financial_metrics',
      'web_search',
      'skill:dcf',
      'skill:backtest-dca',
    ],
    systemPrompt:
      'You are a technical analyst. Focus on price action, volume, momentum, chart patterns, and key technical levels. Output a structured findings object with trend, support/resistance, momentum indicators, and trade triggers.',
    maxTurns: 8,
  },
  'fundamental-analysis': {
    role: 'fundamental-analysis',
    allowedTools: [
      'financial_search',
      'get_financial_metrics',
      'read_filings',
      'web_search',
      'skill:dcf',
    ],
    systemPrompt:
      'You are a fundamental analyst. Focus on revenue/earnings quality, valuation (PE/PB/EV/EBITDA), ROE/ROIC, balance-sheet strength, moat. Output structured findings with valuation verdict and key risks.',
    maxTurns: 8,
  },
  'capital-flow': {
    role: 'capital-flow',
    allowedTools: [
      'financial_search',
      'web_search',
      'skill:fund-flow',
    ],
    systemPrompt:
      'You are a capital-flow analyst. Focus on main-board net inflow/outflow, northbound flow, institutional holdings, block trades, margin financing. Output structured findings with flow direction and conviction.',
    maxTurns: 6,
  },
  'sentiment-analysis': {
    role: 'sentiment-analysis',
    allowedTools: [
      'web_search',
      'browser',
      'skill:news-sentiment',
    ],
    systemPrompt:
      'You are a sentiment analyst. Focus on news tone, social media chatter, analyst rating changes, insider transactions. Output structured findings with sentiment score in [-1, 1] and key catalysts.',
    maxTurns: 6,
  },
};
