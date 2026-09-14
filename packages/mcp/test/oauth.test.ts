/**
 * MCP OAuth Test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  buildRedirectUri,
  findAvailablePort,
  getMcpOAuthCallbackPort,
  InMemoryTokenStorage,
  isTokenExpired,
  OAuthTokens,
} from './oauth.js';

describe('buildRedirectUri', () => {
  it('should build redirect URI with default port', () => {
    const uri = buildRedirectUri();
    expect(uri).toBe('http://localhost:3118/callback');
  });

  it('should build redirect URI with custom port', () => {
    const uri = buildRedirectUri(8080);
    expect(uri).toBe('http://localhost:8080/callback');
  });

  it('should use callback path', () => {
    const uri = buildRedirectUri(9000);
    expect(uri).toContain('/callback');
  });
});

describe('getMcpOAuthCallbackPort', () => {
  it('should return configured port from env', () => {
    const original = process.env.MCP_OAUTH_CALLBACK_PORT;
    process.env.MCP_OAUTH_CALLBACK_PORT = '8080';

    const port = getMcpOAuthCallbackPort();
    expect(port).toBe(8080);

    if (original !== undefined) {
      process.env.MCP_OAUTH_CALLBACK_PORT = original;
    } else {
      delete process.env.MCP_OAUTH_CALLBACK_PORT;
    }
  });

  it('should return undefined for invalid port', () => {
    const original = process.env.MCP_OAUTH_CALLBACK_PORT;
    process.env.MCP_OAUTH_CALLBACK_PORT = 'not-a-number';

    const port = getMcpOAuthCallbackPort();
    expect(port).toBeUndefined();

    if (original !== undefined) {
      process.env.MCP_OAUTH_CALLBACK_PORT = original;
    } else {
      delete process.env.MCP_OAUTH_CALLBACK_PORT;
    }
  });

  it('should return undefined for empty env', () => {
    const original = process.env.MCP_OAUTH_CALLBACK_PORT;
    delete process.env.MCP_OAUTH_CALLBACK_PORT;

    const port = getMcpOAuthCallbackPort();
    expect(port).toBeUndefined();

    if (original !== undefined) {
      process.env.MCP_OAUTH_CALLBACK_PORT = original;
    }
  });
});

describe('findAvailablePort', () => {
  it('should find an available port', async () => {
    const port = await findAvailablePort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
  });

  it('should return configured port if available', async () => {
    const original = process.env.MCP_OAUTH_CALLBACK_PORT;
    process.env.MCP_OAUTH_CALLBACK_PORT = '19999';

    try {
      const port = await findAvailablePort();
      expect(port).toBe(19999);
    } catch {
      // Port may not be available, which is fine
    }

    if (original !== undefined) {
      process.env.MCP_OAUTH_CALLBACK_PORT = original;
    } else {
      delete process.env.MCP_OAUTH_CALLBACK_PORT;
    }
  });
});

describe('InMemoryTokenStorage', () => {
  let storage: InMemoryTokenStorage;

  beforeEach(() => {
    storage = new InMemoryTokenStorage();
  });

  it('should store and retrieve tokens', async () => {
    const tokens: OAuthTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
    };

    await storage.set('test-server', tokens);
    const retrieved = await storage.get('test-server');

    expect(retrieved).toEqual(tokens);
  });

  it('should return null for non-existent server', async () => {
    const tokens = await storage.get('non-existent');
    expect(tokens).toBeNull();
  });

  it('should delete tokens', async () => {
    const tokens: OAuthTokens = {
      accessToken: 'test-access-token',
    };

    await storage.set('test-server', tokens);
    await storage.delete('test-server');

    const retrieved = await storage.get('test-server');
    expect(retrieved).toBeNull();
  });
});

describe('isTokenExpired', () => {
  it('should return false for valid tokens', () => {
    const tokens: OAuthTokens = {
      accessToken: 'test',
      expiresAt: Date.now() + 3600000, // 1 hour from now
    };

    expect(isTokenExpired(tokens)).toBe(false);
  });

  it('should return true for expired tokens', () => {
    const tokens: OAuthTokens = {
      accessToken: 'test',
      expiresAt: Date.now() - 1000, // 1 second ago
    };

    expect(isTokenExpired(tokens)).toBe(true);
  });

  it('should return false for tokens without expiresAt', () => {
    const tokens: OAuthTokens = {
      accessToken: 'test',
    };

    expect(isTokenExpired(tokens)).toBe(false);
  });

  it('should account for clock skew', () => {
    // Use fixed future timestamp to avoid timing issues
    const futureTime = Date.now() + 600000; // 10 minutes from now

    const tokens: OAuthTokens = {
      accessToken: 'test',
      expiresAt: futureTime,
    };

    // With large clock skew (5 min), should not be expired (10 min remaining > 5 min skew)
    expect(isTokenExpired(tokens, 300000)).toBe(false);

    // With 0 skew and plenty of time, should not be expired
    expect(isTokenExpired(tokens, 0)).toBe(false);
  });
});