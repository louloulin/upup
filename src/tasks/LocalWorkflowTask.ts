/**
 * Local workflow task — runs a sequence of sub-tasks in order.
 *
 * Each step is a `Task<unknown, unknown>` (any task class). The
 * workflow:
 *   - Runs steps in order, awaiting each
 *   - Captures each step's result as `value.step_<i>`
 *   - On first failure, halts (subsequent steps are skipped) and the
 *     workflow result.ok is false with the failing step's error
 *   - Supports cancel between steps: each step gets the workflow's
 *     signal (linked via a child AbortController so cancelling the
 *     workflow also cancels the in-flight step)
 *
 * On halt, the partial result (with completedSteps + failedAt) is
 * attached to the thrown error as `partialValue` so the runtime
 * can still expose it via `result.value` even though `ok=false`.
 */
import { BaseTask, type TaskContext, type TaskResult, type Task, NOOP_LOGGER, createTaskId } from './types.js';

export interface LocalWorkflowInput {
  /** Ordered list of sub-tasks. */
  steps: Task<unknown, unknown>[];
  /** Optional workflow name (for logs/UI). */
  name?: string;
  /** If true, continue on step failures (each failure captured in
   *  the result, but workflow status remains completed). */
  continueOnError?: boolean;
}

export interface LocalWorkflowOutput {
  stepCount: number;
  completedSteps: number;
  results: Array<{ name: string; ok: boolean; error?: { code: string; message: string } }>;
  /** Index of the failing step (if any and !continueOnError). */
  failedAt?: number;
}

export class LocalWorkflowTask extends BaseTask<LocalWorkflowInput, LocalWorkflowOutput> {
  private childController: AbortController | null = null;

  constructor(input: LocalWorkflowInput, name?: string) {
    super(input, 'local-workflow', name);
  }

  cancel(reason?: string): void {
    super.cancel(reason);
    // Also signal the in-flight child (if any)
    if (this.childController && !this.childController.signal.aborted) {
      this.childController.abort(reason);
    }
  }

  protected async run(ctx: TaskContext): Promise<TaskResult<LocalWorkflowOutput>> {
    return this.runInternal(async () => {
      const logger = ctx.logger ?? NOOP_LOGGER;
      const results: LocalWorkflowOutput['results'] = [];
      let completedSteps = 0;
      let failedAt: number | undefined;

      for (let i = 0; i < this.input.steps.length; i++) {
        if (this.signal.aborted) break;
        const step = this.input.steps[i]!;
        const stepName = step.name || `step-${i}`;

        // Link the step's signal to ours so cancelling the workflow
        // cancels the in-flight step. The step's BaseTask.start will
        // wire childController.signal → its own this._abortController.
        this.childController = new AbortController();
        const onAbort = (): void => {
          if (this.childController && !this.childController.signal.aborted) {
            this.childController.abort(this.signal.reason);
          }
        };
        if (this.signal.aborted) {
          this.childController.abort(this.signal.reason);
        } else {
          this.signal.addEventListener('abort', onAbort, { once: true });
        }

        let result;
        try {
          result = await step.start({
            taskId: createTaskId(`${step.kind}-${i}`),
            signal: this.childController.signal,
            logger,
            now: ctx.now,
          });
        } finally {
          this.signal.removeEventListener('abort', onAbort);
        }
        this.childController = null;

        results.push({
          name: stepName,
          ok: result.ok,
          error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
        });

        if (result.ok) {
          completedSteps++;
        } else {
          if (this.input.continueOnError) {
            completedSteps++;
          } else {
            failedAt = i;
            break;
          }
        }
      }

      const out: LocalWorkflowOutput = {
        stepCount: this.input.steps.length,
        completedSteps,
        results,
        failedAt,
      };
      if (failedAt !== undefined) {
        const err = new Error(
          `workflow failed at step ${failedAt} (${results[failedAt]?.name}): ${results[failedAt]?.error?.message ?? 'unknown'}`,
        ) as Error & { code: string; detail: Record<string, unknown>; partialValue: LocalWorkflowOutput };
        err.code = 'exception';
        err.detail = { failedAt };
        // Attach the partial result so runInternal surfaces it on
        // result.value even though ok=false.
        err.partialValue = out;
        throw err;
      }
      return out;
    });
  }
}
