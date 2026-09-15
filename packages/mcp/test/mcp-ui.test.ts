/**
 * MCP UI Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import {
  MCPServerInfo,
  MCPServerList,
  MCPServerDetail,
  MCPUI,
  printMCPServers,
} from '../src/mcp-ui';
import { saveMCPConfig, loadMCPConfig } from '../src/mcp-ui';
import type { McpServerConfig, MCPServerStatus } from '@upup/mcp';

describe('MCPServerList', () => {
  let list: MCPServerList;

  beforeEach(() => {
    list = new MCPServerList();
  });

  it('should render empty state', () => {
    const lines = list.render(60);
    expect(lines.length).toBeGreaterThan(0);
    // Use lines.join() because Box adds padding which shifts content
    expect(lines.join()).toContain('No servers configured');
  });

  it('should render servers', () => {
    const servers: MCPServerInfo[] = [
      { name: 'server1', config: { type: 'stdio', command: 'echo', args: [] } as McpServerConfig },
      { name: 'server2', config: { type: 'stdio', command: 'node', args: [] } as McpServerConfig },
    ];

    list.setServers(servers);
    const lines = list.render(60);

    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join()).toContain('server1');
    expect(lines.join()).toContain('server2');
  });

  it('should navigate up/down', () => {
    const servers: MCPServerInfo[] = [
      { name: 'server1', config: { type: 'stdio', command: 'echo', args: [] } as McpServerConfig },
      { name: 'server2', config: { type: 'stdio', command: 'node', args: [] } as McpServerConfig },
      { name: 'server3', config: { type: 'stdio', command: 'python', args: [] } as McpServerConfig },
    ];

    list.setServers(servers);
    expect(list.getSelected()?.name).toBe('server1');

    list.moveDown();
    expect(list.getSelected()?.name).toBe('server2');

    list.moveUp();
    expect(list.getSelected()?.name).toBe('server1');
  });

  it('should show status icons', () => {
    const makeStatus = (state: 'connected' | 'disconnected' | 'error'): MCPServerStatus => ({
      name: state,
      state,
      transport: 'stdio',
      autoConnect: false,
    });
    const servers: MCPServerInfo[] = [
      { name: 'connected', config: { type: 'stdio', command: 'echo', args: [] } as McpServerConfig, status: makeStatus('connected') },
      { name: 'disconnected', config: { type: 'stdio', command: 'echo', args: [] } as McpServerConfig, status: makeStatus('disconnected') },
      { name: 'error', config: { type: 'stdio', command: 'echo', args: [] } as McpServerConfig, status: makeStatus('error') },
    ];

    list.setServers(servers);
    const lines = list.render(60);

    // Should contain status indicators
    expect(lines.join()).toContain('connected');
    expect(lines.join()).toContain('disconnected');
    expect(lines.join()).toContain('error');
  });
});

describe('MCPServerDetail', () => {
  let detail: MCPServerDetail;

  beforeEach(() => {
    detail = new MCPServerDetail();
  });

  it('should render empty state', () => {
    const lines = detail.render(60);
    // Use lines.join() because Box adds padding which shifts content
    expect(lines.join()).toContain('Select a server');
  });

  it('should render server details', () => {
    const server: MCPServerInfo = {
      name: 'test-server',
      config: { type: 'stdio', command: 'node', args: ['server.js'] } as McpServerConfig,
    };

    detail.setServer(server);
    const lines = detail.render(60);

    expect(lines.join()).toContain('test-server');
    expect(lines.join()).toContain('stdio');
    expect(lines.join()).toContain('node');
  });

  it('should show URL for HTTP servers', () => {
    const server: MCPServerInfo = {
      name: 'http-server',
      config: { type: 'sse', url: 'https://api.example.com/mcp' } as McpServerConfig,
    };

    detail.setServer(server);
    const lines = detail.render(60);

    expect(lines.join()).toContain('https://api.example.com/mcp');
  });
});

describe('MCP Config Integration', () => {
  const testDir = join(tmpdir(), 'mcp-ui-test');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should load and save MCP config', () => {
    const configPath = join(testDir, 'mcp.json');
    const servers = {
      'test-server': { type: 'stdio', command: 'echo' } as any,
    };

    saveMCPConfig(servers, configPath);
    const loaded = loadMCPConfig(configPath);

    expect(loaded['test-server']).toBeDefined();
    expect((loaded['test-server'] as { command: string }).command).toBe('echo');
  });

  it('should print servers', () => {
    // This is a smoke test - just verify it doesn't throw
    expect(() => {
      printMCPServers('project');
    }).not.toThrow();
  });
});