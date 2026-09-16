import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import { Type } from 'typebox';
import type { FinancialToolDetails, UpUpToolContract } from '@upup/pi-runtime';

/** Local injected latency probe: the finance packages no longer export probe tools. */
const quoteTool: UpUpToolContract = {
  name: 'probe_quote',
  label: 'probe_quote',
  description: 'Local latency probe for the Pi runtime performance gate.',
  category: 'market',
  safetyLevel: 'safe',
  parameters: Type.Object({ symbol: Type.String({ minLength: 1 }) }),
  maxConcurrent: 4,
  hasFinancialImpact: false,
  async execute(input: { symbol: string }): Promise<{ value: { symbol: string }; text: string; details: FinancialToolDetails }> {
    const value = { symbol: input.symbol };
    return {
      value,
      text: JSON.stringify(value),
      details: {
        evidence: [{ id: 'probe-quote', source: 'upup-probe://performance', retrievedAt: '2026-01-01T00:00:00.000Z', asOf: '2026-01-01', query: input.symbol }],
        dataFreshness: 'historical',
        warnings: ['Session probe; not market data.'],
        auditId: 'probe-quote',
      },
    };
  },
};

describe('Pi runtime performance gate', () => {
  test('keeps deterministic session startup, tool throughput, and recovery within budget', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-performance-'));
    const sessionPath = join(directory, 'performance.jsonl');
    const factory = new PiAgentSessionFactory();
    const startupAt = performance.now();
    const session = await factory.createSession(
      { ...getInvestmentAgentSpec('invest-explore'), tools: [quoteTool.name] },
      {
        cwd: directory,
        sessionPath,
        tools: [quoteTool],
      },
    );
    const startupMs = performance.now() - startupAt;

    try {
      const throughputAt = performance.now();
      for (let index = 0; index < 10; index += 1) {
        const result = await session.executeTool(
          quoteTool.name,
          `performance-${index}`,
          { symbol: '600519.SH' },
        );
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.details).toMatchObject({
          evidence: expect.any(Array),
          auditId: expect.any(String),
        });
      }
      const throughputMs = performance.now() - throughputAt;
      expect(startupMs).toBeLessThan(500);
      expect(throughputMs).toBeLessThan(1000);
      expect((await readFile(sessionPath, 'utf8')).length).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }

    const recoveryAt = performance.now();
    const recovered = await factory.createSession(
      { ...getInvestmentAgentSpec('invest-explore'), tools: [quoteTool.name] },
      {
        cwd: directory,
        sessionPath,
        tools: [quoteTool],
      },
    );
    expect(recovered.id).toBe(session.id);
    expect(performance.now() - recoveryAt).toBeLessThan(500);
    recovered.dispose();
    await rm(directory, { recursive: true, force: true });
  });
});
