import { fauxProvider, fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnPiRpcStdio } from './pi-rpc-stdio-client';
import { runPrint } from '@upup/pi-app/print';
import { runAgentForMessage, type GatewayRuntime } from '@upup/gateway';
import { executeCronJob, type CronJob, type CronStore } from '@upup/cron';
import { TasksWorker } from '@upup/daemon';
import { createEvaluationRunner } from '@upup/pi-evals';
import { getInvestmentAgentSpec, PiAgentCatalog } from '@upup/pi-investment-workflow';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { GatewayAgentRuntimePort, GatewayRuntime } from '@upup/gateway';

type EntryName = 'cli' | 'gateway' | 'cron' | 'daemon' | 'stdio' | 'client' | 'eval';
type EntryStatus = 'passed' | 'failed';

interface EntryFaultEvidence {
  readonly entry: EntryName;
  readonly status: EntryStatus;
  readonly firstFailure?: string;
  readonly recovered: boolean;
  readonly attempts: number;
  readonly artifacts: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
}

interface EntryFaultReport {
  readonly schema: 'upup.pi.entry-faults.v1';
  readonly generatedAt: string;
  readonly fixture: 'local-pi-entry-fault-injection';
  readonly sharedRuntime: 'Pi AgentSession + Package public APIs';
  readonly entries: readonly EntryFaultEvidence[];
  readonly summary: { readonly total: number; readonly passed: number; readonly failed: number };
  readonly durationMs: number;
}

const root = process.cwd();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function* doneStream(answer: string): AsyncGenerator<UpUpAgentEvent> {
  yield { type: 'run_end', sessionId: 'entry-fault', answer, iterations: 1, totalTime: 1 };
}

function fixtureRuntime(runPrompt: GatewayAgentRuntimePort['runPrompt']): GatewayRuntime {
  return {
    agent: { isSessionRunning: () => false, runPrompt },
    config: { getConfiguredModelId: () => 'entry-fault-model', getConfiguredProvider: () => 'entry-fault-provider' },
    cron: { ensureHeartbeatCronJob: () => undefined, startCronRunner: () => ({ stop: () => undefined }) },
  };
}

async function cliFault(): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  const eventStream = {
    stream: (async function* (): AsyncGenerator<UpUpAgentEvent> {
      attempts++;
      if (attempts === 1) throw new Error('CLI fixture timeout');
      yield* doneStream('CLI recovered through Pi event stream');
    }) as typeof doneStream,
  };
  try {
    await runPrint({ prompt: 'cli fault fixture' }, () => undefined, eventStream as never);
  } catch (error) {
    firstFailure = errorText(error);
  }
  const answer = await runPrint({ prompt: 'cli fault fixture retry' }, () => undefined, eventStream as never);
  const recovered = attempts === 2 && answer.includes('recovered');
  return { entry: 'cli', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['canonical Pi event stream'], details: { answer } };
}

async function gatewayFault(): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  const runtime = fixtureRuntime(async () => {
    attempts++;
    if (attempts === 1) throw new Error('Gateway provider 503');
    return 'Gateway recovered';
  });
  try {
    await runAgentForMessage({ sessionKey: 'fault:gateway', query: 'gateway fixture', model: 'entry-fault-model', modelProvider: 'entry-fault-provider' }, runtime.agent);
  } catch (error) {
    firstFailure = errorText(error);
  }
  const answer = await runAgentForMessage({ sessionKey: 'fault:gateway', query: 'gateway retry', model: 'entry-fault-model', modelProvider: 'entry-fault-provider' }, runtime.agent);
  const recovered = attempts === 2 && answer === 'Gateway recovered';
  return { entry: 'gateway', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['gateway canonical event callback', 'Pi session boundary'], details: { answer } };
}

function cronJob(): CronJob {
  const now = Date.now();
  return { id: 'entry-fault-cron', name: 'entry fault cron', enabled: true, createdAtMs: now, updatedAtMs: now, schedule: { kind: 'every', everyMs: 60_000 }, payload: { message: 'cron fault fixture', model: 'entry-fault-model', modelProvider: 'entry-fault-provider' }, fulfillment: 'keep', state: { consecutiveErrors: 0, scheduleErrorCount: 0 } };
}

