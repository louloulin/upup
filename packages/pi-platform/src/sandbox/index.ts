// Workspace file tools are provided by @upup/pi-platform's native Extension.

// Sandbox configuration exports
export {
  type SandboxConfig,
  type SandboxMode,
  type SandboxNetworkConfig,
  type SandboxFilesystemConfig,
  DEFAULT_SANDBOX_CONFIG,
  loadSandboxConfig,
  sandboxModeDisplay,
} from './sandbox-config';
export { SandboxManager, getSandboxManager } from './sandbox-manager';
export {
  resolveSandboxPath,
  assertSandboxPath,
} from './sandbox';

// Sandbox rules exports
export {
  type SandboxRule,
  type SandboxRuleSet,
  type RuleType,
  type RuleScope,
  compileGlobPattern,
  matchesPattern,
  matchesAnyRule,
  evaluateAccess,
  DEFAULT_SANDBOX_RULES,
  SandboxRulesManager,
  getSandboxRulesManager,
} from './sandbox-rules';

// Sandbox dependencies exports
export {
  type SandboxDependencyCheck,
  checkSandboxDependencies,
  getSandboxDependencySummary,
  runSandboxCheck,
} from './sandbox-dependencies';
