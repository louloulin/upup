/**
 * MCP Health Manager
 *
 * Implements MCP server health checking and caching:
 * - Health status tracking
 * - Periodic health checks
 * - Authentication status tracking
 * - Connection state management
 *
 * Reference: Claude Code's mcp-health-cache.json and mcp-needs-auth-cache.json
 */

// ============================================================================
// Types
// ============================================================================

/**
 * MCP health status
 */
export interface McpHealthStatus {
  /** Server name */
  server: string;
  /** Is server healthy */
  healthy: boolean;
  /** Last check timestamp */
  lastCheck: number;
  /** Latency in ms (if healthy) */
  latency?: number;
  /** Error message (if unhealthy) */
  error?: string;
}

/**
 * MCP authentication status
 */
export interface McpAuthStatus {
  /** Server name */
  server: string;
  /** Needs authentication */
  needsAuth: boolean;
  /** Auth type */
  authType?: 'bearer' | 'api-key' | 'oauth';
  /** Last check timestamp */
  lastCheck: number;
  /** Error message (if auth failed) */
  error?: string;
}

/**
 * MCP connection state
 */
export type McpConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * MCP server info
 */
export interface McpServerInfo {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  state: McpConnectionState;
  lastConnected?: number;
  lastError?: string;
}

/**
 * MCP health check configuration
 */
export interface McpHealthConfig {
  /** Health check interval in ms (default: 60000) */
  checkInterval?: number;
  /** Timeout for health check in ms (default: 5000) */
  checkTimeout?: number;
  /** Max consecutive failures before marking unhealthy (default: 3) */
  maxFailures?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHECK_INTERVAL = 60000; // 1 minute
const DEFAULT_CHECK_TIMEOUT = 5000; // 5 seconds
const DEFAULT_MAX_FAILURES = 3;

// ============================================================================
// Health Cache Manager
// ============================================================================

/**
 * MCP Health Manager
 * Manages health status, auth status, and connection states for MCP servers
 */
export class McpHealthManager {
  private healthCache: Map<string, McpHealthStatus> = new Map();
  private authCache: Map<string, McpAuthStatus> = new Map();
  private serverInfo: Map<string, McpServerInfo> = new Map();
  private failureCount: Map<string, number> = new Map();
  private checkInterval: number;
  private checkTimeout: number;
  private maxFailures: number;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: McpHealthConfig = {}) {
    this.checkInterval = config.checkInterval ?? DEFAULT_CHECK_INTERVAL;
    this.checkTimeout = config.checkTimeout ?? DEFAULT_CHECK_TIMEOUT;
    this.maxFailures = config.maxFailures ?? DEFAULT_MAX_FAILURES;
  }

  // ---------------------------------------------------------------------------
  // Health Status Management
  // ---------------------------------------------------------------------------

  /**
   * Update health status for a server
   */
  updateHealthStatus(server: string, status: Omit<McpHealthStatus, 'server'>): void {
    const fullStatus: McpHealthStatus = {
      server,
      ...status,
    };
    this.healthCache.set(server, fullStatus);

    // Update failure count
    if (!status.healthy) {
      const failures = (this.failureCount.get(server) ?? 0) + 1;
      this.failureCount.set(server, failures);
    } else {
      this.failureCount.set(server, 0);
    }

    // Update server info
    const info = this.getServerInfo(server);
    info.state = status.healthy ? 'connected' : 'error';
    if (status.latency) {
      info.lastConnected = Date.now();
    }
    if (status.error) {
      info.lastError = status.error;
    }
  }

  /**
   * Get health status for a server
   */
  getHealthStatus(server: string): McpHealthStatus | undefined {
    return this.healthCache.get(server);
  }

  /**
   * Check if server is healthy
   */
  isHealthy(server: string): boolean {
    const status = this.healthCache.get(server);
    return status?.healthy ?? false;
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses(): McpHealthStatus[] {
    return [...this.healthCache.values()];
  }

  /**
   * Get healthy servers
   */
  getHealthyServers(): string[] {
    return [...this.healthCache.entries()]
      .filter(([, status]) => status.healthy)
      .map(([name]) => name);
  }

  /**
   * Get unhealthy servers
   */
  getUnhealthyServers(): string[] {
    return [...this.healthCache.entries()]
      .filter(([, status]) => !status.healthy)
      .map(([name]) => name);
  }

  /**
   * Get server info
   */
  getServerInfo(server: string): McpServerInfo {
    if (!this.serverInfo.has(server)) {
      this.serverInfo.set(server, {
        name: server,
        command: '',
        args: [],
        state: 'idle',
      });
    }
    return this.serverInfo.get(server)!;
  }

  /**
   * Register a server
   */
  registerServer(server: McpServerInfo): void {
    this.serverInfo.set(server.name, server);
  }

  /**
   * Get all registered servers
   */
  getAllServers(): McpServerInfo[] {
    return [...this.serverInfo.values()];
  }

  // ---------------------------------------------------------------------------
  // Auth Status Management
  // ---------------------------------------------------------------------------

  /**
   * Update auth status for a server
   */
  updateAuthStatus(server: string, status: Omit<McpAuthStatus, 'server'>): void {
    const fullStatus: McpAuthStatus = {
      server,
      ...status,
    };
    this.authCache.set(server, fullStatus);
  }

  /**
   * Get auth status for a server
   */
  getAuthStatus(server: string): McpAuthStatus | undefined {
    return this.authCache.get(server);
  }

  /**
   * Check if server needs auth
   */
  needsAuth(server: string): boolean {
    const status = this.authCache.get(server);
    return status?.needsAuth ?? false;
  }

  /**
   * Get all auth statuses
   */
  getAllAuthStatuses(): McpAuthStatus[] {
    return [...this.authCache.values()];
  }

  // ---------------------------------------------------------------------------
  // Health Check Logic
  // ---------------------------------------------------------------------------

  /**
   * Perform health check on a server
   */
  async checkHealth(server: McpServerInfo): Promise<McpHealthStatus> {
    const start = Date.now();

    try {
      // Check if server process is running
      // In real implementation, this would ping the MCP server
      const isHealthy = await this.performHealthCheck(server);

      return {
        server: server.name,
        healthy: isHealthy,
        lastCheck: Date.now(),
        latency: isHealthy ? Date.now() - start : undefined,
        error: isHealthy ? undefined : 'Health check failed',
      };
    } catch (error) {
      return {
        server: server.name,
        healthy: false,
        lastCheck: Date.now(),
        error: String(error),
      };
    }
  }

  /**
   * Perform actual health check
   * Override this method for custom health check logic
   */
  protected async performHealthCheck(server: McpServerInfo): Promise<boolean> {
    // Default implementation: check if server info exists and state is connected
    return server.state === 'connected';
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.runHealthChecks();
    }, this.checkInterval);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Run health checks on all servers
   */
  async runHealthChecks(): Promise<void> {
    const servers = this.getAllServers();

    for (const server of servers) {
      const status = await this.checkHealth(server);
      this.updateHealthStatus(server.name, status);
    }
  }

