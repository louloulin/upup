import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

/**
 * Contract: a model selection that targets a provider UpUp contributes to Pi
 * (the local Ollama server) must reach that server through Pi's own runtime —
 * resolution, registration, streaming and assistant-message mapping included.
 *
 * The server below speaks the OpenAI-compatible surface Ollama exposes under
 * `/v1`, and `OLLAMA_BASE_URL` points at it, so the test never needs a real
 * Ollama installation.
 */
function startFakeOllamaServer() {
  let chatRequests = 0;
  let lastModel: string | undefined;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/api/tags') {
        return Response.json({
          models: [{ name: 'llama3.1:latest', modified_at: '2026-09-15T00:00:00Z', size: 1 }],
        });
      }
      if (url.pathname === '/v1/chat/completions') {
        chatRequests += 1;
        const body = (await request.json()) as { model?: string };
        lastModel = body.model;
        const chunk = (delta: Record<string, unknown>, finishReason: string | null) =>
          `data: ${JSON.stringify({
            id: 'chatcmpl-fixture',
            object: 'chat.completion.chunk',
            created: 1,
            model: lastModel,
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}`;
        return new Response(
          [
            chunk({ role: 'assistant', content: '本地模型已完成回答。' }, null),
            chunk({}, 'stop'),
            'data: [DONE]',
            '',
          ].join('\n\n'),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response('not found', { status: 404 });
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    get chatRequests() {
      return chatRequests;
    },
    get lastModel() {
      return lastModel;
    },
    stop: () => server.stop(true),
  };
}

describe('Pi runtime — ollama provider contract', () => {
  test('runs an ollama: session through Pi against a local OpenAI-compatible endpoint', async () => {
    const ollama = startFakeOllamaServer();
    const previousBaseUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = ollama.baseUrl;
    const directory = await mkdtemp(join(process.cwd(), '.upup', 'pi-ollama-'));
    let session: Awaited<ReturnType<PiAgentSessionFactory['createSession']>> | undefined;
    try {
      session = await new PiAgentSessionFactory().createSession(
        { ...getInvestmentAgentSpec('invest-explore'), model: 'ollama:llama3.1' },
        { cwd: directory },
      );
      await session.prompt('用本地模型回答');
      await session.waitForIdle();
      expect(ollama.chatRequests).toBeGreaterThan(0);
      expect(ollama.lastModel).toBe('llama3.1');
      expect(session.getMessages().at(-1)).toMatchObject({ role: 'assistant' });
    } finally {
      session?.dispose();
      if (previousBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = previousBaseUrl;
      ollama.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
