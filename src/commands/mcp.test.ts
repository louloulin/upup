/**
 * MCP Commands Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import {
  loadMCPConfig,
  saveMCPConfig,
  getConfigPath,
  MCPCommandOptions,
} from './mcp.js';
import type { McpServerConfig } from '../mcp/types.js';

describe('MCP Commands', () => {
  const testDir = join(tmpdir(), 'test-mcp-commands');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('loadMCPConfig', () => {
    it('should load config from file', () => {
      const configPath = join(testDir, 'mcp.json');
      writeFileSync(configPath, JSON.stringify({
        mcpServers: {
          'test-server': { type: 'stdio', command: 'npx', args: ['test'] },
        },
      }), 'utf-8');

      const config = loadMCPConfig(configPath);
      expect(config['test-server']).toBeDefined();
      expect((config['test-server'] as { command: string }).command).toBe('npx');
    });

    it('should return empty object for non-existent file', () => {
      const config = loadMCPConfig(join(testDir, 'non-existent.json'));
      expect(config).toEqual({});
    });

    it('should handle corrupted JSON', () => {
      const configPath = join(testDir, 'corrupted.json');
      writeFileSync(configPath, '{ invalid json', 'utf-8');

      const config = loadMCPConfig(configPath);
      expect(config).toEqual({});
    });

    it('should support servers key format', () => {
      const configPath = join(testDir, 'alt-format.json');
      writeFileSync(configPath, JSON.stringify({
        servers: {
          'alt-server': { type: 'stdio', command: 'echo' },
        },
      }), 'utf-8');

      const config = loadMCPConfig(configPath);
      expect(config['alt-server']).toBeDefined();
    });
  });

  describe('saveMCPConfig', () => {
    it('should save config to file', () => {
      const configPath = join(testDir, 'save-test.json');
      const servers: Record<string, { type: 'stdio'; command: string; args: string[] }> = {
        'save-server': { type: 'stdio', command: 'echo', args: ['hello'] },
      };

      saveMCPConfig(servers, configPath);

      expect(existsSync(configPath)).toBe(true);
      const content = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      expect(content.mcpServers['save-server']).toBeDefined();
    });

    it('should create version field', () => {
      const configPath = join(testDir, 'version-test.json');
      saveMCPConfig({}, configPath);

      const content = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      expect(content.version).toBe('1.0');
    });
  });

  describe('getConfigPath', () => {
    it('should return project path for project scope', () => {
      const path = getConfigPath('project');
      expect(path).toBe('.mcp.json');
    });

    it('should return user path for user scope', () => {
      const path = getConfigPath('user');
      expect(path).toContain('mcp-servers.json');
    });

    it('should default to user path for unknown scope', () => {
      const path = getConfigPath('dynamic');
      expect(path).toContain('mcp-servers.json');
    });
  });

  describe('ConfigScope handling', () => {
    it('should validate config scope', async () => {
      const { ConfigScopeSchema } = await import('../mcp/types.js');

      const validScopes = ['local', 'user', 'project', 'dynamic', 'enterprise'] as const;
      for (const scope of validScopes) {
        const result = ConfigScopeSchema.parse(scope);
        expect(result).toBe(scope);
      }
    });
  });

  describe('Server config parsing', () => {
    it('should parse stdio config', async () => {
      const { McpStdioServerConfigSchema } = await import('../mcp/types.js');

      const config = McpStdioServerConfigSchema.parse({
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' },
      });

      expect(config.type).toBe('stdio');
      expect(config.command).toBe('node');
      expect(config.args).toEqual(['server.js']);
      expect(config.env?.NODE_ENV).toBe('production');
    });

    it('should parse SSE config', async () => {
      const { McpSSEServerConfigSchema } = await import('../mcp/types.js');

      const config = McpSSEServerConfigSchema.parse({
        type: 'sse',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      });

      expect(config.type).toBe('sse');
      expect(config.url).toBe('https://api.example.com/mcp');
      expect(config.headers?.Authorization).toBe('Bearer token');
    });

    it('should parse HTTP config', async () => {
      const { McpHTTPServerConfigSchema } = await import('../mcp/types.js');

      const config = McpHTTPServerConfigSchema.parse({
        type: 'http',
        url: 'https://api.example.com/mcp',
      });

      expect(config.type).toBe('http');
      expect(config.url).toBe('https://api.example.com/mcp');
    });
  });

  describe('Transport detection', () => {
    it('should detect stdio transport', async () => {
      const { getTransportType, isStdioConfig } = await import('../mcp/types.js');

      const config = { type: 'stdio', command: 'echo', args: [] } as McpServerConfig;
      expect(getTransportType(config)).toBe('stdio');
      expect(isStdioConfig(config)).toBe(true);
    });

    it('should detect HTTP transport', async () => {
      const { getTransportType, isHttpConfig } = await import('../mcp/types.js');

      const config = { type: 'sse', url: 'https://example.com/mcp' } as McpServerConfig;
      expect(getTransportType(config)).toBe('sse');
      expect(isHttpConfig(config)).toBe(true);
    });

    it('should check OAuth support', async () => {
      const { supportsOAuth } = await import('../mcp/types.js');

      const withOAuth = { type: 'sse', url: 'https://example.com', oauth: { clientId: 'test' } } as McpServerConfig;
      const withoutOAuth = { type: 'stdio', command: 'echo', args: [] } as McpServerConfig;

      expect(supportsOAuth(withOAuth)).toBe(true);
      expect(supportsOAuth(withoutOAuth)).toBe(false);
    });
  });
});