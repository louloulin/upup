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
} from '../../session/session-state.js'

// Bash Permission
export {
  checkPermission,
  checkPermissionWithHardDeny,
  requiresConfirmation,
  isAllowed,
  PERMISSION_MODE_BEHAVIORS,
  isHardDenyCommand,
  HARD_DENY_PATTERNS,
} from '../../tools/bash/permission-mode.js'
