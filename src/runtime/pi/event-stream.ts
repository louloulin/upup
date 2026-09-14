/**
 * Root bridge: Pi canonical event stream adapter with runner injection.
 *
 * The Pi-side runner lives in `@upup/pi-event-adapter` (Package layer).
 * This bridge provides a thin wrapper that injects the root `runPiPrompt`
 * so existing callers (`src/index.tsx`, `src/print.ts`, `src/evals/run.ts`,
 * `src/controllers/agent-runner.ts`, `packages/pi-stdio/src/server.ts`)
 * continue to use the same `streamPiAgent(prompt, config, options)` API.
 *
 * The package layer cannot import root src/runtime/pi/runner.ts; this is
 * the ONLY root bridge that exposes the runner to the event-adapter.
 */

import { streamPiAgentWithRunner, type PiStreamOptions, type PiPromptRunner } from '@upup/pi-event-adapter';
import type { AgentConfig, AgentEvent } from '@upup/pi-event-adapter';
import { runPiPrompt } from './runner.js';

export type { PiStreamOptions };

let cachedRunner: PiPromptRunner | undefined;
function getPiPromptRunner(): PiPromptRunner {
  if (!cachedRunner) {
    cachedRunner = (prompt, options) => runPiPrompt(prompt, {
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
      ...(options.sessionKey !== undefined ? { sessionKey: options.sessionKey } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
      ...(options.toolFilter !== undefined ? { toolFilter: options.toolFilter } : {}),
      ...(options.modelInstance !== undefined ? { modelInstance: options.modelInstance as Parameters<typeof runPiPrompt>[1] extends { modelInstance?: infer M } ? M : never } : {}),
      ...(options.modelRuntime !== undefined ? { modelRuntime: options.modelRuntime as Parameters<typeof runPiPrompt>[1] extends { modelRuntime?: infer R } ? R : never } : {}),
      ...(options.requestToolApproval !== undefined ? { requestToolApproval: options.requestToolApproval } : {}),
      ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
    });
  }
  return cachedRunner;
}

export async function* streamPiAgent(
  prompt: string,
  config: AgentConfig = {},
  options: PiStreamOptions = {},
): AsyncGenerator<AgentEvent> {
  yield* streamPiAgentWithRunner(prompt, config, options, getPiPromptRunner());
}
