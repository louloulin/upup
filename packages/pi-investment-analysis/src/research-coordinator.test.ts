import { describe, expect, test } from 'bun:test';
import { runResearchCoordinator } from './research-coordinator.js';

describe('Pi research coordinator', () => {
  test('runs selected workers in parallel and aggregates evidence', async () => {
    const started: string[] = [];
    const result = await runResearchCoordinator('AAPL', '是否值得买入？', async (request) => {
      started.push(request.role);
      return { role: request.role, output: `${request.role} finding`, evidence: [{ role: request.role }] };
    }, { workers: ['technical-analysis', 'fundamental-analysis'] });
    expect(started).toEqual(['technical-analysis', 'fundamental-analysis']);
    expect(result.workers.every((worker) => worker.status === 'completed')).toBe(true);
    expect(result.evidence).toHaveLength(2);
  });

  test('isolates worker failures and fails closed without a runner', async () => {
    const result = await runResearchCoordinator('600519.SH', '风险？', async (request) => {
      if (request.role === 'capital-flow') throw new Error('provider unavailable');
      return { role: request.role, output: 'ok', evidence: [] };
    }, { workers: ['capital-flow', 'sentiment-analysis'] });
    expect(result.failedWorkers).toEqual(['capital-flow']);
    expect(result.workers.find((worker) => worker.role === 'capital-flow')).toMatchObject({ status: 'failed', error: 'provider unavailable' });
    await expect(runResearchCoordinator('AAPL', 'x', undefined)).rejects.toThrow('fail-closed');
  });

  test('marks aborted workers as blocked', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runResearchCoordinator('AAPL', 'x', async () => ({ role: 'technical-analysis', output: 'never', evidence: [] }), { workers: ['technical-analysis'], signal: controller.signal });
    expect(result.workers[0]).toMatchObject({ status: 'blocked', error: 'aborted' });
  });
});
