/**
 * MCP Types Test
 */

import { describe, it, expect } from 'bun:test';
import {
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpOAuthConfigSchema,
  ConfigScopeSchema,
  TransportSchema,
  getTransportType,
  supportsOAuth,
  isStdioConfig,
  isHttpConfig,
  getServerEndpoint,
  getTransportDisplayName,
} from './types.js';

describe('McpStdioServerConfigSchema', () => {
  it('should validate valid stdio config', () => {
    const config = {
      command: '/usr/local/bin/mcp-server',
      args: ['--debug'],
      env: { DEBUG: 'true' },
    };

    const result = McpStdioServerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should require command', () => {
    const config = {
      args: ['--debug'],
    };

    const result = McpStdioServerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject empty command', () => {
    const config = {
      command: '',
    };

    const result = McpStdioServerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should accept minimal config', () => {
    const config = {
      command: '/usr/bin/mcp',
    };

    const result = McpStdioServerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toEqual([]);
    }
  });
});

describe('McpSSEServerConfigSchema', () => {
  it('should validate valid SSE config', () => {
    const config = {
      type: 'sse',
      url: 'https://example.com/mcp',
    };

    const result = McpSSEServerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should require valid URL', () => {
    const config = {
      type: 'sse',
      url: 'not-a-url',
    };

    const result = McpSSEServerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should accept optional headers and oauth', () => {
    const config = {
      type: 'sse',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    };

    const result = McpSSEServerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('McpOAuthConfigSchema', () => {
  it('should validate minimal OAuth config', () => {
    const config = {};

    const result = McpOAuthConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate full OAuth config', () => {
    const config = {
      clientId: 'my-client-id',
      callbackPort: 8080,
      authServerMetadataUrl: 'https://auth.example.com/.well-known/oauth-authorization-server',
      xaa: true,
    };

    const result = McpOAuthConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should require valid URL for authServerMetadataUrl', () => {
    const config = {
      authServerMetadataUrl: 'not-a-url',
    };

    const result = McpOAuthConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject negative callbackPort', () => {
    const config = {
      callbackPort: -1,
    };

    const result = McpOAuthConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('ConfigScopeSchema', () => {
  it('should accept valid scopes', () => {
    const scopes = ['local', 'user', 'project', 'dynamic', 'enterprise', 'claudeai', 'managed'] as const;

    for (const scope of scopes) {
      const result = ConfigScopeSchema.safeParse(scope);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid scope', () => {
    const result = ConfigScopeSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('TransportSchema', () => {
  it('should accept valid transports', () => {
    const transports = ['stdio', 'sse', 'http', 'ws', 'sse-ide'] as const;

    for (const transport of transports) {
      const result = TransportSchema.safeParse(transport);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid transport', () => {
    const result = TransportSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('Helper functions', () => {
  describe('getTransportType', () => {
    it('should return correct transport type', () => {
      expect(getTransportType({ type: 'stdio', command: '/bin/test' })).toBe('stdio');
      expect(getTransportType({ type: 'sse', url: 'https://example.com' })).toBe('sse');
      expect(getTransportType({ type: 'http', url: 'https://example.com' })).toBe('http');
      expect(getTransportType({ type: 'ws', url: 'ws://example.com' })).toBe('ws');
    });
  });

  describe('supportsOAuth', () => {
    it('should return true for SSE with OAuth', () => {
      const config = {
        type: 'sse',
        url: 'https://example.com',
        oauth: { clientId: 'test' },
      };
      expect(supportsOAuth(config)).toBe(true);
    });

    it('should return false for stdio config', () => {
      const config = {
        type: 'stdio',
        command: '/bin/test',
      };
      expect(supportsOAuth(config)).toBe(false);
    });
  });

  describe('isStdioConfig', () => {
    it('should return true for stdio config', () => {
      expect(isStdioConfig({ type: 'stdio', command: '/bin/test' })).toBe(true);
    });

    it('should return false for SSE config', () => {
      expect(isStdioConfig({ type: 'sse', url: 'https://example.com' })).toBe(false);
    });
  });

  describe('isHttpConfig', () => {
    it('should return true for SSE config', () => {
      expect(isHttpConfig({ type: 'sse', url: 'https://example.com' })).toBe(true);
    });

    it('should return true for HTTP config', () => {
      expect(isHttpConfig({ type: 'http', url: 'https://example.com' })).toBe(true);
    });

    it('should return false for stdio config', () => {
      expect(isHttpConfig({ type: 'stdio', command: '/bin/test' })).toBe(false);
    });
  });

  describe('getServerEndpoint', () => {
    it('should return URL for HTTP-based configs', () => {
      expect(getServerEndpoint({ type: 'sse', url: 'https://example.com' })).toBe('https://example.com');
      expect(getServerEndpoint({ type: 'http', url: 'https://api.example.com' })).toBe('https://api.example.com');
    });

    it('should return command for stdio config', () => {
      expect(getServerEndpoint({ type: 'stdio', command: '/usr/bin/mcp' })).toBe('/usr/bin/mcp');
    });
  });

  describe('getTransportDisplayName', () => {
    it('should return human-readable transport name', () => {
      expect(getTransportDisplayName('stdio')).toBe('Standard I/O');
      expect(getTransportDisplayName('sse')).toBe('Server-Sent Events');
      expect(getTransportDisplayName('http')).toBe('HTTP/REST');
      expect(getTransportDisplayName('ws')).toBe('WebSocket');
    });
  });
});