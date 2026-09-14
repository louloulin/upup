/**
 * UpUp canonical event stream adapter (Pi6 Phase 2).
 *
 * This file is now a thin runtime shim that wires `runPiPrompt` (Pi-side)
 * to the canonical event adapter (`@upup/pi-event-adapter`). The previous
 * inline `mapEvent` function has been moved into the adapter package so
 * that Gateway, stdio, Bridge and the controller all share one
 * implementation.
 */

import { runPiPrompt } from './runner.js';
import type { AgentConfig, AgentEvent } from './legacy-events.js';
import { buildLegacyDoneEvent, mapPiEventToLegacy } from '@upup/pi-event-adapter';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

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
    onEvent: (event: UpUpAgentEvent) => {
      const mapped = mapPiEventToLegacy(event);
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
  yield buildLegacyDoneEvent({
    answer,
    toolCalls: [],
    iterations: 0,
    totalTime: Date.now() - start,
  });
}
