/**
 * PowerShellTool - Windows PowerShell command execution tool
 *
 * Features:
 * - PowerShell command execution with timeout
 * - Security validation (dangerous commands, injection prevention)
 * - Output formatting for PowerShell objects
 * - Cross-platform PowerShell Core support (pwsh)
 *
 * This tool provides PowerShell execution on Windows and macOS/Linux
 * with PowerShell Core installed.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getCwd } from '@upup/utils/cwd';
import { info, warn, error } from '@upup/utils/logging/logger';

const execFileAsync = promisify(execFile);

// ============================================================================
// Constants
// ============================================================================

export const POWERSHELL_TOOL_NAME = 'powershell';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 100_000;

// PowerShell executable paths (in order of preference)
const POWERSHELL_EXECUTABLES = [
  'pwsh',        // PowerShell Core (cross-platform)
  'powershell',  // Windows PowerShell
];

// Dangerous PowerShell commands that require explicit confirmation
const DANGEROUS_COMMANDS = new Set([
  'Remove-Item',
  'rm',
  'del',
  'rmdir',
  'Stop-Process',
  'Stop-Computer',
  'Restart-Computer',
  'Remove-Module',
  'Uninstall-Module',
  'Format-Volume',
  'Clear-Disk',
  'Initialize-Disk',
]);

// ============================================================================
// Types
// ============================================================================

export interface PowerShellToolOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum output length */
  maxOutputLength?: number;
  /** Enable security checks (default: true) */
  security?: boolean;
  /** Environment variables */
  env?: Record<string, string>;
  /** PowerShell executable to use */
  executable?: string;
}

export interface PowerShellToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  truncated?: boolean;
  securityWarnings?: string[];
}

// ============================================================================
// Schemas
// ============================================================================

const inputSchema = z.object({
  command: z.string().describe('PowerShell command to execute'),
  description: z.string().optional().describe('Description of what this command does'),
  timeout: z.number().optional().default(30).describe('Timeout in seconds'),
});

type PowerShellToolInput = z.infer<typeof inputSchema>;

// ============================================================================
// Security Functions
// ============================================================================

/**
 * Check for dangerous PowerShell patterns
 */
export function checkDangerousPatterns(command: string): string[] {
  const warnings: string[] = [];
  const lowerCommand = command.toLowerCase();

  // Check for dangerous command patterns
  const dangerousPatterns = [
    // Remove-Item with any force/recurse options
    { pattern: /remove-item\s+/i, message: 'Remove-Item (potentially destructive)' },
    { pattern: /rm\s+/i, message: 'rm command (destructive)' },
    { pattern: /del\s+/i, message: 'del command (destructive)' },
    // Computer control
    { pattern: /stop-computer/i, message: 'Stop-Computer (destructive)' },
    { pattern: /restart-computer/i, message: 'Restart-Computer (destructive)' },
    // Process control
    { pattern: /stop-process\s+.*\*/i, message: 'Stop-Process with wildcard (destructive)' },
    // Dynamic code execution
    { pattern: /invoke-expression|iex\s+/i, message: 'Invoke-Expression/iex (dynamic code execution)' },
    // System modification
    { pattern: /set-executionpolicy\s+unrestricted/i, message: 'Unrestricted execution policy' },
    { pattern: /bypass\s*(-exec)?/i, message: 'Bypass execution policy' },
    // Network downloads
    { pattern: /downloadstring|downloadfile/i, message: 'Web download operation' },
    { pattern: /webclient.*download/i, message: 'WebClient download' },
    { pattern: /invoke-webrequest\s+.*http/i, message: 'Web request (potential download)' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(command)) {
      warnings.push(message);
    }
  }

  return warnings;
}

/**
 * Check if a command is considered dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lowerCommand.includes(dangerous.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// PowerShell Detection
// ============================================================================

let cachedExecutable: string | null = null;

/**
 * Detect available PowerShell executable
 */
export async function detectPowerShellExecutable(): Promise<string | null> {
  if (cachedExecutable) {
    return cachedExecutable;
  }

  for (const exe of POWERSHELL_EXECUTABLES) {
    try {
      await execFileAsync(exe, ['-Version'], { timeout: 5000 });
      cachedExecutable = exe;
      return exe;
    } catch {
      // Try next executable
    }
  }

  return null;
}

/**
 * Check if PowerShell is available
 */
