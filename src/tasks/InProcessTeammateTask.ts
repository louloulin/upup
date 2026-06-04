/**
 * In-process teammate task — spawns a sibling agent in the same process.
 *
 * Uses a caller-supplied event bus to coordinate. The "teammate" is
 * represented as a Task that runs in parallel with the parent; the
 * runtime can subscribe to its events via the bus.
 *
 * This is a thin wrapper that captures the same Task semantics
 * (start/cancel/status/result) but executes in-process without
 * spawning a child process or worker thread.
 */
import { BaseTask, type TaskContext, type TaskResult, NOOP_LOGGER } from './types.js';

export interface InProcessTeammateInput {
  /** Identifier for this teammate (must be unique within the bus). */
  teammateId: string;
  /** Topic prefix for emitting events (e.g. 'teammate.<id>'). */
  topicPrefix?: string;
  /** Optional task name (for logs/UI). */
  name?: string;
  /**
   * Caller-supplied executor — runs the teammate's work and returns
   * the final result. The executor is invoked once when start() is
   * called. It should respect the abort signal for cooperative
   * cancellation.
   */
  execute: (args: { teammateId: string; signal: AbortSignal }) => Promise<InProcessTeammateOutput>;
  /**
   * Optional event bus for emitting teammate events (e.g. partial
   * outputs, status updates). If omitted, teammate runs silently.
   */
  bus?: { emit: (topic: string, payload: unknown) => void };
}

export interface InProcessTeammateOutput {
  text: string;
  /** Number of partial events emitted during execution. */
  eventsEmitted: number;
}

export class InProcessTeammateTask extends BaseTask<InProcessTeammateInput, InProcessTeammateOutput> {
  constructor(input: InProcessTeammateInput, name?: string) {
    super(input, 'in-process-teammate', name);
  }

  protected async run(ctx: TaskContext): Promise<TaskResult<InProcessTeammateOutput>> {
    return this.runInternal(async () => {
      const logger = ctx.logger ?? NOOP_LOGGER;
      const prefix = this.input.topicPrefix ?? `teammate.${this.input.teammateId}`;
      let eventsEmitted = 0;
      const emit = (topic: string, payload: unknown): void => {
        if (this.input.bus) {
          this.input.bus.emit(topic, payload);
          eventsEmitted++;
        }
      };
      emit(`${prefix}.started`, { teammateId: this.input.teammateId, at: Date.now() });
      logger.info('in-process-teammate: start', { teammateId: this.input.teammateId });

      try {
        const out = await this.input.execute({ teammateId: this.input.teammateId, signal: this.signal });
        emit(`${prefix}.completed`, { teammateId: this.input.teammateId, at: Date.now(), outputLen: out.text.length });
        return { text: out.text, eventsEmitted };
      } catch (err) {
        emit(`${prefix}.failed`, { teammateId: this.input.teammateId, at: Date.now(), message: (err as Error).message });
        throw err;
      }
    });
  }
}
