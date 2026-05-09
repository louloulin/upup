/**
 * ToolSearchTool - Search and explore available tools
 *
 * Allows agents to discover, search, and get details about available tools
 * in the Dexter tool registry.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { getToolRegistry, type RegisteredTool } from './registry/index.js';

// ============================================================================
// Schema & Description
// ============================================================================

export const ToolSearchSchema = z.object({
  /** Search query to match against tool names and descriptions */
  query: z
    .string()
    .optional()
    .describe('Search query to match against tool names and descriptions'),
  /** Filter by tool name (exact or prefix match) */
  name: z
    .string()
    .optional()
    .describe('Filter by exact or prefix-matched tool name'),
  /** Filter by whether tool is concurrency-safe */
  concurrencySafe: z.boolean().optional().describe('Filter by concurrency safety'),
});

export type ToolSearchInput = z.infer<typeof ToolSearchSchema>;

export const TOOL_SEARCH_DESCRIPTION = `
Search and explore available tools in the Dexter system.

Use this when:
- Looking for a tool to accomplish a specific task
- Finding tools related to a keyword or topic
- Listing all tools matching certain criteria
- Discovering what capabilities are available

Returns a list of matching tools with their names, descriptions, and safety info.

Examples:
- Find tools related to "file": query: 'file'
- Find tools by prefix "config": name: 'config'
- Find all concurrency-safe tools: concurrencySafe: true`;

export const TOOL_GET_DESCRIPTION = `
Get detailed information about a specific tool.

Use this when:
- You need to understand a tool's full capabilities
- You want to see the exact input schema
- You need the compact description for quick reference

Returns tool name, full description, compact description, and safety status.`;

export const TOOL_LIST_DESCRIPTION = `
List all available tools in the Dexter system.

Use this when:
- You want to see everything available
- Building a tool picker UI
- Getting a complete overview of capabilities

Returns all tools with their names and compact descriptions.`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createToolSearchTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'tool_search',
    description: TOOL_SEARCH_DESCRIPTION,
    schema: ToolSearchSchema,
    async func(input, runManager): Promise<string> {
      const tools = await getToolRegistry('dummy');

      const filtered = tools.filter((tool: RegisteredTool) => {
        if (input.query !== undefined) {
          const q = input.query.toLowerCase();
          const matchesName = tool.name.toLowerCase().includes(q);
          const matchesDesc = tool.description?.toLowerCase().includes(q) ?? false;
          const matchesCompact =
            tool.compactDescription?.toLowerCase().includes(q) ?? false;
          if (!matchesName && !matchesDesc && !matchesCompact) return false;
        }

        if (input.name !== undefined) {
          const prefix = input.name.toLowerCase();
          if (!tool.name.toLowerCase().startsWith(prefix)) return false;
        }

        if (input.concurrencySafe !== undefined) {
          if (tool.concurrencySafe !== input.concurrencySafe) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        return `No tools found matching criteria.\nTotal tools in registry: ${tools.length}`;
      }

      const lines = [
        `Found ${filtered.length} tool(s) (of ${tools.length} total):\n`,
      ];

      for (const tool of filtered) {
        const safety = tool.concurrencySafe ? '✅' : '⚠️';
        lines.push(`${safety} ${tool.name}`);
        if (tool.compactDescription) {
          lines.push(`   ${tool.compactDescription}`);
        }
        lines.push('');
      }

      return lines.join('\n').trim();
    },
  });
}

export function createToolGetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'tool_get',
    description: TOOL_GET_DESCRIPTION,
    schema: z.object({
      /** Name of the tool to get details for */
      name: z.string().describe('Name of the tool to retrieve'),
    }),
    async func(input): Promise<string> {
      const tools = await getToolRegistry('dummy');
      const tool = tools.find((t: RegisteredTool) => t.name === input.name);

      if (!tool) {
        const similar = tools
          .filter((t: RegisteredTool) =>
            t.name.toLowerCase().includes(input.name.toLowerCase())
          )
          .map((t: RegisteredTool) => t.name);

        let hint = '';
        if (similar.length > 0) {
          hint = `\n\nDid you mean: ${similar.join(', ')}?`;
        } else {
          hint = `\n\nRun tool_list to see all available tools.`;
        }
        return `Tool '${input.name}' not found.${hint}`;
      }

      const safety = tool.concurrencySafe
        ? '✅ Concurrency-safe (can run in parallel)'
        : '⚠️ Not concurrency-safe (avoid parallel calls)';

      const lines = [
        `=== Tool: ${tool.name} ===`,
        `Status: ${safety}`,
        '',
        `--- Compact Description ---`,
        tool.compactDescription ?? '(none)',
        '',
        `--- Full Description ---`,
        tool.description ?? '(none)',
      ];

      return lines.join('\n');
    },
  });
}

export function createToolListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'tool_list',
    description: TOOL_LIST_DESCRIPTION,
    schema: z.object({
      /** Optional: filter to tools with this prefix */
      prefix: z.string().optional().describe('Filter to tools with this name prefix'),
      /** Optional: limit output to this many tools (default 50) */
      limit: z.number().optional().describe('Maximum number of tools to return'),
    }),
    async func(input): Promise<string> {
      const tools = await getToolRegistry('dummy');

      let filtered = tools;
      if (input.prefix !== undefined) {
        const prefix = input.prefix.toLowerCase();
        filtered = tools.filter((t: RegisteredTool) =>
          t.name.toLowerCase().startsWith(prefix)
        );
      }

      const limit = input.limit ?? 50;
      const shown = filtered.slice(0, limit);
      const skipped = Math.max(0, filtered.length - limit);

      const lines = [
        `Total: ${tools.length} tools${input.prefix ? ` (${filtered.length} matching '${input.prefix}')` : ''}`,
        `${skipped > 0 ? ` (showing first ${limit})` : ''}\n`,
      ];

      for (const tool of shown) {
        const safety = tool.concurrencySafe ? '✅' : '⚠️';
        lines.push(`  ${safety} ${tool.name}`);
        if (tool.compactDescription) {
          lines.push(`      ${tool.compactDescription}`);
        }
      }

      if (skipped > 0) {
        lines.push(`\n... and ${skipped} more (use prefix to narrow)`);
      }

      return lines.join('\n');
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
