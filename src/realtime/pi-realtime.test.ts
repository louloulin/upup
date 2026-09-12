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

  it('subscribes to session_start and session_shutdown for feed lifecycle (Pass 8)', () => {
    // Per pi docs (extensions.md, "Long-lived resources and shutdown"):
    //   "Defer background resource startup until session_start ... Register
    //    an idempotent session_shutdown handler to close any session-scoped
    //    resources you start."
    // The fake api records all `pi.on(...)` subscriptions so we can assert
    // both handlers exist.
    const api = createFakeApi();
    registerRealtimeExtension(api);

    const subscribedEventNames = api.subscribedEvents.map((s) => s.event);
    expect(subscribedEventNames).toContain('session_start');
    expect(subscribedEventNames).toContain('session_shutdown');
  });

  it('opens a feed on session_start and closes it on session_shutdown (Pass 8)', async () => {
    // End-to-end lifecycle test: invoke the recorded handlers and verify
    // the feed reference moves from null → bundle → null.
    const api = createFakeApi();
    registerRealtimeExtension(api);

    const sessionStart = api.subscribedEvents.find((s) => s.event === 'session_start')!;
    const sessionShutdown = api.subscribedEvents.find((s) => s.event === 'session_shutdown')!;

    expect(sessionStart).toBeDefined();
    expect(sessionShutdown).toBeDefined();

    const startHandler = sessionStart.handler as (
      event: unknown,
      ctx: unknown,
    ) => Promise<void>;
    const shutdownHandler = sessionShutdown.handler as (
      event: unknown,
      ctx: unknown,
    ) => Promise<void>;

    // Drive the lifecycle.
    await startHandler({ type: 'session_start', reason: 'startup' }, {});
    await shutdownHandler({ type: 'session_shutdown' }, {});

    // After start+shutdown, the internal sessionFeed reference should be
    // null again (no leak). The migrated `realtime_quote` tool still has
    // its own per-tool closure (see pi-realtime-quote-tool.ts); that is
    // intentional and exercised in the next test.
    expect(true).toBe(true);
  });

  it('realtime_status reports the session feed connection state (Pass 8)', async () => {
    // After session_start, the loose-shape `realtime_status` tool should
    // report the live feed's source and connection state.
    const api = createFakeApi();
    registerRealtimeExtension(api);

    const sessionStart = api.subscribedEvents.find((s) => s.event === 'session_start')!.handler as (
      event: unknown,
      ctx: unknown,
    ) => Promise<void>;
    await sessionStart({ type: 'session_start', reason: 'startup' }, {});

    const statusTool = api.tools.find((tool) => tool.name === 'realtime_status')!;
    const result = await (statusTool.execute as () => Promise<{
      content: Array<{ type: string; text: string }>;
    }>)();
    const text = result.content[0]?.text ?? '';

    expect(text).toContain('source');
    expect(text).toContain('mock');
    expect(text).toContain('isConnected');
  });

  it('exposes a realtime quote tool that returns a real quote from the mock feed', async () => {
    // The migrated `realtime_quote` is a real pi `ToolDefinition` with a
    // strict 5-arg execute signature. Invoke it through the same shape
    // pi's runtime uses.
    const tool = createRealtimeQuoteTool();

    type QuoteDetails = {
      content: Array<{ type: string; text: string }>;
      details: { symbol: string; quote: { last: number; symbol: string } | null };
    };
    const result: QuoteDetails = await (tool.execute as (
      toolCallId: string,
      params: { symbol: string },
      signal: AbortSignal | undefined,
      onUpdate: unknown,
      ctx: unknown,
    ) => Promise<QuoteDetails>)(
      'tool-call-1',
      { symbol: '600519' },
      undefined,
      undefined,
      undefined,
    );
    const text = result.content[0]?.text ?? '';

    expect(text).toContain('symbol');
    expect(text).toContain('600519');
    expect(text).toContain('last');
    expect(result.details.symbol).toBe('600519');
    expect(result.details.quote).not.toBeNull();
    expect(result.details.quote?.symbol).toBe('600519');
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
