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
// Background prompt service
// =============================================================================
export * from './background-service';

// =============================================================================
// Pi-native session service, runner registry and resolution helpers
// =============================================================================
export * from './session-registry';

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
export * from './pi-native-providers';
export * from './prompt-runner';

export * from './tool-scope';
export * from './skill-scope';
