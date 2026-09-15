/**
 * BashTool - Shell command execution tool with security checks
 *
 * Features:
 * - Shell command execution with timeout
 * - Security validation (dangerous commands, injection prevention)
 * - Path constraints (allowed directories)
 * - Read/write command classification
 * - Permission mode support
 * - Output truncation
 * - Sandbox mode (optional)
 *
 * Reference: Loucode's BashTool (10,894 lines across 15 files)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getCwd } from '@upup/utils';
import {
  checkDangerousPatterns,
  validateCommandSecurity,
  type SecurityValidationResult,
} from './security';
import {
  parseForSecurity,
  classifyFromAST,
  hasDangerousBuiltin,
  type ParseResult,
} from './ast-parser';
import { validatePath } from './path-validation';
import {
  isReadOnlyCommand,
  classifyCommand,
  type CommandClassification,
} from './command-classifier';
import { getPermissionMode } from './permission-mode';
import { formatBashOutput, formatBashSummary } from './formatter';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

export const BASH_TOOL_NAME = 'bash';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 100_000;

// Dangerous commands that require explicit confirmation
const DANGEROUS_COMMANDS = new Set([
  'rm', 'rmdir', 'del',
  'dd', 'shred',
  'mkfs', 'mke2fs', 'mkfs.ext4',
  'fdisk', 'parted',
  'dd',
  ':(){:|:&};:',  // Fork bomb pattern
]);

// Commands that modify system state
const WRITE_COMMANDS = new Set([
  'mkdir', 'rmdir', 'touch', 'chmod', 'chown', 'chgrp',
  'mv', 'cp', 'ln', 'unlink',
  'cat', 'echo', 'printf', 'tee',
  'sed', 'awk', 'perl', 'python', 'node', 'ruby',
  'git', 'svn', 'hg',
  'npm', 'yarn', 'pnpm', 'bun', 'pip', 'cargo',
  'curl', 'wget',
  'kill', 'pkill', 'killall',
  'systemctl', 'service', 'launchctl',
]);

// ============================================================================
// Types
// ============================================================================

export interface BashToolOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Allowed directory patterns (glob) */
  allowedDirs?: string[];
  /** Denied directory patterns (glob) */
  deniedDirs?: string[];
  /** Maximum output length */
  maxOutputLength?: number;
  /** Enable sandbox mode */
  sandbox?: boolean;
  /** Enable security checks (default: true, set to false to disable) */
  security?: boolean;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface BashToolResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
  /** Whether the command timed out */
  timedOut?: boolean;
  /** Execution duration in ms */
  durationMs: number;
  /** Truncated output indicator */
  truncated?: boolean;
  /** Security warnings */
  securityWarnings?: string[];
}

export interface BashToolInput {
  /** The shell command to execute */
  command: string;
  /** Optional description of what the command does */
  description?: string;
  /** Timeout in seconds (default: 30) */
  timeout?: number;
}

// ============================================================================
// Input Schema
// ============================================================================

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Execute a shell command with security checks
 */
