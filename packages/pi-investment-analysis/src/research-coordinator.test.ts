import { describe, expect, test } from 'bun:test';
import { runResearchCoordinator } from './research-coordinator';

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

describe('topologicalResearchRoles / batchResearchRoles', () => {
  const roles = ['technical-analysis', 'fundamental-analysis', 'capital-flow', 'sentiment-analysis'] as const;

  test('returns the natural order when no needs are provided', async () => {
    const { topologicalResearchRoles } = await import('./research-coordinator');
    expect(topologicalResearchRoles(roles)).toEqual(roles);
  });

  test('orders roles by needs edges', async () => {
    const { topologicalResearchRoles } = await import('./research-coordinator');
    const sorted = topologicalResearchRoles(roles, { 'capital-flow': ['fundamental-analysis'] });
    expect(sorted.indexOf('fundamental-analysis')).toBeLessThan(sorted.indexOf('capital-flow'));
  });

  test('throws on cycles', async () => {
    const { topologicalResearchRoles } = await import('./research-coordinator');
    expect(() => topologicalResearchRoles(roles, {
      'technical-analysis': ['fundamental-analysis'],
      'fundamental-analysis': ['technical-analysis'],
    })).toThrow(/cycle/);
  });

  test('batches independent roles together', async () => {
    const { batchResearchRoles } = await import('./research-coordinator');
    const batches = batchResearchRoles(roles, {
      'capital-flow': ['fundamental-analysis'],
      'sentiment-analysis': ['fundamental-analysis'],
    });
    expect(batches.length).toBe(2);
    expect(batches[0]).toContain('fundamental-analysis');
    expect(batches[1]).toContain('capital-flow');
    expect(batches[1]).toContain('sentiment-analysis');
  });

  test('runs DAG-sequenced workers when needs is passed', async () => {
    const { runResearchCoordinator } = await import('./research-coordinator');
    const order: string[] = [];
    const result = await runResearchCoordinator('AAPL', 'test', async (req) => {
      order.push(req.role);
      return { role: req.role, output: 'ok', evidence: [{ role: req.role }] };
    }, { needs: { 'capital-flow': ['fundamental-analysis'] } });
    expect(result.workers).toHaveLength(4);
    expect(order.indexOf('fundamental-analysis')).toBeLessThan(order.indexOf('capital-flow'));
    expect(result.failedWorkers).toEqual([]);
  });
});
