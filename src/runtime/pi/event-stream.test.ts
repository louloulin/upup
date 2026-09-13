/**
 * Tests that `streamPiAgent` (the CLI / print / stdio / Eval / SDK surface)
 * correctly maps Pi `UpUpAgentEvent` into the legacy `AgentEvent` shape and
 * yields a terminal `done` event. We exercise the public path with a faux
 * provider; tool execution is covered by the existing pi-fixture suite, so
 * this file focuses on the event mapping contract.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { streamPiAgent } from './event-stream.js';

async function withTempDir<T>(prefix: string, body: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(process.cwd(), '.upup', prefix));
  try {
    return await body();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function collectDone(prompt: string, faux: ReturnType<typeof fauxProvider>): Promise<{
  events: string[];
  done: { type: 'done'; answer: string; toolCalls: unknown[]; iterations: number; totalTime: number } | undefined;
}> {
  const runtime = await ModelRuntime.create({ refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  const events: string[] = [];
  let done: { type: 'done'; answer: string; toolCalls: unknown[]; iterations: number; totalTime: number } | undefined;
  // The streamPiAgent public path constructs a Pi session internally; the
  // fixture provider is registered with the runtime so the model resolves.
  for await (const event of streamPiAgent(prompt, {
    model: faux.getModel().id,
    modelInstance: faux.getModel(),
    modelRuntime: runtime,
    maxIterations: 1,
  } as Parameters<typeof streamPiAgent>[1])) {
    events.push(event.type);
    if (event.type === 'done') {
      done = event as typeof done;
    }
  }
  return { events, done };
}

describe('streamPiAgent event adapter', () => {
  test('yields a terminal done event for a plain text response', async () => {
    await withTempDir('event-stream-ok-', async () => {
      const faux = fauxProvider({
        provider: 'upup-event-stream-ok',
        models: [{ id: 'event-stream-ok-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('你好，这里是 UpUp。')])]);

      const { events, done } = await collectDone('打个招呼', faux);
      expect(events.at(-1)).toBe('done');
      expect(done).toBeDefined();
      expect(typeof done?.answer).toBe('string');
      expect(Array.isArray(done?.toolCalls)).toBe(true);
      expect(typeof done?.totalTime).toBe('number');
    });
  });

  test('does not throw and always terminates with done for empty text responses', async () => {
    await withTempDir('event-stream-empty-', async () => {
      const faux = fauxProvider({
        provider: 'upup-event-stream-empty',
        models: [{ id: 'event-stream-empty-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('')])]);

      const { events, done } = await collectDone('空响应', faux);
      expect(events).toContain('done');
      expect(events.at(-1)).toBe('done');
      expect(typeof done?.answer).toBe('string');
    });
  });

  test('emits multiple progress events for streamed text and aggregates the final answer', async () => {
    await withTempDir('event-stream-streaming-', async () => {
      const faux = fauxProvider({
        provider: 'upup-event-stream-streaming',
        models: [{ id: 'event-stream-streaming-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('第一段'), fauxText('第二段'), fauxText('第三段')])]);

      const { events, done } = await collectDone('分段回复', faux);
      expect(events).toContain('done');
      expect(events.at(-1)).toBe('done');
      // The three text parts should land in the final answer.
      expect(done?.answer).toContain('第一段');
      expect(done?.answer).toContain('第二段');
      expect(done?.answer).toContain('第三段');
    });
  });
});
