/**
 * Task runtime — 6 类任务 + 共享生命周期。
 *
 * 所有任务类都实现 `Task<TInput, TOutput>` 接口：
 *   - kind    : 任务类型(只读)
 *   - name    : 任务名(只读,用于日志/UI)
 *   - input   : 任务输入(只读)
 *   - status  : 当前状态(pending/running/completed/failed/cancelled/timeout)
 *   - result  : 最终结果(完成前为 null)
 *   - start   : 启动任务,返回结果
 *   - cancel  : 取消(可指定原因),幂等
 *
 * 6 类任务(kind):
 *   - local-agent         : 本地 Agent 子任务(在当前 CLI 内跑一个 prompt)
 *   - local-shell         : 本地 shell 命令执行(Bun.spawn)
 *   - local-workflow      : 本地工作流(多步骤组合)
 *   - monitor-mcp         : MCP 监控(订阅事件直到取消)
 *   - remote-agent        : 远端 Agent(CCR / WebSocket)
 *   - in-process-teammate : 进程内队友(共享 in-process 事件总线)
 *
 * 状态机:
 *   pending → running → (completed | failed | cancelled | timeout)
 *   终态(completed/failed/cancelled/timeout)不能再 start。
 *   终态后 cancel 是 no-op。
 *
 * 取消信号链接(template method):
 *   BaseTask.start(ctx) 是非 abstract 入口。Subclass 实现 run(ctx)。
 *   start 负责把 ctx.signal 链接到 this._abortController,所以
 *   子类里 this.signal 会反映 ctx.signal 的中止状态。这是 workflow
 *   取消能传播到 in-flight step 的关键。
 */
import { randomBytes } from 'node:crypto';

export const TASK_KINDS = [
  'local-agent',
  'local-shell',
  'local-workflow',
  'monitor-mcp',
  'remote-agent',
  'in-process-teammate',
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

export function isTerminalStatus(s: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

export interface TaskError {
  code: 'aborted' | 'exception' | 'timeout' | 'nonzero-exit' | 'unsupported';
  message: string;
  /** Optional structured detail (e.g. exit code, stderr head). */
  detail?: Record<string, unknown>;
}

export interface TaskResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: TaskError;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}

export interface TaskContext {
  /** Caller-supplied task id (for tracing). */
  taskId: string;
  /** Wall-clock source (defaults to Date.now). */
  now?: () => number;
  /** Abort signal — fires when the runtime wants the task to stop. */
  signal: AbortSignal;
  /** Optional logger — defaults to no-op. */
  logger?: TaskLogger;
}

export interface TaskLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export const NOOP_LOGGER: TaskLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface Task<TInput = unknown, TOutput = unknown> {
  readonly kind: TaskKind;
  readonly name: string;
  readonly input: TInput;
  status(): TaskStatus;
  result(): TaskResult<TOutput> | null;
  start(ctx: TaskContext): Promise<TaskResult<TOutput>>;
  cancel(reason?: string): void;
}

/** Generate a short, unique task id. */
export function createTaskId(prefix: string = 'task'): string {
  const hex = randomBytes(6).toString('hex');
  return `${prefix}-${hex}`;
}

/** Validate that a string is a known TaskKind. */
export function isTaskKind(s: string): s is TaskKind {
  return (TASK_KINDS as readonly string[]).includes(s);
}

/**
 * Resolve a default task name from kind + input. Subclasses pass kind
 * to the BaseTask constructor; if no name is given, this derives a
 * sensible label from the input shape.
 */
function defaultName(kind: TaskKind, input: unknown): string {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.name === 'string' && obj.name.length > 0) return obj.name;
    if (typeof obj.command === 'string') return `${kind}:${obj.command}`;
    if (typeof obj.prompt === 'string') return `${kind}:${String(obj.prompt).slice(0, 32)}`;
  }
  return kind;
}

function classifyError(err: unknown): TaskError['code'] {
  if (!(err instanceof Error)) return 'exception';
  // Subclasses can throw errors with a `.code` field for richer classification.
  const c = (err as Error & { code?: string }).code;
  if (c === 'nonzero-exit' || c === 'timeout' || c === 'unsupported') return c;
  return 'exception';
}

