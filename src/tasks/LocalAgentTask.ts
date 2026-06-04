/**
 * Local Agent sub-task.
 *
 * Wraps running an Agent prompt in the current CLI process. The actual
 * agent invocation is delegated to a caller-supplied runner so this
 * module stays decoupled from the agent internals.
 *
 * Status: minimal implementation — the runtime calls `runLocalAgent`
 * with the input, awaits the result, and returns it. Cancel propagates
 * to the runner via the abort signal.
 */
import { BaseTask, type TaskContext, type TaskResult, NOOP_LOGGER } from './types.js';

export interface LocalAgentInput {
  /** The user/task prompt to send to the local agent. */
  prompt: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Optional agent model override (e.g. 'gpt-5.4', 'claude-...'). */
  model?: string;
  /** Optional task name (for logs/UI). */
  name?: string;
  /** Caller-supplied runner — invoked with prompt + signal, returns the agent's text output. */
  runLocalAgent: (args: { prompt: string; systemPrompt?: string; model?: string; signal: AbortSignal }) => Promise<LocalAgentOutput>;
}

export interface LocalAgentOutput {
  text: string;
  /** Optional token usage, if the runner reports it. */
  usage?: { inputTokens: number; outputTokens: number };
}

export class LocalAgentTask extends BaseTask<LocalAgentInput, LocalAgentOutput> {
  constructor(input: LocalAgentInput, name?: string) {
    super(input, 'local-agent', name);
  }

  protected async run(ctx: TaskContext): Promise<TaskResult<LocalAgentOutput>> {
    return this.runInternal(async () => {
      const logger = ctx.logger ?? NOOP_LOGGER;
      logger.info('local-agent: start', { name: this.name, promptLen: this.input.prompt.length });
      const out = await this.input.runLocalAgent({
        prompt: this.input.prompt,
        systemPrompt: this.input.systemPrompt,
        model: this.input.model,
        signal: this.signal,
      });
      logger.info('local-agent: done', { outputLen: out.text.length });
      return out;
    });
  }
}
