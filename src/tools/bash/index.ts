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
 * import { bashTool, executeBashCommand } from './bash';
 *
 * // Direct execution
 * const result = await executeBashCommand('ls -la');
 *
 * // As tool
 * const tool = createBashTool();
 * const result = await tool.invoke({ command: 'ls -la' });
 * ```
 */

export { bashTool, createBashTool, executeBashCommand, formatBashResult, isDangerousCommand } from './bash-tool.js';
export { BASH_TOOL_NAME } from './bash-tool.js';

export {
  validateCommandSecurity,
  checkDangerousPatterns,
  sanitizeOutput,
  isReadOnlyOperation,
  DANGEROUS_PATTERNS,
  ALWAYS_DANGEROUS_COMMANDS,
  CONDITIONALLY_DANGEROUS,
} from './security.js';

export {
  validatePath,
  validatePaths,
  checkPathAccess,
  resolveRealPath,
  getPathInfo,
  checkSymlinkVulnerability,
  PROTECTED_PATHS,
  SENSITIVE_PATH_PATTERNS,
} from './path-validation.js';

export {
  classifyCommand,
  isReadOnlyCommand,
  isDestructiveCommand,
  getCommandInfo,
  CommandClassification,
  PermissionMode,
} from './command-classifier.js';

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
} from './permission-mode.js';

// Re-export types
export type {
  BashToolOptions,
  BashToolResult,
  BashToolInput,
  SecurityValidationResult,
  PathValidationResult,
  PathConstraint,
  CommandInfo,
  PermissionRequest,
  PermissionSuggestion,
  PermissionResult,
} from './bash-tool.js';
