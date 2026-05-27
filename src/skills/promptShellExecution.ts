/**
 * Prompt Shell Execution
 *
 * Executes shell commands embedded in skill prompts.
 * Supports two syntaxes:
 * - Code blocks: ```! command ```
 * - Inline: !`command`
 *
 * Features:
 * - Bash and PowerShell support
 * - Permission checking integration
 * - Security validation
 */

import { executeBashCommand } from '../tools/bash/bash-tool.js';
import { executePowerShellCommand } from '../tools/powershell/powershell-tool.js';
import { hasPermissionsToUseTool, createSkillPermissionContext, type Tool } from './permissions.js';

// Pattern for code blocks: ```! command ``` (loucode style)
const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g;

// Pattern for inline: !`command` (loucode style)
// Uses positive lookbehind to require whitespace or start-of-line before !
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm;

// Pattern for PowerShell blocks: ```!ps command ``` (loucode style)
const PS_BLOCK_PATTERN = /```!ps\s*\n?([\s\S]*?)\n?```/g;

// Pattern for PowerShell inline: !ps`command` (loucode style)
const PS_INLINE_PATTERN = /(?<=^|\s)!ps`([^`]+)`/gm;

// Standard markdown bash code blocks: ```bash command ``` (compatibility mode)
const BASH_BLOCK_PATTERN = /```bash\s*\n?([\s\S]*?)\n?```/gi;

// Standard markdown shell code blocks: ```shell command ``` (compatibility mode)
const SHELL_BLOCK_PATTERN = /```shell\s*\n?([\s\S]*?)\n?```/gi;

export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  shell: 'bash' | 'powershell';
}

/**
 * Execute a bash command and return the result.
 */
async function executeBash(command: string): Promise<ShellExecutionResult> {
  try {
    const result = await executeBashCommand(command, {
      timeout: 30000,
    });
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
      shell: 'bash',
    };
  } catch (error: any) {
    return {
      stdout: '',
      stderr: error.message || String(error),
      exitCode: 1,
      shell: 'bash',
    };
  }
}

/**
 * Execute a PowerShell command and return the result.
 */
async function executeShell(
  command: string,
  shell: 'bash' | 'powershell' = 'bash'
): Promise<ShellExecutionResult> {
  if (shell === 'powershell') {
    try {
      const result = await executePowerShellCommand(command, {
        timeout: 30000,
      });
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        shell: 'powershell',
      };
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message || String(error),
        exitCode: 1,
        shell: 'powershell',
      };
    }
  }
  return executeBash(command);
}

/**
 * Execute shell commands embedded in skill prompt text.
 *
 * Supports two syntaxes:
 * - Code blocks: ```! command ```
 * - Inline: !`command`
 * - PowerShell blocks: ```!ps command ```
 * - PowerShell inline: !ps`command`
 *
 * @param text - The skill prompt text containing shell commands
 * @param context - Tool use context with permission settings
 * @param slashCommandName - The skill name (for logging)
 * @param shellConfig - Shell configuration (commands, etc.)
 * @param allowedTools - List of allowed tools
 * @returns The text with shell commands replaced by their output
 */
export async function executeShellCommandsInPrompt(
  text: string,
  context?: unknown,
  slashCommandName?: string,
  shellConfig?: { commands?: string[]; type?: 'bash' | 'powershell' },
  allowedTools?: string[],
): Promise<string> {
  let result = text;

  // Collect all matches
  const matches: Array<{
    pattern: string;
    command: string;
    isInline: boolean;
    shell: 'bash' | 'powershell';
  }> = [];

  // Find bash block matches
  let match;
  const blockRegex = new RegExp(BLOCK_PATTERN.source, 'g');
  while ((match = blockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
    }
  }

  // Find bash inline matches
  if (text.includes('!`')) {
    const inlineRegex = new RegExp(INLINE_PATTERN.source, 'gm');
    while ((match = inlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        matches.push({ pattern: match[0], command, isInline: true, shell: 'bash' });
      }
    }
  }

  // Find PowerShell block matches
  const psBlockRegex = new RegExp(PS_BLOCK_PATTERN.source, 'g');
  while ((match = psBlockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      matches.push({ pattern: match[0], command, isInline: false, shell: 'powershell' });
    }
  }

  // Find PowerShell inline matches
  if (text.includes('!ps`')) {
    const psInlineRegex = new RegExp(PS_INLINE_PATTERN.source, 'gm');
    while ((match = psInlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        matches.push({ pattern: match[0], command, isInline: true, shell: 'powershell' });
      }
    }
  }

  // Find standard markdown bash block matches (compatibility mode)
  if (text.includes('```bash')) {
    const bashBlockRegex = new RegExp(BASH_BLOCK_PATTERN.source, 'gi');
    while ((match = bashBlockRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
      }
    }
  }

  // Find standard markdown shell block matches (compatibility mode)
  if (text.includes('```shell')) {
    const shellBlockRegex = new RegExp(SHELL_BLOCK_PATTERN.source, 'gi');
    while ((match = shellBlockRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        matches.push({ pattern: match[0], command, isInline: false, shell: 'bash' });
      }
    }
  }

  // Execute all commands in parallel
  const results = await Promise.all(
    matches.map(async ({ pattern, command, isInline, shell }) => {
      // Check permissions before executing
      const tool: Tool = { name: shell === 'powershell' ? 'powershell' : 'bash' };
      const toolContext = context as { getAppState?: () => { toolPermissionContext?: { alwaysAllowRules?: { command?: string[] } } } } | undefined;
      
      try {
        // Try permission check if context is provided
        if (toolContext?.getAppState) {
          const permission = await hasPermissionsToUseTool(
            tool,
            { command },
            toolContext as any
          );
          if (permission.behavior === 'deny') {
            return {
              pattern,
              output: '',
              error: `[Permission Denied] ${permission.message || 'Command not allowed'}`,
            };
          }
        }
        
        // Also check allowedTools
        const allowed = allowedTools || shellConfig?.commands;
        if (allowed && allowed.length > 0 && !isCommandAllowed(command, allowed)) {
          return {
            pattern,
            output: '',
            error: `[Permission Denied] Command not allowed: ${command}. Allowed: ${allowed.join(', ')}`,
          };
        }

        const shellResult = await executeShell(command, shell);

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
    result = result.replace(pattern, () => replacement);
  }

  return result;
}

/**
 * Check if text contains shell command syntax.
 */
export function containsShellCommands(text: string): boolean {
  return text.includes('!`') ||
         text.includes('```!') ||
         text.includes('```bash') ||
         text.includes('```shell') ||
         text.includes('!ps`') ||
         text.includes('```!ps');
}

/**
 * Extract all shell commands from text.
 */
export function extractShellCommands(text: string): Array<{ command: string; shell: 'bash' | 'powershell' }> {
  const commands: Array<{ command: string; shell: 'bash' | 'powershell' }> = [];

  // Extract bash block commands
  let match;
  const blockRegex = new RegExp(BLOCK_PATTERN.source, 'g');
  while ((match = blockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      commands.push({ command, shell: 'bash' });
    }
  }

  // Extract bash inline commands
  if (text.includes('!`')) {
    const inlineRegex = new RegExp(INLINE_PATTERN.source, 'gm');
    while ((match = inlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        commands.push({ command, shell: 'bash' });
      }
    }
  }

  // Extract PowerShell block commands
  const psBlockRegex = new RegExp(PS_BLOCK_PATTERN.source, 'g');
  while ((match = psBlockRegex.exec(text)) !== null) {
    const command = match[1]?.trim();
    if (command) {
      commands.push({ command, shell: 'powershell' });
    }
  }

  // Extract PowerShell inline commands
  if (text.includes('!ps`')) {
    const psInlineRegex = new RegExp(PS_INLINE_PATTERN.source, 'gm');
    while ((match = psInlineRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        commands.push({ command, shell: 'powershell' });
      }
    }
  }

  // Extract standard markdown bash block commands (compatibility mode)
  if (text.includes('```bash')) {
    const bashBlockRegex = new RegExp(BASH_BLOCK_PATTERN.source, 'gi');
    while ((match = bashBlockRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        commands.push({ command, shell: 'bash' });
      }
    }
  }

  // Extract standard markdown shell block commands (compatibility mode)
  if (text.includes('```shell')) {
    const shellBlockRegex = new RegExp(SHELL_BLOCK_PATTERN.source, 'gi');
    while ((match = shellBlockRegex.exec(text)) !== null) {
      const command = match[1]?.trim();
      if (command) {
        commands.push({ command, shell: 'bash' });
      }
    }
  }

  return commands;
}

/**
 * Validate a shell command against allowed commands list.
 * Supports patterns like "Bash(curl*)", "Bash(python3*)"
 */
export function isCommandAllowed(
  command: string,
  allowedCommands?: string[]
): boolean {
  if (!allowedCommands || allowedCommands.length === 0) {
    return true;
  }

  const normalizedCommand = command.trim().toLowerCase();

  return allowedCommands.some((allowed) => {
    // Parse pattern like "Bash(curl*)" or "Bash(curl)"
    const match = allowed.match(/^(\w+)\(([^)]+)\)$/);
    if (match) {
      const [, tool, commandPattern] = match;
      const toolName = normalizedCommand.startsWith('powershell') ? 'powershell' : 'bash';

      // Check tool name matches
      if (toolName !== tool.toLowerCase()) {
        return false;
      }

      // Check command pattern
      if (commandPattern.endsWith('*')) {
        const prefix = commandPattern.slice(0, -1).toLowerCase();
        return normalizedCommand.includes(prefix);
      }

      // Exact match
      return normalizedCommand === commandPattern.toLowerCase();
    }

    // Simple tool name match (case-insensitive)
    if (normalizedCommand.startsWith('powershell')) {
      return allowed.toLowerCase() === 'powershell';
    }
    return normalizedCommand.startsWith(allowed.toLowerCase()) ||
           normalizedCommand.startsWith('bash ' + allowed.toLowerCase());
  });
}
