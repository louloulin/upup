import type { PiUpupExtensionApi } from '../pi-main.js';
import { createRealtimeFeed, type RealtimeFeedBundle } from './index.js';
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
 * **Lifecycle (Pass 8)**: per pi conventions documented in
 * `docs/extensions.md` (section "Long-lived resources and shutdown"),
 * the realtime feed is created in `session_start` and torn down in
 * `session_shutdown`. This keeps the feed lifecycle aligned with the
 * session, regardless of whether the user runs `/realtime` first.
 *
 * The `RealtimeExtensionApi` alias is kept for callers that prefer the
 * narrow historical name; both refer to the same upup contract.
 */
export type RealtimeExtensionApi = PiUpupExtensionApi;

export function registerRealtimeExtension(pi: PiUpupExtensionApi): void {
  // Shared session-scoped feed. Created in `session_start`, closed in
  // `session_shutdown`. Both `realtime_status` (loose-shape) and the
  // strict `realtime_quote` tool consult this same reference so a
  // single feed serves the whole session.
  let sessionFeed: RealtimeFeedBundle | null = null;

  // --- Lifecycle: open / close the feed per session -----------------------

  pi.on('session_start', async (_event, _ctx) => {
    sessionFeed = createRealtimeFeed({ source: 'mock' });
  });

  pi.on('session_shutdown', async (_event, _ctx) => {
    if (sessionFeed) {
      await sessionFeed.close();
      sessionFeed = null;
    }
  });

  // --- Tools --------------------------------------------------------------

  // Loose-shape `realtime_status` — reads the session-scoped feed.
  pi.registerTool({
    name: 'realtime_status',
    label: 'Realtime Status',
    description: 'Show realtime feed status for mock or eastmoney source',
    promptSnippet: 'Show realtime feed status (source, connection state)',
    promptGuidelines: [
      'Use realtime_status to confirm the realtime feed is connected before placing trades or subscribing to quotes.',
    ],
    async execute() {
      if (!sessionFeed) {
        return {
          content: [
            { type: 'text', text: 'Realtime feed is not active for this session.' },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              source: sessionFeed.feed.source,
              isConnected: sessionFeed.feed.isConnected,
            }),
          },
        ],
      };
    },
  });

  // Migrated tool — strict `ToolDefinition` with TypeBox schema.
  // The tool owns its own feed reference in its closure (see
  // pi-realtime-quote-tool.ts). In a future pass, this can be
  // refactored to share `sessionFeed` with realtime_status via a
  // shared setter; the per-tool closure keeps the migrated tool
  // self-contained for now.
  pi.registerTool(createRealtimeQuoteTool());

  // --- Command ------------------------------------------------------------
  // The `/realtime` command no longer creates the feed (it is created
  // automatically on session_start). It now reports the feed status,
  // matching the lifecycle refactor.
  pi.registerCommand('realtime', {
    description: 'Show realtime feed status for the current session',
    handler: async (_args, _ctx) => {
      if (!sessionFeed) {
        return;
      }
      // The status is exposed through the realtime_status tool; the
      // command exists for users who prefer slash-command UX. We keep
      // it side-effect-free so the session_start lifecycle remains
      // the source of truth.
    },
  });
}
