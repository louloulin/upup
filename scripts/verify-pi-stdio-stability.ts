/**
 * C14 — stdio transport stability under concurrency.
 *
 * What this contract is actually about: several independent `upup --stdio`
 * processes sharing one session directory must be able to run interleaved
 * RPC traffic without (a) deadlocking on Pi's per-session file lock,
 * (b) leaving `.pi-lock` residue behind, or (c) emitting malformed JSONL.
 *
 * The harness drives Pi's **native** RPC surface — commands shaped
 * `{ id, type: "<command>", ...params }`, answered with
 * `{ id, type: "response", command, success, data | error }`. That is what
 * `upup --stdio` serves: it forwards to `main() --mode rpc` → `runRpcMode`.
 *
 * History: this file used to speak a bespoke JSON-RPC envelope
 * (`{ jsonrpc: "2.0", id, method, params }`). That protocol belonged to the
 * UpUp stdio server package removed by the Pi Native migration, but the
 * verifier was never updated — so every round failed with
 * `Unknown command: undefined` and the contract had been reporting a false
 * negative ever since. The intent (concurrency, lock hygiene, JSONL
 * well-formedness) is unchanged; only the wire shape is corrected.
 *
 * Reference client for the same surface: `scripts/pi-rpc-stdio-client.ts`.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PiRpcResponse {
  id?: string;
  type: string;
  command?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
}

interface StabilityReport {
  schema: 'upup.pi.stdio-stability.v1';
  rounds: number;
  completedRounds: number;
  /** Concurrent `upup --stdio` processes per round. */
  sessionsPerRound: number;
  /** RPC requests issued per round, summed across both clients. */
  requestsPerRound: number;
  failures: Array<{ round: number; phase: string; message: string; stderr: string; exitCode: number | null }>;
  lockResidues: string[];
  malformedJsonl: string[];
  durationMs: number;
}