function targetSession() {
  return { sessionKey: 'whatsapp:entry-fault', createdAt: Date.now(), updatedAt: Date.now(), lastChannel: 'whatsapp', lastTo: 'fixture', lastAccountId: 'fixture-account', lastAgentId: 'upup-primary' };
}

async function cronFault(): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  const runtime = fixtureRuntime(async () => 'cron recovered');
  const job = cronJob();
  const store: CronStore = { version: 1, jobs: [job] };
  const runAgent = async () => {
    attempts++;
    if (attempts === 1) throw new Error('Cron provider timeout');
    return 'cron recovered';
  };
  await executeCronJob(job, store, { runtime, targetSession: targetSession(), validateOutbound: () => undefined, runAgent, sendMessage: async () => ({ messageId: 'fixture', toJid: 'fixture' }) });
  firstFailure = job.state.lastError ?? '';
  await executeCronJob(job, store, { runtime, targetSession: targetSession(), validateOutbound: () => undefined, runAgent, sendMessage: async () => ({ messageId: 'fixture', toJid: 'fixture' }) });
  const recovered = attempts === 2 && job.state.lastRunStatus === 'ok';
  return { entry: 'cron', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['cron state', 'outbound policy fixture'], details: { lastRunStatus: job.state.lastRunStatus, consecutiveErrors: job.state.consecutiveErrors } };
}

async function daemonFault(): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  const runtime = fixtureRuntime(async () => {
    attempts++;
    if (attempts === 1) throw new Error('Daemon provider timeout');
    return 'daemon recovered';
  });
  const worker = new TasksWorker(runtime.agent, runtime, { start: async () => 'unused-background' });
  const task = { id: 'entry-fault-daemon', type: 'agent:scheduled', payload: { message: 'daemon fault fixture' }, priority: 1, status: 'pending' as const, retryCount: 0 };
  runtime.agent.runPrompt = async () => { attempts++; if (attempts === 1) throw new Error('Daemon provider timeout'); return 'daemon-task-recovered'; };
  const first = await worker.execute(task);
  firstFailure = first.error ?? '';
  const second = await worker.execute({ ...task, id: 'entry-fault-daemon-retry' });
  const recovered = attempts === 2 && second.success;
  return { entry: 'daemon', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['daemon task result', 'Pi background capability'], details: { firstSuccess: first.success, secondSuccess: second.success, secondOutput: second.output } };
}

function piRpcCommand(): readonly string[] {
  // Always exercise the source entry: CI never builds `dist/`, and a stale
  // compiled binary would silently verify the previous migration state.
  // Set `UPUP_PI_VERIFY_BINARY=1` to cover a freshly built `dist/upup`.
  if (process.env.UPUP_PI_VERIFY_BINARY === '1') {
    const binary = join(root, 'dist', 'upup');
    if (Bun.file(binary).size > 0) return [binary, '--stdio'];
  }
  return [process.execPath, 'run', join(root, 'src', 'index.tsx'), '--stdio'];
}

/**
 * Pi-native stdio entry (`upup --stdio` -> Pi `main() --mode rpc`).
 *
 * Fault surface: a malformed JSONL line must be answered with a `parse`
 * error frame (never a crash), and the very next well-formed command must
 * still round-trip. Recovery is the second command succeeding on the same
 * child process.
 */
async function stdioFault(directory: string): Promise<EntryFaultEvidence> {
  const client = spawnPiRpcStdio({ root, env: { UPUP_SESSION_DIR: directory }, command: piRpcCommand() });
  let firstFailure = '';
  const attempts = 1;
  client.write('{not-json}');
  const parsed = await client.call({ type: 'get_state' });
  const frames = client.frames() as ReadonlyArray<{ type?: string; command?: string; success?: boolean }>;
  const parseFrame = frames.find((frame) => frame.type === 'response' && frame.command === 'parse');
  if (!parseFrame) firstFailure = 'malformed JSONL line was not answered with a Pi parse error frame';
  const recovered = Boolean(parseFrame) && parsed.success === true && parsed.data !== undefined;
  const exitCode = await client.close();
  const stderrText = client.stderr();
  return {
    entry: 'stdio',
    status: recovered && (exitCode === 0 || exitCode === 143) ? 'passed' : 'failed',
    firstFailure,
    recovered,
    attempts,
    artifacts: ['Pi rpc stdio child', 'Pi parse error frame', 'Pi get_state round-trip'],
    details: {
      malformedFrames: frames.filter((frame) => frame.command === 'parse').length,
      responseCommand: parsed.command,
      responseSuccess: parsed.success,
      exitCode,
      stderrBytes: stderrText.length,
    },
  };
}

