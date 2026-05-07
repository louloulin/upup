/**
 * Subagent System - Core Types and Interfaces
 *
 * Provides subagent/spawn capabilities for Dexter, enabling:
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