// =============================================================================
// Pi Session — public surface for production code.
//
// The class implementation lives in `./session-adapter` so that
// `agent-session-factory` can import the adapter without inducing a
// circular import through this barrel (factory re-exports + index).
// =============================================================================
export * from './session-adapter';

// =============================================================================
// Pi Host Bridge contract (foundation for finance + session capability bridge)
// =============================================================================
export * from './host-contract';

// =============================================================================
// Finance host contract (thin convenience wrapper for finance capability)
// =============================================================================
export * from './finance-host-contract';

// =============================================================================
// Persistent session service (background tasks + persistent sessions)
// =============================================================================
export * from './background-service';
export * from './session-service';

// =============================================================================
// Session orchestration helpers (state tracking, environment capture,
// restore, ephemeral filtering, context collapse, message chain, shared types)
// =============================================================================
export * from './session-state';
export * from './session-environment';
export * from './session-tracker';
export * from './context-collapse';
export * from './ephemeral-messages';
export * from './message-chain';
export * from './session-types';

// =============================================================================
// Session message renderer (used by CLI)
// =============================================================================
export * from './render/message-renderer';

// =============================================================================
// Legacy session migration helpers (one-shot data migration)
// =============================================================================
export * from './pi-migration';
export * from './migrate';
export * from './migrate-to-pi';
export * from './storage-portable';

// =============================================================================
// Persistent storage helpers (JSONL-backed session storage)
// =============================================================================
export * from './storage';
export * from './restore';
export * from './pid-manager';
export * from './selector';

// Pi Native runtime and prompt orchestration. These are the only public
// production entry points for creating AgentSession instances and running
// prompts; the root application must not import their implementation paths.
export * from './agent-session-factory';
export * from './prompt-runner';
export { PiSessionRegistry } from './session-registry';
export type { PiRunnerSessionState, PiSessionInitialization } from './session-registry';
export { withPiFileLock } from './file-lock';
export type { PiFileLockOptions } from './file-lock';

// Explicit composition boundary for PiApp and deterministic fixtures.
export {
  builtinSessionComposition,
  builtinSessionFinanceComposition,
  builtinSessionPlatformComposition,
  builtinSessionPromptComposition,
} from './builtin-composition';
export type {
  PiSessionCompositionProviders,
  PiSessionFinanceProviders,
  PiSessionPlatformProviders,
  PiSessionPromptProviders,
} from './builtin-composition';
