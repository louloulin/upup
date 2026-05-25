/**
 * Tool Result Storage Module
 * 
 * Handles storage and formatting of tool execution results.
 * Based on Claude Code's toolResultStorage.ts implementation.
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ToolResultBlock {
  type: 'tool_use' | 'text';
  content: string | ToolContent[];
  tool_use_id?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown> | ShellResult;
  version?: string;
  typeName?: string;
}

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  interrupted: boolean;
}

// ============================================================================
// Tool Result Storage
// ============================================================================

/**
 * Global storage for tool results
 */
const toolResultStore = new Map<string, ToolResultBlock>();

/**
 * Process a tool result and store it for later retrieval
 * 
 * @param tool - The tool that produced the result
 * @param result - The execution result
 * @param toolUseId - Unique ID for this tool use
 * @returns Processed tool result block
 */
export async function processToolResultBlock(
  tool: any,
  result: ShellResult,
  toolUseId?: string,
): Promise<ToolResultBlock> {
  const id = toolUseId || randomUUID();
  
  // Format the output
  const output = formatToolOutput(tool.name || 'bash', result);
  
  // Create the tool result block
  const block: ToolResultBlock = {
    type: 'tool_use',
    content: output,
    tool_use_id: id,
    id,
    name: tool.name || 'bash',
    input: result,
    version: 'v1',
    typeName: 'tool_result',
  };

  // Store the result
  toolResultStore.set(id, block);

  return block;
}

/**
 * Format tool output based on tool type
 */
function formatToolOutput(toolName: string, result: ShellResult): string {
  const parts: string[] = [];

  if (result.stdout?.trim()) {
    parts.push(result.stdout.trim());
  }

  if (result.stderr?.trim()) {
    if (toolName === 'bash' || toolName === 'powershell') {
      parts.push(`[stderr]\n${result.stderr.trim()}`);
    } else {
      parts.push(`Error: ${result.stderr.trim()}`);
    }
  }

  if (result.interrupted) {
    parts.push('[Command interrupted]');
  }

  return parts.join('\n');
}

/**
 * Get a stored tool result by ID
 */
export function getToolResult(toolUseId: string): ToolResultBlock | undefined {
  return toolResultStore.get(toolUseId);
}

/**
 * Get all stored tool results
 */
export function getAllToolResults(): Map<string, ToolResultBlock> {
  return toolResultStore;
}

/**
 * Clear all stored tool results
 */
export function clearToolResults(): void {
  toolResultStore.clear();
}

/**
 * Clear a specific tool result
 */
export function clearToolResult(toolUseId: string): boolean {
  return toolResultStore.delete(toolUseId);
}

/**
 * Create content replacement state for compact
 */
export function createContentReplacementState(): Map<string, string> {
  return new Map();
}

/**
 * Get cached tool result for compact display
 */
export function getCachedToolResult(
  toolUseId: string,
  compactContent?: string,
): string | undefined {
  const block = toolResultStore.get(toolUseId);
  if (!block) return undefined;

  // Return the compact content if provided, otherwise return full content
  if (compactContent !== undefined) {
    return compactContent;
  }

  // Return the stored content
  return typeof block.content === 'string' 
    ? block.content 
    : JSON.stringify(block.content);
}
