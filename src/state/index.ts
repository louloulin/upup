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
// Note: this re-export module sits at the src/state/ boundary; importing
// src/agent/agent-port here is intentional — the port registry is a
// package-boundary crossing mechanism, not a layer violation.
import {
  registerStatePort,
  type StatePort,
  type SessionSummary,
} from '../agent/agent-port.js';
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