  // ---------------------------------------------------------------------------
  // Cache Persistence
  // ---------------------------------------------------------------------------

  /**
   * Export health cache to JSON format
   */
  exportHealthCache(): McpHealthStatus[] {
    return this.getAllHealthStatuses();
  }

  /**
   * Export auth cache to JSON format
   */
  exportAuthCache(): McpAuthStatus[] {
    return this.getAllAuthStatuses();
  }

  /**
   * Import health cache from JSON
   */
  importHealthCache(cache: McpHealthStatus[]): void {
    for (const status of cache) {
      this.healthCache.set(status.server, status);
    }
  }

  /**
   * Import auth cache from JSON
   */
  importAuthCache(cache: McpAuthStatus[]): void {
    for (const status of cache) {
      this.authCache.set(status.server, status);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clear all caches
   */
  clear(): void {
    this.healthCache.clear();
    this.authCache.clear();
    this.serverInfo.clear();
    this.failureCount.clear();
    this.stopHealthChecks();
  }

  /**
   * Remove server from cache
   */
  removeServer(server: string): void {
    this.healthCache.delete(server);
    this.authCache.delete(server);
    this.serverInfo.delete(server);
    this.failureCount.delete(server);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalServers: number;
    healthyCount: number;
    unhealthyCount: number;
    needsAuthCount: number;
    totalFailureCount: number;
  } {
    const healthStatuses = this.getAllHealthStatuses();
    const authStatuses = this.getAllAuthStatuses();

    return {
      totalServers: this.serverInfo.size,
      healthyCount: healthStatuses.filter(s => s.healthy).length,
      unhealthyCount: healthStatuses.filter(s => !s.healthy).length,
      needsAuthCount: authStatuses.filter(s => s.needsAuth).length,
      totalFailureCount: [...this.failureCount.values()].reduce((a, b) => a + b, 0),
    };
  }
}

// ============================================================================
// Global Manager Instance
// ============================================================================

let globalManager: McpHealthManager | null = null;

export function getMcpHealthManager(): McpHealthManager {
  if (!globalManager) {
    globalManager = new McpHealthManager();
    globalManager.startHealthChecks();
  }
  return globalManager;
}

export function resetMcpHealthManager(): void {
  if (globalManager) {
    globalManager.clear();
    globalManager = null;
  }
}

// ============================================================================
// Cache File Operations
// ============================================================================

/**
 * Load health cache from file
 */
export async function loadHealthCacheFromFile(
  filePath: string,
  manager: McpHealthManager
): Promise<void> {
  const { readFileSync, existsSync } = await import('fs');

  if (!existsSync(filePath)) return;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const cache = JSON.parse(content) as McpHealthStatus[];
    manager.importHealthCache(cache);
  } catch {
    // Invalid cache file, ignore
  }
}

/**
 * Save health cache to file
 */
export async function saveHealthCacheToFile(
  filePath: string,
  manager: McpHealthManager
): Promise<void> {
  const fs = await import('fs');
  const { writeFileSync, mkdirSync } = fs;
  const { dirname } = await import('path');

  const dir = dirname(filePath);
  if (!fs.existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const cache = manager.exportHealthCache();
  writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Load auth cache from file
 */
export async function loadAuthCacheFromFile(
  filePath: string,
  manager: McpHealthManager
): Promise<void> {
  const fs = await import('fs');
  const { readFileSync } = fs;
  const { existsSync } = fs;

  if (!existsSync(filePath)) return;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const cache = JSON.parse(content) as McpAuthStatus[];
    manager.importAuthCache(cache);
  } catch {
    // Invalid cache file, ignore
  }
}

/**
 * Save auth cache to file
 */
export async function saveAuthCacheToFile(
  filePath: string,
  manager: McpHealthManager
): Promise<void> {
  const fs = await import('fs');
  const { writeFileSync, mkdirSync } = fs;
  const { dirname } = await import('path');

  const dir = dirname(filePath);
  if (!fs.existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const cache = manager.exportAuthCache();
  writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}