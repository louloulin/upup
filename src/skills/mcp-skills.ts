/**
 * MCP Skills Module
 * 
 * Loads and manages skills from MCP (Model Context Protocol) servers.
 * Enables MCP tools to be used as skills with full skill system features.
 * 
 * Reference: Claude Code's mcpSkills.ts and mcpSkillBuilders.ts
 */

import { MCPClientManager, type MCPServerConnection } from '@upup/mcp';
import type { Skill } from '@upup/skills';

// ============================================================================
// Types
// ============================================================================

export interface MCPSkillDefinition {
  /** Skill name derived from MCP tool name */
  name: string;
  /** Description from MCP tool description */
  description: string;
  /** MCP server name */
  serverName: string;
  /** MCP tool name */
  toolName: string;
  /** Full MCP tool for execution */
  tool: unknown;
}

/**
 * MCP Skill metadata for discovery
 */
export interface MCPSkillMetadata {
  name: string;
  description: string;
  source: 'mcp' | 'builtin' | 'user' | 'project' | 'plugin' | 'agent';
  serverName: string;
  toolName: string;
}

// ============================================================================
// MCP Skills Registry
// ============================================================================

/**
 * Global registry for MCP skills
 */
const mcpSkillsRegistry = new Map<string, MCPSkillMetadata>();

/**
 * MCP client reference (can be MCPClientManager or compatible interface)
 */
let mcpClient: MCPClientManager | null = null;

/**
 * Set the MCP client for skill loading
 */
export function setMCPClient(client: MCPClientManager): void {
  mcpClient = client;
}

/**
 * Get the MCP client
 */
export function getMCPClient(): MCPClientManager | null {
  return mcpClient;
}

/**
 * Check if MCP client is available
 */
export function hasMCPClient(): boolean {
  // Check if mcpClient exists and has connections
  if (!mcpClient) {
    return false;
  }
  
  const connections = mcpClient.getAllConnections?.() || [];
  return connections.some(c => c.state === 'connected');
}

// ============================================================================
// Skill Discovery
// ============================================================================

/**
 * Discover all skills from MCP servers
 * 
 * Iterates through connected MCP servers and converts their tools
 * into skills with proper metadata.
 */
export async function discoverMCPSkills(): Promise<MCPSkillMetadata[]> {
  const skills: MCPSkillMetadata[] = [];
  
  if (!mcpClient) {
    return skills;
  }

  // Get all MCP connections from MCPClientManager
  const connections = mcpClient.getAllConnections?.() || [];
  
  for (const connection of connections) {
    if (connection.state !== 'connected') {
      continue;
    }

    const serverName = connection.name || 'unknown';
    const tools = connection.tools || [];

    for (const tool of tools) {
      if (!tool?.name) continue;

      const skillName = `mcp_${serverName}_${tool.name}`;
      const skillMetadata: MCPSkillMetadata = {
        name: skillName,
        description: tool.description || `MCP tool: ${tool.name}`,
        source: 'mcp',
        serverName,
        toolName: tool.name,
      };

      skills.push(skillMetadata);
      mcpSkillsRegistry.set(skillName, skillMetadata);
    }
  }

  return skills;
}

/**
 * Get a specific MCP skill by name
 */
export function getMCPSkill(name: string): MCPSkillMetadata | undefined {
  return mcpSkillsRegistry.get(name);
}

/**
 * Get all MCP skills
 */
export function getAllMCPSkills(): MCPSkillMetadata[] {
  return Array.from(mcpSkillsRegistry.values());
}

/**
 * Clear MCP skills registry
 */
export function clearMCPSkills(): void {
  mcpSkillsRegistry.clear();
}

// ============================================================================
// Skill Conversion
// ============================================================================

/**
 * Convert an MCP tool to a Skill for execution
 * 
 * Creates a skill that calls the MCP tool when executed.
 */
export function mcpToolToSkill(
  metadata: MCPSkillMetadata,
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Skill {
  return {
    name: metadata.name,
    description: metadata.description,
    source: 'mcp' as any,
    path: `mcp:${metadata.serverName}/${metadata.toolName}`,
    instructions: `# MCP Skill: ${metadata.toolName}

This skill executes the MCP tool \`${metadata.toolName}\` from server \`${metadata.serverName}\`.

## Usage

The tool will be called with the arguments you provide.

## Description

${metadata.description}
`,
    userInvocable: true,
    argumentHint: 'Arguments for the MCP tool',
  };
}

/**
 * Load all MCP skills as executable skills
 */
export async function loadMCPSkills(
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<Skill[]> {
  const metadata = await discoverMCPSkills();
  return metadata.map(m => mcpToolToSkill(m, executeTool));
}

// ============================================================================
// MCP Skill Command
// ============================================================================

/**
 * Create a skill command for MCP skill execution
 */
export function createMCPSkillCommand(
  metadata: MCPSkillMetadata,
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>
): {
  name: string;
  description: string;
  source: 'mcp';
  getPromptForCommand: () => string;
  execute: (args: string) => Promise<string>;
} {
  return {
    name: metadata.name,
    description: metadata.description,
    source: 'mcp',
    
    getPromptForCommand(): string {
      return `# MCP Skill: ${metadata.toolName}

Execute the MCP tool \`${metadata.toolName}\` from server \`${metadata.serverName}\`.

${metadata.description}
`;
    },
    
    async execute(args: string): Promise<string> {
      try {
        // Parse arguments
        const toolArgs = args ? JSON.parse(args) : {};
        
        // Execute the tool
        const result = await executeTool(metadata.toolName, toolArgs);
        
        // Format result
        return typeof result === 'string' 
          ? result 
          : JSON.stringify(result, null, 2);
      } catch (error) {
        return `Error executing MCP tool: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}
