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
} from './mcp-ui.js';
import { saveMCPConfig, loadMCPConfig } from '../commands/mcp.js';

describe('MCPServerList', () => {
  let list: MCPServerList;

  beforeEach(() => {
    list = new MCPServerList();
  });

  it('should render empty state', () => {
    const lines = list.render(60);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('No MCP servers');
  });

  it('should render servers', () => {
    const servers: MCPServerInfo[] = [
      { name: 'server1', config: { type: 'stdio', command: 'echo' } },
      { name: 'server2', config: { type: 'stdio', command: 'node' } },
    ];

    list.setServers(servers);
    const lines = list.render(60);

    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join()).toContain('server1');
    expect(lines.join()).toContain('server2');
  });

  it('should navigate up/down', () => {
    const servers: MCPServerInfo[] = [
      { name: 'server1', config: { type: 'stdio', command: 'echo' } },
      { name: 'server2', config: { type: 'stdio', command: 'node' } },
      { name: 'server3', config: { type: 'stdio', command: 'python' } },
    ];

    list.setServers(servers);
    expect(list.getSelected()?.name).toBe('server1');

    list.moveDown();
    expect(list.getSelected()?.name).toBe('server2');

    list.moveUp();
    expect(list.getSelected()?.name).toBe('server1');
  });

  it('should show status icons', () => {
    const servers: MCPServerInfo[] = [
      { name: 'connected', config: { type: 'stdio', command: 'echo' }, status: { name: 'connected', state: 'connected', transport: 'stdio', autoConnect: false } },
      { name: 'disconnected', config: { type: 'stdio', command: 'echo' }, status: { name: 'disconnected', state: 'disconnected', transport: 'stdio', autoConnect: false } },
      { name: 'error', config: { type: 'stdio', command: 'echo' }, status: { name: 'error', state: 'error', transport: 'stdio', autoConnect: false } },
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
    expect(lines[0]).toContain('Select a server');
  });

  it('should render server details', () => {
    const server: MCPServerInfo = {
      name: 'test-server',
      config: { type: 'stdio', command: 'node', args: ['server.js'] },
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
      config: { type: 'sse', url: 'https://api.example.com/mcp' },
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
    expect(loaded['test-server'].command).toBe('echo');
  });

  it('should print servers', () => {
    // This is a smoke test - just verify it doesn't throw
    expect(() => {
      printMCPServers('project');
    }).not.toThrow();
  });
});