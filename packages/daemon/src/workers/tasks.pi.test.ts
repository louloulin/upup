import { describe, expect, test } from 'bun:test';
import type { GatewayRuntime } from '@upup/gateway';
import { TasksWorker } from './tasks';

function createRuntime(): GatewayRuntime {
  return {
    agent: {
      isSessionRunning: () => false,
      runPrompt: async () => 'fixture',
    },
    config: {
      getConfiguredModelId: () => 'fixture-model',
      getConfiguredProvider: () => 'fixture-provider',
    },
    cron: {
      ensureHeartbeatCronJob: async () => undefined,
      startCronRunner: () => ({ stop: () => undefined }),
    },
  };
}

describe('TasksWorker Pi background contract', () => {
  test('executes background tasks through the injected Pi capability', async () => {
    const calls: Array<{ prompt: string; options: unknown }> = [];
    const worker = new TasksWorker(createRuntime().agent, createRuntime(), {
      start: async (prompt, options) => {
        calls.push({ prompt, options });
        return 'background-fixture-id';
      },
    });

    const result = await worker.execute({
      id: 'task-1',
      type: 'agent:background',
      payload: { prompt: 'run a background research task', config: { model: 'fixture-model', tools: ['market-data'], cwd: '/tmp' } },
      priority: 1,
      status: 'pending',
      retryCount: 0,
    });

    expect(result).toEqual({
      success: true,
      output: {
        taskId: 'background-fixture-id',
        message: 'Background agent task started',
        prompt: 'run a background research task',
      },
    });
    expect(calls).toEqual([{
      prompt: 'run a background research task',
      options: { model: 'fixture-model', toolFilter: ['market-data'], cwd: '/tmp' },
    }]);
  });
});
