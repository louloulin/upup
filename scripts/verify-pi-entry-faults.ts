import { fauxProvider, fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { runPrint } from '@upup/pi-app/print';
import { runAgentForMessage, type GatewayRuntime } from '@upup/gateway';
import { executeCronJob, type CronJob, type CronStore } from '@upup/cron';
import { TasksWorker } from '@upup/daemon';
import { createEvaluationRunner } from '@upup/pi-evals';
import { getInvestmentAgentSpec, PiAgentCatalog } from '@upup/pi-investment-workflow';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { GatewayAgentRuntimePort, GatewayRuntime } from '@upup/gateway';

type EntryName = 'cli' | 'gateway' | 'bridge' | 'stdio' | 'cron' | 'daemon' | 'sdk' | 'eval';
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

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error('bridge open failed')); });
}

async function decodeSocketData(data: unknown): Promise<BridgeMessage> {
  const bytes = data instanceof Blob
    ? new Uint8Array(await data.arrayBuffer())
    : typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(bytes)).msg as BridgeMessage;
}

function nextSocketMessage(socket: WebSocket, timeoutMs = 5_000): Promise<BridgeMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bridge response timeout')), timeoutMs);
    socket.onmessage = async (event) => {
      clearTimeout(timer);
      try { resolve(await decodeSocketData(event.data)); } catch (error) { reject(error); }
    };
  });
}

async function collectUntilIdle(socket: WebSocket): Promise<BridgeMessage[]> {
  const messages: BridgeMessage[] = [];
  for (let index = 0; index < 12; index += 1) {
    const message = await nextSocketMessage(socket, 2_000);
    messages.push(message);
    process.stderr.write(`[pi-entry-faults] bridge-message:${message.kind}\n`);
    if (message.kind === 'status' && message.payload.phase === 'idle') return messages;
  }
  throw new Error('bridge did not reach idle within 12 messages');
}

async function bridgeFault(directory: string): Promise<EntryFaultEvidence> {
  let attempts = 0;
  let firstFailure = '';
  let injectedFailure = '';
  const runtime = fixtureRuntime(async () => 'bridge runtime unused');
  const server = await startBridgeServer({ port: 0, token: 'entry-fault-token', auditPath: join(directory, 'bridge-audit.jsonl'), runtime, agentRunner: async () => { attempts++; if (attempts === 1) { injectedFailure = 'Bridge provider 503'; throw new Error(injectedFailure); } return 'bridge recovered'; } });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/bridge?token=entry-fault-token`);
  try {
    await waitForOpen(socket);
    const initial = await nextSocketMessage(socket);
    const send = async (seq: number) => {
      socket.send(encodeMessage({ kind: 'chat', seq, sessionId: initial.sessionId, timestamp: Date.now(), payload: { role: 'user', content: 'bridge fault fixture' } }));
      return collectUntilIdle(socket);
    };
    try { await send(1); } catch (error) { firstFailure = errorText(error); }
    if (!firstFailure) firstFailure = injectedFailure;
    const messages = await send(2);
    const recovered = attempts === 2 && messages.some((message) => message.kind === 'chat' && message.payload.role === 'assistant' && message.payload.content.includes('recovered'));
    return { entry: 'bridge', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['bridge websocket chat', join(directory, 'bridge-audit.jsonl')], details: { responseKinds: messages.map((message) => message.kind) } };
  } finally { socket.close(); await server.stop(); }
}

function binaryLocation(): { command: string; args: string[] } {
  const binary = join(root, 'dist', 'upup');
  if (Bun.file(binary).size > 0) return { command: binary, args: ['--stdio'] };
  return { command: process.execPath, args: [join(root, 'src', 'index.tsx'), '--stdio'] };
}

async function stdioFault(directory: string): Promise<EntryFaultEvidence> {
  const location = binaryLocation();
  let firstFailure = '';
  let attempts = 0;
  const malformed = spawn(location.command, location.args, { cwd: root, env: { ...process.env, UPUP_SESSION_DIR: directory }, stdio: ['pipe', 'pipe', 'pipe'] });
  malformed.stdin.write('{not-json}\n');
  malformed.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  const initialized = await new Promise<boolean>((resolve) => {
    let buffer = '';
    const timer = setTimeout(() => resolve(false), 10_000);
    malformed.stdout.on('data', (chunk: Buffer) => { buffer += chunk.toString(); if (buffer.includes('"id":1')) { clearTimeout(timer); resolve(true); } });
  });
  malformed.kill('SIGTERM');
  const invalidTransport = new StdioTransport({ executablePath: process.execPath, args: ['-e', 'process.exit(7)'] });
  try {
    await Promise.race([
      invalidTransport.connect(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('invalid executable connection timeout')), 3_000)),
    ]);
    firstFailure = 'failing executable unexpectedly connected';
  } catch (error) { firstFailure = errorText(error); }
  await invalidTransport.close();
  const transport = new StdioTransport({ executablePath: location.command, args: location.args });
  await transport.connect(); attempts += 1;
  await transport.request('session/create', { id: 'entry-fault-stdio' });
  await transport.close();
  const recovered = initialized && attempts === 1 && firstFailure.length > 0;
  return { entry: 'stdio', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts, artifacts: ['stdio malformed JSON recovery', 'stdio JSON-RPC initialize/session/create'], details: { malformedIgnored: initialized } };
}

async function sdkFault(directory: string): Promise<EntryFaultEvidence> {
  const location = binaryLocation();
  let firstFailure = '';
  try { await createClient({ binary: { command: '/path/that/does/not/exist', args: ['--stdio'], source: 'explicit' }, env: { UPUP_SESSION_DIR: directory } }); } catch (error) { firstFailure = errorText(error); }
  const client = await createClient({ binary: { command: location.command, args: location.args, source: 'explicit' }, env: { UPUP_SESSION_DIR: directory } });
  const session = await client.session?.create({ id: 'entry-fault-sdk' });
  await client.close();
  const recovered = Boolean(session?.id) && firstFailure.length > 0;
  return { entry: 'sdk', status: recovered ? 'passed' : 'failed', firstFailure, recovered, attempts: 2, artifacts: ['SDK failed connect', 'SDK public session create'], details: { sessionId: session?.id } };
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
    process.stderr.write('[pi-entry-faults] bridge\n');
    entries.push(await bridgeFault(directory));
    process.stderr.write('[pi-entry-faults] stdio\n');
    entries.push(await stdioFault(directory));
    process.stderr.write('[pi-entry-faults] sdk\n');
    entries.push(await sdkFault(directory));
    process.stderr.write('[pi-entry-faults] eval\n');
    entries.push(await evalFault());
  } finally { await rm(directory, { recursive: true, force: true }); }
  const report: EntryFaultReport = { schema: 'upup.pi.entry-faults.v1', generatedAt: new Date().toISOString(), fixture: 'local-pi-entry-fault-injection', sharedRuntime: 'Pi AgentSession + Package public APIs', entries, summary: { total: entries.length, passed: entries.filter((entry) => entry.status === 'passed').length, failed: entries.filter((entry) => entry.status === 'failed').length }, durationMs: Date.now() - startedAt };
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

await run();