/**
 * Shared base class for all task implementations. Subclasses pass
 * `kind` and (optionally) `name` to the constructor. The base class
 * handles:
 *   - status transitions
 *   - abort signal management (with template-method linking)
 *   - result capture (success + error, including partialValue on error)
 *   - idempotent cancel
 *
 * Subclasses use `runInternal(executor)` to wrap their work. The
 * executor returns the value (becomes `result.value`) or throws (becomes
 * `result.error` with status=failed; cancelled if the signal aborted).
 * To carry a partial result on failure, the thrown error can set
 * `partialValue` — it will populate `result.value` even when `ok=false`.
 */
export abstract class BaseTask<TInput, TOutput> implements Task<TInput, TOutput> {
  readonly kind: TaskKind;
  readonly name: string;
  readonly input: TInput;

  private _status: TaskStatus = 'pending';
  private _result: TaskResult<TOutput> | null = null;
  private _abortController: AbortController = new AbortController();
  private _started = false;
  private _cancelReason: string | null = null;

  constructor(input: TInput, kind: TaskKind, name?: string) {
    this.input = input;
    this.kind = kind;
    this.name = name ?? defaultName(kind, input);
  }

  status(): TaskStatus {
    return this._status;
  }

  result(): TaskResult<TOutput> | null {
    return this._result;
  }

  /** Protected: subclasses + the runtime can read the signal to wire cancellation. */
  protected get signal(): AbortSignal {
    return this._abortController.signal;
  }

  cancel(reason?: string): void {
    if (isTerminalStatus(this._status)) return;
    this._cancelReason = reason ?? null;
    this._abortController.abort(reason);
    if (this._status === 'pending' || this._status === 'running') {
      this._status = 'cancelled';
    }
  }

  getCancelReason(): string | null {
    return this._cancelReason;
  }

  /**
   * Non-abstract entry point. Links the caller-supplied signal to
   * this task's internal abort controller, then delegates to the
   * subclass's `run(ctx)`. Linking means: when `ctx.signal` fires,
   * `this.signal` also fires — which is what lets a workflow abort
   * propagate to the in-flight step.
   */
  async start(ctx: TaskContext): Promise<TaskResult<TOutput>> {
    if (ctx.signal.aborted) {
      if (!this._abortController.signal.aborted) {
        this._abortController.abort(ctx.signal.reason);
      }
    } else {
      ctx.signal.addEventListener(
        'abort',
        () => {
          if (!this._abortController.signal.aborted) {
            this._abortController.abort(ctx.signal.reason);
          }
        },
        { once: true },
      );
    }
    return this.run(ctx);
  }

  /**
   * Subclasses override this — not start(). The base class owns the
   * ctx.signal → this._abortController linking in start().
   */
  protected abstract run(ctx: TaskContext): Promise<TaskResult<TOutput>>;

  /**
   * Wrap the subclass's executor. Handles status transitions, error
   * capture, and abort-signal translation. The executor should respect
   * `this.signal` for cooperative cancellation.
   */
  protected async runInternal(executor: () => Promise<TOutput>): Promise<TaskResult<TOutput>> {
    if (this._started) {
      throw new Error(`task ${this.name} already started (status: ${this._status})`);
    }
    if (isTerminalStatus(this._status)) {
      throw new Error(`task ${this.name} cannot start from terminal status: ${this._status}`);
    }
    this._started = true;
    this._status = 'running';
    const startedAt = Date.now();

    try {
      const value = await executor();
      this._result = {
        ok: true,
        value,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      };
      this._status = 'completed';
    } catch (err) {
      const aborted = this._abortController.signal.aborted;
      const partialValue = (err as Error & { partialValue?: TOutput })?.partialValue;
      const error: TaskError = {
        code: aborted ? 'aborted' : classifyError(err),
        message: err instanceof Error ? err.message : String(err),
        detail: err instanceof Error && (err as Error & { detail?: unknown }).detail
          ? ((err as Error & { detail?: Record<string, unknown> }).detail)
          : undefined,
      };
      this._result = {
        ok: false,
        value: partialValue,
        error,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      };
      this._status = aborted ? 'cancelled' : 'failed';
    }
    return this._result;
  }
}
