/**
 * McpAuthTool - MCP Authentication Management
 *
 * Provides tools for managing MCP server authentication:
 * - Store/retrieve API keys and OAuth tokens for MCP servers
 * - List configured authentication for servers
 * - Clear authentication credentials
 *
 * Reference: Claude Code's McpAuthTool
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { upupPath, ensureDir } from '../utils/paths.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface MCPServerAuth {
  serverName: string;
  type: 'api_key' | 'bearer' | 'basic' | 'oauth2' | 'none';
  /** Key header name (e.g., 'Authorization', 'X-API-Key') */
  headerName?: string;
  /** Key prefix (e.g., 'Bearer ', 'Basic ') */
  keyPrefix?: string;
  /** Encrypted/encoded credential value */
  credential?: string;
  /** Additional auth metadata (e.g., OAuth scopes) */
  metadata?: Record<string, string>;
}

interface AuthStore {
  [serverName: string]: MCPServerAuth;
}

// ============================================================================
// Auth Storage
// ============================================================================

const AUTH_DIR = 'mcp-auth';
const AUTH_FILE = 'credentials.json';

function getAuthFilePath(): string {
  return upupPath(AUTH_DIR, AUTH_FILE);
}

function loadAuthStore(): AuthStore {
  const filePath = getAuthFilePath();
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Return empty store on error
  }
  return {};
}

function saveAuthStore(store: AuthStore): void {
  const filePath = getAuthFilePath();
  ensureDir(join(filePath, '..'));
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

// ============================================================================
// Schemas
// ============================================================================

export const McpAuthSetSchema = z.object({
  /** Server name to configure authentication for */
  server_name: z.string().min(1).describe('MCP server name to set auth for'),
  /** Authentication type */
  type: z.enum(['api_key', 'bearer', 'basic', 'oauth2', 'none']).describe('Auth type'),
  /** The credential value (API key, token, or base64 user:pass) */
  credential: z.string().optional().describe('Credential value (API key, token, etc.)'),
  /** Header name for API key type (default: Authorization) */
  header_name: z.string().optional().describe('Header name for API key auth'),
  /** Key prefix (e.g., "Bearer ", "Basic ") */
  key_prefix: z.string().optional().describe('Key prefix'),
});

export const McpAuthGetSchema = z.object({
  /** Server name to get auth for (omit for all) */
  server_name: z.string().optional().describe('Server name (omit for all)'),
});

export const McpAuthClearSchema = z.object({
  /** Server name to clear auth for */
  server_name: z.string().min(1).describe('Server name to clear auth for'),
});

// ============================================================================
// Tool Descriptions
// ============================================================================

export const MCP_AUTH_SET_DESCRIPTION = `
Set authentication credentials for an MCP server.

Use this when:
- Configuring API key authentication for a remote MCP server
- Setting up bearer token auth
- Adding basic auth credentials
- Storing OAuth2 tokens

Credentials are stored locally in .upup/mcp-auth/credentials.json.

Examples:
- Set API key: server_name='alpha-vantage', type='api_key', credential='YOUR_KEY'
- Set bearer token: server_name='internal-api', type='bearer', credential='token123'
`;

export const MCP_AUTH_GET_DESCRIPTION = `
Get authentication configuration for MCP servers.

Use this to:
- Check which servers have auth configured
- Verify auth type before connecting
- Audit credential configuration

Returns auth type and metadata (credential values are masked for security).`;

export const MCP_AUTH_CLEAR_DESCRIPTION = `
Clear stored authentication credentials for an MCP server.

Use this when:
- Rotating credentials
- Removing server access
- Resetting auth configuration`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createMcpAuthSetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'mcp_auth_set',
    description: MCP_AUTH_SET_DESCRIPTION,
    schema: McpAuthSetSchema,
    async func(input): Promise<string> {
      try {
        const store = loadAuthStore();
        const auth: MCPServerAuth = {
          serverName: input.server_name,
          type: input.type,
          credential: input.credential,
          headerName: input.header_name,
          keyPrefix: input.key_prefix,
        };
        store[input.server_name] = auth;
        saveAuthStore(store);
        info('mcp', `Auth configured for ${input.server_name} (${input.type})`);
        return `Authentication configured for "${input.server_name}" (type: ${input.type}).\nCredentials stored in .upup/mcp-auth/credentials.json`;
      } catch (err) {
        return `Auth config error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createMcpAuthGetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'mcp_auth_get',
    description: MCP_AUTH_GET_DESCRIPTION,
    schema: McpAuthGetSchema,
    async func(input): Promise<string> {
      try {
        const store = loadAuthStore();

        if (input.server_name) {
          const auth = store[input.server_name];
          if (!auth) {
            return `No authentication configured for "${input.server_name}".`;
          }
          return formatAuthEntry(auth, true);
        }

        const entries = Object.values(store);
        if (entries.length === 0) {
          return 'No MCP servers have authentication configured.';
        }
        return 'MCP Authentication:\n\n' + entries.map(e => formatAuthEntry(e, true)).join('\n\n');
      } catch (err) {
        return `Auth read error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createMcpAuthClearTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'mcp_auth_clear',
    description: MCP_AUTH_CLEAR_DESCRIPTION,
    schema: McpAuthClearSchema,
    async func(input): Promise<string> {
      try {
        const store = loadAuthStore();
        if (!store[input.server_name]) {
          return `No authentication found for "${input.server_name}".`;
        }
        delete store[input.server_name];
        saveAuthStore(store);
        info('mcp', `Auth cleared for ${input.server_name}`);
        return `Authentication cleared for "${input.server_name}".`;
      } catch (err) {
        return `Auth clear error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function formatAuthEntry(auth: MCPServerAuth, maskCredential: boolean): string {
  const lines = [
    `Server: ${auth.serverName}`,
    `  Type: ${auth.type}`,
  ];
  if (auth.headerName) lines.push(`  Header: ${auth.headerName}`);
  if (auth.keyPrefix) lines.push(`  Prefix: ${auth.keyPrefix}`);
  if (auth.credential) {
    lines.push(`  Credential: ${maskCredential ? mask(auth.credential) : auth.credential}`);
  }
  return lines.join('\n');
}

function mask(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

/**
 * Get auth headers for a server (used by MCP client when connecting).
 */
export function getAuthHeaders(serverName: string): Record<string, string> | null {
  const store = loadAuthStore();
  const auth = store[serverName];
  if (!auth || !auth.credential) return null;

  const headers: Record<string, string> = {};
  const headerName = auth.headerName ?? 'Authorization';
  const prefix = auth.keyPrefix ?? (auth.type === 'bearer' ? 'Bearer ' : auth.type === 'basic' ? 'Basic ' : '');
  headers[headerName] = prefix + auth.credential;
  return headers;
}
