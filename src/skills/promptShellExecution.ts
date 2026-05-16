/**
 * Prompt Shell Execution
 *
 * Executes shell commands embedded in skill prompts.
 * Supports two syntaxes:
 * - Code blocks: ```! command ```
 * - Inline: !`command`
 *
 * This is a simplified implementation for Upup.
 * Full implementation requires integration with the permission system.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Pattern for code blocks: ```! command ```
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g;

// Pattern for inline: !`command`
// Uses positive lookbehind to require whitespace or start-of-line before !
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm;

export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a shell command and return the result.
 */
async function executeCommand(command: string): Promise<ShellExecutionResult> {
  return new Promise((resolve) => {
    exec(command, { timeout: 30000, shell: '/bin/bash' }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error?.code || 0,
      });
    });
  });
}

/**
 * Execute shell commands embedded in skill prompt text.
 *
 * Supports two syntaxes:
 * - Code blocks: ```! command ```
 * - Inline: !`command`
 *
 * @param text - The skill prompt text containing shell commands
 * @param context - Tool use context (for future permission integration)
 * @param slashCommandName - The skill name (for logging)
 * @param shell - Shell type ('bash' or 'powershell', default: 'bash')
 * @returns The text with shell commands replaced by their output
 */
export async function executeShellCommandsInPrompt(
  text: string,
  context?: unknown,
  slashCommandName?: string,
  shell?: { commands?: string[] },
): Promise<string> {
  let result = text;

  // Collect all matches first (since we'll be replacing)
  const matches: Array<{ pattern: string; command: string; isInline: boolean }> = [];

  // Find block matches
  let match;
  const blockRegex = new RegExp(BLOCK_PATTERN.source, 'g');
  while ((match = blockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      matches.push({ pattern: match[0], command, isInline: false });
    }
  }

  // Find inline matches (only if text contains !`)
  if (text.includes('!`')) {
    const inlineRegex = new RegExp(INLINE_PATTERN.source, 'gm');
    while ((match = inlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        matches.push({ pattern: match[0], command, isInline: true });
      }
    }
  }

  // Execute all commands in parallel
  const results = await Promise.all(
    matches.map(async ({ pattern, command, isInline }) => {
      try {
        const shellResult = await executeCommand(command);

        // Format output
        let output = '';
        if (shellResult.stdout.trim()) {
          output = shellResult.stdout.trim();
        }
        if (shellResult.stderr.trim()) {
          output += (output ? '\n' : '') + `[stderr] ${shellResult.stderr.trim()}`;
        }
        if (shellResult.exitCode !== 0 && !output) {
          output = `[Exit code: ${shellResult.exitCode}]`;
        }

        return { pattern, output, error: null };
      } catch (error: any) {
        const message = error.message || String(error);
        return {
          pattern,
          output: '',
          error: `[Error] ${message}`,
        };
      }
    })
  );

  // Replace all matches in the text
  for (const { pattern, output, error } of results) {
    const replacement = error || output;
    // Use function form to avoid $ interpretation issues
    result = result.replace(pattern, () => replacement);
  }

  return result;
}

/**
 * Check if text contains shell command syntax.
 */
export function containsShellCommands(text: string): boolean {
  return text.includes('!`') || text.includes('```!');
}

/**
 * Extract all shell commands from text.
 */
export function extractShellCommands(text: string): string[] {
  const commands: string[] = [];

  // Extract block commands
  let match;
  const blockRegex = new RegExp(BLOCK_PATTERN.source, 'g');
  while ((match = blockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      commands.push(command);
    }
  }

  // Extract inline commands
  if (text.includes('!`')) {
    const inlineRegex = new RegExp(INLINE_PATTERN.source, 'gm');
    while ((match = inlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        commands.push(command);
      }
    }
  }

  return commands;
}

/**
 * Validate a shell command against allowed commands list.
 * Returns true if command is allowed or no restrictions.
 */
export function isCommandAllowed(
  command: string,
  allowedCommands?: string[]
): boolean {
  if (!allowedCommands || allowedCommands.length === 0) {
    return true; // No restrictions
  }

  // Check if command starts with any allowed command
  return allowedCommands.some((allowed) =>
    command.trim().startsWith(allowed)
  );
}