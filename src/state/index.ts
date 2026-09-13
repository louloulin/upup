/**
 * @deprecated Use @upup/state instead
 * Re-exports from @upup/state for backward compatibility
 */

export {
  AppStateStore,
  getAppState,
  resetAppState,
  calculateTokenCost,
  formatCost,
  formatTokens,
  SessionManager,
  getSessionManager,
  CostTracker,
  type AppState,
  type AppStateListeners,
  type ModelCostConfig,
  type CostSnapshot,
  type SessionRecord,
} from '@upup/state';


// ============================================================================
// Self-registration with public port registry
// ============================================================================
// Allows packages/commands/ to access state singletons without a fragile
// 4-level `await import('../../../../../src/state/index.js')` path.
// The Pi runtime owns the port registry; this module only registers the
// state capability at the package boundary.
//
// Session list enumeration (`getSessionManager().listSessions`) is delegated
// to the Pi `PiSessionService` (`src/runtime/pi/session-service.ts`), which is
// the single source of truth for persisted session lifecycle (resume, fork,
// compact, remove). The legacy `@upup/state` SessionManager still owns the
// short-lived CLI command session duration / token counters; this is a
// domain metric, not a session lifecycle store.
import {
  registerStatePort,
  type StatePort,
  type SessionSummary,
} from '../runtime/pi/agent-port.js';
import {
  getAppState,
  formatCost,
  formatTokens,
} from '@upup/state';
import { getPiSessionService } from '../runtime/pi/session-service.js';

export function __registerStatePort(): void {
  const port: StatePort = {
    getAppState: () => getAppState() as unknown as StatePort['getAppState'] extends () => infer R ? R : never,
    formatCost: (cost: number) => formatCost(cost),
    formatTokens: (tokens: number) => formatTokens(tokens),
    getSessionManager: () => ({
      listSessions: async (limit: number): Promise<SessionSummary[]> => {
        const cwd = process.cwd();
        const all = await getPiSessionService().list(cwd);
        const trimmed = limit > 0 ? all.slice(0, limit) : all;
        return trimmed.map((s) => ({
          id: s.id,
          ...(s.customTitle ? { customTitle: s.customTitle } : {}),
          ...(s.firstPrompt ? { firstPrompt: s.firstPrompt } : {}),
          ...(s.created !== undefined ? { created: s.created } : {}),
          ...(s.modified !== undefined ? { modified: s.modified } : {}),
          ...(s.messageCount !== undefined ? { messageCount: s.messageCount } : {}),
          ...(s.tags !== undefined ? { tags: s.tags } : {}),
        }));
      },
    }),
  };
  registerStatePort(port);
}
__registerStatePort();
