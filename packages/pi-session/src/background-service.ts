import { randomUUID } from 'node:crypto';
import { runPiPrompt } from './runner.js';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

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

export class PiBackgroundService {
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

  private async execute(task: PiBackgroundTask, controller: AbortController, options: PiBackgroundTaskOptions): Promise<void> {
    task.status = 'running';
    try {
      task.result = await runPiPrompt(task.prompt, {
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
export function getPiBackgroundService(): PiBackgroundService {
  service ??= new PiBackgroundService();
  return service;
}
