import { describe, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import { FINANCE_FIXTURE_TOOLS } from '../../extensions/upup/finance-fixtures.js';
import type { UpUpToolContract } from './types.js';

const fixtureTool: UpUpToolContract = {
  name: 'fixture_market_quote',
  label: 'Fixture market quote',
  description: 'Returns a deterministic market quote.',
  category: 'market',
  safetyLevel: 'safe',
  parameters: Type.Object({ symbol: Type.String() }),
  hasFinancialImpact: false,
  async execute(input: { symbol: string }, context) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    context.onUpdate?.({ text: `quoted ${input.symbol}`, progress: 1 });
    return {
      value: { symbol: input.symbol, close: 100 },
      text: JSON.stringify({ symbol: input.symbol, close: 100 }),
      details: {
        evidence: [{
          id: 'fixture-quote-600519',
          source: 'upup-fixture://market-quote',
          retrievedAt: '2026-09-13T00:00:00.000Z',
          asOf: '2026-09-12',
          query: input.symbol,
        }],
        dataFreshness: 'historical',
        auditId: context.auditId,
      },
    };
  },
};

describe('Pi runtime deterministic fixture', () => {
  test('executes all five finance fixtures through Pi registerTool definitions', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      tools: FINANCE_FIXTURE_TOOLS.map((tool) => tool.name),
    }, {
      cwd: process.cwd(),
      tools: FINANCE_FIXTURE_TOOLS,
    });
    const inputs: Record<string, unknown> = {
      fixture_market_quote: { symbol: '600519.SH' },
      fixture_fundamentals: { symbol: '600519.SH' },
      fixture_news: { query: '贵州茅台' },
      fixture_search: { query: '白酒行业' },
      fixture_trading_day: { date: '2026-09-12' },
    };
    try {
      for (const tool of FINANCE_FIXTURE_TOOLS) {
        expect(session.getAvailableToolNames()).toContain(tool.name);
        expect(tool.maxConcurrent).toBeGreaterThan(0);
        const result = await session.executeTool(
          tool.name,
          `fixture-call-${tool.name}`,
          inputs[tool.name],
          new AbortController().signal,
        );
        expect(result.content).toBeDefined();
        const details = result.details as Record<string, unknown>;
        expect(details).toMatchObject({
          auditId: expect.any(String),
          evidence: [expect.objectContaining({
            source: expect.stringContaining('upup-fixture://'),
            retrievedAt: '2026-09-13T00:00:00.000Z',
            asOf: expect.stringMatching(/^2026-09-\d{2}$/),
            dataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          })],
          warnings: [expect.stringContaining('Deterministic fixture data')],
        });
      }
    } finally {
      session.dispose();
    }
  });

  test('preserves fixture concurrency metadata, progress, and AbortSignal semantics', async () => {
    const updates: Array<{ text: string; progress?: number }> = [];
    const quote = FINANCE_FIXTURE_TOOLS.find((tool) => tool.name === 'fixture_market_quote');
    expect(quote).toBeDefined();
    const controller = new AbortController();
    const result = await quote!.execute({ symbol: '600519.SH' }, {
      agent: getInvestmentAgentSpec('invest-explore'),
      toolCallId: 'fixture-contract-call',
      signal: controller.signal,
      auditId: 'fixture-contract-audit',
      onUpdate: (update) => updates.push(update),
    });
    expect(result.details?.auditId).toContain('fixture-audit');
    expect(updates).toEqual([{ text: 'Loading quote for 600519.SH', progress: 0.5 }]);

    controller.abort();
    await expect(quote!.execute({ symbol: '600519.SH' }, {
      agent: getInvestmentAgentSpec('invest-explore'),
      toolCallId: 'fixture-aborted-call',
      signal: controller.signal,
      auditId: 'fixture-aborted-audit',
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('runs a multi-turn tool call and exposes session lifecycle operations', async () => {
    const tempDir = await mkdtemp(join(process.cwd(), '.upup', 'pi-fixture-'));
    const faux = fauxProvider({ provider: 'upup-fixture', models: [{ id: 'fixture-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('fixture_market_quote', { symbol: '600519' })]),
      fauxAssistantMessage([fauxText('报价已获取：600519 收盘价 100。')]),
      fauxAssistantMessage([fauxText('已按你的补充要求保留证据。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: process.cwd(),
      tools: [fixtureTool],
      model: faux.getModel(),
      modelRuntime,
      sessionPath: join(tempDir, 'session.jsonl'),
    });
    const events: string[] = [];
    session.subscribe((event) => events.push(event.type));
    const prompt = session.prompt('查询 600519');
    await new Promise((resolve) => setTimeout(resolve, 3));
    await session.steer('请保留来源证据');
    await prompt;
    await session.waitForIdle();

    expect(events).toContain('tool_start');
    expect(events).toContain('tool_end');
    expect(events).toContain('message_end');
    expect(events).toContain('agent_end');
    expect(session.getMessages().some((message) => typeof message === 'object' && message !== null && 'role' in message && message.role === 'toolResult')).toBe(true);
    expect(session.getSessionTree().length).toBeGreaterThan(0);
    const exportPath = session.exportToJsonl(join(tempDir, 'export.jsonl'));
    expect(exportPath).toContain('export.jsonl');
    expect(session.fork()).toBeString();
    session.dispose();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('handles multiple tool calls, follow-up steering, and preserves the final answer', async () => {
    const faux = fauxProvider({ provider: 'upup-multi-tool-fixture', models: [{ id: 'multi-tool-model', reasoning: false }] });
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall('fixture_market_quote', { symbol: '600519' }, { id: 'quote-1' }),
        fauxToolCall('fixture_market_quote', { symbol: '000858' }, { id: 'quote-2' }),
      ]),
      fauxAssistantMessage([fauxText('两只股票的报价均已获取。')]),
      fauxAssistantMessage([fauxText('已保留两份证据。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: process.cwd(),
      tools: [fixtureTool],
      model: faux.getModel(),
      modelRuntime,
    });
    const toolCalls: string[] = [];
    const events: string[] = [];
    const unsubscribe = session.subscribe((event) => {
      events.push(event.type);
      if (event.type === 'tool_start') toolCalls.push(event.toolCallId);
    });
    try {
      const prompt = session.prompt('同时查询 600519 和 000858');
      await new Promise((resolve) => setTimeout(resolve, 3));
      await session.steer('回答中保留每个来源');
      await prompt;
      await session.waitForIdle();
      expect(toolCalls).toEqual(['quote-1', 'quote-2']);
      expect(events).toContain('tool_end');
      expect(events).toContain('agent_end');
      expect(session.getMessages().some((message) => typeof message === 'object' && message !== null && 'role' in message && message.role === 'toolResult')).toBe(true);
      expect(session.getMessages().at(-1)).toMatchObject({ role: 'assistant' });
    } finally {
      unsubscribe();
      session.dispose();
    }
  });

  test('maps Pi provider errors and aborts to observable session events', async () => {
    const errorFaux = fauxProvider({ provider: 'upup-error-fixture', models: [{ id: 'error-model', reasoning: false }] });
    errorFaux.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'fixture provider failed' })]);
    const errorRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    errorRuntime.registerNativeProvider(errorFaux.provider);
    const errorSession = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: process.cwd(), tools: [], model: errorFaux.getModel(), modelRuntime: errorRuntime,
    });
    const errorEvents: string[] = [];
    errorSession.subscribe((event) => errorEvents.push(event.type));
    try {
      await errorSession.prompt('触发 provider 错误');
      await errorSession.waitForIdle();
      expect(errorEvents).toContain('session_error');
    } finally {
      errorSession.dispose();
    }

    const abortFaux = fauxProvider({ provider: 'upup-abort-fixture', models: [{ id: 'abort-model', reasoning: false }] });
    abortFaux.setResponses([fauxAssistantMessage([fauxToolCall('fixture_market_quote', { symbol: '600519' })])]);
    const abortRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    abortRuntime.registerNativeProvider(abortFaux.provider);
    const abortSession = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), timeoutMs: 1 }, {
      cwd: process.cwd(), tools: [fixtureTool], model: abortFaux.getModel(), modelRuntime: abortRuntime,
    });
    const abortEvents: string[] = [];
    abortSession.subscribe((event) => abortEvents.push(event.type));
    try {
      await abortSession.prompt('触发超时取消');
      await abortSession.waitForIdle();
      expect(abortEvents).toContain('session_error');
    } finally {
      abortSession.dispose();
    }
  });
});
