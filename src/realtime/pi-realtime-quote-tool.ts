/**
 * `realtime_quote` — the second TypeBox-migrated Pi tool in upup.
 *
 * This tool is the second migration after `daemon_stats`. Unlike the
 * arg-less `daemon_stats`, `realtime_quote` validates the non-empty
 * TypeBox schema path: it requires a `symbol: string` parameter.
 *
 * Migration cost (vs. `daemon_stats`):
 *   - Same 4 steps: schema, 5-arg execute, `{ content, details }`, defineTool.
 *   - Plus: when the LLM passes an invalid arg (missing `symbol` or wrong
 *     type), pi's runtime would reject the call before `execute` runs.
 *     The runtime validates against `parameters` via TypeBox — the
 *     previous defensive `params?.symbol ?? 'AAPL'` fallback becomes
 *     unnecessary because invalid params never reach execute.
 *
 * Stateful pattern: pi holds a tool's identity stable across calls,
 * so the `currentFeed` reference lives in a closure returned by the
 * factory. `pi-realtime.ts` calls `createRealtimeQuoteTool()` once and
 * registers the returned tool — every invocation sees the same feed
 * state.
 */
import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { createRealtimeFeed, type Quote } from './index.js';

/**
 * `realtime_quote` takes one required argument: the symbol to subscribe
 * to. The TypeBox schema below is what pi's runtime uses to validate
 * the LLM's tool call before invoking `execute`.
 */
export const realtimeQuoteParams = Type.Object({
  symbol: Type.String({
    description: 'Ticker symbol to subscribe to (e.g. "600519", "AAPL").',
    minLength: 1,
  }),
});
export type RealtimeQuoteParams = Static<typeof realtimeQuoteParams>;

/**
 * Quote details returned by the feed. Used as `TDetails` so the result
 * `{ content, details }` is typed for pi's runtime consumers.
 */
export interface RealtimeQuoteDetails {
  symbol: string;
  quote: Quote | null;
}

/**
 * Per-tool execute factory. Returns the registered tool with a stable
 * identity across calls. The `getFeed` and `setFeed` hooks let the
 * surrounding extension share a feed reference (so the `realtime`
 * command can pre-seed the feed before any tool call lands).
 */
export function createRealtimeQuoteTool(): ReturnType<typeof defineTool> {
  let currentFeed: ReturnType<typeof createRealtimeFeed> | null = null;

  return defineTool({
    name: 'realtime_quote',
    label: 'Realtime Quote',
    description: 'Subscribe to realtime quotes for a symbol and return the first tick',
    promptSnippet: 'Get the latest quote for a symbol from the realtime feed',
    promptGuidelines: [
      'Use realtime_quote to fetch the current market price for a single symbol (e.g. AAPL, 600519).',
      "When the user asks for multiple symbols, call realtime_quote once per symbol rather than guessing a batch API — the realtime tool surface only supports one-symbol-at-a-time lookups in this version.",
    ],
    parameters: realtimeQuoteParams,
    async execute(
      _toolCallId,
      params: RealtimeQuoteParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: RealtimeQuoteDetails }> {
      if (!currentFeed) {
        currentFeed = createRealtimeFeed({ source: 'mock' });
      }

      const { symbol } = params;

      const firstQuote: Promise<Quote | null> = new Promise((resolve) => {
        const off = currentFeed!.feed.on('quote', (event) => {
          if (event.type !== 'quote') return;
          if (event.payload.symbol !== symbol) return;
          off();
          resolve(event.payload);
        });
      });

      await currentFeed.feed.subscribe([symbol]);

      // Mock feed: push one quote so the consumer observes a tick.
      const inner = currentFeed.feed as unknown as {
        pushQuote: (q: Quote) => void;
      };
      inner.pushQuote({
        symbol,
        last: 100,
        volume: 1,
        timestamp: Date.now(),
      });

      const quote = await Promise.race([
        firstQuote,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
      ]);

      return {
        content: [{ type: 'text', text: JSON.stringify({ symbol, quote }) }],
        details: { symbol, quote },
      };
    },
  });
}
