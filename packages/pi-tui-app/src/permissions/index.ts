/**
 * Permissions Module - 统一权限管理入口
 * 
 * 导出所有权限相关的类型和函数
 */

// Types
export type {
  // Permission Modes
  PermissionMode,
  ExternalPermissionMode,
  InternalPermissionMode,
  BashPermissionMode,
  
  // Permission Rules
  PermissionBehavior,
  PermissionRuleSource,
  PermissionRuleValue,
  PermissionRule,
  BashBuiltInRule,
  
  // Permission Decision
  PermissionDecision,
  PermissionCheckResult,
  PermissionRequest,
  PermissionContext,
  
  // Permission Update
  PermissionUpdateDestination,
  PermissionUpdate,
  
  // CLI & Security
  PermissionCliArgs,
  SecurityCheckResult,
  SecurityCheck,
} from './types.js'

// Constants
export {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODE_CONFIG,
  BASH_PERMISSION_BEHAVIORS,
  DEFAULT_PERMISSION_MODE,
  DEFAULT_BASH_MODE,
  NO_CONFIRMATION_MODES,
  BLOCKING_MODES,
  DANGEROUS_MODES,
} from './types.js'

// Permission Setup (primary source for setup functions)
export {
  // Security Checks
  isRunningAsRoot,
  isInSandbox,
  shouldAllowBypassPermissionsMode,
  runSecurityChecks,
  
  // CLI Parsing
  initialPermissionModeFromCLI,
  isValidPermissionMode,
  getPermissionModeFromEnv,
  
  // Mode Helpers
  getPermissionModeNotification,
  
  // Dangerous Detection
  isDangerousBashPermission,
  
  // Defaults
  DEFAULT_CLI_ARGS,
} from './permissionSetup.js'

// Session State
export {
  setPermissionMode,
  getPermissionMode,
  setPermissionModeChangedListener,
  removePermissionModeChangedListener,
  isDangerousMode,
  isPlanMode,
  isAcceptEditsMode,
  isDontAskMode,
  notifyPermissionModeChanged,
  getPermissionModeLabel as getSessionPermissionModeLabel,
  getCurrentModeNotification,
} from '@upup/pi-session'

// Bash Permission
export {
  checkPermission,
  checkPermissionWithHardDeny,
  requiresConfirmation,
  isAllowed,
  PERMISSION_MODE_BEHAVIORS,
  isHardDenyCommand,
  HARD_DENY_PATTERNS,
} from '../platform-bridge/bash.js'

// Rule Parser
export {
  permissionRuleValueFromString,
  permissionRuleValueToString,
  parseRuleString,
  matchesRuleContent,
  containsGlob,
  globMatch,
  escapeContent,
  unescapeContent,
  isValidRuleString,
  extractToolName,
  isMcpToolRule,
  parseRuleStrings,
  normalizeRuleContent,
} from './permissionRuleParser.js'

// Permissions Loader
export {
  loadAllPermissionRulesFromDisk,
  getPermissionRulesForSource,
  getRulesForBehavior,
  sortRulesByPriority,
  findMatchingRules,
  applyPermissionUpdate,
  persistPermissionUpdates,
  getBuiltInRules,
  settingsJsonToRules,
  RULE_SOURCE_PRIORITY,
} from './permissionsLoader.js'

// Permissions Core
export {
  PermissionChecker,
  getPermissionChecker,
  reloadPermissionRules,
  checkToolPermission,
  quickCheckPermission,
  shouldPromptForTool,
  createPermissionRequest,
  formatPermissionResult,
  getDecisionLabel,
  isOperationAllowedInCurrentMode,
  getModeSecurityLevel,
  isOperationSafe,
} from './permissions.js'

// Denial Tracking
export {
  DenialTracker,
  getDenialTracker,
  resetDenialTracker,
  trackDenial,
  trackSuccess,
  shouldPrompt,
  getDenialStats,
  getDenialRecoverySuggestions,
  withDenialTracking,
  DENIAL_LIMITS,
  RECOVERY_SUGGESTIONS,
} from './denialTracking.js'

// Permission Update
export {
  PermissionConfigManager,
  getPermissionConfigManager,
  addAllowRule,
  addDenyRule,
  addAskRule,
  removeRule,
  hasRule,
  listRules,
  clearAllRules,
  addRuleFromString,
  addRulesFromStrings,
  PERMISSION_CONFIG_DIR,
  PERMISSION_CONFIG_FILE,
  SESSION_CONFIG_FILE,
} from './PermissionUpdate.js'

// Approval Config
export {
  getApprovalConfig,
  setApprovalConfig,
  resetApprovalConfig,
  loadConfigFromEnv,
  loadConfigFromSettings,
  getTimeoutForTool,
  shouldShowTimeoutWarning,
  getToolDangerLevel,
  DEFAULT_APPROVAL_CONFIG,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_APPROVAL_OPTIONS,
  DEFAULT_UI_CONFIG,
} from './approvalConfig.js'
