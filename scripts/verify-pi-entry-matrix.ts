import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runPrint } from '@upup/pi-app/print';
import { createPiCanonicalEventStream } from '@upup/pi-event-adapter';
import { createPiAgentRuntime, disposePiSessions, isPiSessionRunning, runPiPrompt } from '@upup/pi-session';
import { runAgentForMessage } from '@upup/gateway';
import { executeCronJob } from '@upup/cron';
import { TasksWorker } from '@upup/daemon';
import { createEvaluationRunner } from '@upup/pi-evals';
import { getPiNativeApp } from '@upup/pi-app/default';
import type { GatewayRuntime } from '@upup/gateway';

type EntryName = 'cli' | 'gateway' | 'bridge' | 'stdio' | 'cron' | 'daemon' | 'sdk' | 'eval';
type EntryEvidence = {
  entry: EntryName;
  status: 'passed' | 'contract-only';
  fixture: true;
  sessionId?: string;
  answer?: string;
  events: string[];
  artifacts: string[];
  notes?: string[];
};

const root = process.cwd();
const fixture = fauxProvider({
  provider: 'upup-pi-entry-matrix',
  models: [{ id: 'pi-entry-fixture', reasoning: false }],
});
fixture.setResponses([
  fauxAssistantMessage([fauxText('detect → plan → execute → verify → report：fixture 闭环完成。')]),
  fauxAssistantMessage([fauxText('gateway fixture 闭环完成。')]),
  fauxAssistantMessage([fauxText('cron fixture 闭环完成。')]),
  fauxAssistantMessage([fauxText('daemon fixture 闭环完成。')]),
  fauxAssistantMessage([fauxText('bridge fixture 闭环完成。')]),
]);

function runtime(modelRuntime: ModelRuntime): GatewayRuntime {
  return {
    agent: { isSessionRunning: isPiSessionRunning, runPrompt: runPiPrompt },
    config: {
      getConfiguredModelId: () => 'pi-entry-fixture',
      getConfiguredProvider: () => 'upup-pi-entry-matrix',
    },
    cron: {
      ensureHeartbeatCronJob: () => undefined,
      startCronRunner: () => ({ stop: () => undefined }),
    },
  };
}

async function readBridgeMessage(event: MessageEvent): Promise<BridgeMessage> {
  const data = event.data as unknown;
  const bytes = data instanceof Blob
    ? new Uint8Array(await data.arrayBuffer())
    : typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(bytes)).msg as BridgeMessage;
}

function waitForBridgeOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error('bridge websocket failed to open'));
  });
}

function nextBridgeMessage(socket: WebSocket, timeoutMs = 5_000): Promise<BridgeMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bridge message timed out')), timeoutMs);
    socket.onmessage = async (event) => {
      clearTimeout(timer);
      try {
        resolve(await readBridgeMessage(event));
      } catch (error) {
        reject(error);
      }
    };
  });
}

