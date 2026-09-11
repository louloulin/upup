import { createRealtimeFeed } from './index.js';
import type { PiUpupExtensionApi } from '../pi-main.js';

/**
 * The realtime extension registers against the upup extension contract —
 * the same `PiUpupExtensionApi` shape the Pi Fake API implements. This is
 * intentionally a narrow contract (not the full Pi `ExtensionAPI`) because
 * realtime only needs `registerTool` + `registerCommand`; making it
 * `ExtensionAPI` would force the internal tools to satisfy pi's strict
 * `ToolDefinition` schema (`parameters: TypeBox`, 5-arg execute signature,
 * etc.) which is out of scope for this iteration.
 *
 * The `RealtimeExtensionApi` alias is kept for callers that prefer the
 * narrow historical name; both refer to the same upup contract.
 */
export type RealtimeExtensionApi = PiUpupExtensionApi;

export function registerRealtimeExtension(pi: PiUpupExtensionApi): void {
  let currentFeed: ReturnType<typeof createRealtimeFeed> | null = null;

  pi.registerTool({
    name: 'realtime_status',
    label: 'Realtime Status',
    description: 'Show realtime feed status for mock or eastmoney source',
    async execute() {
      if (!currentFeed) {
        return { content: [{ type: 'text', text: 'Realtime feed not initialized' }] };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              source: currentFeed.feed.source,
              isConnected: currentFeed.feed.isConnected,
            }),
          },
        ],
      };
    },
  });

  pi.registerTool({
    name: 'realtime_quote',
    label: 'Realtime Quote',
    description: 'Subscribe to realtime quotes for a symbol and return the first tick',
    async execute(rawParams) {
      const params = rawParams as { symbol: string } | undefined;
      if (!currentFeed) {
        currentFeed = createRealtimeFeed({ source: 'mock' });
      }

      const symbol = params?.symbol ?? 'AAPL';

      const firstQuote: Promise<unknown> = new Promise((resolve) => {
        const off = currentFeed!.feed.on('quote', (event) => {
          if (event.type !== 'quote') return;
          if (event.payload.symbol !== symbol) return;
          off();
          resolve(event.payload);
        });
      });

      await currentFeed.feed.subscribe([symbol]);

      // Mock feed: push one quote so the consumer observes a tick.
      const inner = currentFeed.feed as unknown as { pushQuote: (q: unknown) => void };
      inner.pushQuote({ symbol, last: 100, volume: 1, timestamp: Date.now() });

      const quote = await Promise.race([
        firstQuote,
        new Promise((resolve) => setTimeout(() => resolve(null), 50)),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ symbol, quote }),
          },
        ],
      };
    },
  });

  pi.registerCommand('realtime', {
    description: 'Start a minimal realtime session',
    handler: async () => {
      currentFeed = createRealtimeFeed({ source: 'mock' });
    },
  });
}