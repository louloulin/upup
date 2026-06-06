/**
 * Command Executor
 *
 * 统一执行 CLI 命令和 Skill 命令
 * Single entry point for all command execution
 *
 * Reference: loucode/src/commands.ts
 */

import type { CommandContext } from '@upup/commands';
import { isInvestmentCommand, runInvestmentCommand } from './investment/registry.js';

/**
 * Command execution result
 */
export interface ExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result type */
  type: 'output' | 'error' | 'jsx' | 'redirect' | 'clear' | 'compact' | 'noop';
  /** Output text (for output type) */
  text?: string;
  /** Error message (for error type) */
  message?: string;
  /** JSX component (for jsx type) */
  component?: unknown;
  /** Redirect command (for redirect type) */
  command?: string;
}

/**
 * Create execution context for commands
 */
export function createCommandContext(cwd: string): CommandContext {
  return {
    cwd,
    env: { ...process.env } as Record<string, string>,
  };
}

/**
 * Execute a slash command
 *
 * @param commandName Command name (without slash)
 * @param args Command arguments
 * @param context Execution context
 * @returns Execution result
 */
export async function executeSlashCommand(
  commandName: string,
  args: string,
  context: CommandContext,
): Promise<ExecutionResult> {
  // Fast lane: 投资命令(本地,无 LLM,< 1s)
  // 不进 packages/commands 也不调 src/tools/*,零循环依赖
  if (isInvestmentCommand(commandName)) {
    const text = (await runInvestmentCommand(commandName, args)) ?? '';
    return { success: true, type: 'output', text };
  }

  try {
    // Import @upup/commands dynamically
    const commandsModule = await import('@upup/commands');

    // Single execution path through @upup/commands. The previous
    // findCommand+execute fallback was removed (P1.8) because:
    //   1. executeCommand handles all builtin + dynamic commands
    //   2. Local skills are resolved upstream by the unified-registry bridge
    //      which feeds listAllCommands() — they appear as dynamic commands
    //   3. Two paths means double the surface area to test
    if (!commandsModule.executeCommand) {
      return {
        success: false,
        type: 'error',
        message: `executeCommand not available in @upup/commands`,
      };
    }

    const result = await commandsModule.executeCommand(commandName, args, context);

    return {
      success: true,
      type: result.type as ExecutionResult['type'],
      text: (result as any).text,
      message: (result as any).message,
      component: (result as any).component,
      command: (result as any).command,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      message: `Error executing /${commandName}: ${error}`,
    };
  }
}

/**
 * Execute a skill command
 *
 * @param skillName Skill name
 * @param args Skill arguments
 * @param context Execution context
 * @returns Execution result
 */
export async function executeSkillCommand(
  skillName: string,
  args: string,
  _context: CommandContext,
): Promise<ExecutionResult> {
  try {
    // Import skill registry
    const { getSkillCommandRegistry } = await import('../skills/slash-command.js');

    const registry = getSkillCommandRegistry();
    const skillCommand = registry.getSkillCommand(skillName);

    if (!skillCommand) {
      return {
        success: false,
        type: 'error',
        message: `Skill /${skillName} not found`,
      };
    }

    // Check if skill has execute method
    if (typeof (skillCommand as any).execute === 'function') {
      const result = await (skillCommand as any).execute(args, _context);

      return {
        success: true,
        type: (result?.type || 'output') as ExecutionResult['type'],
        text: (result as any)?.text,
        message: (result as any)?.message,
        component: (result as any)?.component,
      };
    }

    // If skill has getPromptForCommand, it's a prompt-type command
    if (typeof (skillCommand as any).getPromptForCommand === 'function') {
      // This returns ContentBlockParam[] - treat as output
      return {
        success: true,
        type: 'output',
        text: `Skill /${skillName} loaded with args: ${args}`,
      };
    }

    return {
      success: false,
      type: 'error',
      message: `Skill /${skillName} is not executable`,
    };
  } catch (error) {
    return {
      success: false,
      type: 'error',
      message: `Error executing skill /${skillName}: ${error}`,
    };
  }
}

/**
 * Execute any command (CLI or Skill)
 *
 * @param input User input (e.g., "/model deepseek")
 * @param context Execution context
 * @returns Execution result
 */
export async function executeCommand(
  input: string,
  context: CommandContext,
): Promise<ExecutionResult> {
  // Parse command
  const match = input.match(/^\/([^\s]+)(?:\s+(.*))?$/);
  if (!match) {
    return {
      success: false,
      type: 'error',
      message: 'Invalid command format',
    };
  }

  const commandName = match[1].toLowerCase();
  const args = match[2]?.trim() || '';

  // Try CLI command first
  const cliResult = await executeSlashCommand(commandName, args, context);
  if (cliResult.success) {
    return cliResult;
  }

  // Fallback to skill command
  return executeSkillCommand(commandName, args, context);
}
