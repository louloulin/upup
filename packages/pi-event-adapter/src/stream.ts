/**
 * Pi canonical event stream adapter.
 *
 * Wires the Pi prompt runner (injected) to the canonical event adapter so
 * that Gateway, stdio, Bridge and the controller share one implementation.
 *
 * The runner is injected via {@link createPiCanonicalEventStream} so this package has
 * no dependency on root src/runtime/pi.
 */

import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { ApprovalDecision, UpUpAgentEvent, UpUpToolSafetyLevel } from '@upup/pi-runtime';

export interface PiStreamConfig {
  model?: string;
  modelProvider?: string;
  maxIterations?: number;
  signal?: AbortSignal;
  requestToolApproval?: (request: { tool: string; args: Record<string, unknown> }) => Promise<ApprovalDecision>;
  sessionApprovedTools?: Set<string>;
  onToolApproval?: (tool: string) => void;
  toolFilter?: string[] | '*';
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
}

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

export type PiCanonicalEventStream = (
  prompt: string,
  config?: PiStreamConfig,
  options?: PiStreamOptions,
) => AsyncGenerator<UpUpAgentEvent>;

/**
 * Stream the Pi-native event contract without converting through a second event protocol.
 * The terminal run_end event is emitted by this transport boundary because
 * AgentSession itself reports lifecycle events but does not carry the prompt
 * runner's aggregate answer and timing metadata.
 */
export function createPiCanonicalEventStream(runner: PiPromptRunner): PiCanonicalEventStream {
  return (prompt, config = {}, options = {}) => streamPiCanonicalEvents(prompt, config, options, runner);
}

export async function* streamPiCanonicalEvents(
  prompt: string,
  config: PiStreamConfig,
  options: PiStreamOptions,
  runner: PiPromptRunner,
): AsyncGenerator<UpUpAgentEvent> {
  const start = Date.now();
  let answer = '';
  let sessionId = options.sessionId ?? '';
  let failure: unknown;
  const queue: UpUpAgentEvent[] = [];
  const waiters: Array<() => void> = [];
  let settled = false;
  const push = (event: UpUpAgentEvent) => {
    sessionId = event.sessionId;
    queue.push(event);
    waiters.shift()?.();
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
    onEvent: (event) => {
      push(event);
      if (event.type === 'message_end' && event.role === 'assistant') answer = event.text;
    },
  })
    .then((result) => { answer = result; }, (error) => { failure = error; })
    .then(() => {
      if (!failure) {
        push({
          type: 'run_end',
          sessionId,
          answer,
          iterations: 0,
          totalTime: Date.now() - start,
        });
      }
      settled = true;
      waiters.shift()?.();
    });
  while (!settled || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (settled) break;
    await new Promise<void>((resolve) => waiters.push(resolve));
    if (failure) throw failure;
  }
  await execution;
  if (failure) throw failure;
}
