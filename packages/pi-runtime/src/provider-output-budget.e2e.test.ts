import { describe, expect, it } from 'bun:test';
import {
  createExtensionRuntime,
  ExtensionRunner,
  type Extension,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import { streamSimple } from '@earendil-works/pi-ai/compat';

import { createUpUpEventSurfaceExtension } from './event-surface-extension';

/**
 * End-to-end regression for the "Response was truncated before completion."
 * loop reported on `deepseek-v4.1-flash` via the `@llmgates_api/pi-llmgates-provider`
 * plugin.
 *
 * The failure chain:
 *   1. The plugin declares `contextWindow: 128000` for a model whose gateway
 *      actually serves 260k+ prompt tokens (so the real window is bigger).
 *   2. Pi clamps the output budget to `contextWindow - estimate - 4096` with a
 *      floor of 1 token. When the session is large the result collapses to 1.
 *   3. The gateway floors completion at 128 tokens, so the response is
 *      truncated mid-answer with `finish_reason: "length"` and Pi renders
 *      "Response was truncated before completion." on every turn.
 *
 * These tests drive Pi's *real* openai-completions request builder and
 * capture the wire body so they prove that the UpUp event surface repairs
 * the degenerate budget to the model's declared `maxTokens` rather than to
 * an arbitrary constant. The 1 → 16384 jump is what turned the truncation
 * into a complete answer in the live gateway reproduction.
 */

/**
 * Mount the real UpUp event surface onto a real Pi `ExtensionRunner`.
 *
 * Using Pi own runner (rather than a replica) means these tests exercise the
 * exact plumbing that runs in production: `ExtensionRunner.emitBeforeProviderRequest`
 * at `core/extensions/runner.js`, which Pi's `core/sdk.js` bridges onto the
 * provider adapter's `onPayload` hook.
 */
function mountRunner(model: { maxTokens?: number } | undefined): ExtensionRunner {
  const handlers = new Map<string, ((event: unknown, context: unknown) => unknown)[]>();
  const capture: ExtensionAPI = {
    on: (event: string, handler: (e: unknown, c: unknown) => unknown) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler as never]);
    },
  } as unknown as ExtensionAPI;
  createUpUpEventSurfaceExtension({ audit: () => undefined, disableAuditFile: true })(capture);

  const extension: Extension = {
    path: '<upup-event-surface>',
    resolvedPath: '<upup-event-surface>',
    sourceInfo: { path: '<upup-event-surface>', source: 'inline', scope: 'user', origin: 'top-level' },
    handlers: handlers as unknown as Extension['handlers'],
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };

  const runner = new ExtensionRunner(
    [extension],
    createExtensionRuntime(),
    process.cwd(),
    {} as never,
    {} as never,
  );
  // Pi binds this through `runner.bindCore({ getModel: () => this.model })`;
  // stepping on the private field reproduces that binding exactly.
  (runner as unknown as { getModel: () => unknown }).getModel = () => model;
  return runner;
}

/**
 * Wrap a payload handler the way Pi's `core/sdk.js:208` binds `onPayload` to
 * `emitBeforeProviderRequest`: the original payload is kept unless the runner
 * returns a replacement.
 */
async function emitBeforeProviderRequest(
  runner: ExtensionRunner,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await runner.emitBeforeProviderRequest(payload);
  return (result as Record<string, unknown> | undefined) ?? payload;
}

const makeModel = (overrides: Record<string, unknown> = {}) => ({
  id: 'deepseek-v4.1-flash',
  name: 'deepseek-v4.1-flash',
  api: 'openai-completions',
  provider: 'ax',
  baseUrl: 'http://127.0.0.1:9/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
  ...overrides,
});

function buildBigContext(): { messages: { role: string; content: string }[] } {
  // 688,800 chars is enough to force `clampMaxTokensToContext` below its
  // 1-token floor with the 128k declared contextWindow, reproducing the
  // production failure shape (`max_completion_tokens`/`max_tokens` clamped
  // to 1). The exact count is not load-bearing: anything over ~440k chars
  // overflows `contextWindow - 4096`.
  return { messages: [{ role: 'user', content: 'x'.repeat(688800) }] };
}

describe('provider output budget on Pi real openai-completions path', () => {
  it('captures the degenerate clamp before any extension is mounted', async () => {
    const captured: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: { body?: string }) => {
      Object.assign(captured, JSON.parse(init.body ?? '{}'));
      throw new Error('stop-after-capture');
    }) as unknown as typeof fetch;

    try {
      for await (const _ of streamSimple(
        makeModel() as never,
        buildBigContext() as never,
        {
          apiKey: 'sk-test',
          fetch: fetchImpl,
        } as never,
      ) as AsyncIterable<unknown>) {
        // drain
      }
    } catch {
      /* the fake fetch throws to short-circuit */
    }

    // Without UpUp, the model record (which mirrors the ax gateway catalog)
    // sends a one-token output budget. This is the symptom the surface
    // extension has to undo at the request boundary.
    const field = ['max_tokens', 'max_completion_tokens', 'max_output_tokens'].find(
      (name) => name in captured,
    );
    expect(field).toBeDefined();
    expect(captured[field as string]).toBe(1);
  });

  it('restores the budget to the model declared maxTokens through the real Pi ExtensionRunner', async () => {
    const runner = mountRunner({ maxTokens: 16384 });
    const captured: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: { body?: string }) => {
      Object.assign(captured, JSON.parse(init.body ?? '{}'));
      throw new Error('stop-after-capture');
    }) as unknown as typeof fetch;

    try {
      for await (const _ of streamSimple(
        makeModel() as never,
        buildBigContext() as never,
        {
          apiKey: 'sk-test',
          fetch: fetchImpl,
          // Mirrors core/sdk.js:208, which bridges Pi's provider `onPayload`
          // straight onto `ExtensionRunner.emitBeforeProviderRequest`.
          onPayload: (payload: unknown) =>
            emitBeforeProviderRequest(runner, payload as Record<string, unknown>),
        } as never,
      ) as AsyncIterable<unknown>) {
        // drain
      }
    } catch {
      /* expected */
    }

    const field = ['max_tokens', 'max_completion_tokens', 'max_output_tokens'].find(
      (name) => name in captured,
    );
    expect(field).toBeDefined();
    // The model declared maxTokens is what Pi itself would have sent had the
    // context window been honest. This is the exact value the gateway needs
    // to deliver a complete answer (measured against the live gateway on a
    // 260k-token prompt: 1024/2048/3072 still truncate, 4096+ reaches finish=stop).
    expect(captured[field as string]).toBe(16384);
  });

  it('falls back to the absolute floor when the session has no current model', async () => {
    const runner = mountRunner(undefined);
    const returned = await emitBeforeProviderRequest(runner, { max_tokens: 1 });
    expect(returned.max_tokens).toBe(1024);
  });

  it('leaves a usable budget alone so Pi clamp survives legitimate context pressure', async () => {
    const runner = mountRunner({ maxTokens: 16384 });
    const payload = { max_tokens: 8192 };
    const returned = await emitBeforeProviderRequest(runner, payload);
    // Same object identity: the runner only replaces the payload when a
    // handler returns a value.
    expect(returned).toBe(payload);
    expect(payload.max_tokens).toBe(8192);
  });

});
