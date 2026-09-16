// =============================================================================
// Pi Session — public surface for production code.
// =============================================================================

export { PiSessionAdapter } from './session-adapter';
export type { PiSessionAdapterOptions } from './session-adapter';

// =============================================================================
// Pi Host Bridge contract
// =============================================================================
export * from './host-contract';

// =============================================================================
// Finance host contract
// =============================================================================
export * from './finance-host-contract';

// =============================================================================
// Persistent session service
// =============================================================================
export * from './session-tracker';
export * from './background-service';
export * from './session-service';

// =============================================================================
// Session orchestration helpers
// =============================================================================
export * from './session-environment';
export * from './session-types';

// =============================================================================
// Session message renderer
// =============================================================================
export * from './render/message-renderer';

// =============================================================================
// Persistent storage helpers
// =============================================================================
export * from './selector';

// =============================================================================
// Built-in session composition (finance + platform sub-boundaries)
// =============================================================================
export {
  builtinSessionComposition,
  builtinSessionFinanceComposition,
  builtinSessionPlatformComposition,
  builtinSessionPromptComposition,
  type PiSessionCompositionProviders,
  type PiSessionFinanceProviders,
  type PiSessionPlatformProviders,
  type PiSessionPromptProviders,
} from './builtin-composition';

// =============================================================================
// Pi Native runtime and prompt orchestration
// =============================================================================
export * from './agent-session-factory';
export * from './prompt-runner';

export { withPiFileLock } from './file-lock';
export type { PiFileLockOptions } from './file-lock';

export { PiSessionRegistry } from './session-registry';
export type { PiRunnerSessionState, PiSessionInitialization } from './session-registry';

export * from './tool-scope';
export * from './skill-scope';
