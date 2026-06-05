/**
 * Tests for MCP Resource Tools
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import { listMcpResourcesTool, readMcpResourceTool } from './resource-tools.js';

// Mock the MCP client
vi.mock('./client.js', () => ({
  getDefaultMCPClient: vi.fn(() => ({
    listResources: vi.fn(async (serverName?: string) => {
      if (serverName === 'empty-server') {
        return [];
      }
      return [
        {
          server: 'test-server',
          resources: [
            {
              uri: 'file:///test/resource.txt',
              name: 'Test Resource',
              description: 'A test resource',
              mimeType: 'text/plain',
            },
            {
              uri: 'file:///test/data.json',
              name: 'Data File',
              description: 'JSON data file',
              mimeType: 'application/json',
            },
          ],
        },
      ];
    }),
    readResource: vi.fn(async (uri: string, serverName?: string) => ({
      server: serverName || 'test-server',
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'Hello, world!',
        },
      ],
    })),
  })),
}));

describe('listMcpResourcesTool', () => {
  it('lists resources from all servers', async () => {
    const result = await listMcpResourcesTool.invoke({});
    const parsed = JSON.parse(result as string);

    expect(parsed.servers).toBe(1);
    // totalResources now includes the 3 built-in upup:// templates
    expect(parsed.totalResources).toBe(2 + parsed.upupResources.length);
    expect(parsed.upupResources).toHaveLength(6);  // P2.a.4: +2 strategy + strategy-list
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].resources).toHaveLength(2);
    expect(parsed.results[0].resources[0].uri).toBe('file:///test/resource.txt');
  });

  it('handles no connected servers gracefully', async () => {
    // Override mock for this test
    const { getDefaultMCPClient } = await import('./client.js');
    (getDefaultMCPClient as any).mockReturnValueOnce({
      listResources: async () => [],
    });

    const result = await listMcpResourcesTool.invoke({});
    const parsed = JSON.parse(result as string);

    // No 'message' fallback because upup:// templates are always available.
    // This is the new contract: zero external servers does NOT mean zero resources.
    expect(parsed.message).toBeUndefined();
    expect(parsed.servers).toBe(0);
    expect(parsed.totalResources).toBe(6);  // P2.a.4
    expect(parsed.upupResources).toHaveLength(6);  // P2.a.4
  });

  it('filters by server name', async () => {
    const result = await listMcpResourcesTool.invoke({ server: 'test-server' });
    const parsed = JSON.parse(result as string);

    expect(parsed.totalResources).toBe(2 + parsed.upupResources.length);
  });
});

describe('readMcpResourceTool', () => {
  it('reads a resource by URI', async () => {
    const result = await readMcpResourceTool.invoke({
      uri: 'file:///test/resource.txt',
    });
    const parsed = JSON.parse(result as string);

    expect(parsed.uri).toBe('file:///test/resource.txt');
    expect(parsed.contents).toHaveLength(1);
    expect(parsed.contents[0].text).toBe('Hello, world!');
  });

  it('reads with explicit server name', async () => {
    const result = await readMcpResourceTool.invoke({
      uri: 'file:///test/resource.txt',
      server: 'explicit-server',
    });
    const parsed = JSON.parse(result as string);

    expect(parsed.server).toBe('explicit-server');
  });
});
