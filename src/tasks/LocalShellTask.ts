/**
 * Local shell command execution task.
 *
 * Runs a single command via Bun.spawn. Captures stdout, stderr, and
 * exit code. Respects cancellation via the AbortSignal — kills the
 * spawned process and surfaces the result as a cancelled task.
 *
 * Non-zero exit code is treated as a failure (TaskResult.ok = false,
 * error.code = 'nonzero-exit'). Callers can override by setting
 * `tolerateNonZero: true` in the input.
 */
import { BaseTask, type TaskContext, type TaskResult } from './types.js';

export interface LocalShellInput {
  /** Command name (e.g. 'npm', 'ls'). */
  command: string;
  /** Command arguments. */
  args?: string[];
  /** Working directory. */
  cwd?: string;
  /** Environment variables (merged with process.env). */
  env?: Record<string, string>;
  /** Optional task name (for logs/UI). */
  name?: string;
  /** If true, a non-zero exit is treated as a successful result. */
  tolerateNonZero?: boolean;
  /** Max output bytes to capture (per stream). Default 1 MB. */
  maxOutputBytes?: number;
}

export interface LocalShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** True if the task was killed by the abort signal. */
  killed: boolean;
}

const DEFAULT_MAX_OUTPUT = 1024 * 1024;

export class LocalShellTask extends BaseTask<LocalShellInput, LocalShellOutput> {
  constructor(input: LocalShellInput, name?: string) {
    super(input, 'local-shell', name);
  }

  protected async run(_ctx: TaskContext): Promise<TaskResult<LocalShellOutput>> {
    return this.runInternal(async () => {
      const max = this.input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
      const proc = Bun.spawn({
        cmd: [this.input.command, ...(this.input.args ?? [])],
        cwd: this.input.cwd,
        env: { ...process.env, ...this.input.env },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Wire cancellation: kill the process when the abort signal fires.
      const onAbort = (): void => {
        try {
          proc.kill();
        } catch {
          // already dead
        }
      };
      if (this.signal.aborted) {
        onAbort();
      } else {
        this.signal.addEventListener('abort', onAbort, { once: true });
      }

      // Cap output reads to avoid runaway memory.
      const [exitCode, stdoutBytes, stderrBytes] = await Promise.all([
        proc.exited,
        readCapped(proc.stdout, max),
        readCapped(proc.stderr, max),
      ]);

      this.signal.removeEventListener('abort', onAbort);

      const killed = this.signal.aborted;
      const result: LocalShellOutput = {
        stdout: new TextDecoder().decode(stdoutBytes),
        stderr: new TextDecoder().decode(stderrBytes),
        exitCode,
        killed,
      };

      if (killed) {
        throw new TaskAbortError('shell task aborted');
      }
      if (exitCode !== 0 && !this.input.tolerateNonZero) {
        const err = new Error(
          `shell exited with code ${exitCode}: ${result.stderr.slice(0, 200)}`,
        ) as Error & { code: string; detail: Record<string, unknown> };
        err.code = 'nonzero-exit';
        err.detail = { exitCode, stderrHead: result.stderr.slice(0, 200) };
        throw err;
      }
      return result;
    });
  }
}

class TaskAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskAbortError';
  }
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = max - total;
    if (remaining <= 0) {
      // Drop the rest — caller will see truncation
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      total = max;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  let out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
