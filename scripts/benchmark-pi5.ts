import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec, PiAgentSessionFactory } from '../src/runtime/pi/index.js';
import { FINANCE_FIXTURE_TOOLS } from '../src/extensions/upup/finance-fixtures.js';

const thresholds = {
  startupMs: 500,
  toolBatchMs: 1000,
  recoveryMs: 500,
} as const;

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(2));
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-benchmark-'));
  const sessionPath = join(directory, 'benchmark.jsonl');
  const quoteTool = FINANCE_FIXTURE_TOOLS.find((tool) => tool.name === 'fixture_market_quote');
  if (!quoteTool) throw new Error('fixture_market_quote is not registered');

  const factory = new PiAgentSessionFactory();
  const spec = { ...getInvestmentAgentSpec('invest-explore'), tools: ['fixture_market_quote'] };
  const startupStart = performance.now();
  const first = await factory.createSession(spec, {
    cwd: directory,
    sessionPath,
    tools: [quoteTool],
  });
  const startupMs = elapsed(startupStart);

  let toolBatchMs = 0;
  let sessionBytes = 0;
  try {
    const toolStart = performance.now();
    for (let index = 0; index < 10; index += 1) {
      const result = await first.executeTool('fixture_market_quote', `benchmark-${index}`, { symbol: '600519.SH' });
      if (!result.content.length || !result.details || !('auditId' in result.details)) {
        throw new Error('benchmark tool result did not contain auditable content');
      }
    }
    toolBatchMs = elapsed(toolStart);
    sessionBytes = (await readFile(sessionPath)).byteLength;
  } finally {
    first.dispose();
  }

  const recoveryStart = performance.now();
  const recovered = await factory.createSession(spec, {
    cwd: directory,
    sessionPath,
    tools: [quoteTool],
  });
  const recoveryMs = elapsed(recoveryStart);
  const sessionId = recovered.id;
  recovered.dispose();
  await rm(directory, { recursive: true, force: true });

  const report = {
    schema: 'upup.pi5.performance.v1',
    runtime: { bun: Bun.version, node: process.versions.node },
    workload: { tool: 'fixture_market_quote', calls: 10, symbol: '600519.SH' },
    measurements: { startupMs, toolBatchMs, recoveryMs, sessionBytes },
    thresholds,
    passed: startupMs < thresholds.startupMs && toolBatchMs < thresholds.toolBatchMs && recoveryMs < thresholds.recoveryMs && sessionBytes > 0,
    sessionId,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