/** Minimal JSONL client for Pi's `runRpcMode` command/response shape. */
class RpcClient {
  private buffer = '';
  private readonly pending = new Map<string, {
    resolve: (response: PiRpcResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private nextId = 1;

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

  /**
   * Send a Pi RPC command and resolve with its response envelope.
   *
   * Non-`response` frames (streamed events, extension UI requests) are
   * ignored: this verifier asserts transport stability, not turn output.
   */
  call(command: Record<string, unknown>, timeoutMs = 60_000): Promise<PiRpcResponse> {
    const id = `stability-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout id=${id} type=${String(command.type)}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let frame: PiRpcResponse;
      try {
        frame = JSON.parse(line) as PiRpcResponse;
      } catch {
        continue;
      }
      if (frame.type !== 'response' || typeof frame.id !== 'string') continue;
      const request = this.pending.get(frame.id);
      if (!request) continue;
      this.pending.delete(frame.id);
      clearTimeout(request.timer);
      if (frame.success === false) request.reject(new Error(`${frame.command}: ${frame.error ?? 'unknown error'}`));
      else request.resolve(frame);
    }
  }
}

/** Resolve the CLI invocation: prefer the compiled binary, fall back to source. */
function resolveCommand(): { command: string; args: string[] } {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const binary = join(root, 'dist', 'upup');
  if (existsSync(binary)) return { command: binary, args: ['--stdio'] };
  return { command: process.execPath, args: [join(root, 'src', 'index.tsx'), '--stdio'] };
}

function startServer(sessionDir: string, command: string, args: string[]): ChildProcessWithoutNullStreams {
  return spawn(command, args, {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
    // `UPUP_SESSION_DIR` is UpUp's legacy spelling; the launcher mirrors it to
    // the name Pi actually reads (`UPUP_CODING_AGENT_SESSION_DIR`), so both
    // processes in a round share one session dir and genuinely contend.
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

/**
 * Assert every file under `sessionDir` is either a well-formed JSONL session
 * or a lock/auxiliary artifact, and that no `.pi-lock` survived the round.
 */
async function inspectSessionDir(sessionDir: string, report: StabilityReport): Promise<void> {
  const entries = await readdir(sessionDir, { recursive: true }).catch(() => [] as string[]);
  for (const entry of entries.filter((name) => name.endsWith('.pi-lock'))) {
    report.lockResidues.push(join(sessionDir, entry));
  }
  for (const entry of entries.filter((name) => name.endsWith('.jsonl'))) {
    const path = join(sessionDir, entry);
    try {
      const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
      for (const line of lines) JSON.parse(line);
    } catch {
      report.malformedJsonl.push(path);
    }
  }
}

async function run(): Promise<void> {
  const parsedRounds = Number.parseInt(process.env.UPUP_PI_STDIO_STABILITY_ROUNDS ?? '3', 10);
  const rounds = Number.isFinite(parsedRounds) && parsedRounds > 0 ? parsedRounds : 3;
  const report: StabilityReport = {
    schema: 'upup.pi.stdio-stability.v1',
    rounds,
    completedRounds: 0,
    sessionsPerRound: 2,
    requestsPerRound: 8,
    failures: [],
    lockResidues: [],
    malformedJsonl: [],
    durationMs: 0,
  };
  const { command, args } = resolveCommand();
  const startedAt = Date.now();

  // Parent for round session dirs. Kept inside the repo's `.upup/` so the run
  // stays on the same filesystem as the lock files it is testing.
  const container = join(process.cwd(), '.upup');
  await mkdir(container, { recursive: true });

  for (let round = 1; round <= rounds; round++) {
    const sessionDir = await mkdtemp(join(container, 'pi-stdio-stability-'));
    const children = [startServer(sessionDir, command, args), startServer(sessionDir, command, args)];
    const clients = children.map((child) => new RpcClient(child));
    try {
      // Both processes initialize their session concurrently in one dir —
      // this is the lock contention the contract exists to exercise.
      await Promise.all([
        clients[0]!.call({ type: 'new_session' }),
        clients[1]!.call({ type: 'new_session' }),
      ]);
      const states = await Promise.all(clients.map((client) => client.call({ type: 'get_state' })));
      for (const state of states) {
        const data = state.data as { sessionId?: unknown; sessionFile?: unknown } | undefined;
        if (typeof data?.sessionId !== 'string') throw new Error('get_state did not return a sessionId');
        if (typeof data.sessionFile !== 'string') throw new Error('get_state did not return a sessionFile');
      }

      // Interleave shared-directory metadata writes from both processes.
      await Promise.all([
        clients[0]!.call({ type: 'set_session_name', name: `stability-${round}-a` }),
        clients[1]!.call({ type: 'set_session_name', name: `stability-${round}-b` }),
      ]);

      // Independent reads against the live lock; all four must complete.
      await Promise.all([
        clients[0]!.call({ type: 'get_tree' }),
        clients[1]!.call({ type: 'get_entries' }),
        clients[0]!.call({ type: 'get_messages' }),
        clients[1]!.call({ type: 'get_session_stats' }),
      ]);

      // Every session file written this round must be parseable JSONL.
      await inspectSessionDir(sessionDir, report);
      report.completedRounds++;
    } catch (error) {
      const stopped = await Promise.all(children.map(stopServer));
      report.failures.push({
        round,
        phase: 'rpc',
        message: error instanceof Error ? error.message : String(error),
        stderr: stopped.map((item) => item.stderr).join('\n'),
        exitCode: stopped.find((item) => item.code !== 0)?.code ?? null,
      });
      await inspectSessionDir(sessionDir, report);
      await rm(sessionDir, { recursive: true, force: true });
      continue;
    }
    await Promise.all(children.map(stopServer));
    // Re-inspect after shutdown: a lock released on exit must not be left behind.
    await inspectSessionDir(sessionDir, report);
    await rm(sessionDir, { recursive: true, force: true });
  }

  report.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(report, null, 2));
  if (
    report.completedRounds !== report.rounds
    || report.lockResidues.length > 0
    || report.malformedJsonl.length > 0
  ) {
    process.exitCode = 1;
  }
}

await run();
