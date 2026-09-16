/**
 * Minimal stdio client for the Pi-native `upup --stdio` entry.
 *
 * Sprint 4 cleanup (Pi Native migration): the bespoke `@upup/pi-stdio`
 * transport was deleted in favour of Pi's own `runRpcMode`. This helper is the
 * verification-side counterpart: it spawns `src/index.tsx --stdio` (which
 * forwards to Pi `main() --mode rpc`) and speaks Pi's native JSONL command
 * shape — `{ id, type: "<command>", ...params }` in, and
 * `{ id, type: "response", command, success, data | error }` out — so the
 * entry verifiers exercise the real Pi transport instead of a re-implementation
 * of it.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface PiRpcStdioOptions {
  /** Repository root used as the child `cwd`. */
  readonly root: string;
  /** Extra environment entries merged over `process.env`. */
  readonly env?: Record<string, string>;
  /** Per-request timeout. Defaults to 20s. */
  readonly timeoutMs?: number;
  /**
   * Explicit `[command, ...args]` override. Defaults to
   * `[bun, run, <root>/src/index.tsx, --stdio]` so the verifiers exercise the
   * source entry; pass `['<root>/dist/upup', '--stdio']` to cover a compiled
   * binary when one exists.
   */
  readonly command?: readonly string[];
}

/** A Pi RPC response envelope as emitted by `runRpcMode` on stdout. */
export interface PiRpcResponse {
  readonly id?: string;
  readonly type: string;
  readonly command?: string;
  readonly success?: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export interface PiRpcCommand {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface PiRpcStdio {
  /** Raw child pid (for diagnostics). */
  readonly pid: number | undefined;
  /** Send a Pi RPC command and resolve with the matching response envelope. */
  call(command: PiRpcCommand): Promise<PiRpcResponse>;
  /** Write an arbitrary (possibly malformed) line to the child stdin. */
  write(line: string): void;
  /** Collected stderr so far. */
  stderr(): string;
  /** Parsed JSONL frames received so far. */
  frames(): readonly unknown[];
  /** True once the child process has exited. */
  hasExited(): boolean;
  /** Resolves with the exit code once the child terminates (null on timeout). */
  waitForExit(timeoutMs?: number): Promise<number | null>;
  /** Terminate the child and resolve with its exit code. */
  close(signal?: NodeJS.Signals): Promise<number | null>;
}

export function spawnPiRpcStdio(options: PiRpcStdioOptions): PiRpcStdio {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const command = options.command ?? [process.execPath, 'run', join(options.root, 'src', 'index.tsx'), '--stdio'];
  const [executable, ...args] = command;
  const child: ChildProcess = spawn(executable!, args, {
    cwd: options.root,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let exited = false;
  let exitCode: number | null = null;
  let nextId = 1;
  const received: unknown[] = [];
  const pending = new Map<string, { resolve: (value: PiRpcResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const exitWaiters: Array<(code: number | null) => void> = [];

  const settle = (id: string, outcome: PiRpcResponse | Error): void => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (outcome instanceof Error) entry.reject(outcome);
    else entry.resolve(outcome);
  };

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    received.push(parsed);
    const frame = parsed as PiRpcResponse;
    if (frame.type === 'response' && typeof frame.id === 'string') settle(frame.id, frame);
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  });
  child.stderr?.on('data', (chunk: Buffer) => { stderrBuffer += chunk.toString(); });

  const failAll = (error: Error): void => {
    for (const id of [...pending.keys()]) settle(id, error);
  };

  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
    failAll(new Error(`pi rpc child exited with code ${code}`));
    for (const waiter of exitWaiters.splice(0)) waiter(code);
  });
  child.once('error', (error) => failAll(error instanceof Error ? error : new Error(String(error))));

  const waitForExit = (waitMs: number): Promise<number | null> => {
    if (exited) return Promise.resolve(exitCode);
    return new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        const index = exitWaiters.indexOf(waiter);
        if (index >= 0) exitWaiters.splice(index, 1);
        resolve(null);
      }, waitMs);
      const waiter = (code: number | null): void => { clearTimeout(timer); resolve(code); };
      timer.unref?.();
      exitWaiters.push(waiter);
    });
  };

  return {
    pid: child.pid,
    call(command) {
      const id = `upup-verify-${nextId++}`;
      return new Promise<PiRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`pi rpc command "${command.type}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
        pending.set(id, { resolve, reject, timer });
        child.stdin?.write(`${JSON.stringify({ id, ...command })}\n`);
      });
    },
    write(line) {
      child.stdin?.write(line.endsWith('\n') ? line : `${line}\n`);
    },
    stderr: () => stderrBuffer,
    frames: () => received,
    hasExited: () => exited,
    waitForExit,
    close(signal = 'SIGTERM') {
      if (exited) return Promise.resolve(exitCode);
      const waiter = waitForExit(5_000);
      child.kill(signal);
      return waiter;
    },
  };
}
