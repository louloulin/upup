/**
 * Subagent System - Core Types and Interfaces
 *
 * Provides subagent/spawn capabilities for UpUp, enabling:
 * - Spawning child agents for parallel task execution
 * - Context inheritance from parent agent
 * - Background task execution with lifecycle management
 * - Tool isolation and permission modes
 */

import type { StructuredToolInterface } from '@langchain/core/tools';

/**
 * Subagent types supported by the system
 */
export type SubagentType =
  | 'general'      // General purpose agent
  | 'specialized'  // Specialized for specific tasks
  | 'fork';        // Implicit fork with full context inheritance

/**
 * Permission modes for subagent execution
 */
export type PermissionMode =
  | 'default'      // Use parent agent's permission settings
  | 'bubble'       // Surface permission prompts to parent terminal
  | 'plan';        // Require plan approval before execution

/**
 * Isolation modes for subagent execution
 */
export type IsolationMode =
  | 'none'         // Same working directory as parent
  | 'worktree';    // Isolated git worktree

/**
 * Subagent configuration
 */
export interface SubagentConfig {
  /** Unique identifier for the subagent */
  id?: string;
  /** Human-readable name */
  name?: string;
  /** Subagent type */
  type: SubagentType;
  /** Tools available to the subagent (array of tool names or '*' for all) */
  tools: string[] | '*';
  /** Maximum number of turns (iterations) */
  maxTurns?: number;
  /** Maximum tokens to consume (budget limit) */
  maxTokens?: number;
  /** Model to use ('inherit' to use parent's model) */
  model?: string | 'inherit';
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Isolation mode */
  isolation?: IsolationMode;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Working directory override */
  cwd?: string;
  /** Run in background (non-blocking) */
  runInBackground?: boolean;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;
}

/**
 * Subagent result after execution
 */
export interface SubagentResult {
  /** Success status */
  success: boolean;
  /** Final output message */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Tool calls made during execution */
  toolCalls?: number;
  /** Tokens consumed */
  tokens?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Files modified */
  filesChanged?: string[];
  /** Commit hash if changes were committed */
  commitHash?: string;
}

/**
 * Subagent task status
 */
export type SubagentTaskStatus =
  | 'pending'      // Not yet started
  | 'running'      // Currently executing
  | 'completed'    // Finished successfully
  | 'failed'       // Finished with error
  | 'cancelled'    // Cancelled by user
  | 'timeout';     // Timed out

/**
 * Subagent task for background execution
 */
export interface SubagentTask {
  /** Task unique ID */
  id: string;
  /** Task configuration */
  config: SubagentConfig;
  /** Initial prompt/task description */
  prompt: string;
  /** Parent context information */
  parentContext?: {
    sessionId: string;
    cwd: string;
    tools: string[];
    systemPrompt?: string;
  };
  /** Task status */
  status: SubagentTaskStatus;
  /** Created timestamp */
  createdAt: Date;
  /** Started timestamp */
  startedAt?: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Progress updates */
  progress?: string;
  /** Result when completed */
  result?: SubagentResult;
}

/**
 * Subagent event types
 */
export type SubagentEventType =
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Subagent event
 */
export interface SubagentEvent {
  type: SubagentEventType;
  taskId: string;
  timestamp: Date;
  data?: Partial<SubagentResult>;
}

/**
 * Subagent event listener callback
 */
export type SubagentEventListener = (event: SubagentEvent) => void;

/**
 * Subagent runner interface
 */
export interface SubagentRunner {
  /**
   * Run a subagent synchronously (blocking)
   */
  run(config: SubagentConfig, prompt: string, context?: SubagentContext): Promise<SubagentResult>;

  /**
   * Run a subagent asynchronously (non-blocking, returns task ID)
   */
  runAsync(config: SubagentConfig, prompt: string, context?: SubagentContext): Promise<string>;

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): SubagentTaskStatus;

  /**
   * Get task result
   */
  getTaskResult(taskId: string): SubagentResult | undefined;

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): Promise<void>;

  /**
   * Subscribe to task events
   */
  onEvent(listener: SubagentEventListener): () => void;
}

/**
 * Context passed to subagent execution
 */
export interface SubagentContext {
  /** Parent session ID */
  sessionId: string;
  /** Parent working directory */
  cwd: string;
  /** Available tools */
  tools: StructuredToolInterface[];
  /** Parent system prompt (for fork mode) */
  systemPrompt?: string;
  /** Parent model name */
  model?: string;
  /** Cancellation signal */
  signal?: AbortSignal;
}

/**
 * Default configuration for different subagent types
 */
export const DEFAULT_SUBAGENT_CONFIG: Record<SubagentType, Partial<SubagentConfig>> = {
  general: {
    maxTurns: 50,
    model: 'inherit',
    permissionMode: 'default',
    isolation: 'none',
  },
  specialized: {
    maxTurns: 100,
    model: 'inherit',
    permissionMode: 'default',
    isolation: 'none',
  },
  fork: {
    maxTurns: 200,
    model: 'inherit',
    permissionMode: 'bubble',
    isolation: 'none',
  },
};

/**
 * Built-in agent definitions (for specialized agents)
 */
export interface BuiltInAgentDefinition {
  agentType: string;
  description: string;
  systemPrompt: string;
  tools: string[] | '*';
  maxTurns: number;
  model?: string | 'inherit';
}

