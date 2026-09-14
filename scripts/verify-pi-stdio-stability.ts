import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface StabilityReport {
  schema: 'upup.pi.stdio-stability.v1';
  rounds: number;
  completedRounds: number;
  sessionsPerRound: number;
  requestsPerRound: number;
  failures: Array<{ round: number; phase: string; message: string; stderr: string; exitCode: number | null }>;
  lockResidues: string[];
  malformedJsonl: string[];
  durationMs: number;
}

class RpcClient {
  private buffer = '';
  private readonly pending = new Map<number, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
    child.once('exit', (code, signal) => {
      for (const [id, request] of this.pending) {
        clearTimeout(request.timer);
        request.reject(new Error(`stdio child exited before response id=${id}, code=${code}, signal=${signal ?? 'none'}`));
      }
      this.pending.clear();
    });
  }

  request(id: number, method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<RpcResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout id=${id} method=${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let response: RpcResponse;
      try {
        response = JSON.parse(line) as RpcResponse;
      } catch {
        continue;
      }
      const request = this.pending.get(response.id);
      if (!request) continue;
      this.pending.delete(response.id);
      clearTimeout(request.timer);
      if (response.error) request.reject(new Error(`${response.error.code}: ${response.error.message}`));
      else request.resolve(response);
    }
  }
}

function startServer(sessionDir: string): ChildProcessWithoutNullStreams {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const binary = join(root, 'dist', 'upup');
  const command = Bun.file(binary).size > 0 ? binary : process.execPath;
  const args = command === binary ? ['--stdio'] : [join(root, 'src', 'index.tsx'), '--stdio'];
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, UPUP_SESSION_DIR: sessionDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function stopServer(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stderr: string }> {
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  if (child.exitCode === null) child.kill('SIGTERM');
  const code = await new Promise<number | null>((resolve) => child.once('exit', (exitCode) => resolve(exitCode)));
  return { code, stderr };
}

async function run(): Promise<void> {
  const rounds = Number.parseInt(process.env.UPUP_PI_STDIO_STABILITY_ROUNDS ?? '3', 10);
  const report: StabilityReport = {
    schema: 'upup.pi.stdio-stability.v1',
    rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : 3,
    completedRounds: 0,
    sessionsPerRound: 2,
    requestsPerRound: 8,
    failures: [],
    lockResidues: [],
    malformedJsonl: [],
    durationMs: 0,
  };
  const startedAt = Date.now();
  for (let round = 1; round <= report.rounds; round++) {
    const sessionDir = await mkdtemp(join(process.cwd(), '.upup', 'pi-stdio-stability-'));
    const children = [startServer(sessionDir), startServer(sessionDir)];
    const clients = children.map((child) => new RpcClient(child));
    try {
      await Promise.all(clients.map((client, index) => client.request(1, 'initialize', { clientName: `stability-${round}-${index}`, clientVersion: '1.0.0' }, 15_000)));
      await Promise.all([
        clients[0]!.request(2, 'session/create', { id: `stability-${round}-a` }),
        clients[1]!.request(2, 'session/create', { id: `stability-${round}-b` }),
      ]);
      await Promise.all([
        clients[0]!.request(3, 'session/update', { id: `stability-${round}-a`, metadata: { round, writer: 'a' } }),
        clients[1]!.request(3, 'session/update', { id: `stability-${round}-a`, metadata: { round, writer: 'b' } }),
      ]);
      const exported = await clients[0]!.request(4, 'session/export', { id: `stability-${round}-a` });
      const exportedPath = (exported.result as { path?: unknown }).path;
      if (typeof exportedPath !== 'string') throw new Error('session/export did not return a path');
      await Promise.all([
        clients[0]!.request(5, 'session/get', { id: `stability-${round}-a` }),
        clients[1]!.request(5, 'session/get', { id: `stability-${round}-b` }),
        clients[0]!.request(6, 'session/messages', { id: `stability-${round}-a` }),
        clients[1]!.request(6, 'session/messages', { id: `stability-${round}-b` }),
      ]);
      const lines = (await readFile(exportedPath, 'utf8')).split('\n').filter(Boolean);
      for (const line of lines) JSON.parse(line);
      report.completedRounds++;
    } catch (error) {
      const stopped = await Promise.all(children.map(stopServer));
      report.failures.push({ round, phase: 'rpc', message: error instanceof Error ? error.message : String(error), stderr: stopped.map((item) => item.stderr).join('\n'), exitCode: stopped.find((item) => item.code !== 0)?.code ?? null });
      const entries = await readdir(sessionDir, { recursive: true }).catch(() => [] as string[]);
      report.lockResidues.push(...entries.filter((entry) => entry.endsWith('.pi-lock')).map((entry) => join(sessionDir, entry)));
      for (const entry of entries.filter((entry) => entry.endsWith('.jsonl'))) {
        try {
          const lines = (await readFile(join(sessionDir, entry), 'utf8')).split('\n').filter(Boolean);
          for (const line of lines) JSON.parse(line);
        } catch {
          report.malformedJsonl.push(join(sessionDir, entry));
        }
      }
      await rm(sessionDir, { recursive: true, force: true });
      continue;
    }
    await Promise.all(children.map(stopServer));
    const entries = await readdir(sessionDir, { recursive: true }).catch(() => [] as string[]);
    const residues = entries.filter((entry) => entry.endsWith('.pi-lock'));
    report.lockResidues.push(...residues.map((entry) => join(sessionDir, entry)));
    for (const entry of entries.filter((entry) => entry.endsWith('.jsonl'))) {
      try {
        const lines = (await readFile(join(sessionDir, entry), 'utf8')).split('\n').filter(Boolean);
        for (const line of lines) JSON.parse(line);
      } catch {
        report.malformedJsonl.push(join(sessionDir, entry));
      }
    }
    await rm(sessionDir, { recursive: true, force: true });
  }
  report.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(report, null, 2));
  if (report.completedRounds !== report.rounds || report.lockResidues.length > 0 || report.malformedJsonl.length > 0) process.exitCode = 1;
}

await run();
