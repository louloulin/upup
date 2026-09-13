import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 100_000;
const POWERSHELL_EXECUTABLES = ['pwsh', 'powershell'] as const;

const DANGEROUS_COMMANDS = [
  'Remove-Item', 'rm', 'del', 'rmdir', 'Stop-Process', 'Stop-Computer',
  'Restart-Computer', 'Remove-Module', 'Uninstall-Module', 'Format-Volume',
  'Clear-Disk', 'Initialize-Disk',
] as const;

export interface PlatformPowerShellOptions {
  cwd?: string;
  timeout?: number;
  maxOutputLength?: number;
  security?: boolean;
  env?: Record<string, string>;
  executable?: string;
}

export interface PlatformPowerShellResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly truncated?: boolean;
  readonly securityWarnings?: readonly string[];
}

export function checkPowerShellDangerousPatterns(command: string): string[] {
  const patterns = [
    { pattern: /remove-item\s+/i, message: 'Remove-Item (potentially destructive)' },
    { pattern: /rm\s+/i, message: 'rm command (destructive)' },
    { pattern: /del\s+/i, message: 'del command (destructive)' },
    { pattern: /stop-computer/i, message: 'Stop-Computer (destructive)' },
    { pattern: /restart-computer/i, message: 'Restart-Computer (destructive)' },
    { pattern: /stop-process\s+.*\*/i, message: 'Stop-Process with wildcard (destructive)' },
    { pattern: /invoke-expression|iex\s+/i, message: 'Invoke-Expression/iex (dynamic code execution)' },
    { pattern: /set-executionpolicy\s+unrestricted/i, message: 'Unrestricted execution policy' },
    { pattern: /bypass\s*(-exec)?/i, message: 'Bypass execution policy' },
    { pattern: /downloadstring|downloadfile/i, message: 'Web download operation' },
    { pattern: /webclient.*download/i, message: 'WebClient download' },
    { pattern: /invoke-webrequest\s+.*http/i, message: 'Web request (potential download)' },
  ];
  return patterns.filter(({ pattern }) => pattern.test(command)).map(({ message }) => message);
}

export function isPowerShellDangerousCommand(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return DANGEROUS_COMMANDS.some((entry) => normalized.includes(entry.toLowerCase()));
}

let cachedExecutable: string | null = null;

export async function detectPlatformPowerShell(): Promise<string | null> {
  if (cachedExecutable) return cachedExecutable;
  for (const executable of POWERSHELL_EXECUTABLES) {
    try {
      await execFileAsync(executable, ['-Version'], { timeout: 5_000 });
      cachedExecutable = executable;
      return executable;
    } catch {
      // Try the next supported executable.
    }
  }
  return null;
}

export async function isPlatformPowerShellAvailable(): Promise<boolean> {
  return (await detectPlatformPowerShell()) !== null;
}

export async function platformPowerShell(command: string, options: PlatformPowerShellOptions = {}): Promise<PlatformPowerShellResult> {
  const startedAt = Date.now();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const maxOutputLength = options.maxOutputLength ?? MAX_OUTPUT_LENGTH;
  const securityWarnings = options.security === false ? [] : checkPowerShellDangerousPatterns(command);
  const executable = options.executable ?? await detectPlatformPowerShell();
  if (!executable) {
    return { stdout: '', stderr: 'PowerShell is not available. Install PowerShell Core (pwsh) to use this tool.', exitCode: 1, timedOut: false, durationMs: Date.now() - startedAt };
  }

  try {
    const result = await execFileAsync(executable, ['-NoProfile', '-NonInteractive', '-Command', command], {
      cwd: options.cwd ?? process.cwd(),
      timeout,
      env: { ...process.env, ...options.env },
      maxBuffer: maxOutputLength * 2,
    });
    const stdout = String(result.stdout ?? '');
    const stderr = String(result.stderr ?? '');
    const truncated = stdout.length > maxOutputLength || stderr.length > maxOutputLength;
    return {
      stdout: truncated ? stdout.slice(0, maxOutputLength) : stdout,
      stderr: truncated ? stderr.slice(0, Math.floor(maxOutputLength / 10)) : stderr,
      exitCode: 0,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      truncated,
      ...(securityWarnings.length > 0 ? { securityWarnings } : {}),
    };
  } catch (error) {
    const failure = error as { killed?: boolean; code?: string; stdout?: unknown; stderr?: unknown; status?: number; message?: string };
    const durationMs = Date.now() - startedAt;
    if (failure.killed || failure.code === 'ETIMEDOUT' || failure.code === 'ETIME') {
      return { stdout: '', stderr: `Command timed out after ${timeout}ms`, exitCode: 124, timedOut: true, durationMs };
    }
    if (failure.stdout !== undefined) {
      const stdout = String(failure.stdout);
      const stderr = String(failure.stderr ?? '');
      const truncated = stdout.length > maxOutputLength;
      return {
        stdout: truncated ? stdout.slice(0, maxOutputLength) : stdout,
        stderr,
        exitCode: failure.status ?? 1,
        timedOut: false,
        durationMs,
        truncated,
        ...(securityWarnings.length > 0 ? { securityWarnings } : {}),
      };
    }
    return { stdout: '', stderr: failure.message ?? String(error), exitCode: 1, timedOut: false, durationMs };
  }
}
