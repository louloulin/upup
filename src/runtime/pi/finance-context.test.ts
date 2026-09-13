import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory, serializeFinanceSessionContext } from './agent-session-factory.js';

describe('Pi finance session context', () => {
  test('persists and restores structured investment context through Pi JSONL', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-finance-context-'));
    const sessionPath = join(directory, 'finance.jsonl');
    const factory = new PiAgentSessionFactory();
    const context = {
      ticker: '600519.SH',
      market: 'A-share',
      asOf: '2026-09-12',
      assumptions: { growthRate: 0.08, discountRate: 0.1 },
      risks: ['估值回撤', '流动性'],
      evidence: [{
        id: 'evidence-1',
        source: 'upup-fixture://quote',
        retrievedAt: '2026-09-13T00:00:00.000Z',
        asOf: '2026-09-12',
        query: '600519.SH',
      }],
      unfinishedPhases: ['valuation', 'risk'],
    } as const;
    const first = await factory.createSession(getInvestmentAgentSpec('invest-review'), {
      cwd: directory,
      sessionPath,
      loadRegisteredTools: false,
    });
    first.setFinanceContext(context);
    expect(first.getFinanceContext()).toMatchObject(context);
    first.dispose();

    const recovered = await factory.createSession(getInvestmentAgentSpec('invest-review'), {
      cwd: directory,
      sessionPath,
      loadRegisteredTools: false,
    });
    try {
      expect(recovered.getFinanceContext()).toMatchObject(context);
      const jsonl = await readFile(sessionPath, 'utf8');
      expect(jsonl).toContain('upup_finance_context');
      expect(jsonl).toContain('600519.SH');
      expect(jsonl).toContain('valuation');
    } finally {
      recovered.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('serializes a lossless finance compaction summary', () => {
    const summary = serializeFinanceSessionContext({
      ticker: 'AAPL',
      market: 'US',
      asOf: '2026-09-12',
      assumptions: { terminalGrowth: 0.03 },
      risks: ['currency'],
      evidence: [{
        id: 'evidence-aapl',
        source: 'upup-fixture://fundamentals',
        retrievedAt: '2026-09-13T00:00:00.000Z',
        query: 'AAPL',
      }],
      unfinishedPhases: ['review'],
    }, 'manual', 'keep all finance facts');
    const parsed = JSON.parse(summary) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      schema: 1,
      domain: 'finance',
      ticker: 'AAPL',
      market: 'US',
      asOf: '2026-09-12',
      assumptions: { terminalGrowth: 0.03 },
      risks: ['currency'],
      unfinishedPhases: ['review'],
      compactionReason: 'manual',
      customInstructions: 'keep all finance facts',
    });
    expect(parsed.evidence).toEqual([expect.objectContaining({ id: 'evidence-aapl' })]);
  });
});
