export interface PlatformToolMetadata {
  readonly name: string;
  readonly description: string;
  readonly compactDescription?: string;
  readonly concurrencySafe: boolean;
}

export interface ToolSearchInput {
  readonly query?: string;
  readonly name?: string;
  readonly concurrencySafe?: boolean;
}

export interface ToolListInput {
  readonly prefix?: string;
  readonly limit?: number;
}

export const TOOL_SEARCH_DESCRIPTION = `
Search and explore available tools in the UpUp system.

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
- You need to see the compact description for quick reference

Returns tool name, full description, compact description, and safety status.`;

export const TOOL_LIST_DESCRIPTION = `
List all available tools in the UpUp system.

Use this when:
- You want to see everything available
- Building a tool picker UI
- Getting a complete overview of capabilities

Returns all tools with their names and compact descriptions.`;

function safety(tool: PlatformToolMetadata): string {
  return tool.concurrencySafe ? '✅' : '⚠️';
}

export function searchPlatformTools(tools: readonly PlatformToolMetadata[], input: ToolSearchInput): string {
  const filtered = tools.filter((tool) => {
    if (input.query !== undefined) {
      const query = input.query.toLowerCase();
      if (!tool.name.toLowerCase().includes(query)
        && !tool.description.toLowerCase().includes(query)
        && !(tool.compactDescription?.toLowerCase().includes(query) ?? false)) return false;
    }
    if (input.name !== undefined && !tool.name.toLowerCase().startsWith(input.name.toLowerCase())) return false;
    if (input.concurrencySafe !== undefined && tool.concurrencySafe !== input.concurrencySafe) return false;
    return true;
  });
  if (filtered.length === 0) return `No tools found matching criteria.\nTotal tools in registry: ${tools.length}`;
  const lines = [`Found ${filtered.length} tool(s) (of ${tools.length} total):\n`];
  for (const tool of filtered) {
    lines.push(`${safety(tool)} ${tool.name}`);
    if (tool.compactDescription) lines.push(`   ${tool.compactDescription}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function getPlatformTool(tools: readonly PlatformToolMetadata[], name: string): string {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    const similar = tools.filter((candidate) => candidate.name.toLowerCase().includes(name.toLowerCase())).map((candidate) => candidate.name);
    return `Tool '${name}' not found.${similar.length > 0 ? `\n\nDid you mean: ${similar.join(', ')}?` : '\n\nRun tool_list to see all available tools.'}`;
  }
  const status = tool.concurrencySafe ? '✅ Concurrency-safe (can run in parallel)' : '⚠️ Not concurrency-safe (avoid parallel calls)';
  return [
    `=== Tool: ${tool.name} ===`,
    `Status: ${status}`,
    '',
    '--- Compact Description ---',
    tool.compactDescription ?? '(none)',
    '',
    '--- Full Description ---',
    tool.description || '(none)',
  ].join('\n');
}

export function listPlatformTools(tools: readonly PlatformToolMetadata[], input: ToolListInput): string {
  const filtered = input.prefix === undefined
    ? [...tools]
    : tools.filter((tool) => tool.name.toLowerCase().startsWith(input.prefix!.toLowerCase()));
  const limit = input.limit ?? 50;
  const shown = filtered.slice(0, limit);
  const skipped = Math.max(0, filtered.length - limit);
  const lines = [
    `Total: ${tools.length} tools${input.prefix ? ` (${filtered.length} matching '${input.prefix}')` : ''}`,
    `${skipped > 0 ? ` (showing first ${limit})` : ''}\n`,
  ];
  for (const tool of shown) {
    lines.push(`  ${safety(tool)} ${tool.name}`);
    if (tool.compactDescription) lines.push(`      ${tool.compactDescription}`);
  }
  if (skipped > 0) lines.push(`\n... and ${skipped} more (use prefix to narrow)`);
  return lines.join('\n');
}
