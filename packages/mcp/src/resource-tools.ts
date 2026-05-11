/**
 * MCP Resource Tools - Expose MCP resource listing and reading as first-class tools.
 *
 * These tools let the agent discover and read resources exposed by connected MCP servers.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDefaultMCPClient } from './client.js';

export const LIST_MCP_RESOURCES_DESCRIPTION = `
List available resources from connected MCP servers.

## When to Use

- Discovering what data/resources MCP servers expose (files, prompts, templates)
- Finding available resource URIs before reading specific resources

## When NOT to Use

- Reading a specific resource (use \`read_mcp_resource\`)
- Listing MCP tools (use \`tool_list\`)

## Usage Notes

- Optionally filter by server name
- Returns resource URIs, names, descriptions, and MIME types
`.trim();

export const READ_MCP_RESOURCE_DESCRIPTION = `
Read a specific resource from an MCP server by URI.

## When to Use

- Reading a resource discovered via \`list_mcp_resources\`
- Fetching specific data exposed by MCP servers (files, prompts, etc.)

## When NOT to Use

- Listing available resources (use \`list_mcp_resources\`)
- Calling MCP tools (use the MCP tool directly)

## Usage Notes

- Requires the resource URI (obtained from \`list_mcp_resources\`)
- Optionally specify server name to avoid auto-detection
- Returns resource content (text or binary)
`.trim();

export const listMcpResourcesTool = new DynamicStructuredTool({
  name: 'list_mcp_resources',
  description: 'List available resources from connected MCP servers.',
  schema: z.object({
    server: z.string().optional().describe('Optional server name to filter results.'),
  }),
  func: async (input) => {
    const client = getDefaultMCPClient();
    const results = await client.listResources(input.server);

    if (results.length === 0) {
      return JSON.stringify({
        message: 'No MCP servers connected or no resources available.',
        servers: 0,
        totalResources: 0,
      });
    }

    const totalResources = results.reduce((sum, r) => sum + r.resources.length, 0);
    return JSON.stringify({
      servers: results.length,
      totalResources,
      results: results.map(r => ({
        server: r.server,
        resources: r.resources.map((res: any) => ({
          uri: res.uri,
          name: res.name,
          description: res.description,
          mimeType: res.mimeType,
        })),
      })),
    });
  },
});

export const readMcpResourceTool = new DynamicStructuredTool({
  name: 'read_mcp_resource',
  description: 'Read a specific resource from an MCP server by URI.',
  schema: z.object({
    uri: z.string().describe('URI of the resource to read.'),
    server: z.string().optional().describe('Optional server name (auto-detected if omitted).'),
  }),
  func: async (input) => {
    const client = getDefaultMCPClient();
    const result = await client.readResource(input.uri, input.server);

    return JSON.stringify({
      server: result.server,
      uri: input.uri,
      contents: result.contents.map((c: any) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text,
        blob: c.blob ? `[binary data, ${c.blob.length} bytes]` : undefined,
      })),
    });
  },
});
