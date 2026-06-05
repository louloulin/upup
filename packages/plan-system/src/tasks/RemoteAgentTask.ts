/**
 * Remote Agent task — invokes an agent on a remote endpoint (CCR / WebSocket).
 *
 * Sends the prompt to the configured URL and awaits a streamed or
 * single-shot response. The runner is caller-supplied (similar to
 * LocalAgentTask) so this module stays decoupled from the specific
 * remote transport.
 *
 * The remote runner respects the abort signal — cancellation propagates
 * to the underlying transport (close WebSocket, abort fetch, etc.).
 */
import { BaseTask, type TaskContext, type TaskResult, NOOP_LOGGER } from './types.js';

export interface RemoteAgentInput {
  /** Remote agent endpoint (URL or pre-resolved handle). */
  endpoint: string;
  /** The user/task prompt. */
  prompt: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Optional model override. */
  model?: string;
  /** Optional task name (for logs/UI). */
  name?: string;
  /** Caller-supplied remote runner. */
  runRemoteAgent: (args: {
    endpoint: string;
    prompt: string;
    systemPrompt?: string;
    model?: string;
    signal: AbortSignal;
  }) => Promise<RemoteAgentOutput>;
}

export interface RemoteAgentOutput {
  text: string;
  /** Remote-side session id (for follow-up calls). */
  remoteSessionId?: string;
  /** Optional token usage. */
  usage?: { inputTokens: number; outputTokens: number };
}

export class RemoteAgentTask extends BaseTask<RemoteAgentInput, RemoteAgentOutput> {
  constructor(input: RemoteAgentInput, name?: string) {
    super(input, 'remote-agent', name);
  }

  protected async run(ctx: TaskContext): Promise<TaskResult<RemoteAgentOutput>> {
    return this.runInternal(async () => {
      const logger = ctx.logger ?? NOOP_LOGGER;
      logger.info('remote-agent: invoking', { endpoint: this.input.endpoint, name: this.name });
      const out = await this.input.runRemoteAgent({
        endpoint: this.input.endpoint,
        prompt: this.input.prompt,
        systemPrompt: this.input.systemPrompt,
        model: this.input.model,
        signal: this.signal,
      });
      logger.info('remote-agent: done', { remoteSessionId: out.remoteSessionId });
      return out;
    });
  }
}
