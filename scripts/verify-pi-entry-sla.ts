import { spawn } from 'node:child_process';

interface EntryFaultReport {
  schema: 'upup.pi.entry-faults.v1';
  summary: { total: number; passed: number; failed: number };
  durationMs: number;
}

interface RoundResult {
  round: number;
  status: 'passed' | 'failed';
  durationMs: number;
  exitCode: number | null;
  report?: EntryFaultReport;
  stderr: string;
  error?: string;
}

interface SlaReport {
  schema: 'upup.pi.entry-sla.v1';
  fixture: 'local-pi-entry-fault-injection';
  rounds: number;
  completedRounds: number;
  latencyMs: { p50: number; p95: number; p99: number; min: number; max: number };
  failures: readonly RoundResult[];
  roundsDetail: readonly RoundResult[];
  summary: { entriesPerRound: number; expectedEntries: number; passedEntries: number };
}

const roundsRaw = Number.parseInt(process.env.UPUP_PI_ENTRY_SLA_ROUNDS ?? '3', 10);
const rounds = Number.isFinite(roundsRaw) && roundsRaw > 0 ? Math.min(roundsRaw, 20) : 3;
const timeoutRaw = Number.parseInt(process.env.UPUP_PI_ENTRY_SLA_TIMEOUT_MS ?? '60000', 10);
const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.min(timeoutRaw, 300000) : 60000;
const root = process.cwd();

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function parseEntryFaultReport(stdout: string): EntryFaultReport | undefined {
  const marker = '{\n  "schema": "upup.pi.entry-faults.v1"';
  const reportStart = stdout.lastIndexOf(marker);
  if (reportStart < 0) return undefined;
  try {
    return JSON.parse(stdout.slice(reportStart)) as EntryFaultReport;
  } catch {
    return undefined;
  }
}

function runRound(round: number): Promise<RoundResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ['run', 'scripts/verify-pi-entry-faults.ts'], {
      cwd: root,
      env: { ...process.env, UPUP_PI_ENTRY_SLA_ROUND: String(round) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    timeout.unref?.();
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timeout);
      resolve({ round, status: 'failed', durationMs: Date.now() - startedAt, exitCode: null, stderr, error: error.message });
    });
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      const report = parseEntryFaultReport(stdout);
      const status = exitCode === 0 && report?.summary.failed === 0 && report.summary.passed === 8 ? 'passed' : 'failed';
      resolve({ round, status, durationMs: Date.now() - startedAt, exitCode, ...(report ? { report } : {}), stderr, ...(status === 'failed' ? { error: report ? `entry failures=${report.summary.failed}` : 'entry fault report was not valid JSON' } : {}) });
    });
  });
}

const roundsDetail: RoundResult[] = [];
for (let round = 1; round <= rounds; round += 1) {
  process.stderr.write(`[pi-entry-sla] round ${round}/${rounds}\n`);
  roundsDetail.push(await runRound(round));
}

const latencies = roundsDetail.map((round) => round.durationMs);
const passedEntries = roundsDetail.reduce((total, round) => total + (round.report?.summary.passed ?? 0), 0);
const report: SlaReport = {
  schema: 'upup.pi.entry-sla.v1',
  fixture: 'local-pi-entry-fault-injection',
  rounds,
  completedRounds: roundsDetail.filter((round) => round.status === 'passed').length,
  latencyMs: {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    min: Math.min(...latencies),
    max: Math.max(...latencies),
  },
  failures: roundsDetail.filter((round) => round.status === 'failed'),
  roundsDetail,
  summary: { entriesPerRound: 8, expectedEntries: rounds * 8, passedEntries },
};

console.log(JSON.stringify(report, null, 2));
if (report.completedRounds !== report.rounds || report.summary.passedEntries !== report.summary.expectedEntries) process.exitCode = 1;