// ===========================================================================
// P1.a.2 — 3-worker parallel manager
// ===========================================================================
//
// A generic coordinator for N subagents (typically 3) that fan out in parallel
// and aggregate their results. The earnings-preview 3W pipeline
// (analyst / sentiment / transcript) is the canonical consumer — see
// src/agent/earnings-3w.ts. Tests inject a mock `runFn` to avoid LLM calls.

/** A single worker spec in a parallel run. */
export interface ParallelWorkerSpec<T> {
  /** Stable key, e.g. 'analyst' | 'sentiment' | 'transcript'. */
  key: string;
  /** Per-worker subagent config (tools, model, isolation, ...). */
  config: SubagentConfig;
  /** Per-worker prompt. */
  prompt: string;
  /** Optional shared scratchpad / parent context. */
  context?: SubagentContext;
  /**
   * Optional override of the worker type. Defaults to `config.type`.
   * Used by the synthesiser to distinguish results when the same type
   * would otherwise be shared across workers (e.g. all 'specialized').
   */
  workerType?: string;
}

/** Per-worker outcome inside a ParallelGroupResult. */
export interface ParallelWorkerResult<T> {
  key: string;
  status: SubagentTaskStatus;
  output?: T;
  error?: string;
  duration: number;
  startedAt: number;
  endedAt: number;
}

/** Aggregated result across all workers in a parallel run. */
export interface ParallelGroupResult<T> {
  workers: ParallelWorkerResult<T>[];
  /** True when every worker status === 'completed'. */
  full: boolean;
  /** True when >= 1 worker succeeded but `full` is false. */
  partial: boolean;
  /** True when zero workers succeeded. */
  failed: boolean;
  totalDuration: number;
}

/**
 * Pluggable worker-runner signature. Production callers pass
 * `(spec, ctx) => runner.run(spec.config, spec.prompt, spec.context)`.
 * Tests pass a deterministic function that returns canned results.
 */
export type WorkerRunFn = (
  spec: ParallelWorkerSpec<unknown>,
  ctx: SubagentContext | undefined,
) => Promise<SubagentResult>;

/**
 * Run N workers in parallel with bounded concurrency of 3 (P1.a.2 default).
 *
 * Semantics:
 *   - All workers start as soon as the event loop permits (no serial).
 *   - A worker that throws / fails is captured, not propagated.
 *   - The returned ParallelGroupResult always has N entries (one per spec).
 *   - `full` / `partial` / `failed` flags summarise the group.
 *
 * The 3-worker bound is the design's recommended grouping — for more,
 * pass a larger `concurrency` value.
 */
export async function runWorkersParallel<T>(
  specs: ParallelWorkerSpec<T>[],
  runFn: WorkerRunFn,
  options: { concurrency?: number } = {},
): Promise<ParallelGroupResult<T>> {
  if (specs.length === 0) {
    return { workers: [], full: false, partial: false, failed: true, totalDuration: 0 };
  }
  const startedAt = Date.now();
  const concurrency = options.concurrency ?? Math.min(3, specs.length);

  // Bounded-concurrency scheduler: at most `concurrency` in-flight at a time.
  const results: ParallelWorkerResult<T>[] = new Array(specs.length);
  let cursor = 0;

  async function worker(idx: number): Promise<void> {
    const spec = specs[idx]!;
    const t0 = Date.now();
    try {
      const r = await runFn(spec as ParallelWorkerSpec<unknown>, spec.context);
      const t1 = Date.now();
      const status: SubagentTaskStatus = r.success ? 'completed' : 'failed';
      const parsed = r.success ? parseOutput<T>(r.output) : undefined;
      results[idx] = {
        key: spec.key,
        status,
        output: parsed,
        error: r.success ? undefined : (r.error ?? 'unknown error'),
        duration: t1 - t0,
        startedAt: t0,
        endedAt: t1,
      };
    } catch (err) {
      const t1 = Date.now();
      results[idx] = {
        key: spec.key,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        duration: t1 - t0,
        startedAt: t0,
        endedAt: t1,
      };
    }
  }

  // Launch workers in slots of `concurrency`.
  const inFlight: Promise<void>[] = [];
  while (cursor < specs.length) {
    while (inFlight.length < concurrency && cursor < specs.length) {
      inFlight.push(worker(cursor));
      cursor += 1;
    }
    // Wait for at least one to complete before scheduling the next.
    if (inFlight.length > 0) {
      await Promise.race(inFlight.splice(0, 1));
    }
  }
  await Promise.all(inFlight);

  const succeeded = results.filter(r => r.status === 'completed').length;
  const full = succeeded === results.length;
  const failed = succeeded === 0;
  const partial = !full && !failed;

  return {
    workers: results,
    full,
    partial,
    failed,
    totalDuration: Date.now() - startedAt,
  };
}

/**
 * Defensive JSON parse for the worker's output string. If parsing fails,
 * the raw string is wrapped in `{ raw: ... }` so downstream code never
 * has to handle "string-or-object" unions.
 */
function parseOutput<T>(output: string | undefined): T | undefined {
  if (output === undefined) return undefined;
  try {
    return JSON.parse(output) as T;
  } catch {
    return { raw: output } as unknown as T;
  }
}
