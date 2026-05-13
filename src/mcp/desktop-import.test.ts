/**
 * Desktop Import Test - Import MCP servers from Claude Desktop config
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// Test config path that mimics macOS location
const TEST_CONFIG_PATH = '/tmp/dexter-desktop-test-claude-desktop-config.json';

// ============================================================================
// Mock the desktop-import functions for unit testing
// ============================================================================

describe('DesktopMCPServerConfig type', () => {
  it('should have correct type structure', () => {
    const config = {
      command: '/usr/bin/mcp-server',
      args: ['--option', 'value'],
      env: { KEY: 'value' },
    };

    expect(config.command).toBe('/usr/bin/mcp-server');
    expect(config.args).toEqual(['--option', 'value']);
    expect(config.env).toEqual({ KEY: 'value' });
  });

  it('should allow optional fields to be undefined', () => {
    const config = {
      command: '/usr/bin/mcp-server',
    };

    expect(config.args).toBeUndefined();
    expect(config.env).toBeUndefined();
  });
});

// ============================================================================
// Integration tests (read/write operations)
// ============================================================================

describe('Config file parsing', () => {
  beforeEach(() => {
    try {
      rmSync(TEST_CONFIG_PATH, { force: true });
    } catch {}
  });

  afterEach(() => {
    try {
      rmSync(TEST_CONFIG_PATH, { force: true });
    } catch {}
  });

  it('should parse valid MCP server config', async () => {
    const config = {
      mcpServers: {
        'test-server': {
          command: '/usr/local/bin/test-mcp',
          args: ['--debug'],
          env: { DEBUG: 'true' },
        },
      },
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true);

    const content = await import('fs').then((fs) =>
      fs.promises.readFile(TEST_CONFIG_PATH, 'utf8')
    );
    const parsed = JSON.parse(content);

    expect(parsed.mcpServers['test-server'].command).toBe('/usr/local/bin/test-mcp');
    expect(parsed.mcpServers['test-server'].args).toEqual(['--debug']);
    expect(parsed.mcpServers['test-server'].env).toEqual({ DEBUG: 'true' });
  });

  it('should handle multiple servers', async () => {
    const config = {
      mcpServers: {
        'server-1': { command: '/bin/server1' },
        'server-2': { command: '/bin/server2', args: ['--arg1'] },
      },
    };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config));

    const content = await import('fs').then((fs) =>
      fs.promises.readFile(TEST_CONFIG_PATH, 'utf8')
    );
    const parsed = JSON.parse(content);

    expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
    expect(parsed.mcpServers['server-1'].command).toBe('/bin/server1');
    expect(parsed.mcpServers['server-2'].command).toBe('/bin/server2');
  });

  it('should skip invalid server configs', () => {
    const config = {
      mcpServers: {
        'valid-server': { command: '/bin/valid' },
        'invalid-server': { args: ['no-command'] },
        'empty-command': { command: '' },
      },
    };

    // Simulate the filtering logic from desktop-import.ts
    const servers: Record<string, unknown> = {};

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const sc = serverConfig as Record<string, unknown>;
      if (typeof sc.command === 'string' && sc.command.length > 0) {
        servers[name] = serverConfig;
      }
    }

    expect(Object.keys(servers)).toHaveLength(1);
    expect(servers['valid-server']).toBeDefined();
    expect(servers['invalid-server']).toBeUndefined();
    expect(servers['empty-command']).toBeUndefined();
  });

  it('should handle empty mcpServers', async () => {
    const config = { mcpServers: {} };

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config));

    const content = await import('fs').then((fs) =>
      fs.promises.readFile(TEST_CONFIG_PATH, 'utf8')
    );
    const parsed = JSON.parse(content);

    expect(Object.keys(parsed.mcpServers)).toHaveLength(0);
  });

  it('should handle missing mcpServers field', async () => {
    const config = {};

    writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config));

    const content = await import('fs').then((fs) =>
      fs.promises.readFile(TEST_CONFIG_PATH, 'utf8')
    );
    const parsed = JSON.parse(content);

    expect(parsed.mcpServers).toBeUndefined();
  });

  it('should handle invalid JSON gracefully', () => {
    const invalidContent = '{ invalid json }';

    expect(() => JSON.parse(invalidContent)).toThrow();
  });
});

// ============================================================================
// Import filtering tests
// ============================================================================

describe('Server import filtering', () => {
  it('should import all servers when no filter', () => {
    const servers = {
      'server-1': { command: '/bin/1' },
      'server-2': { command: '/bin/2' },
    };

    const filter: string[] = [];
    const allServers = filter.length > 0 ? filter : Object.keys(servers);

    expect(allServers).toHaveLength(2);
    expect(allServers).toContain('server-1');
    expect(allServers).toContain('server-2');
  });

  it('should filter servers when filter provided', () => {
    const servers = {
      'server-1': { command: '/bin/1' },
      'server-2': { command: '/bin/2' },
      'server-3': { command: '/bin/3' },
    };

    const filter = ['server-1', 'server-3'];
    const filtered = filter.filter((name) => servers[name]);

    expect(filtered).toHaveLength(2);
    expect(filtered).toContain('server-1');
    expect(filtered).toContain('server-3');
  });

  it('should skip non-existent servers in filter', () => {
    const servers = {
      'server-1': { command: '/bin/1' },
    };

    const filter = ['server-1', 'non-existent'];
    const filtered = filter.filter((name) => servers[name]);

    expect(filtered).toHaveLength(1);
    expect(filtered).toContain('server-1');
  });
});