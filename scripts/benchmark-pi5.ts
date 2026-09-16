import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Type } from 'typebox';
import type { FinancialToolDetails, UpUpToolContract, UpUpToolResult } from '@upup/pi-runtime';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

/**
 * In-process latency probe. The benchmark measures Pi session and tool-dispatch
 * overhead, so the tool it calls must be local and deterministic; it is defined
 * here instead of shipped from a package, so no package exports benchmark data.
 */
const PROBE_TOOL_NAME = 'benchmark_probe_quote';
const probeTool: UpUpToolContract = {
  name: PROBE_TOOL_NAME,
  label: 'Benchmark probe quote',
  description: 'In-process latency probe used by scripts/benchmark-pi5.ts. Not market data.',
  category: 'market',
  safetyLevel: 'safe',
  parameters: Type.Object({ symbol: Type.String({ minLength: 1 }) }),
  maxConcurrent: 4,
  hasFinancialImpact: false,
  async execute(input: { symbol: string }, context): Promise<UpUpToolResult<Readonly<Record<string, string | number>>>> {
    if (context.signal?.aborted) throw new DOMException('benchmark probe aborted', 'AbortError');
    const value = { symbol: input.symbol, probe: 1 };
    const details: FinancialToolDetails = {
      evidence: [{
        id: `benchmark-probe-${input.symbol}`,
        source: 'upup-benchmark://probe',
        retrievedAt: new Date().toISOString(),
        asOf: '2026-01-01',
        query: input.symbol,
        dataHash: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
        confidence: 'high',
      }],
      dataFreshness: 'historical',
      warnings: ['Benchmark probe payload; not market data.'],
      auditId: 'benchmark-probe',
    };
    return { value, text: JSON.stringify(value), details };
  },
};

const thresholds = {
  startupMs: 500,
  toolBatchMs: 1000,
  recoveryMs: 500,
  perCallP95Ms: 100,
  perCallP99Ms: 200,
  slaSustainedCalls: 200,
} as const;

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(2));
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index]!.toFixed(3));
}

function stats(values: readonly number[]): { count: number; min: number; max: number; mean: number; median: number; p50: number; p95: number; p99: number } {
  if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0, median: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    min: Number(sorted[0]!.toFixed(3)),
    max: Number(sorted.at(-1)!.toFixed(3)),
    mean: Number((sum / sorted.length).toFixed(3)),
    median: percentile(sorted, 50),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function main(): Promise<void> {
  const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-benchmark-'));
  const sessionPath = join(directory, 'benchmark.jsonl');
  const quoteTool = probeTool;

  const factory = new PiAgentSessionFactory();
  const spec = { ...getInvestmentAgentSpec('invest-explore'), tools: [PROBE_TOOL_NAME] };
  const startupStart = performance.now();
  const first = await factory.createSession(spec, {
    cwd: directory,
    sessionPath,
    tools: [quoteTool],
  });
  const startupMs = elapsed(startupStart);

  let toolBatchMs = 0;
  let sessionBytes = 0;
  const perCallLatencies: number[] = [];
  try {
    const toolStart = performance.now();
    for (let index = 0; index < 10; index += 1) {
      const callStart = performance.now();
      const result = await first.executeTool(PROBE_TOOL_NAME, `benchmark-${index}`, { symbol: '600519.SH' });
      perCallLatencies.push(Number((performance.now() - callStart).toFixed(3)));
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

  let slaSustainedP95Ms = 0;
  let slaSustainedMaxMs = 0;
  try {
    const slaLatencies: number[] = [];
    for (let index = 0; index < thresholds.slaSustainedCalls; index += 1) {
      const callStart = performance.now();
      await recovered.executeTool(PROBE_TOOL_NAME, `sla-${index}`, { symbol: '600519.SH' });
      slaLatencies.push(Number((performance.now() - callStart).toFixed(3)));
    }
    const slaStats = stats(slaLatencies);
    slaSustainedP95Ms = slaStats.p95;
    slaSustainedMaxMs = slaStats.max;
  } finally {
    recovered.dispose();
    await rm(directory, { recursive: true, force: true });
  }

  const perCallStats = stats(perCallLatencies);
  const report = {
    schema: 'upup.pi5.performance.v1',
    runtime: { bun: Bun.version, node: process.versions.node },
    workload: { tool: PROBE_TOOL_NAME, calls: 10, symbol: '600519.SH' },
    measurements: {
      startupMs,
      toolBatchMs,
      recoveryMs,
      sessionBytes,
      perCallMs: perCallStats,
      slaSustainedCalls: thresholds.slaSustainedCalls,
      slaSustainedP95Ms,
      slaSustainedMaxMs,
    },
    thresholds,
    passed:
      startupMs < thresholds.startupMs &&
      toolBatchMs < thresholds.toolBatchMs &&
      recoveryMs < thresholds.recoveryMs &&
      sessionBytes > 0 &&
      perCallStats.p95 < thresholds.perCallP95Ms &&
      perCallStats.p99 < thresholds.perCallP99Ms &&
      slaSustainedP95Ms < thresholds.perCallP95Ms,
    sessionId,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