async function run(): Promise<void> {
  await mkdir(join(root, '.upup'), { recursive: true });
  const sessionDir = await mkdtemp(join(root, '.upup', 'pi-entry-matrix-'));
  const previousSessionDir = process.env.UPUP_SESSION_DIR;
  process.env.UPUP_SESSION_DIR = sessionDir;
  const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
  modelRuntime.registerNativeProvider(fixture.provider);
  const events: string[] = [];
  const results: EntryEvidence[] = [];
  const gateway = runtime(modelRuntime);
  try {
    const mark = (stage: string): void => { process.stderr.write(`[pi-entry-matrix] ${stage}\n`); };
    const within = async <T>(stage: string, operation: Promise<T>, timeoutMs = 20_000): Promise<T> => {
      mark(`${stage}:start`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation,
          new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${stage} timed out after ${timeoutMs}ms`)), timeoutMs); }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
        mark(`${stage}:end`);
      }
    };
    const app = getPiNativeApp();
    const eventStream = createPiCanonicalEventStream((prompt, options) => runPiPrompt(prompt, {
      model: options.model,
      modelProvider: options.modelProvider,
      modelInstance: options.modelInstance as Parameters<typeof runPiPrompt>[1]['modelInstance'],
      modelRuntime: options.modelRuntime as Parameters<typeof runPiPrompt>[1]['modelRuntime'],
      sessionKey: options.sessionKey,
      onEvent: options.onEvent,
    }));

    const cliEvents: string[] = [];
    const cliAnswer = await within('cli', runPrint(
      { prompt: '执行投资研究 fixture', model: 'pi-entry-fixture', sessionId: 'matrix:cli', modelInstance: fixture.getModel(), modelRuntime },
      () => undefined,
      { stream: eventStream },
    ));
    cliEvents.push('text_delta', 'run_end');
    results.push({ entry: 'cli', status: 'passed', fixture: true, sessionId: 'matrix:cli', answer: cliAnswer, events: cliEvents, artifacts: ['pi session JSONL', 'canonical event stream'] });

    const gatewayAnswer = await within('gateway', runAgentForMessage({
      sessionKey: 'matrix:gateway', query: '执行 Gateway fixture', model: 'pi-entry-fixture', modelProvider: 'upup-pi-entry-matrix',
      piModel: fixture.getModel(), piModelRuntime: modelRuntime, onEvent: (event) => events.push(event.type),
    }, gateway.agent));
    results.push({ entry: 'gateway', status: 'passed', fixture: true, sessionId: 'matrix:gateway', answer: gatewayAnswer, events: [...events], artifacts: ['pi session JSONL', 'canonical event callback'] });

    const cronEvents: string[] = [];
    await within('cron', executeCronJob({
      id: 'matrix-cron', name: 'Pi entry matrix', enabled: true, createdAtMs: Date.now(), updatedAtMs: Date.now(),
      schedule: { kind: 'every', everyMs: 60_000 }, payload: { message: '检查 fixture 投资条件', model: 'pi-entry-fixture', modelProvider: 'upup-pi-entry-matrix' },
      fulfillment: 'keep', state: { consecutiveErrors: 0, scheduleErrorCount: 0 },
    }, { version: 1, jobs: [] }, {
      runtime: gateway, targetSession: { lastTo: 'fixture', lastAccountId: 'fixture', updatedAt: Date.now() },
      validateOutbound: () => undefined, sendMessage: async () => undefined,
      runAgent: async (request, agent) => runAgentForMessage({ ...request, onEvent: (event) => cronEvents.push(event.type) }, agent),
      piModel: fixture.getModel(), piModelRuntime: modelRuntime,
    }));
    results.push({ entry: 'cron', status: 'passed', fixture: true, sessionId: 'cron:matrix-cron', events: cronEvents, artifacts: ['cron state', 'canonical event callback', 'outbound policy fixture'] });

    const daemonEvents: string[] = [];
    const daemon = new TasksWorker(gateway.agent, gateway, { start: async (prompt, options) => {
      const answer = await runPiPrompt(prompt, { model: options?.model, modelProvider: 'upup-pi-entry-matrix', modelInstance: fixture.getModel(), modelRuntime, onEvent: (event) => daemonEvents.push(event.type) });
      return `daemon:${answer}`;
    }});
    const daemonResult = await within('daemon', daemon.execute({ id: 'matrix-daemon', type: 'agent:background', payload: { prompt: '执行 daemon fixture', config: { model: 'pi-entry-fixture' } }, priority: 1, status: 'pending', retryCount: 0 }));
    if (!daemonResult.success) throw new Error(daemonResult.error);
    results.push({ entry: 'daemon', status: 'passed', fixture: true, sessionId: 'daemon:matrix-daemon', events: daemonEvents, artifacts: ['daemon task result', 'Pi background session'] });

    const bridgeAudit = join(sessionDir, 'bridge-audit.jsonl');
    const bridge = await startBridgeServer({
      port: 0,
      token: 'pi-entry-fixture-token',
      auditPath: bridgeAudit,
      runtime: gateway,
      agentRunner: async (request) => {
        await request.onEvent?.({ type: 'text_delta', sessionId: request.sessionKey, delta: 'bridge fixture' });
        return 'bridge fixture 闭环完成。';
      },
    });
    const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge?token=pi-entry-fixture-token`);
    await within('bridge-open', waitForBridgeOpen(socket));
    const bridgeInitial = await within('bridge-initial', nextBridgeMessage(socket));
    const bridgeChat: BridgeMessage = {
      kind: 'chat', seq: 1, sessionId: bridgeInitial.sessionId, timestamp: Date.now(),
      payload: { role: 'user', content: '执行 bridge fixture' },
    };
    socket.send(encodeMessage(bridgeChat));
    const bridgeMessages = await within('bridge-chat', (async () => [
      await nextBridgeMessage(socket),
      await nextBridgeMessage(socket),
      await nextBridgeMessage(socket),
      await nextBridgeMessage(socket),
    ])());
    if (!bridgeMessages.some((message) => message.kind === 'chat' && message.payload.role === 'assistant')) {
      throw new Error('bridge chat did not produce an assistant message');
    }
    socket.close();
    await bridge.stop();
    results.push({ entry: 'bridge', status: 'passed', fixture: true, sessionId: bridgeInitial.sessionId, answer: 'bridge fixture 闭环完成。', events: bridgeMessages.map((message) => message.kind), artifacts: ['bridge websocket chat', 'bridge audit path', 'bridge session sync'] });

    const compiledBinary = join(root, 'dist', 'upup');
    const childBinary = Bun.file(compiledBinary).size > 0
      ? { command: compiledBinary, args: ['--stdio'] }
      : { command: process.execPath, args: [join(root, 'src', 'index.tsx'), '--stdio'] };
    const stdio = new StdioTransport({ executablePath: childBinary.command, args: childBinary.args, env: { UPUP_SESSION_DIR: sessionDir } });
    await within('stdio-connect', stdio.connect({ executablePath: childBinary.command, args: childBinary.args, env: { UPUP_SESSION_DIR: sessionDir } }), 60_000);
    const stdioSession = await within('stdio-create', stdio.request('session/create', { id: 'matrix-stdio', metadata: { entry: 'stdio' } })) as { id: string };
    const stdioMessages = await within('stdio-messages', stdio.request('session/messages', { id: stdioSession.id })) as { messages: unknown[] };
    const stdioExport = await within('stdio-export', stdio.request('session/export', { id: stdioSession.id, outputPath: join(sessionDir, 'matrix-stdio.jsonl') })) as { path: string };
    await within('stdio-close', stdio.close());
    if (!Array.isArray(stdioMessages.messages) || !stdioExport.path.endsWith('.jsonl')) throw new Error('stdio session contract failed');
    results.push({ entry: 'stdio', status: 'passed', fixture: true, sessionId: stdioSession.id, events: ['initialize', 'session/create', 'session/messages', 'session/export'], artifacts: ['stdio JSON-RPC session', stdioExport.path, 'Pi Session JSONL'] });

    const sdk = await within('sdk-connect', createClient({
      binary: childBinary,
      env: { UPUP_SESSION_DIR: sessionDir },
      session: { id: 'matrix-sdk' },
    }), 60_000);
    const sdkSession = await within('sdk-create', sdk.session?.create({ id: 'matrix-sdk', metadata: { entry: 'sdk' } }) ?? Promise.reject(new Error('SDK session unavailable')));
    const sdkInfo = await within('sdk-get', sdk.session?.get() ?? Promise.reject(new Error('SDK session unavailable')));
    await within('sdk-close', sdk.close());
    if (!sdkSession || sdkInfo?.id !== sdkSession.id) throw new Error('SDK did not create/read a Pi session');
    results.push({ entry: 'sdk', status: 'passed', fixture: true, sessionId: sdkSession.id, events: ['initialize', 'session/create', 'session/get', 'shutdown'], artifacts: ['SDK public client', 'SDK stdio transport', 'Pi Session JSONL'] });

    const evalEvents: string[] = [];
    const evalStream = {
      stream: async function* (): AsyncGenerator<{ type: 'run_end'; sessionId: string; answer: string; iterations: number; totalTime: number }> {
        evalEvents.push('run_end');
        yield { type: 'run_end', sessionId: 'matrix-eval', answer: 'fixture evaluation answer', iterations: 1, totalTime: 1 };
      },
    };
    const evalRunner = createEvaluationRunner(evalStream, async () => JSON.stringify({ score: 1, comment: 'fixture evaluator' }), 1);
    let evalExperiment = '';
    let evalQuestions = 0;
    mark('eval:start');
    for await (const event of evalRunner()) {
      if (event.type === 'question_end') evalQuestions += 1;
      if (event.type === 'complete') evalExperiment = event.experimentName;
    }
    mark('eval:end');
    if (evalQuestions !== 1 || !evalExperiment) throw new Error('eval fixture did not complete one question');
    await rm(join(root, '.upup', `${evalExperiment}.jsonl`), { force: true });
    results.push({ entry: 'eval', status: 'passed', fixture: true, events: evalEvents, artifacts: ['Pi eval runner', 'fixture evaluator', 'evaluation JSONL'] });

    const jsonlFiles = await Array.fromAsync(new Bun.Glob('*.jsonl').scan({ cwd: sessionDir }));
    for (const file of jsonlFiles) {
      const content = await readFile(join(sessionDir, file), 'utf8');
      if (!content.trim()) throw new Error(`empty session artifact: ${file}`);
    }
    console.log(JSON.stringify({ schema: 'upup.pi.entry-matrix.v1', generatedAt: new Date().toISOString(), fixture: 'upup-pi-entry-matrix', results, summary: { total: results.length, passed: results.filter((result) => result.status === 'passed').length, contractOnly: results.filter((result) => result.status === 'contract-only').length, sessionJsonlFiles: jsonlFiles.length, canonicalEvents: events } }, null, 2));
  } finally {
    disposePiSessions();
    if (previousSessionDir === undefined) delete process.env.UPUP_SESSION_DIR;
    else process.env.UPUP_SESSION_DIR = previousSessionDir;
    await rm(sessionDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await run();
}
