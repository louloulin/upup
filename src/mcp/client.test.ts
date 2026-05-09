/**
 * MCP Client Integration Verification Tests
 *
 * Tests the MCP client manager's core functionality:
 * - Connection management (constructor, disconnect, disconnectAll)
 * - Tool discovery and conversion (getTools, getToolsForServer)
 * - Resource listing (listResources, readResource)
 * - Connection state tracking (getConnectionState, getAllConnections)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { MCPClientManager, type MCPServerConfig, type MCPClientConfig } from './client.js';

describe('MCP Client Manager', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    const config: MCPClientConfig = { servers: [] };
    manager = new MCPClientManager(config);
  });

  describe('Connection State', () => {
    test('initial state — no servers connected, no tools', () => {
      const tools = manager.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });

    test('getAllConnections returns empty array initially', () => {
      const connections = manager.getAllConnections();
      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBe(0);
    });

    test('getConnectionState returns undefined for unknown server', () => {
      const state = manager.getConnectionState('non-existent');
      expect(state).toBeUndefined();
    });
  });

  describe('Tool Management', () => {
    test('getToolsForServer returns empty for non-existent server', () => {
      const tools = manager.getToolsForServer('non-existent');
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });
  });

  describe('Resource Management', () => {
    test('listResources returns empty when no servers connected', async () => {
      const resources = await manager.listResources();
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBe(0);
    });

    test('readResource throws when no servers connected', async () => {
      await expect(manager.readResource('file:///test.txt')).rejects.toThrow('No MCP server found');
    });
  });

  describe('Error Handling', () => {
    test('disconnect non-existent server does not throw', async () => {
      await expect(manager.disconnect('non-existent')).resolves.toBeUndefined();
    });

    test('disconnectAll with no servers does not throw', async () => {
      await expect(manager.disconnectAll()).resolves.toBeUndefined();
    });
  });

  describe('Constructor with Config', () => {
    test('accepts empty server config', () => {
      const config: MCPClientConfig = { servers: [] };
      const mgr = new MCPClientManager(config);
      expect(mgr.getTools().length).toBe(0);
    });

    test('accepts config with servers (not connected)', () => {
      const config: MCPClientConfig = {
        servers: [
          { name: 'test-server', command: 'echo', args: ['hello'] },
        ],
      };
      const mgr = new MCPClientManager(config);
      // Servers not connected yet (need connectAll)
      expect(mgr.getTools().length).toBe(0);
      expect(mgr.getAllConnections().length).toBe(0);
    });

    test('accepts config with clientInfo', () => {
      const config: MCPClientConfig = {
        servers: [],
        clientInfo: { name: 'Dexter', version: '2026.5.2' },
      };
      const mgr = new MCPClientManager(config);
      expect(mgr).toBeDefined();
    });
  });
});

describe('MCP Configuration Types', () => {
  test('MCPServerConfig Stdio type', () => {
    const config: MCPServerConfig = {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { NODE_ENV: 'test' },
      autoConnect: false,
    };
    expect(config.name).toBe('filesystem');
    expect(config.command).toBe('npx');
    expect(config.autoConnect).toBe(false);
    expect(config.args?.length).toBe(3);
  });

  test('MCPServerConfig SSE type', () => {
    const config: MCPServerConfig = {
      name: 'web-server',
      url: 'http://localhost:3001/mcp',
      autoConnect: false,
    };
    expect(config.name).toBe('web-server');
    expect(config.url).toBe('http://localhost:3001/mcp');
    expect(config.command).toBeUndefined();
  });

  test('MCPClientConfig supports multiple servers', () => {
    const config: MCPClientConfig = {
      servers: [
        { name: 'filesystem', command: 'npx', args: ['-y', '@mcp/server-fs'] },
        { name: 'sqlite', command: 'npx', args: ['-y', '@mcp/server-sqlite'] },
        { name: 'web', url: 'http://localhost:3001/mcp' },
      ],
    };
    expect(config.servers.length).toBe(3);
    expect(config.servers[0].name).toBe('filesystem');
    expect(config.servers[2].url).toBe('http://localhost:3001/mcp');
  });
});
