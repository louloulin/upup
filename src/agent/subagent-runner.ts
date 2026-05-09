/**
 * Subagent Runner Implementation
 *
 * Handles subagent spawning, execution, and lifecycle management.
 * Supports both synchronous (blocking) and asynchronous (background) execution.
 */

import { randomUUID } from 'crypto';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type {
  SubagentConfig,
  SubagentResult,
  SubagentTask,
  SubagentTaskStatus,
  SubagentEvent,
  SubagentEventListener,
  SubagentContext,
  SubagentEventType,
} from './subagent.js';
import { DEFAULT_SUBAGENT_CONFIG } from './subagent.js';
import { getTools, getToolConcurrencyMap } from '../tools/registry.js';
import { info, warn, error as logError, perf } from '../utils/logging/logger.js';
import type { AgentEvent } from './types.js';

/**
 * Subagent task store for tracking running tasks
 */
class SubagentTaskStore {
  private tasks: Map<string, SubagentTask> = new Map();

  create(task: SubagentTask): void {
    this.tasks.set(task.id, task);
  }

  get(id: string): SubagentTask | undefined {
    return this.tasks.get(id);
  }

  update(id: string, updates: Partial<SubagentTask>): void {
    const task = this.tasks.get(id);
    if (task) {
      this.tasks.set(id, { ...task, ...updates });
    }
  }

  delete(id: string): void {
    this.tasks.delete(id);
  }

  getAll(): SubagentTask[] {
    return Array.from(this.tasks.values());
  }

  getByStatus(status: SubagentTaskStatus): SubagentTask[] {
    return this.getAll().filter(t => t.status === status);
  }

  clear(): void {
    this.tasks.clear();
  }
}

/**
 * Event emitter for subagent events
 */
class SubagentEventEmitter {
  private listeners: Set<SubagentEventListener> = new Set();

