/**
 * Subagent Runner Implementation
 *
 * Handles subagent spawning, execution, and lifecycle management.
 * Supports both synchronous (blocking) and asynchronous (background) execution.
 */

import { randomUUID } from 'crypto';
import {
  PiSubagentConfig,
  SubagentResult,
  SubagentTask,
  SubagentTaskStatus,
  SubagentEvent,
  SubagentEventListener,
  SubagentContext,
  SubagentEventType,
  toPiSubagentSpec,
} from './subagent.js';
import { DEFAULT_SUBAGENT_CONFIG } from './subagent.js';
import { error as logError } from '../../utils/logging/logger.js';
import type { AgentEvent } from './legacy-events.js';
import { getPiBackgroundService } from './background-service.js';
import { runPiPrompt } from './runner.js';

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
 * PiSubagentService - Pi-backed subagent lifecycle compatibility service.
 *
 * All model/tool/session execution in this service is delegated to Pi
 * AgentSession. The legacy SubagentRunner name is retained only for API
 * compatibility while callers migrate to PiSubagentService.
 */
export class PiSubagentService {
  private store: SubagentTaskStore;
  private events: SubagentEventEmitter;
  private activeAgents: Map<string, AbortController> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.store = new SubagentTaskStore();
    this.events = new SubagentEventEmitter();
  }

  /**
   * Run a subagent synchronously (blocking)
   */
  async run(
    config: PiSubagentConfig,
    prompt: string,
    context?: SubagentContext,
    eventCallback?: (event: AgentEvent) => void,
  ): Promise<SubagentResult> {
    const startTime = Date.now();
    const toolCalls: string[] = [];

    try {
      const mergedConfig = this.mergeConfig(config);
      const agentSpec = toPiSubagentSpec(mergedConfig);
      const result = await runPiPrompt(this.createExecContext(mergedConfig, context, prompt), {
        model: mergedConfig.model === 'inherit' ? undefined : mergedConfig.model,
        cwd: mergedConfig.cwd ?? context?.cwd,
        toolFilter: mergedConfig.tools,
        systemPrompt: mergedConfig.systemPrompt,
        agentSpec,
        sessionKey: `subagent:${randomUUID()}`,
        onEvent: (event) => {
          const mapped = this.mapPiEvent(event);
          if (mapped) eventCallback?.(mapped);
        },
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
    config: PiSubagentConfig,
    prompt: string,
    context?: SubagentContext
  ): Promise<string> {
    // Start auto-cleanup on first background task (idempotent)
    const taskId = randomUUID();

    // Create task
    const task: SubagentTask = {
      id: taskId,
      config,
      prompt,
      parentContext: context ? {
        sessionId: context.sessionId,
        cwd: context.cwd,
        tools: context.tools.map(t => t?.name).filter((n): n is string => n !== undefined),
        systemPrompt: context.systemPrompt,
      } : undefined,
      status: 'pending',
      createdAt: new Date(),
    };

    this.store.create(task);

    void this.runInBackground(taskId, config, prompt, context);

    // Bridge to TaskStore so subagent tasks appear in task_list/task_get
    try {
      const { registerSubagentTask } = await import('../../tools/task/task-tool.js');
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

    const task = this.store.get(taskId);
    if (!task) return;
    this.store.update(taskId, { status: 'cancelled', completedAt: new Date() });

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

  private mergeConfig(config: PiSubagentConfig): PiSubagentConfig {
    const defaults = DEFAULT_SUBAGENT_CONFIG[config.type] || DEFAULT_SUBAGENT_CONFIG.general;
    return {
      ...defaults,
      ...config,
    };
  }

  private createExecContext(
    config: PiSubagentConfig,
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

  private mapPiEvent(event: unknown): AgentEvent | undefined {
    if (!event || typeof event !== 'object' || !('type' in event)) return undefined;
    const value = event as { type: string; delta?: string; toolName?: string; toolCallId?: string; input?: unknown; error?: string };
    if (value.type === 'text_delta') return { type: 'stream_progress', charDelta: value.delta?.length ?? 0, mode: 'responding', textContent: value.delta ?? '' };
    if (value.type === 'tool_start' && value.toolName) return { type: 'tool_start', tool: value.toolName, args: (value.input ?? {}) as Record<string, unknown>, toolCallId: value.toolCallId };
    if (value.type === 'tool_end' && value.error && value.toolName) return { type: 'tool_error', tool: value.toolName, error: value.error, toolCallId: value.toolCallId };
    return undefined;
  }

  private async runInBackground(
    taskId: string,
    config: PiSubagentConfig,
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
      const agentSpec = toPiSubagentSpec(config);
      const result = await runPiPrompt(this.createExecContext(config, context, prompt), {
        model: config.model === 'inherit' ? undefined : config.model,
        cwd: config.cwd ?? context?.cwd,
        toolFilter: config.tools,
        systemPrompt: config.systemPrompt,
        agentSpec,
        sessionKey: `subagent:${taskId}`,
        signal: controller.signal,
      });

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
        const { updateSubagentTask } = await import('../../tools/task/task-tool.js');
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
        const { updateSubagentTask } = await import('../../tools/task/task-tool.js');
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

  /**
   * Initialize agents directory (no-op for base runner, implemented in EnhancedSubagentRunner)
   */
  async initializeAgents(_dirPath?: string): Promise<number> {
    // Base implementation - EnhancedSubagentRunner handles agent directory
    return 0;
  }
}

function extractPiAnswer(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || !('role' in message) || message.role !== 'assistant' || !('content' in message) || !Array.isArray(message.content)) continue;
    const text = message.content.filter((part): part is { type: 'text'; text: string } => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string').map((part) => part.text).join('');
    if (text) return text;
  }
  return 'Agent completed without output';
}

// Singleton instance
/** @deprecated Use PiSubagentService. */
export const SubagentRunner = PiSubagentService;

let defaultRunner: PiSubagentService | null = null;

/**
 * Get or create the default SubagentRunner instance
 */
export function getPiSubagentService(): PiSubagentService {
  if (!defaultRunner) {
    defaultRunner = new PiSubagentService();
  }
  return defaultRunner;
}

/** @deprecated Use getPiSubagentService. */
export function getDefaultSubagentRunner(): PiSubagentService {
  return getPiSubagentService();
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

export function resetPiSubagentService(): void {
  resetDefaultSubagentRunner();
}


// ============================================================================
// Self-registration with public port registry
// ============================================================================
// Allows packages/commands/ to access subagent capabilities without a fragile
// deep import into the legacy agent directory.
import { registerSubagentPort, type SubagentPort } from './agent-port.js';

function registerSelf(): void {
  const port: SubagentPort = {
    createTask: async (config) => {
      const taskId = await getPiBackgroundService().start(config.prompt, { toolFilter: '*' });
      return { id: taskId };
    },
    getAllTasks: () => getPiBackgroundService().list().map((t) => ({
        id: t.id,
        status: t.status,
        prompt: t.prompt,
      })),
    cancelTask: async (id) => getPiBackgroundService().cancel(id),
  };
  registerSubagentPort(port);
}
registerSelf();