/**
 * Pi client entry: an unusable entrypoint must fail fast, and the real
 * entrypoint must then complete a command round-trip on the same client
 * implementation (recovery after a transport-level fault).
 */
async function clientFault(directory: string): Promise<EntryFaultEvidence> {
  let firstFailure = '';
  let attempts = 0;
  const broken = spawnPiRpcStdio({
    root,
    env: { UPUP_SESSION_DIR: directory },
    command: [process.execPath, '-e', 'process.exit(7)'],
    timeoutMs: 5_000,
  });
  try {
    await broken.call({ type: 'get_state' });
    firstFailure = 'unusable entrypoint unexpectedly answered a command';
  } catch (error) {
    firstFailure = errorText(error);
  }
  await broken.close();
  attempts += 1;

  const client = spawnPiRpcStdio({ root, env: { UPUP_SESSION_DIR: directory }, command: piRpcCommand() });
  const sessions = await client.call({ type: 'new_session' });
  const state = await client.call({ type: 'get_state' });
  attempts += 1;
  await client.close();
  const recovered = Boolean(firstFailure) && sessions.success === true && state.success === true;
  return {
    entry: 'client',
    status: recovered ? 'passed' : 'failed',
    firstFailure,
    recovered,
    attempts,
    artifacts: ['Pi rpc client failed connect', 'Pi rpc new_session', 'Pi rpc get_state'],
    details: { newSessionSuccess: sessions.success, stateSuccess: state.success },
  };
}

async function evalFault(): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  const eventStream = { stream: async function* (): AsyncGenerator<UpUpAgentEvent> { attempts++; if (attempts === 1) throw new Error('Eval provider timeout'); yield* doneStream('eval recovered'); } };
  const promptRunner = async () => '{"score":1,"comment":"fixture recovered"}';
  try { for await (const _event of createEvaluationRunner(eventStream, promptRunner, 1)()) { /* expected first failure */ } } catch (error) { firstFailure = errorText(error); }
  let completed = false;
  for await (const event of createEvaluationRunner(eventStream, promptRunner, 1)()) if (event.type === 'complete') completed = true;
  const recovered = attempts === 2 && completed;
  return { entry: 'eval', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['evaluation JSONL', 'fixture evaluator'], details: { completed } };
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const directory = await mkdtemp(join(root, '.upup', 'pi-entry-faults-'));
  const entries: EntryFaultEvidence[] = [];
  try {
    process.stderr.write('[pi-entry-faults] cli/gateway/cron/daemon\n');
    entries.push(await cliFault(), await gatewayFault(), await cronFault(), await daemonFault());
    process.stderr.write('[pi-entry-faults] stdio\n');
    entries.push(await stdioFault(directory));
    process.stderr.write('[pi-entry-faults] client\n');
    entries.push(await clientFault(directory));
    process.stderr.write('[pi-entry-faults] eval\n');
    entries.push(await evalFault());
  } finally { await rm(directory, { recursive: true, force: true }); }
  const report: EntryFaultReport = { schema: 'upup.pi.entry-faults.v1', generatedAt: new Date().toISOString(), fixture: 'local-pi-entry-fault-injection', sharedRuntime: 'Pi AgentSession + Package public APIs', entries, summary: { total: entries.length, passed: entries.filter((entry) => entry.status === 'passed').length, failed: entries.filter((entry) => entry.status === 'failed').length }, durationMs: Date.now() - startedAt };
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

await run();
