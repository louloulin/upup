/**
 * MCP Skills Discovery
 *
 * Discovers and integrates skills from MCP servers.
 * Currently a placeholder - full implementation requires MCP server integration.
 */

export interface McpSkillCommand {
  readonly type: 'prompt';
  readonly name: string;
  readonly description: string;
  readonly contentLength: number;
  readonly userInvocable?: boolean;
  readonly argumentHint?: string;
}

/**
 * Fetch skills from MCP servers.
 *
 * This is a placeholder implementation. Full implementation requires:
 * - MCP client connection management
 * - Resource discovery from MCP servers
 * - Skill resource format handling
 *
 * @returns Promise resolving to array of skill commands from MCP servers
 */
export async function fetchMcpSkillsForClient(): Promise<McpSkillCommand[]> {
  // Placeholder: Return empty array until MCP server integration is complete
  // Full implementation would:
  // 1. Connect to configured MCP servers
  // 2. Query for skill:// resources
  // 3. Convert resources to SkillCommand format
  return [];
}

/**
 * Check if MCP skills are available.
 *
 * @returns true if MCP skills can be discovered
 */
export function isMcpSkillsAvailable(): boolean {
  // Placeholder: Always return false until MCP server integration
  return false;
}

/**
 * Get MCP skills configuration.
 *
 * @returns MCP skills configuration or null if not configured
 */
export function getMcpSkillsConfig(): { servers: string[] } | null {
  // Placeholder: Return null until MCP server integration
  return null;
}
