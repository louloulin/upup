import { runPiPrompt } from './runner.js';
import type { UpUpAgentEvent } from './types.js';
import type { AgentConfig, AgentEvent } from './legacy-events.js';

export interface PiStreamOptions {
  sessionId?: string;
  inMemoryHistory?: unknown;
}

export async function* streamPiAgent(
  prompt: string,
  config: AgentConfig = {},
  options: PiStreamOptions = {},
): AsyncGenerator<AgentEvent> {
  const start = Date.now();
  let answer = '';
  let settled = false;
  let failure: unknown;
  const queue: AgentEvent[] = [];
  const waiters: Array<(result: IteratorResult<AgentEvent>) => void> = [];
  const push = (event: AgentEvent) => {
    const waiter = waiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else queue.push(event);
  };
  const execution = runPiPrompt(prompt, {
    model: config.model,
    modelProvider: config.modelProvider,
    sessionKey: options.sessionId,
    signal: config.signal,
    maxIterations: config.maxIterations,
    toolFilter: config.toolFilter,
    modelInstance: config.modelInstance,
    modelRuntime: config.modelRuntime,
    requestToolApproval: config.requestToolApproval
      ? async (request) => {
          if (config.sessionApprovedTools?.has(request.tool)) return true;
          const decision = await config.requestToolApproval!({
            tool: request.tool,
            args: (request.input && typeof request.input === 'object' ? request.input : {}) as Record<string, unknown>,
          });
          if (decision !== 'deny') config.onToolApproval?.(request.tool);
          if (decision === 'allow-session') config.sessionApprovedTools?.add(request.tool);
          return decision !== 'deny';
        }
      : undefined,
    onEvent: (event) => {
      const mapped = mapEvent(event);
      if (mapped) push(mapped);
    },
  }).then((result) => { answer = result; }, (error) => { failure = error; })
    .finally(() => {
      settled = true;
      const waiter = waiters.shift();
      waiter?.({ value: undefined as never, done: true });
    });
  while (!settled || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (settled) break;
    await new Promise<IteratorResult<AgentEvent>>((resolve) => waiters.push(resolve));
    if (failure) throw failure;
  }
  await execution;
  if (failure) throw failure;
  yield {
    type: 'done',
    answer,
    toolCalls: [],
    iterations: 0,
    totalTime: Date.now() - start,
  };
}

function mapEvent(event: UpUpAgentEvent): AgentEvent | undefined {
  switch (event.type) {
    case 'text_delta':
      return { type: 'stream_progress', charDelta: event.delta.length, mode: 'responding', textContent: event.delta };
    case 'tool_start':
      return { type: 'tool_start', tool: event.toolName, args: (event.input ?? {}) as Record<string, unknown>, toolCallId: event.toolCallId };
    case 'tool_update':
      return { type: 'tool_progress', tool: event.toolName, message: event.text };
    case 'tool_end':
      return event.error
        ? { type: 'tool_error', tool: event.toolName, error: event.error, toolCallId: event.toolCallId }
        : { type: 'tool_end', tool: event.toolName, args: {}, result: '', duration: 0, toolCallId: event.toolCallId };
    default:
      return undefined;
  }
}
