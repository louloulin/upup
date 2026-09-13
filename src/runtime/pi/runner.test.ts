/**
 * Tests for the Pi runtime prompt runner:
 *   - toPiSessionId — identity normalization (already covered above)
 *   - isPiSessionRunning — reports running state by session key
 *   - runPiPrompt — end-to-end path through the public prompt surface
 *   - disposePiSessions — clears the runner's session cache
 *
 * The end-to-end path uses a `fauxProvider` so we exercise the public
 * `runPiPrompt` flow without depending on a real network provider.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { disposePiSessions, isPiSessionRunning, runPiPrompt, toPiSessionId } from './runner.js';
import { getPiSessionService } from './session-service.js';
import type { UpUpToolContract } from './types.js';

const quoteTool: UpUpToolContract = {
  name: 'fixture_market_quote',
  label: 'Fixture market quote',
  description: 'Returns a deterministic market quote.',
  category: 'market',
  safetyLevel: 'safe',
  parameters: Type.Object({ symbol: Type.String() }),
  hasFinancialImpact: false,
  async execute(input: { symbol: string }) {
    return {
      value: { symbol: input.symbol, close: 100 },
      text: JSON.stringify({ symbol: input.symbol, close: 100 }),
      details: {
        evidence: [{
          id: `fixture-quote-${input.symbol}`,
          source: 'upup-fixture://market-quote',
          retrievedAt: '2026-09-13T00:00:00.000Z',
          asOf: '2026-09-12',
          query: input.symbol,
        }],
        dataFreshness: 'historical',
        auditId: 'audit-fixture',
      },
    };
  },
};

async function withTempDir<T>(prefix: string, body: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(process.cwd(), '.upup', prefix));
  const previous = process.env.UPUP_SESSION_DIR;
  process.env.UPUP_SESSION_DIR = dir;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.UPUP_SESSION_DIR;
    else process.env.UPUP_SESSION_DIR = previous;
    await getPiSessionService().dispose();
    await rm(dir, { recursive: true, force: true });
  }
}

describe('Pi runner session identity', () => {
  test('normalizes channel-scoped keys into valid deterministic Pi IDs', () => {
    expect(toPiSessionId('whatsapp:+8613800000000')).toBe('whatsapp-8613800000000');
    expect(toPiSessionId('cron:daily-report')).toBe('cron-daily-report');
    expect(toPiSessionId('whatsapp:+8613800000000')).toBe(toPiSessionId('whatsapp:+8613800000000'));
  });

  test('hashes empty or oversized identities instead of passing invalid IDs to Pi', () => {
    expect(toPiSessionId(':::')).toMatch(/^upup-[0-9a-f]{32}$/);
    expect(toPiSessionId('x'.repeat(200))).toMatch(/^upup-[0-9a-f]{32}$/);
  });
});

describe('Pi runner session lifecycle', () => {
  afterEach(() => {
    disposePiSessions();
  });

  test('isPiSessionRunning reports false for unknown and unkeyed prompts', async () => {
    await withTempDir('runner-lifecycle-', async () => {
      expect(isPiSessionRunning('whatsapp:never-started')).toBe(false);
    });
  });

  test('disposePiSessions is safe to call when the cache is empty', () => {
    expect(() => disposePiSessions()).not.toThrow();
    expect(() => disposePiSessions()).not.toThrow();
  });
});

describe('Pi runner end-to-end (fauxProvider)', () => {
  afterEach(() => {
    disposePiSessions();
  });

  test('runs a plain text response and returns the Pi session answer', async () => {
    await withTempDir('runner-e2e-ok-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-e2e-ok',
        models: [{ id: 'runner-e2e-ok-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('600519 收盘价 100。')])]);

      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);

      const answer = await runPiPrompt('600519 收盘价是多少？', {
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        maxIterations: 1,
        cwd: process.cwd(),
      });
      expect(answer).toContain('600519');
      expect(answer).toContain('100');
    });
  });

  test('shares a session across prompts on the same sessionKey', async () => {
    await withTempDir('runner-e2e-share-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-e2e-share',
        models: [{ id: 'runner-e2e-share-model', reasoning: false }],
      });
      faux.setResponses([
        fauxAssistantMessage([fauxText('第一轮回答。')]),
        fauxAssistantMessage([fauxText('第二轮回答。')]),
      ]);
      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);

      const sessionKey = 'cron:daily-report';
      const cwd = process.cwd();
      const first = await runPiPrompt('第一轮', {
        sessionKey,
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        maxIterations: 1,
        cwd,
      });
      const second = await runPiPrompt('第二轮', {
        sessionKey,
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        maxIterations: 1,
        cwd,
      });
      expect(first).toContain('第一轮回答');
      expect(second).toContain('第二轮回答');
      // After the runner returns from both prompts the session is idle.
      expect(isPiSessionRunning(sessionKey)).toBe(false);
    });
  });

  test('rejects reusing a session key with a different Pi AgentSpec', async () => {
    await withTempDir('runner-spec-isolation-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-spec-isolation',
        models: [{ id: 'runner-spec-isolation-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('readonly')])]);
      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);
      const sessionKey = 'profile:shared';
      await runPiPrompt('first', {
        sessionKey,
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        cwd: process.cwd(),
        toolFilter: ['fixture_market_quote'],
      });
      await expect(runPiPrompt('second', {
        sessionKey,
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        cwd: process.cwd(),
        toolFilter: ['fixture_fundamentals'],
      })).rejects.toThrow('different AgentSpec');
    });
  });

  test('persists AgentSpec isolation across runner disposal and reopen', async () => {
    await withTempDir('runner-persisted-spec-isolation-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-persisted-spec-isolation',
        models: [{ id: 'runner-persisted-spec-isolation-model', reasoning: false }],
      });
      faux.setResponses([fauxAssistantMessage([fauxText('first')])]);
      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);
      const options = {
        sessionKey: 'profile:persisted',
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        cwd: process.cwd(),
      };
      await runPiPrompt('first', { ...options, toolFilter: ['fixture_market_quote'] });
      disposePiSessions();
      await expect(runPiPrompt('second', { ...options, toolFilter: ['fixture_fundamentals'] }))
        .rejects.toThrow('persisted with a different AgentSpec');
    });
  });

  test('serializes concurrent first prompts onto one Pi session per session key', async () => {
    await withTempDir('runner-concurrent-init-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-concurrent-init',
        models: [{ id: 'runner-concurrent-init-model', reasoning: false }],
      });
      faux.setResponses([
        fauxAssistantMessage([fauxText('first response')]),
        fauxAssistantMessage([fauxText('second response')]),
      ]);
      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);
      const options = {
        sessionKey: 'profile:concurrent',
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        cwd: process.cwd(),
      };
      const [first, second] = await Promise.all([
        runPiPrompt('first', options),
        runPiPrompt('second', options),
      ]);
      expect(first).toContain('first response');
      expect(second).toContain('second response');
      expect(isPiSessionRunning(options.sessionKey)).toBe(false);
    });
  });

  test('emits session events through onEvent for the faux model tool call', async () => {
    await withTempDir('runner-e2e-tool-', async () => {
      const faux = fauxProvider({
        provider: 'upup-runner-e2e-tool',
        models: [{ id: 'runner-e2e-tool-model', reasoning: false }],
      });
      faux.setResponses([
        fauxAssistantMessage([
          fauxText('先取报价'),
          fauxToolCall('fixture_market_quote', { symbol: '600519' }),
        ]),
        fauxAssistantMessage([fauxText('报价完成')]),
      ]);
      const runtime = await ModelRuntime.create({ refreshOnCreate: false });
      runtime.registerNativeProvider(faux.provider);

      const events: string[] = [];
      const answer = await runPiPrompt('请报价', {
        model: faux.getModel().id,
        modelInstance: faux.getModel(),
        modelRuntime: runtime,
        maxIterations: 2,
        cwd: process.cwd(),
        toolFilter: ['fixture_market_quote'],
        onEvent: (event) => {
          events.push(event.type);
        },
      });
      // We don't assert exact ordering — only that the public runner surfaces
      // the lifecycle events the CLI / print / Eval consumers depend on.
      expect(events).toContain('tool_start');
      expect(answer.length).toBeGreaterThan(0);
    });
  });
});
