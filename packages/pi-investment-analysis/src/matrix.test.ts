import { describe, expect, test } from 'bun:test';
import { MatrixEngine, renderVerdict, type MatrixCell } from './matrix';

describe('Pi investment matrix core', () => {
  test('renders deterministic verdicts for technical metrics', () => {
    const verdict = renderVerdict('technical', { rsi: 25, momentum: 0.1 });
    expect(verdict.polarity).toBeGreaterThan(0);
    expect(verdict.verdict).toContain('超卖');
  });

  test('builds a bounded summary from injected cells', async () => {
    const engine = new MatrixEngine({ tickers: ['AAPL'], dimensions: ['technical', 'fundamental'] });
    const cell: MatrixCell = {
      ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 25 }, verdict: '偏多', polarity: 0.7, confidence: 0.9, sources: [],
    };
    engine.setCell(cell);
    const result = await engine.build();
    expect(result.summary.totalCells).toBe(2);
    expect(result.summary.totalPopulated).toBe(1);
    expect(result.summary.overallLeaders[0]).toMatchObject({ ticker: 'AAPL', coverage: 1 });
  });
});
