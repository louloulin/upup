import { describe, expect, test } from 'bun:test';
import { runNativeStockAnalysis, type StockAnalysisWorkerRequest } from './stock-analysis.js';

describe('native Pi stock analysis', () => {
  test('runs two research workers in parallel and a Pi recommendation worker', async () => {
    const requests: StockAnalysisWorkerRequest[] = [];
    const result = await runNativeStockAnalysis({ symbol: '600519.SH', name: '贵州茅台', depth: 'detailed' }, async (request) => {
      requests.push(request);
      return { agentId: request.agentId, output: `output:${request.role}`, sessionId: `session:${request.role}` };
    }, new AbortController().signal);
    expect(result).toMatchObject({ symbol: '600519.SH', name: '贵州茅台', success: true, researcherReport: 'output:fundamental-analysis', analystReport: 'output:financial-analysis', recommendation: 'output:portfolio-advisor' });
    expect(result.workerSessions).toEqual(['session:fundamental-analysis', 'session:financial-analysis', 'session:portfolio-advisor']);
    expect(requests).toHaveLength(3);
    expect(requests[0]!.prompt).toContain('最大工具迭代次数：10');
    expect(requests[2]!.prompt).toContain('output:fundamental-analysis');
  });

  test('fails closed for an aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runNativeStockAnalysis({ symbol: 'AAPL', name: 'Apple' }, async () => { throw new Error('must not run'); }, controller.signal);
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });
});