  emit(event: SubagentEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logError('subagent', 'Event listener error', error instanceof Error ? error : undefined);
      }
    });
  }

  subscribe(listener: SubagentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * SubagentRunner - Manages subagent execution
 */
export class SubagentRunner {
  private store: SubagentTaskStore;
  private events: SubagentEventEmitter;
  private activeAgents: Map<string, AbortController> = new Map();
  private readonly DEFAULT_TIMEOUT_MS = 300000; // 5 minutes default
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store = new SubagentTaskStore();
    this.events = new SubagentEventEmitter();
  }

  /**
   * Run a subagent synchronously (blocking)
   */
  async run(
    config: SubagentConfig,
    prompt: string,
    context?: SubagentContext,
    eventCallback?: (event: AgentEvent) => void,
  ): Promise<SubagentResult> {
    const startTime = Date.now();
    const toolCalls: string[] = [];

    try {
      // Merge config with defaults
      const mergedConfig = this.mergeConfig(config);

      // Create execution context
      const execContext = this.createExecContext(mergedConfig, context, prompt);

      // Emit started event
      this.emitEvent('started', '', {});

      // Execute using Dexter's Agent
      // Note: This will be integrated with the existing Agent system
      const result = await this.executeAgent(mergedConfig, execContext, (toolName) => {
        toolCalls.push(toolName);
      }, undefined, eventCallback);

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: result,
        toolCalls: toolCalls.length,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: message,
        toolCalls: toolCalls.length,
        duration,
      };
    }
  }

  /**
   * Run a subagent asynchronously (non-blocking)
   */
  async runAsync(
    config: SubagentConfig,
    prompt: string,
    context?: SubagentContext
  ): Promise<string> {
    // Start auto-cleanup on first background task (idempotent)
    this.startAutoCleanup();

    const taskId = randomUUID();
    const startTime = Date.now();

    // Create task
    const task: SubagentTask = {
      id: taskId,
      config,
      prompt,
      parentContext: context ? {
        sessionId: context.sessionId,
        cwd: context.cwd,
        tools: context.tools.map(t => t.name),
        systemPrompt: context.systemPrompt,
      } : undefined,
      status: 'pending',
      createdAt: new Date(),
    };

    this.store.create(task);

    // Start execution in background
    this.runInBackground(taskId, config, prompt, context).catch(error => {
      error('subagent', `Background task ${taskId} failed: ${error instanceof Error ? error.message : String(error)}`);
      this.store.update(taskId, {
        status: 'failed',
        completedAt: new Date(),
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      this.emitEvent('failed', taskId, { error: String(error) });
    });

    // Bridge to TaskStore so subagent tasks appear in task_list/task_get
    try {
      const { registerSubagentTask } = await import('../tools/task/task-tool.js');
      registerSubagentTask(taskId, config.type === 'fork' ? 'Fork sub-agent' : `Sub-agent: ${prompt.substring(0, 60)}`);
    } catch {
      // Non-critical bridge — don't fail if task-tool not available
    }

    return taskId;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): SubagentTaskStatus {
    const task = this.store.get(taskId);
    return task?.status || 'pending';
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): SubagentResult | undefined {
    const task = this.store.get(taskId);
    return task?.result;
  }

  /**
   * Get full task info
   */
  getTask(taskId: string): SubagentTask | undefined {
    return this.store.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): SubagentTask[] {
    return this.store.getAll();
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<void> {
    const controller = this.activeAgents.get(taskId);
    if (controller) {
      controller.abort();
      this.activeAgents.delete(taskId);
    }

    this.store.update(taskId, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    this.emitEvent('cancelled', taskId, {});
  }

  /**
   * Subscribe to task events
   */
  onEvent(listener: SubagentEventListener): () => void {
    return this.events.subscribe(listener);
  }

  /**
   * Clean up completed tasks older than maxAgeMs (default 1 hour).
   * Auto-cleanup starts on first runAsync() and runs every 5 minutes.
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    const tasks = this.store.getAll();

    for (const task of tasks) {
      if (task.completedAt && (now - task.completedAt.getTime()) > maxAgeMs) {
        this.store.delete(task.id);
      }
    }
  }

  /**
   * Start periodic auto-cleanup of completed tasks (every 5 minutes).
   * Called automatically on first runAsync(). Idempotent.
   */
  startAutoCleanup(intervalMs: number = 300000, maxAgeMs: number = 3600000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(maxAgeMs), intervalMs);
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop periodic auto-cleanup. Called on process exit or manual reset.
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Private methods

  private mergeConfig(config: SubagentConfig): SubagentConfig {
    const defaults = DEFAULT_SUBAGENT_CONFIG[config.type] || DEFAULT_SUBAGENT_CONFIG.general;
    return {
      ...defaults,
      ...config,
    };
  }

  private createExecContext(
    config: SubagentConfig,
    context?: SubagentContext,
    prompt?: string
  ): string {
    // Build execution prompt with context
    let execPrompt = prompt || '';

    if (config.type === 'fork' && context?.systemPrompt) {
      // Fork mode: include parent system prompt
      execPrompt = `INHERITED SYSTEM PROMPT:\n${context.systemPrompt}\n\n---\n\nTASK DIRECTIVE:\n${prompt}`;
    } else if (config.systemPrompt) {
      // Custom system prompt
      execPrompt = `${config.systemPrompt}\n\n---\n\nTASK:\n${prompt}`;
    }

    return execPrompt;
  }

  private async executeAgent(
    config: SubagentConfig,
    prompt: string,
    onToolCall?: (name: string) => void,
    taskId?: string,
    eventCallback?: (event: AgentEvent) => void,
  ): Promise<string> {
    // Save CWD before try block so catch can access it
    let originalCwd: string | undefined;
    let worktreePath: string | undefined;
    try {
      // Handle worktree isolation
      if (config.isolation === 'worktree') {
        const wtPath = await this.createIsolationWorktree(taskId || 'sync');
        if (wtPath) {
          worktreePath = wtPath;
          info('subagent', `Created isolation worktree: ${worktreePath}`);
          originalCwd = process.cwd();
          process.chdir(worktreePath);
        }
      } else {
        // Save and override CWD if specified
        originalCwd = config.cwd ? process.cwd() : undefined;
        if (config.cwd) {
          try {
            process.chdir(config.cwd);
            info('subagent', `CWD changed to: ${config.cwd}`);
          } catch (err) {
            warn('subagent', `Failed to change CWD to ${config.cwd}: ${err}`);
          }
        }
      }

      // Dynamically import Agent to avoid circular dependency
      const { Agent } = await import('./agent.js');

      // Create agent instance with inherited model
      const model = config.model === 'inherit' ? undefined : config.model;

      // Get signal from active agents map if task is running in background
      let signal: AbortSignal | undefined;
      if (taskId) {
        const controller = this.activeAgents.get(taskId);
        signal = controller?.signal;
      }

      // Create abort controller with timeout if no external signal
      const timeoutMs = config.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => {
        warn('subagent', `Task ${taskId} timeout after ${timeoutMs}ms`);
        timeoutController.abort();
      }, timeoutMs);

      // Save and override CWD if specified
      originalCwd = config.cwd ? process.cwd() : undefined;
      if (config.cwd) {
        try {
          process.chdir(config.cwd);
          info('subagent', `CWD changed to: ${config.cwd}`);
        } catch (err) {
          warn('subagent', `Failed to change CWD to ${config.cwd}: ${err}`);
        }
      }

      const agent = await Agent.create({
        model,
        signal: timeoutController.signal,
        toolFilter: config.tools,
        maxIterations: config.maxTurns,
      });

      // Collect results from agent run
      let result = '';
      try {
        for await (const event of agent.run(prompt)) {
          // Forward all events to parent via callback
          if (eventCallback) {
            try {
              eventCallback(event);
            } catch {
              // Don't let callback errors crash the subagent
            }
          }

          if (event.type === 'done') {
            result = event.answer;
          } else if (event.type === 'tool_end') {
            if (onToolCall) onToolCall(event.tool);
          }
        }
      } finally {
        clearTimeout(timeoutId);
        // Restore original CWD if we changed it
        if (originalCwd) {
          try { process.chdir(originalCwd); } catch { /* best effort */ }
        }
        // Clean up isolation worktree
        if (worktreePath) {
          await this.removeIsolationWorktree(worktreePath).catch(() => {});
        }
      }

      return result || 'Agent completed without output';
    } catch (error) {
      // Restore CWD on error too
      if (originalCwd) {
        try { process.chdir(originalCwd); } catch { /* best effort */ }
      }
      // Clean up isolation worktree on error
      if (worktreePath) {
        await this.removeIsolationWorktree(worktreePath).catch(() => {});
      }
      const message = error instanceof Error ? error.message : String(error);
      logError('subagent', `Agent execution failed: ${message}`);
      throw new Error(`Subagent execution failed: ${message}`);
    }
  }

  /**
   * Create a temporary git worktree for sub-agent isolation.
   * Returns the path to the worktree, or null on failure.
   */
  private async createIsolationWorktree(taskId: string): Promise<string | null> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const path = await import('path');
      const os = await import('os');

      const branchName = `subagent/${taskId.substring(0, 8)}-${Date.now().toString(36)}`;
      const worktreeDir = path.join(os.tmpdir(), `dexter-wt-${taskId.substring(0, 8)}`);

      // Create a new branch and worktree
      await execFileAsync('git', ['worktree', 'add', '-b', branchName, worktreeDir], {
        cwd: process.cwd(),
      });

      info('subagent', `Created worktree: ${worktreeDir} on branch ${branchName}`);
      return worktreeDir;
    } catch (err) {
      warn('subagent', `Failed to create isolation worktree: ${err}`);
      return null;
    }
  }

  /**
   * Remove a temporary git worktree after sub-agent execution.
   */
  private async removeIsolationWorktree(worktreePath: string): Promise<void> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: process.cwd(),
      });
      info('subagent', `Removed worktree: ${worktreePath}`);
    } catch (err) {
      warn('subagent', `Failed to remove worktree ${worktreePath}: ${err}`);
    }
  }

  private async runInBackground(
    taskId: string,
    config: SubagentConfig,
    prompt: string,
    context?: SubagentContext
  ): Promise<void> {
    const controller = new AbortController();
    this.activeAgents.set(taskId, controller);
    const startTime = Date.now();

    this.store.update(taskId, {
      status: 'running',
      startedAt: new Date(),
    });

    this.emitEvent('started', taskId, {});

    try {
      const result = await this.executeAgent(config, prompt, undefined, taskId);

      const subagentResult: SubagentResult = {
        success: true,
        output: result,
        toolCalls: 0,
        duration: Date.now() - startTime,
      };

      this.store.update(taskId, {
        status: 'completed',
        completedAt: new Date(),
        result: subagentResult,
      });

      this.emitEvent('completed', taskId, subagentResult);

      // Bridge completion to TaskStore
      try {
        const { updateSubagentTask } = await import('../tools/task/task-tool.js');
        updateSubagentTask(taskId, 'completed', subagentResult.output);
      } catch { /* non-critical */ }
    } catch (error) {
      this.store.update(taskId, {
        status: 'failed',
        completedAt: new Date(),
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      this.emitEvent('failed', taskId, { error: String(error) });

      // Bridge failure to TaskStore
      try {
        const { updateSubagentTask } = await import('../tools/task/task-tool.js');
        updateSubagentTask(taskId, 'failed', undefined, String(error));
      } catch { /* non-critical */ }
    } finally {
      this.activeAgents.delete(taskId);
    }
  }

  private emitEvent(type: SubagentEventType, taskId: string, data: Partial<SubagentResult>): void {
    this.events.emit({
      type,
      taskId,
      timestamp: new Date(),
      data,
    });
  }
}

// Singleton instance
let defaultRunner: SubagentRunner | null = null;

/**
 * Get or create the default SubagentRunner instance
 */
export function getDefaultSubagentRunner(): SubagentRunner {
  if (!defaultRunner) {
    defaultRunner = new SubagentRunner();
  }
  return defaultRunner;
}

/**
 * Reset the default runner (for testing)
 */
export function resetDefaultSubagentRunner(): void {
  if (defaultRunner) {
    defaultRunner.stopAutoCleanup();
  }
  defaultRunner = null;
}