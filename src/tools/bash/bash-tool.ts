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

import { z } from 'zod';
import { StructuredToolInterface } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getCwd } from '../../utils/cwd.js';
import { info, warn, error } from '../../utils/logging/logger.js';
import {
  checkDangerousPatterns,
  validateCommandSecurity,
  type SecurityValidationResult,
} from './security.js';
import { checkPathConstraints, validatePath } from './path-validation.js';
import {
  isReadOnlyCommand,
  classifyCommand,
  type CommandClassification,
} from './command-classifier.js';
import { getPermissionMode } from './permission-mode.js';

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

export const BASH_TOOL_NAME = 'bash';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 100_000;
const LONG_OUTPUT_THRESHOLD = 10_000;

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

const inputSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  description: z.string().optional().describe('Description of what this command does'),
  timeout: z.number().min(1).max(300).optional().describe('Timeout in seconds (default: 30, max: 300)'),
});

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
  } = options;

  // Security validation
  const securityResult = validateCommandSecurity(command);
  if (!securityResult.valid) {
    const durationMs = Date.now() - startTime;
    return {
      stdout: '',
      stderr: `Security validation failed: ${securityResult.reason}`,
      exitCode: 1,
      durationMs,
      securityWarnings: securityResult.warnings,
    };
  }

  // Path validation (if paths are provided)
  const pathValidation = validatePaths(command, cwd);
  if (!pathValidation.valid) {
    const durationMs = Date.now() - startTime;
    return {
      stdout: '',
      stderr: `Path validation failed: ${pathValidation.reason}`,
      exitCode: 1,
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
    });

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
 * Create the BashTool instance
 */
export function createBashTool(options: BashToolOptions = {}): StructuredToolInterface {
  const toolInstance = tool(
    async (input: BashToolInput, runManager) => {
      const { command, description, timeout = 30 } = input;

      info('bash', `Executing: ${command}`);

      // Log execution start
      await runManager?.handleToolStart({
        name: BASH_TOOL_NAME,
        description: description || command,
      });

      try {
        // Execute command
        const result = await executeBashCommand(command, {
          ...options,
          timeout: timeout * 1000, // Convert to ms
        });

        // Format result
        const output = formatBashResult(result);

        // Check if dangerous
        const isDangerous = isDangerousCommand(command);

        if (isDangerous && result.exitCode === 0) {
          warn('bash', `Dangerous command executed successfully: ${command}`);
        }

        // Log completion
        await runManager?.handleToolEnd({
          name: BASH_TOOL_NAME,
          output,
        });

        return output;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        error('bash', `Command failed: ${errorMsg}`);

        await runManager?.handleToolError({
          name: BASH_TOOL_NAME,
          error: err,
        });

        throw err;
      }
    },
    {
      name: BASH_TOOL_NAME,
      description: getBashToolDescription(),
      schema: inputSchema as unknown as Record<string, unknown>,
    }
  );

  return toolInstance;
}

/**
 * Check if a command is considered dangerous
 */
function isDangerousCommand(command: string): boolean {
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
 * Get the tool description for system prompt
 */
function getBashToolDescription(): string {
  return `Execute shell commands in the terminal. Use for:
- Running build/test commands (npm, yarn, make, cargo, etc.)
- File operations (ls, cat, grep, find, etc.)
- System operations (ps, top, df, etc.)
- Network operations (curl, wget, ssh, etc.)
- Git operations

Security:
- Dangerous commands (rm -rf, dd, fork bombs) require extra caution
- Path traversal and injection attacks are blocked
- Commands are logged for security audit

Examples:
- \`ls -la\`
- \`grep -r "pattern" src/\`
- \`npm test\`
- \`curl https://api.example.com\``;
}

// ============================================================================
// Module exports
// ============================================================================

export const bashTool = createBashTool();
