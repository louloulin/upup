/**
 * Pi canonical event stream adapter.
 *
 * Wires the Pi prompt runner (injected) to the canonical event adapter so
 * that Gateway, stdio, Bridge and the controller share one implementation.
 *
 * The runner is injected via {@link createPiEventStream} so this package has
 * no dependency on root src/runtime/pi.
 */

import type { UpUpAgentEvent, UpUpToolSafetyLevel } from '@upup/pi-runtime';
import { buildLegacyDoneEvent, mapPiEventToLegacy } from './index.js';
import type { AgentConfig, AgentEvent } from './index.js';

export interface PiStreamOptions {
  sessionId?: string;
  inMemoryHistory?: unknown;
}

export interface PiPromptRunnerOptions {
  model?: string;
  modelProvider?: string;
  sessionKey?: string;
  signal?: AbortSignal;
  maxIterations?: number;
  toolFilter?: string[] | '*';
  modelInstance?: unknown;
  modelRuntime?: unknown;
  requestToolApproval?: (request: {
    tool: string;
    input: unknown;
    safetyLevel: UpUpToolSafetyLevel;
    auditId: string;
    permissionProfile: string;
  }) => boolean | Promise<boolean>;
  onEvent?: (event: UpUpAgentEvent) => void | Promise<void>;
}

export type PiPromptRunner = (
  prompt: string,
  options: PiPromptRunnerOptions,
) => Promise<string>;

export async function* streamPiAgentWithRunner(
  prompt: string,
  config: AgentConfig,
  options: PiStreamOptions,
  runner: PiPromptRunner,
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
  const execution = runner(prompt, {
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
  })
    .then((result) => { answer = result; }, (error) => { failure = error; })
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
