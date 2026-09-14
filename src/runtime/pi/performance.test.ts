import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import { FINANCE_FIXTURE_TOOLS } from '@upup/pi-finance-sdk/finance-fixtures';

describe('Pi runtime performance gate', () => {
  test('keeps deterministic session startup, tool throughput, and recovery within budget', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-performance-'));
    const sessionPath = join(directory, 'performance.jsonl');
    const quoteTool = FINANCE_FIXTURE_TOOLS.find((tool) => tool.name === 'fixture_market_quote');
    expect(quoteTool).toBeDefined();

    const factory = new PiAgentSessionFactory();
    const startupAt = performance.now();
    const session = await factory.createSession(
      { ...getInvestmentAgentSpec('invest-explore'), tools: ['fixture_market_quote'] },
      {
        cwd: directory,
        sessionPath,
        tools: [quoteTool!],
      },
    );
    const startupMs = performance.now() - startupAt;

    try {
      const throughputAt = performance.now();
      for (let index = 0; index < 10; index += 1) {
        const result = await session.executeTool(
          'fixture_market_quote',
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
      { ...getInvestmentAgentSpec('invest-explore'), tools: ['fixture_market_quote'] },
      {
        cwd: directory,
        sessionPath,
        tools: [quoteTool!],
      },
    );
    expect(recovered.id).toBe(session.id);
    expect(performance.now() - recoveryAt).toBeLessThan(500);
    recovered.dispose();
    await rm(directory, { recursive: true, force: true });
  });
});
