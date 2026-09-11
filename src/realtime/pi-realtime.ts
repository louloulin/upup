import { createRealtimeFeed } from './index.js';

export interface RealtimeExtensionApi {
  registerTool(tool: {
    name: string;
    label?: string;
    description?: string;
    parameters?: unknown;
    execute?: (...args: any[]) => Promise<any> | any;
  }): void;
  registerCommand(name: string, options: { description?: string; handler?: (...args: any[]) => Promise<void> | void }): void;
}

export function registerRealtimeExtension(pi: RealtimeExtensionApi): void {
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
    async execute(params: { symbol: string }) {
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
      const inner = currentFeed.feed as unknown as { pushQuote: (q: any) => void };
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
