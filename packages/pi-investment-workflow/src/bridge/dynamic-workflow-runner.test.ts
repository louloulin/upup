import { describe, expect, it } from 'bun:test';
import { runSopAsDynamicWorkflow, renderSopDynamicRunResult } from './dynamic-workflow-runner';
import { loadSops } from '../sop-loader';
import type { SopSpec } from '../sop-spec';

function loadBuiltinSop(id: string): SopSpec {
  const result = loadSops({ disableBuiltins: false, cwd: '/tmp', home: '/tmp' });
  const sop = result.sops.find((s) => s.id === id);
  if (!sop) throw new Error(`SOP ${id} not found`);
  return sop;
}

function fakeWorkflowModule(overrides: Partial<Record<string, unknown>> = {}) {
  return async () => ({
    runWorkflow: async (script: string, options: Record<string, unknown> = {}) => ({
      meta: { name: 'test', description: 'test' },
      result: 'synthesized',
      logs: ['log1'],
      phases: ['detect', 'plan'],
      agentCount: 3,
      durationMs: 42,
      runId: 'run-1',
      tokenUsage: { input: 100, output: 50, total: 150, cost: 0.01 },
      _script: script,
      _options: options,
    }),
    ...overrides,
  });
}

describe('runSopAsDynamicWorkflow', () => {
  it('executes a SOP via the injected dynamic-workflow module', async () => {
    const spec = loadBuiltinSop('graham');
    const result = await runSopAsDynamicWorkflow(spec, {
      ticker: '600519.SH',
      importer: fakeWorkflowModule(),
    });
    expect(result).toBeDefined();
    expect(result?.sopId).toBe('graham');
    expect(result?.agentCount).toBe(3);
    expect(result?.runId).toBe('run-1');
    expect(result?.tokenUsage?.total).toBe(150);
    expect(result?.script).toContain('export const meta');
  });

  it('forwards ticker via args and callbacks', async () => {
    const spec = loadBuiltinSop('momentum');
    let sawArgs: unknown;
    const importer = async () => ({
      runWorkflow: async (_script: string, options: Record<string, unknown> = {}) => {
        sawArgs = options.args;
        return {
          meta: { name: 'x', description: 'x' },
          result: null, logs: [], phases: [], agentCount: 0, durationMs: 0,
        };
      },
    });
    await runSopAsDynamicWorkflow(spec, { ticker: 'NVDA', importer });
    expect(sawArgs).toEqual({ ticker: 'NVDA' });
  });

  it('returns undefined and reports through the sink when the package is missing', async () => {
    const spec = loadBuiltinSop('graham');
    const errors: unknown[] = [];
    const result = await runSopAsDynamicWorkflow(spec, {
      ticker: 'AAPL',
      importer: async () => { throw new Error('module not found'); },
      sink: { onError: (_where, error) => errors.push(error) },
    });
    expect(result).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it('returns undefined when the module lacks runWorkflow', async () => {
    const spec = loadBuiltinSop('graham');
    const result = await runSopAsDynamicWorkflow(spec, {
      importer: async () => ({ notRunWorkflow: true }),
    });
    expect(result).toBeUndefined();
  });

  it('isolates runWorkflow throws through the sink', async () => {
    const spec = loadBuiltinSop('graham');
    const errors: unknown[] = [];
    const result = await runSopAsDynamicWorkflow(spec, {
      importer: async () => ({ runWorkflow: async () => { throw new Error('workflow blew up'); } }),
      sink: { onError: (_where, error) => errors.push(error) },
    });
    expect(result).toBeUndefined();
    expect(errors.length).toBe(1);
  });
});

describe('renderSopDynamicRunResult', () => {
  it('renders sopId, phases, agent count, and cost', () => {
    const spec = loadBuiltinSop('graham');
    const text = renderSopDynamicRunResult({
      sopId: 'graham',
      script: '',
      runId: 'run-xyz',
      agentCount: 4,
      durationMs: 5000,
      phases: ['detect', 'plan'],
      logs: [],
      result: 'final answer',
      tokenUsage: { input: 1000, output: 500, total: 1500, cost: 0.1234 },
    }, spec);
    expect(text).toContain('graham');
    expect(text).toContain('run-xyz');
    expect(text).toContain('4');
    expect(text).toContain('$0.1234');
    expect(text).toContain('final answer');
  });
});