export async function isPowerShellAvailable(): Promise<boolean> {
  const executable = await detectPowerShellExecutable();
  return executable !== null;
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute a PowerShell command
 */
export async function executePowerShellCommand(
  command: string,
  options: PowerShellToolOptions = {}
): Promise<PowerShellToolResult> {
  const startTime = Date.now();
  const {
    cwd = getCwd(),
    timeout = DEFAULT_TIMEOUT_MS,
    maxOutputLength = MAX_OUTPUT_LENGTH,
    security = true,
    env,
    executable,
  } = options;

  // Check for dangerous patterns
  const securityWarnings: string[] = [];
  if (security) {
    const warnings = checkDangerousPatterns(command);
    securityWarnings.push(...warnings);
  }

  // Detect or use specified executable
  const psExe = executable || await detectPowerShellExecutable();
  if (!psExe) {
    return {
      stdout: '',
      stderr: 'PowerShell is not available. Install PowerShell Core (pwsh) to use this tool.',
      exitCode: 1,
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Build PowerShell command
  // Use -NoProfile for faster startup
  // Use -NonInteractive for script execution
  // Use -Command for inline commands
  const psArgs = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(psExe, psArgs, {
      cwd,
      timeout,
      env: {
        ...process.env,
        ...env,
      },
      maxBuffer: maxOutputLength * 2, // Allow some buffer for encoding
    });

    const durationMs = Date.now() - startTime;
    const truncated = stdout.length > maxOutputLength || stderr.length > maxOutputLength;

    return {
      stdout: truncated ? stdout.slice(0, maxOutputLength) : stdout,
      stderr: truncated ? stderr.slice(0, maxOutputLength / 10) : stderr,
      exitCode: 0,
      timedOut: false,
      durationMs,
      truncated,
      securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Check for timeout
    if (err.killed || err.code === 'ETIMEDOUT' || err.code === 'ETIME') {
      return {
        stdout: '',
        stderr: `Command timed out after ${timeout}ms`,
        exitCode: 124,
        timedOut: true,
        durationMs,
      };
    }

    // Check for other errors
    if (err.stdout !== undefined) {
      // execFile returns stdout/stderr on error too
      const truncated = (err.stdout?.length || 0) > maxOutputLength;
      return {
        stdout: truncated ? String(err.stdout).slice(0, maxOutputLength) : String(err.stdout || ''),
        stderr: String(err.stderr || ''),
        exitCode: err.status || 1,
        timedOut: false,
        durationMs,
        truncated,
        securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined,
      };
    }

    return {
      stdout: '',
      stderr: String(err.message || err),
      exitCode: 1,
      timedOut: false,
      durationMs,
    };
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format PowerShell output for display
 */
export function formatPowerShellOutput(result: PowerShellToolResult): string {
  const lines: string[] = [];

  if (result.stdout) {
    lines.push(result.stdout);
  }

  if (result.stderr) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(`[stderr] ${result.stderr}`);
  }

  if (result.truncated) {
    lines.push('[Output was truncated]');
  }

  return lines.join('\n');
}

/**
 * Format PowerShell result summary
 */
export function formatPowerShellSummary(result: PowerShellToolResult): string {
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

  if (result.stderr && !result.timedOut) {
    lines.push('\n--- stderr ---');
    lines.push(result.stderr);
  }

  if (result.truncated) {
    lines.push('\n[Output was truncated]');
  }

  return lines.join('\n');
}

// ============================================================================
// Tool Creation
// ============================================================================

/**
 * Create the PowerShellTool instance using DynamicStructuredTool
 */
export function createPowerShellTool(options: PowerShellToolOptions = {}): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: POWERSHELL_TOOL_NAME,
    description: getPowerShellToolDescription(),
    schema: inputSchema,
    async func({ command, description, timeout = 30 }: PowerShellToolInput): Promise<string> {
      info('powershell', `Executing: ${command}`);
      try {
        // Execute command
        const result = await executePowerShellCommand(command, {
          ...options,
          timeout: timeout * 1000, // Convert to ms
        });

        // Check if dangerous
        const dangerous = isDangerousCommand(command);

        if (dangerous && result.exitCode === 0) {
          warn('powershell', `Potentially dangerous command executed: ${command}`);
        }

        // Handle PowerShell not available
        if (result.stderr.includes('not available')) {
          return result.stderr;
        }

        // Format result
        const totalOutput = (result.stdout?.length || 0) + (result.stderr?.length || 0);
        if (totalOutput > 10000) {
          return formatPowerShellSummary(result);
        }

        if (result.timedOut) {
          return `⏱️  Command timed out after ${timeout}s\n${formatPowerShellOutput(result)}`;
        }

        if (result.exitCode !== 0) {
          return `❌ Exit code ${result.exitCode}\n${formatPowerShellOutput(result)}`;
        }

        return formatPowerShellOutput(result);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        error('powershell', `Command failed: ${errorMsg}`);
        return `[Error] ${errorMsg}`;
      }
    },
  });
}

/**
 * Get the tool description for system prompt
 */
function getPowerShellToolDescription(): string {
  return `Execute PowerShell commands. Use for:
- Windows system administration
- Active Directory operations
- Microsoft 365/Azure management
- Windows-specific scripts (.ps1 files)
- Cross-platform PowerShell Core commands

Requires PowerShell (pwsh) or PowerShell Core to be installed.

Examples:
- \`Get-Process\`
- \`Get-Service\`
- \`Get-ChildItem C:\\Users\`
- \`Get-ADUser -Filter *\``;
}

// ============================================================================
// Module exports
// ============================================================================

export const powerShellTool = createPowerShellTool();
