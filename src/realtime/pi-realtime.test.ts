import { describe, expect, it } from 'bun:test';
import { registerRealtimeExtension, type RealtimeExtensionApi } from './pi-realtime.js';
import { createFakeApi, type PiFakeApi } from '../pi-main.js';
import { createRealtimeQuoteTool } from './pi-realtime-quote-tool.js';

describe('pi realtime extension', () => {
  it('registers a realtime status tool and command under the full Pi extension surface', () => {
    const api = createFakeApi();
    registerRealtimeExtension(api as unknown as RealtimeExtensionApi);

    // The fake api records every method call as part of the full Pi surface.
    expect(api.tools.length).toBeGreaterThan(0);
    expect(api.tools.some((tool) => tool.name === 'realtime_status')).toBe(true);
    expect(api.commands.some((command) => command.name === 'realtime')).toBe(true);
  });

  it('exposes a realtime quote tool that returns a real quote from the mock feed', async () => {
    const api = createFakeApi();
    registerRealtimeExtension(api as unknown as RealtimeExtensionApi);

    const realtimeCommand = api.commands.find((command) => command.name === 'realtime')!;
    await (realtimeCommand.options as { handler: () => Promise<void> }).handler();

    const quoteTool = api.tools.find((tool) => tool.name === 'realtime_quote')!;
    expect(quoteTool).toBeDefined();
    expect(quoteTool.execute).toBeDefined();

    // The migrated `realtime_quote` is a real pi `ToolDefinition` with a
    // strict 5-arg execute signature. Invoke it through the same shape
    // pi's runtime uses.
    const result = (await (quoteTool.execute as (
      toolCallId: string,
      params: { symbol: string },
    ) => Promise<{ content: Array<{ type: string; text: string }> }>)(
      'tool-call-1',
      { symbol: '600519' },
    ));
    const text = result?.content?.[0]?.text ?? '';

    expect(text).toContain('symbol');
    expect(text).toContain('600519');
    expect(text).toContain('last');
  });

  it('works against the shared PiFakeApi from src/pi-main.ts — no local fake', () => {
    // The point of this test: registerRealtimeExtension must accept the same
    // fake api object that the loader bridge uses, so there is exactly one
    // recording test double in the project.
    const api: PiFakeApi = createFakeApi();
    registerRealtimeExtension(api);
    expect(api.tools.length).toBeGreaterThan(0);
  });

  it('realtime_quote tool is a real pi ToolDefinition with a non-empty TypeBox schema', async () => {
    // The migrated `realtime_quote` validates the non-empty schema path:
    // it requires a `symbol: string` parameter, validated by pi's runtime
    // against the TypeBox schema before execute runs.
    const tool = createRealtimeQuoteTool();
    expect(tool.name).toBe('realtime_quote');
    expect(tool.label).toBe('Realtime Quote');
    expect(tool.parameters).toBeDefined();

    type QuoteDetails = {
      content: Array<{ type: 'text'; text: string }>;
      details: { symbol: string; quote: { last: number; symbol: string } | null };
    };
    const result: QuoteDetails = await (tool.execute as (
      toolCallId: string,
      params: { symbol: string },
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<QuoteDetails>)(
      'tool-call-2',
      { symbol: 'AAPL' },
      undefined,
      undefined,
      undefined,
    );

    expect(result.content[0]?.type).toBe('text');
    expect(result.details.symbol).toBe('AAPL');
    // The mock feed pushes exactly one tick matching the requested symbol,
    // so `details.quote` is the first observed tick (with `last: 100`).
    expect(result.details.quote).not.toBeNull();
    expect(result.details.quote?.symbol).toBe('AAPL');
  });
});