/**
 * MCP OAuth Integration Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { MCPClientManager, MCPServerConfig, MCPOAuthConfig } from '../src/client.js';

describe('MCPClientManager - OAuth Integration', () => {
  let manager: MCPClientManager;

  beforeEach(() => {
    manager = new MCPClientManager({ servers: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MCPOAuthConfig', () => {
    it('should define OAuth config structure', () => {
      const config: MCPOAuthConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authServerUrl: 'https://auth.example.com',
        tokenServerUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      };

      expect(config.clientId).toBe('test-client-id');
      expect(config.scopes).toContain('read');
    });
  });

  describe('MCPServerConfig with OAuth', () => {
    it('should accept OAuth config', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        url: 'https://example.com/mcp',
        oauth: {
          clientId: 'client-123',
          authServerUrl: 'https://auth.example.com',
          tokenServerUrl: 'https://auth.example.com/token',
        },
      };

      expect(config.name).toBe('test-server');
      expect(config.oauth?.clientId).toBe('client-123');
    });
  });
});

describe('OAuth Token Handling', () => {
  it('should handle OAuth config without tokens', async () => {
    const manager = new MCPClientManager({ servers: [] });

    // Access private method via type assertion for testing
    const getAuthHeaders = (manager as any).getAuthHeaders.bind(manager);

    // With no tokens stored, should return empty headers
    const headers = await getAuthHeaders('test-server', {
      clientId: 'test',
      tokenServerUrl: 'https://auth.example.com/token',
    });

    expect(headers).toEqual({});
  });

  it('should return empty headers when no OAuth config', async () => {
    const manager = new MCPClientManager({ servers: [] });

    const getAuthHeaders = (manager as any).getAuthHeaders.bind(manager);
    const headers = await getAuthHeaders('test-server', undefined);

    expect(headers).toEqual({});
  });
});

describe('OAuth Token Storage', () => {
  it('should store tokens during OAuth flow', async () => {
    const { defaultTokenStorage } = await import('../src/oauth.js');

    const tokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
    };

    await defaultTokenStorage.set('test-server', tokens);
    const retrieved = await defaultTokenStorage.get('test-server');

    expect(retrieved?.accessToken).toBe('test-access-token');
    expect(retrieved?.refreshToken).toBe('test-refresh-token');

    // Cleanup
    await defaultTokenStorage.delete('test-server');
  });
});
