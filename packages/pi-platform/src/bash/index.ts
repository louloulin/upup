/**
 * Bash Tool Module
 *
 * A complete shell command execution tool with security features.
 *
 * Features:
 * - Shell command execution
 * - Security validation
 * - Path validation
 * - Command classification (read/write)
 * - Permission mode support
 * - Output sanitization
 *
 * Usage:
 * ```typescript
 * import { executeBashCommand } from './bash';
 *
 * // Direct execution
 * const result = await executeBashCommand('ls -la');
 *
 * // Agent tool entry: @upup/pi-platform's native `bash` Extension.
 * ```
 */

export { executeBashCommand, formatBashResult, isDangerousCommand } from './bash-tool';
export { BASH_TOOL_NAME } from './bash-tool';

export {
  validateCommandSecurity,
  checkDangerousPatterns,
  sanitizeOutput,
  isReadOnlyOperation,
  DANGEROUS_PATTERNS,
  ALWAYS_DANGEROUS_COMMANDS,
  CONDITIONALLY_DANGEROUS,
} from './security';

export {
  validatePath,
  validatePaths,
  checkPathAccess,
  resolveRealPath,
  getPathInfo,
  checkSymlinkVulnerability,
  PROTECTED_PATHS,
  SENSITIVE_PATH_PATTERNS,
} from './path-validation';

export {
  classifyCommand,
  isReadOnlyCommand,
  isDestructiveCommand,
  getCommandInfo,
} from './command-classifier';

export {
  getPermissionMode,
  requiresConfirmation,
  isAllowed,
  setPermissionMode,
  removePermissionMode,
  clearPermissionRules,
  checkPermission,
  createPermissionRequest,
  formatPermissionPrompt,
  parsePermissionResponse,
} from './permission-mode';

// Re-export types
export type { BashToolOptions, BashToolResult, BashToolInput } from './bash-tool';

export type {
  SecurityValidationResult,
} from './security';

export type {
  PathValidationResult,
  PathConstraint,
} from './path-validation';

export type {
  CommandInfo,
} from './command-classifier';

export type {
  PermissionRequest,
  PermissionSuggestion,
  PermissionResult,
} from './permission-mode';

// Re-export shared types from types.ts
export type { CommandClassification, PermissionMode } from './types';

// Extended permission helpers (used by TUI approval UI)
export {
  isHardDenyCommand,
  checkPermissionWithHardDeny,
  PERMISSION_MODE_BEHAVIORS,
} from './permission-mode';

export { formatBashOutput, formatBashSummary } from './formatter';

export { HARD_DENY_PATTERNS } from './permission-mode';

export {
  truncateAtWord,
  truncateFromStart,
  processContent,
  tryFormatJson,
  tryJsonFormatContent,
  stripUnderlineAnsi,
  stripAllAnsi,
  linkifyUrlsInText,
  outputProcessors,
} from './output-processors';
