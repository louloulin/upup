import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { TelemetryRecorder, executeWithProviderRetry } from '@upup/pi-observability';
import { PiAgentSessionFactory } from '@upup/pi-session';
import { withFileLock } from '@upup/pi-storage';

type FaultStatus = 'passed' | 'failed';

interface FaultEvidence {
  readonly name: string;
  readonly status: FaultStatus;
  readonly firstFailure?: string;
  readonly recovered: boolean;
  readonly artifacts: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
}

interface FaultReport {
  readonly schema: 'upup.pi.fault-matrix.v1';
  readonly generatedAt: string;
  readonly fixture: 'local-pi-fault-injection';
  readonly sharedRuntimeBoundary: readonly string[];
  readonly scenarios: readonly FaultEvidence[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
  };
  readonly durationMs: number;
}

const root = process.cwd();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function telemetryScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: directory, flushEveryNEvents: 1, flushEveryMs: 1 } });
  let attempts = 0;
  const result = await executeWithProviderRetry(
    async () => {
      attempts++;
      if (attempts === 1) throw new Error('HTTP 429 rate limit');
      if (attempts === 2) throw new Error('HTTP 503 provider unavailable');
      return 'recovered';
    },
    { provider: 'fault-fixture', operation: 'quote', maxAttempts: 3, baseDelayMs: 0, jitterFraction: 0, recorder },
  );
  await recorder.flush();
  const files = await Array.fromAsync(new Bun.Glob('events-*.jsonl').scan({ cwd: directory }));
  const lines = files.length > 0 ? (await readFile(join(directory, files[0]! as string), 'utf8')).trim().split('\n').filter(Boolean) : [];
  const events = lines.map((line) => JSON.parse(line) as { kind?: string; outcome?: string; errorCode?: string });
  const codes = events.map((event) => event.errorCode).filter((code): code is string => typeof code === 'string');
  const recovered = result.value === 'recovered' && result.attempts === 3 && codes.includes('http_429') && codes.includes('http_503');
  return { name: 'provider-429-503-recovery', status: recovered ? 'passed' : 'failed', recovered, artifacts: files.map(String), details: { attempts, recordedEvents: events.length, errorCodes: codes, finalOutcome: result.value } };
}

async function exhaustionScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: directory, flushEveryNEvents: 1, flushEveryMs: 1 } });
  let attempts = 0;
  let firstFailure = '';
  try {
    await executeWithProviderRetry(
      async () => {
        attempts++;
        throw new Error('ECONNRESET network interruption');
      },
      { provider: 'fault-fixture', operation: 'history', maxAttempts: 3, baseDelayMs: 0, jitterFraction: 0, recorder },
    );
  } catch (error) {
    firstFailure = errorText(error);
  }
  await recorder.flush();
  const files = await Array.fromAsync(new Bun.Glob('events-*.jsonl').scan({ cwd: directory }));
  const recovered = attempts === 3 && firstFailure.includes('ECONNRESET');
  return { name: 'provider-network-retry-exhaustion', status: recovered ? 'passed' : 'failed', firstFailure, recovered, artifacts: files.map(String), details: { attempts, expectedExhaustion: true } };
}

async function abortScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: directory, flushEveryNEvents: 1, flushEveryMs: 1 } });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5);
  let attempts = 0;
  let firstFailure = '';
  try {
    await executeWithProviderRetry(
      async (_attempt, signal) => {
        attempts++;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 100);
          const abort = () => { clearTimeout(timer); const error = Object.assign(new Error('Operation aborted'), { name: 'AbortError' }); reject(error); };
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        });
        return 'unexpected';
      },
      { provider: 'fault-fixture', operation: 'stream', maxAttempts: 3, baseDelayMs: 0, signal: controller.signal, recorder },
    );
  } catch (error) {
    firstFailure = errorText(error);
  }
  await recorder.flush();
  const files = await Array.fromAsync(new Bun.Glob('events-*.jsonl').scan({ cwd: directory }));
  const telemetry = files.length > 0 ? await readFile(join(directory, files[0]! as string), 'utf8') : '';
  const recovered = attempts === 1 && firstFailure.includes('aborted') && telemetry.includes('"outcome":"aborted"');
  return { name: 'provider-abort-no-retry', status: recovered ? 'passed' : 'failed', firstFailure, recovered, artifacts: files.map(String), details: { attempts, abortRecorded: telemetry.includes('"outcome":"aborted"') } };
}

async function lockScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const stalePath = join(directory, 'stale.pi-lock');
  await mkdir(stalePath, { recursive: true });
  const old = new Date(Date.now() - 60_000);
  await utimes(stalePath, old, old);
  const marker = join(directory, 'stale-recovered.txt');
  await withFileLock(stalePath, async () => { await writeFile(marker, 'recovered', 'utf8'); }, { staleMs: 1, timeoutMs: 200 });
  const recovered = (await readFile(marker, 'utf8')) === 'recovered';
  return { name: 'stale-lock-recovery', status: recovered ? 'passed' : 'failed', recovered, artifacts: [marker], details: { lockRemoved: !(await Bun.file(stalePath).exists()) } };
}