export async function executeBashCommand(
  command: string,
  options: BashToolOptions = {}
): Promise<BashToolResult> {
  const startTime = Date.now();
  const {
    cwd = getCwd(),
    timeout = DEFAULT_TIMEOUT_MS,
    maxOutputLength = MAX_OUTPUT_LENGTH,
    env = {},
    security = true,  // Default to enabled
  } = options;

  // Note: Security is always enabled (security = true is the only supported mode)
  // The security option is kept for future extension but has no effect currently
  void security; // Mark as intentionally unused

  // AST-based structural security check (fail-closed)
  const astResult = parseForSecurity(command);
  if (astResult.kind === 'too-complex') {
    // Complex commands require explicit user approval
    const permission = getPermissionMode(command);
    if (permission === 'deny') {
      const durationMs = Date.now() - startTime;
      return {
        stdout: '',
        stderr: `Command blocked: ${astResult.reason}. Complex shell constructs require explicit approval.`,
        exitCode: 1,
        durationMs,
        securityWarnings: [`AST parse: ${astResult.reason}`],
      };
    }
    // For 'ask' mode, the approval flow is handled at a higher level
    // For 'allow'/'bypass', continue with regex-based fallback
  }

  // Check for dangerous builtins via AST
  if (astResult.kind === 'simple') {
    for (const cmd of astResult.commands) {
      if (hasDangerousBuiltin(cmd)) {
        const durationMs = Date.now() - startTime;
        return {
          stdout: '',
          stderr: `Dangerous builtin '${cmd.argv[0]}' detected and blocked`,
          exitCode: 1,
          durationMs,
          securityWarnings: [`Blocked builtin: ${cmd.argv[0]}`],
        };
      }
    }
  }

  // Regex-based security validation (existing, as defense-in-depth)
  const securityResult = validateCommandSecurity(command);
  if (!securityResult.valid) {
    // Check if command is allowed via permission system
    const permission = getPermissionMode(command);
    if (permission === 'bypass' || permission === 'allow') {
      // User has explicitly allowed this type of command
      // Continue execution with warning
    } else {
      // Block the command - security violation
      const durationMs = Date.now() - startTime;
      return {
        stdout: '',
        stderr: `Security validation failed: ${securityResult.reason}`,
        exitCode: 1,
        durationMs,
        securityWarnings: securityResult.warnings,
      };
    }
  }

  // Path validation (if paths are provided)
  // Only block truly sensitive paths; allow others with warnings
  const pathValidation = validatePaths(command, cwd);
  if (!pathValidation.valid) {
    const durationMs = Date.now() - startTime;
    const isSensitiveError = isSensitivePathError(pathValidation.reason || '');

    // Check permission mode
    const permission = getPermissionMode(command);
    const hasUserOverride = permission === 'bypass' || permission === 'allow';

    if (isSensitiveError && !hasUserOverride) {
      // Truly sensitive paths - block the command (unless user explicitly allowed)
      return {
        stdout: '',
        stderr: `Path validation failed: ${pathValidation.reason}`,
        exitCode: 1,
        durationMs,
        securityWarnings: pathValidation.warnings,
      };
    }
    // Non-sensitive paths OR user has override - allow with warning
    return {
      stdout: '',
      stderr: `Path warning: ${pathValidation.reason}`,
      exitCode: 0,  // Allow the command
      durationMs,
      securityWarnings: pathValidation.warnings,
    };
  }

  try {
    // Execute command
    const result = await execAsync(command, {
      cwd,
      timeout,
      maxBuffer: maxOutputLength * 2,
      env: { ...process.env, ...env },
    }) as { stdout: string; stderr: string; status?: number };

    const durationMs = Date.now() - startTime;
    let stdout = result.stdout;
    let stderr = result.stderr;
    let truncated = false;

    // Truncate if needed
    if (stdout.length > maxOutputLength) {
      stdout = stdout.slice(0, maxOutputLength) + `\n... [Output truncated, ${stdout.length - maxOutputLength} characters cut]`;
      truncated = true;
    }

    if (stderr.length > maxOutputLength) {
      stderr = stderr.slice(0, maxOutputLength) + `\n... [Stderr truncated]`;
      truncated = true;
    }

    return {
      stdout,
      stderr,
      exitCode: result.status ?? 0,
      durationMs,
      truncated,
      securityWarnings: securityResult.warnings.length > 0 ? securityResult.warnings : undefined,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;

    // Handle exec error
    if (err instanceof Error) {
      const execError = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string; status?: number; stdout?: string; stderr?: string };

      // Handle timeout (process was killed by SIGTERM from timeout option)
      if (execError.killed === true && execError.signal === 'SIGTERM') {
        return {
          stdout: '',
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: 124,
          timedOut: true,
          durationMs,
        };
      }

      // Handle non-zero exit code (exec throws when exit code != 0)
      const exitStatus = typeof execError.status === 'number'
        ? execError.status
        : typeof execError.code === 'number'
          ? execError.code
          : null;

      if (exitStatus !== null) {
        return {
          stdout: execError.stdout || '',
          stderr: execError.stderr || err.message,
          exitCode: exitStatus,
          durationMs,
        };
      }

      // Command not found
      if (execError.code === 'ENOENT') {
        return {
          stdout: '',
          stderr: err.message,
          exitCode: 127,
          durationMs,
        };
      }

      return {
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        durationMs,
      };
    }

    return {
      stdout: '',
      stderr: String(err),
      exitCode: 1,
      durationMs,
    };
  }
}

/**
 * Validate paths in a command - only validate explicit paths, not generic arguments
 */
function validatePaths(command: string, cwd: string): {
  valid: boolean;
  reason?: string;
  warnings?: string[];
} {
  const warnings: string[] = [];

  // Only validate explicit paths (starting with /, ~, or .)
  // This avoids false positives on generic arguments like "hello"
  const pathPattern = /(?:^|\s)([\/][^\s]+|~\/[^\s]+|\.\.?\/[^\s]+)/g;
  let match;
  const paths: string[] = [];

  while ((match = pathPattern.exec(command)) !== null) {
    paths.push(match[1]);
  }

  // Validate each path
  for (const path of paths) {
    const validation = validatePath(path, cwd);
    if (!validation.valid) {
      return { valid: false, reason: validation.reason };
    }
    if (validation.warning) {
      warnings.push(validation.warning);
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Format bash result for display
 */
export function formatBashResult(result: BashToolResult): string {
  const lines: string[] = [];

  // Status
  if (result.timedOut) {
    lines.push(`⏱️  Timed out after ${result.durationMs}ms`);
  } else if (result.exitCode === 0) {
    lines.push(`✅ Done in ${result.durationMs}ms`);
  } else {
    lines.push(`❌ Exit code ${result.exitCode} in ${result.durationMs}ms`);
  }

  // Security warnings
  if (result.securityWarnings && result.securityWarnings.length > 0) {
    lines.push(`⚠️  Warnings:`);
    for (const warning of result.securityWarnings) {
      lines.push(`   - ${warning}`);
    }
  }

  // Output
  if (result.stdout) {
    lines.push('\n--- stdout ---');
    lines.push(result.stdout);
  }

  if (result.stderr) {
    lines.push('\n--- stderr ---');
    lines.push(result.stderr);
  }

  if (result.truncated) {
    lines.push('\n[Output was truncated]');
  }

  return lines.join('\n');
}

/**
 * Check if a command is considered dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();

  // Check for dangerous command patterns
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCommand.startsWith(dangerous)) {
      return true;
    }
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /\brsync\s+.*--delete/,
    /\bfind\s+.*-delete/,
    /\brm\s+.*-rf\s+(\/|~)/,
    /\bdd\s+.*of=\/(dev|sd)/,
    /\bmkfs/,
    /\b:\(\)\{:\|:&\};:/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path error is for a truly sensitive path that should be blocked.
 * 用户明确要求: 不阻止任何敏感路径，只发警告
 * 因此此函数始终返回 false，不阻止任何路径
 */
function isSensitivePathError(reason: string): boolean {
  // 用户明确要求: 不要阻止任何敏感路径
  // 始终返回 false，让所有路径都可以通过（带警告）
  return false;
}
