import { randomUUID } from 'node:crypto';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

/**
 * Signature for the prompt runner used by the background service.
 *
 * Decoupled from `@upup/pi-runtime` runner internals so this package can be
 * assembled by composition without dragging root `src/` into the dependency
 * graph.
 */
export type PiBackgroundPromptRunner = (
  prompt: string,
  options: PiBackgroundRunnerOptions,
) => Promise<string>;

export interface PiBackgroundRunnerOptions {
  model?: string;
  modelProvider?: string;
  toolFilter?: string[] | '*';
  cwd?: string;
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
  sessionKey?: string;
  signal?: AbortSignal;
}

export type PiBackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PiBackgroundTask {
  id: string;
  prompt: string;
  status: PiBackgroundTaskStatus;
  createdAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

const tasks = new Map<string, PiBackgroundTask>();
const controllers = new Map<string, AbortController>();

export interface PiBackgroundTaskOptions {
  model?: string;
  modelProvider?: string;
  toolFilter?: string[] | '*';
  cwd?: string;
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
}

export interface PiBackgroundServiceOptions {
  runner: PiBackgroundPromptRunner;
}

export class PiBackgroundService {
  private readonly runner: PiBackgroundPromptRunner;

  constructor(options: PiBackgroundServiceOptions) {
    this.runner = options.runner;
  }
  async start(prompt: string, options: PiBackgroundTaskOptions = {}): Promise<string> {
    const id = randomUUID();
    const task: PiBackgroundTask = { id, prompt, status: 'pending', createdAt: Date.now() };
    tasks.set(id, task);
    const controller = new AbortController();
    controllers.set(id, controller);
    void this.execute(task, controller, options);
    return id;
  }

  get(id: string): PiBackgroundTask | undefined {
    return tasks.get(id);
  }

  list(): readonly PiBackgroundTask[] {
    return [...tasks.values()].sort((left, right) => right.createdAt - left.createdAt);
  }

  cancel(id: string): boolean {
    const task = tasks.get(id);
    if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return false;
    controllers.get(id)?.abort();
    task.status = 'cancelled';
    task.completedAt = Date.now();
    return true;
  }

  dispose(): void {
    for (const id of [...controllers.keys()]) this.cancel(id);
    controllers.clear();
    tasks.clear();
  }

  private async execute(task: PiBackgroundTask, controller: AbortController, options: PiBackgroundTaskOptions): Promise<void> {
    task.status = 'running';
    try {
      task.result = await this.runner(task.prompt, {
        model: options.model,
        modelProvider: options.modelProvider,
        toolFilter: options.toolFilter,
        cwd: options.cwd,
        modelInstance: options.modelInstance,
        modelRuntime: options.modelRuntime,
        sessionKey: `background-${task.id}`,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) task.status = 'completed';
    } catch (error) {
      if (!controller.signal.aborted) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      task.completedAt = Date.now();
      controllers.delete(task.id);
    }
  }
}

let service: PiBackgroundService | undefined;
let runnerFactory: (() => PiBackgroundPromptRunner) | undefined;

export function configurePiBackgroundService(factory: () => PiBackgroundPromptRunner): void {
  service?.dispose();
  runnerFactory = factory;
  service = undefined;
}

export function disposePiBackgroundService(): void {
  service?.dispose();
  service = undefined;
  runnerFactory = undefined;
}

export function getPiBackgroundService(): PiBackgroundService {
  if (!service) {
    if (!runnerFactory) {
      throw new Error('PiBackgroundService is not configured: call configurePiBackgroundService() with a runner factory before getPiBackgroundService()');
    }
    service = new PiBackgroundService({ runner: runnerFactory() });
  }
  return service;
}

export function isPiBackgroundServiceConfigured(): boolean {
  return runnerFactory !== undefined;
}
