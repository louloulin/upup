import type { PiUpupExtensionApi } from '../pi-main.js';
import { createRealtimeFeed } from './index.js';
import { createRealtimeQuoteTool } from './pi-realtime-quote-tool.js';

/**
 * The realtime extension registers against the upup extension contract —
 * the same `PiUpupExtensionApi` shape the Pi Fake API implements. This is
 * intentionally a narrow contract (not the full Pi `ExtensionAPI`):
 *
 *   - `realtime_status` — arg-less tool, kept on the historic loose
 *     shape `{ name, description, execute() }`. No schema to validate.
 *   - `realtime_quote` — migrated to the strict Pi `ToolDefinition`
 *     shape with TypeBox `parameters: { symbol: string }` and 5-arg
 *     execute. See `pi-realtime-quote-tool.ts`.
 *
 * Mixing shapes inside one extension is supported by the fake api's
 * `registerTool` overload: it accepts both loose and strict forms, so
 * stateful and arg-less tools can coexist with schema-validated tools
 * without a forced migration of the whole extension.
 *
 * The `RealtimeExtensionApi` alias is kept for callers that prefer the
 * narrow historical name; both refer to the same upup contract.
 */
export type RealtimeExtensionApi = PiUpupExtensionApi;

export function registerRealtimeExtension(pi: PiUpupExtensionApi): void {
  // Loose-shape `realtime_status` keeps its own feed reference for
  // backward-compat with the existing test. The migrated
  // `realtime_quote` tool owns its feed reference in its closure (see
  // pi-realtime-quote-tool.ts); each tool is self-contained.
  let statusFeed: ReturnType<typeof createRealtimeFeed> | null = null;

  pi.registerTool({
    name: 'realtime_status',
    label: 'Realtime Status',
    description: 'Show realtime feed status for mock or eastmoney source',
    async execute() {
      if (!statusFeed) {
        return { content: [{ type: 'text', text: 'Realtime feed not initialized' }] };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              source: statusFeed.feed.source,
              isConnected: statusFeed.feed.isConnected,
            }),
          },
        ],
      };
    },
  });

  // Migrated tool — strict `ToolDefinition` with TypeBox schema.
  pi.registerTool(createRealtimeQuoteTool());

  pi.registerCommand('realtime', {
    description: 'Start a minimal realtime session',
    handler: async () => {
      statusFeed = createRealtimeFeed({ source: 'mock' });
    },
  });
}
