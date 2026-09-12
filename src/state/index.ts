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
import {
  registerStatePort,
  type StatePort,
  type SessionSummary,
} from '../runtime/pi/agent-port.js';
import {
  getAppState,
  formatCost,
  formatTokens,
  getSessionManager,
} from '@upup/state';

function registerSelf(): void {
  const port: StatePort = {
    getAppState: () => getAppState() as unknown as StatePort['getAppState'] extends () => infer R ? R : never,
    formatCost: (cost: number) => formatCost(cost),
    formatTokens: (tokens: number) => formatTokens(tokens),
    getSessionManager: () => ({
      listSessions: async (limit: number): Promise<SessionSummary[]> => {
        const mgr = getSessionManager() as unknown as {
          listSessions: (n: number) => Promise<Array<{
            id: string;
            customTitle?: string;
            firstPrompt?: string;
          }>>;
        };
        const sessions = await mgr.listSessions(limit);
        return sessions.map((s) => ({
          id: s.id,
          ...(s.customTitle ? { customTitle: s.customTitle } : {}),
          ...(s.firstPrompt ? { firstPrompt: s.firstPrompt } : {}),
        }));
      },
    }),
  };
  registerStatePort(port);
}
registerSelf();
