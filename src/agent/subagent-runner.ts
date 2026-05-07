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
    context?: SubagentContext
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
      });

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
   * Clean up completed tasks
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
    taskId?: string
  ): Promise<string> {
    try {
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

      const agent = await Agent.create({
        model,
        signal: timeoutController.signal,
      });

      // Collect results from agent run
      let result = '';
      try {
        for await (const event of agent.run(prompt)) {
          if (event.type === 'done') {
            result = event.answer;
          } else if (event.type === 'tool_end') {
            if (onToolCall) onToolCall(event.tool);
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      return result || 'Agent completed without output';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('subagent', `Agent execution failed: ${message}`);
      throw new Error(`Subagent execution failed: ${message}`);
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
  defaultRunner = null;
}