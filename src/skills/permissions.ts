/**
 * Skills Permissions Module
 * 
 * Implements permission checking for skill shell command execution.
 * Based on Claude Code's permissions.ts implementation.
 */

// ============================================================================
// Types
// ============================================================================

export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask';
  message?: string;
}

export interface ToolPermissionContext {
  alwaysAllowRules?: {
    command?: string[];
  };
  alwaysDenyRules?: {
    command?: string[];
  };
}

export interface AppState {
  toolPermissionContext?: ToolPermissionContext;
}

// ============================================================================
// Permission Check Function
// ============================================================================

interface ToolUseContext {
  getAppState?: () => AppState;
  cwd?: string;
}

type Tool = { name?: string; permissions?: { mode?: string } };

/**
 * Check if a tool can be used based on context and permissions.
 * 
 * This integrates with the toolPermissionContext from ToolUseContext
 * to check alwaysAllowRules before executing shell commands.
 *
 * @param tool - The tool being used
 * @param input - Tool input arguments
 * @param context - Tool use context with permission settings
 * @param _message - Current message for context (unused)
 * @param _inputSummary - Summary of the input for permission message (unused)
 * @returns Permission result indicating if the tool can be used
 */
export async function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
  _message?: unknown,
  _inputSummary?: string,
): Promise<PermissionResult> {
  // Get the tool name
  const toolName = tool?.name || 'bash';

  // Check if context has toolPermissionContext
  const appState = context?.getAppState?.();
  const toolPermissionContext = appState?.toolPermissionContext;

  // Check alwaysAllowRules
  if (toolPermissionContext?.alwaysAllowRules?.command) {
    const alwaysAllow = toolPermissionContext.alwaysAllowRules.command;
    
    if (Array.isArray(alwaysAllow)) {
      const inputStr = JSON.stringify(input);
      for (const allowedPattern of alwaysAllow) {
        if (matchCommandPattern(toolName, inputStr, allowedPattern)) {
          return { behavior: 'allow' };
        }
      }
    }
  }

  // Check alwaysDenyRules
  if (toolPermissionContext?.alwaysDenyRules?.command) {
    const alwaysDeny = toolPermissionContext.alwaysDenyRules.command;
    
    if (Array.isArray(alwaysDeny)) {
      const inputStr = JSON.stringify(input);
      for (const deniedPattern of alwaysDeny) {
        if (matchCommandPattern(toolName, inputStr, deniedPattern)) {
          return { 
            behavior: 'deny',
            message: `Command denied by alwaysDenyRules: ${deniedPattern}`
          };
        }
      }
    }
  }

  // Check if tool itself has permission configuration
  const toolPermissions = tool?.permissions;
  if (toolPermissions?.mode === 'allow') {
    return { behavior: 'allow' };
  }
  if (toolPermissions?.mode === 'deny') {
    return { 
      behavior: 'deny',
      message: `Tool ${toolName} is explicitly denied`
    };
  }

  // Default: allow with no restrictions
  return { behavior: 'allow' };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Match command pattern with glob support
 * 
 * Supports patterns like:
 * - "Bash" - matches any bash command
 * - "Bash(curl*)" - matches bash commands starting with curl
 * - "Read" - matches read tool
 */
function matchCommandPattern(toolName: string, input: string, pattern: string): boolean {
  // Handle glob patterns like "Bash(python3*)"
  const globMatch = pattern.match(/^(\w+)\(([^)]+)\)$/);
  if (globMatch) {
    const [, tool, commandPattern] = globMatch;
    
    // Check tool name
    if (toolName !== tool) {
      return false;
    }
    
    // Check command pattern
    if (commandPattern.endsWith('*')) {
      const prefix = commandPattern.slice(0, -1);
      return input.includes(prefix);
    }
    
    return input === commandPattern;
  }
  
  // Simple tool name match
  return toolName === pattern;
}

/**
 * Create a permission context for skill execution
 */
export function createSkillPermissionContext(
  allowedTools?: string[]
): { toolPermissionContext: { alwaysAllowRules: { command: string[] } } } {
  return {
    toolPermissionContext: {
      alwaysAllowRules: {
        command: allowedTools || ['Bash'],
      },
    },
  };
}

/**
 * Check if a specific command is allowed
 */
export function isCommandAllowed(command: string, allowedCommands?: string[]): boolean {
  if (!allowedCommands || allowedCommands.length === 0) {
    return true;
  }
  
  for (const pattern of allowedCommands) {
    // Support glob patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (command.startsWith(prefix)) {
        return true;
      }
    } else if (command.startsWith(pattern)) {
      return true;
    }
  }
  
  return false;
}
