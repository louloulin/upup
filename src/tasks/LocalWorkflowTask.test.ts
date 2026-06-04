import { describe, test, expect } from 'bun:test';
import { LocalWorkflowTask } from './LocalWorkflowTask.js';
import { LocalShellTask } from './LocalShellTask.js';
import { BaseTask, NOOP_LOGGER, type TaskContext, type TaskResult } from './types.js';

const ctx: TaskContext = { taskId: 'wf-test', signal: new AbortController().signal, logger: NOOP_LOGGER };

class TagTask extends BaseTask<{ tag: string }, { tag: string }> {
  constructor(input: { tag: string }, name?: string) {
    super(input, 'local-agent', name);
  }
  protected async run(_ctx: TaskContext): Promise<TaskResult<{ tag: string }>> {
    return this.runInternal(async () => ({ tag: this.input.tag }));
  }
}

describe('LocalWorkflowTask — sequential execution', () => {
  test('runs all steps in order', async () => {
    const wf = new LocalWorkflowTask({
      steps: [
        new TagTask({ tag: 'a' }, 'step-a'),
        new TagTask({ tag: 'b' }, 'step-b'),
        new TagTask({ tag: 'c' }, 'step-c'),
      ],
    });
    const result = await wf.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.stepCount).toBe(3);
    expect(result.value?.completedSteps).toBe(3);
    expect(result.value?.results.map((r) => r.name)).toEqual(['step-a', 'step-b', 'step-c']);
  });

  test('halts on first failure (default)', async () => {
    const wf = new LocalWorkflowTask({
      steps: [
        new TagTask({ tag: 'a' }),
        new LocalShellTask({ command: 'sh', args: ['-c', 'exit 1'] }),
        new TagTask({ tag: 'c' }), // should not run
      ],
    });
    const result = await wf.start(ctx);
    expect(result.ok).toBe(false);
    // The partial result is preserved on failure via partialValue.
    expect(result.value?.completedSteps).toBe(1);
    expect(result.value?.failedAt).toBe(1);
    expect(wf.status()).toBe('failed');
  });

  test('continues on error when continueOnError=true', async () => {
    const wf = new LocalWorkflowTask({
      continueOnError: true,
      steps: [
        new LocalShellTask({ command: 'sh', args: ['-c', 'exit 1'] }),
        new TagTask({ tag: 'b' }),
      ],
    });
    const result = await wf.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.completedSteps).toBe(2);
    expect(result.value?.results[0]?.ok).toBe(false);
    expect(result.value?.results[1]?.ok).toBe(true);
  });

  test('empty workflow completes with 0 steps', async () => {
    const wf = new LocalWorkflowTask({ steps: [] });
    const result = await wf.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.stepCount).toBe(0);
  });
});

describe('LocalWorkflowTask — cancel', () => {
  test('cancelling the workflow aborts the in-flight step', async () => {
    const longStep = new LocalShellTask({ command: 'sleep', args: ['30'] });
    const wf = new LocalWorkflowTask({ steps: [longStep] });
    const promise = wf.start(ctx);
    setTimeout(() => wf.cancel('user'), 30);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(wf.status()).toBe('cancelled');
    expect(longStep.status()).toBe('cancelled');
  });

  test('cancel before start transitions to cancelled', () => {
    const wf = new LocalWorkflowTask({ steps: [new TagTask({ tag: 'a' })] });
    wf.cancel('no go');
    expect(wf.status()).toBe('cancelled');
  });
});
