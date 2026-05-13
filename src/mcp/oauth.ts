/**
 * MCP OAuth Utilities
 *
 * OAuth authentication helpers for MCP servers.
 * Based on loucode's oauthPort.ts and auth.ts implementation.
 *
 * Key features:
 * - Redirect URI building (RFC 8252 compliant)
 * - Available port finding for OAuth callbacks
 * - Token storage interface (stub for implementation)
 */

import { createServer } from 'http';

// Platform-specific port ranges
const REDIRECT_PORT_RANGE_MACOS = { min: 49152, max: 65535 };
const REDIRECT_PORT_RANGE_WINDOWS = { min: 39152, max: 49151 };
const REDIRECT_PORT_RANGE_LINUX = { min: 49152, max: 65535 };
const REDIRECT_PORT_FALLBACK = 3118;

/**
 * Get redirect port range for current platform
 */
function getRedirectPortRange(): { min: number; max: number } {
  const platform = process.platform;

  if (platform === 'win32') {
    return REDIRECT_PORT_RANGE_WINDOWS;
  }
  if (platform === 'darwin') {
    return REDIRECT_PORT_RANGE_MACOS;
  }
  return REDIRECT_PORT_RANGE_LINUX;
}

/**
 * Build OAuth redirect URI for localhost callback
 *
 * RFC 8252 Section 7.3: Loopback redirect URIs match any port.
 *
 * @param port - Port number (default: 3118)
 * @returns Redirect URI string
 */
export function buildRedirectUri(port = REDIRECT_PORT_FALLBACK): string {
  return `http://localhost:${port}/callback`;
}

/**
 * Get configured callback port from environment
 */
export function getMcpOAuthCallbackPort(): number | undefined {
  const port = parseInt(process.env.MCP_OAUTH_CALLBACK_PORT || '', 10);
  return port > 0 ? port : undefined;
}

/**
 * Find an available port for OAuth redirect
 *
 * Uses random selection within platform-specific ranges for better security.
 *
 * @returns Available port number
 * @throws Error if no ports available
 */
export async function findAvailablePort(): Promise<number> {
  // First, try the configured port if specified
  const configuredPort = getMcpOAuthCallbackPort();
  if (configuredPort) {
    try {
      await testPort(configuredPort);
      return configuredPort;
    } catch {
      // Port not available, continue with random selection
    }
  }

  const range = getRedirectPortRange();
  const { min, max } = range;
  const rangeSize = max - min + 1;
  const maxAttempts = Math.min(rangeSize, 100);

  // Try random ports first
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = min + Math.floor(Math.random() * rangeSize);

    try {
      await testPort(port);
      return port;
    } catch {
      // Port in use, try another
      continue;
    }
  }

  // Fallback to fixed port
  try {
    await testPort(REDIRECT_PORT_FALLBACK);
    return REDIRECT_PORT_FALLBACK;
  } catch {
    throw new Error('No available ports for OAuth redirect');
  }
}

/**
 * Test if a port is available
 */
async function testPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, () => {
      server.close(() => resolve());
    });
  });
}

// ============================================================================
// OAuth Token Storage Interface
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
}

export interface TokenStorage {
  get(serverName: string): Promise<OAuthTokens | null>;
  set(serverName: string, tokens: OAuthTokens): Promise<void>;
  delete(serverName: string): Promise<void>;
}

/**
 * Simple in-memory token storage (for development/testing)
 * Production should use secure storage (keychain, etc.)
 */
export class InMemoryTokenStorage implements TokenStorage {
  private tokens = new Map<string, OAuthTokens>();

  async get(serverName: string): Promise<OAuthTokens | null> {
    return this.tokens.get(serverName) || null;
  }

  async set(serverName: string, tokens: OAuthTokens): Promise<void> {
    this.tokens.set(serverName, tokens);
  }

  async delete(serverName: string): Promise<void> {
    this.tokens.delete(serverName);
  }
}

// Default token storage instance
export const defaultTokenStorage = new InMemoryTokenStorage();

/**
 * Check if tokens are expired
 *
 * @param tokens - OAuth tokens
 * @param clockSkewMs - Clock skew tolerance in ms (default: 60 seconds)
 * @returns True if expired
 */
export function isTokenExpired(
  tokens: OAuthTokens,
  clockSkewMs = 60000
): boolean {
  if (!tokens.expiresAt) {
    return false;
  }
  return Date.now() > tokens.expiresAt - clockSkewMs;
}

// ============================================================================
// OAuth Server Metadata Discovery
// ============================================================================

export interface OAuthServerMetadata {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuer?: string;
  scopesSupported?: string[];
}

/**
 * Discover OAuth server metadata via RFC 8414 / RFC 9728
 *
 * @param issuer - OAuth issuer URL
 * @returns Server metadata
 */
export async function discoverOAuthServerMetadata(
  issuer: string
): Promise<OAuthServerMetadata | null> {
  try {
    const wellKnownUrl = new URL('/.well-known/oauth-authorization-server', issuer);
    const response = await fetch(wellKnownUrl.toString());

    if (!response.ok) {
      return null;
    }

    const metadata = await response.json();
    return {
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      issuer: metadata.issuer,
      scopesSupported: metadata.scopes_supported,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// PKCE Helpers
// ============================================================================

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
export function generateCodeChallenge(verifier: string): string {
  const { createHash } = require('crypto');
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}