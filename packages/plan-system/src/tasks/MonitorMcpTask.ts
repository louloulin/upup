/**
 * Monitor MCP task — subscribe to MCP events until cancelled.
 *
 * The runtime registers a subscription via `mcp.subscribe`, which
 * returns an unsubscribe function. The task awaits the unsubscribe
 * (or cancellation), then returns the collected events.
 *
 * This is a long-lived task: it should only end via cancel() or the
 * underlying subscription closing. Status transitions: pending → running
 * → (cancelled | completed) where completed is reached when the
 * subscription completes on its own.
 */
import { BaseTask, type TaskContext, type TaskResult, NOOP_LOGGER } from './types.js';

export interface McpEvent {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

export interface MonitorMcpInput {
  /** MCP topic pattern to subscribe to. */
  topic: string;
  /** Optional task name (for logs/UI). */
  name?: string;
  /** Max events to collect before auto-completing. Default Infinity. */
  maxEvents?: number;
  /**
   * Caller-supplied subscribe function. Returns an unsubscribe handle.
   * The subscription may also complete on its own (e.g. MCP server
   * closes) — in that case, the returned promise resolves and the
   * task ends with status=completed.
   */
  subscribe: (args: { topic: string; onEvent: (event: McpEvent) => void; signal: AbortSignal }) => Promise<{ unsubscribe: () => void; done: Promise<void> }>;
}

export interface MonitorMcpOutput {
  events: McpEvent[];
  /** Why the task ended. */
  endedReason: 'cancelled' | 'subscription-closed' | 'max-events-reached' | 'aborted';
}

export class MonitorMcpTask extends BaseTask<MonitorMcpInput, MonitorMcpOutput> {
  constructor(input: MonitorMcpInput, name?: string) {
    super(input, 'monitor-mcp', name);
  }

  protected async run(ctx: TaskContext): Promise<TaskResult<MonitorMcpOutput>> {
    return this.runInternal(async () => {
      const logger = ctx.logger ?? NOOP_LOGGER;
      const events: McpEvent[] = [];
      const max = this.input.maxEvents ?? Infinity;
      let endedReason: MonitorMcpOutput['endedReason'] = 'subscription-closed';
      let resolveDone!: () => void;
      const donePromise = new Promise<void>((resolve) => { resolveDone = resolve; });

      const handle = await this.input.subscribe({
        topic: this.input.topic,
        signal: this.signal,
        onEvent: (event) => {
          events.push(event);
          if (events.length >= max) {
            endedReason = 'max-events-reached';
            try { handle.unsubscribe(); } catch { /* ignore */ }
            resolveDone();
          }
        },
      });

      // Tie the subscription's done to our local donePromise
      handle.done.then(() => resolveDone()).catch(() => resolveDone());

      const onAbort = (): void => {
        endedReason = this.signal.aborted ? 'aborted' : 'cancelled';
        try { handle.unsubscribe(); } catch { /* ignore */ }
        resolveDone();
      };
      if (this.signal.aborted) {
        onAbort();
      } else {
        this.signal.addEventListener('abort', onAbort, { once: true });
      }

      logger.info('monitor-mcp: subscribed', { topic: this.input.topic });
      await donePromise;
      this.signal.removeEventListener('abort', onAbort);

      return { events, endedReason };
    });
  }
}