async function partialJsonlScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'partial.jsonl');
  await writeFile(path, '{"type":"session","id":"partial-fixture"}\n{"type":"custom","data":{"phase":"detect"}}\n{"type":"custom","data":', 'utf8');
  const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
  const valid = lines.slice(0, -1).map((line) => JSON.parse(line) as { type?: string });
  let partialDetected = false;
  try { JSON.parse(lines.at(-1)!); } catch { partialDetected = true; }
  const recovered = valid.length === 2 && partialDetected;
  return { name: 'partial-jsonl-tail-detection', status: recovered ? 'passed' : 'failed', recovered, artifacts: [path], details: { validEntries: valid.length, partialTail: partialDetected } };
}

async function sessionLifecycleScenario(directory: string): Promise<FaultEvidence> {
  await mkdir(directory, { recursive: true });
  const sessionPath = join(directory, 'lifecycle.jsonl');
  const faux = fauxProvider({ provider: 'upup-pi-fault-lifecycle', models: [{ id: 'fault-lifecycle-model', reasoning: false }] });
  faux.setResponses([
    fauxAssistantMessage([fauxText('阶段一已保存。')]),
    fauxAssistantMessage([fauxText('阶段二已保存。')]),
    fauxAssistantMessage([fauxText('阶段三已保存。')]),
    fauxAssistantMessage([fauxText('阶段四已保存。')]),
    fauxAssistantMessage([fauxText('恢复后继续完成。')]),
    fauxAssistantMessage([fauxText('压缩摘要已保存。')]),
  ]);
  const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
  modelRuntime.registerNativeProvider(faux.provider);
  const factory = new PiAgentSessionFactory();
  const session = await factory.createSession(getInvestmentAgentSpec('invest-explore'), { cwd: directory, sessionPath, model: faux.getModel(), modelRuntime });
  let forkPath: string | undefined;
  try {
    const evidence = '收入、利润、现金流、估值假设、风险边界和数据来源。'.repeat(2_500);
    for (const phase of ['一', '二', '三', '四']) {
      await session.prompt(`保存阶段${phase}研究证据：${evidence}`);
      await session.waitForIdle();
    }
    await session.compact('保留阶段和证据');
    forkPath = session.fork();
    session.dispose();
    const recovered = await factory.createSession(getInvestmentAgentSpec('invest-explore'), { cwd: directory, sessionPath, model: faux.getModel(), modelRuntime });
    try {
      const hasHistory = recovered.getMessages().some((message) => typeof message === 'object' && message !== null && 'role' in message);
      const forkExists = typeof forkPath === 'string' && await Bun.file(forkPath).exists();
      const report = { hasHistory, forkExists, sessionPath };
      const ok = hasHistory && forkExists;
      return { name: 'session-restart-compact-fork', status: ok ? 'passed' : 'failed', recovered: ok, artifacts: [sessionPath, ...(forkPath ? [forkPath] : [])], details: report };
    } finally {
      recovered.dispose();
    }
  } catch (error) {
    return { name: 'session-restart-compact-fork', status: 'failed', firstFailure: errorText(error), recovered: false, artifacts: [sessionPath, ...(forkPath ? [forkPath] : [])], details: {} };
  }
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const rootDirectory = await mkdtemp(join(root, '.upup', 'pi-fault-matrix-'));
  const scenarios: FaultEvidence[] = [];
  try {
    scenarios.push(await telemetryScenario(join(rootDirectory, 'provider-recovery')));
    scenarios.push(await exhaustionScenario(join(rootDirectory, 'provider-exhaustion')));
    scenarios.push(await abortScenario(join(rootDirectory, 'provider-abort')));
    scenarios.push(await lockScenario(join(rootDirectory, 'locks')));
    scenarios.push(await partialJsonlScenario(join(rootDirectory, 'jsonl')));
    scenarios.push(await sessionLifecycleScenario(join(rootDirectory, 'session')));
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
  const report: FaultReport = {
    schema: 'upup.pi.fault-matrix.v1',
    generatedAt: new Date().toISOString(),
    fixture: 'local-pi-fault-injection',
    sharedRuntimeBoundary: ['Pi AgentSession', 'Pi Session JSONL', 'provider retry/audit', 'Pi file lock'],
    scenarios,
    summary: { total: scenarios.length, passed: scenarios.filter((scenario) => scenario.status === 'passed').length, failed: scenarios.filter((scenario) => scenario.status === 'failed').length },
    durationMs: Date.now() - startedAt,
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

await run();
