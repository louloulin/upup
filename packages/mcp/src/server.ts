/**
 * MCP Server - Server lifecycle and process management
 *
 * Provides:
 * - Server startup/shutdown management
 * - Graceful shutdown with signal escalation (SIGINT -> SIGTERM -> SIGKILL)
 * - Server health monitoring
 * - Reconnection logic for remote servers
 *
 * Based on loucode's MCP client.ts implementation.
 */

import { ChildProcess, spawn, execSync } from 'child_process';
import { EventEmitter } from 'events';
import { info, warn, error as logError } from '@upup/utils/logging';
import type {
  McpServerConfig,
  MCPServerState,
  Transport,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const SHUTDOWN_TIMEOUT_MS = 500; // Total timeout for graceful shutdown
const SIGINT_GRACE_MS = 100;
const SIGTERM_GRACE_MS = 400;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================================
// Types
// ============================================================================

/**
 * MCP server instance
 */
export interface MCPServerInstance {
  /** Server name */
  name: string;
  /** Server configuration */
  config: McpServerConfig;
  /** Child process (for stdio servers) */
  process?: ChildProcess;
  /** Connection state */
  state: MCPServerState;
  /** Error message if any */
  error?: string;
  /** Last connected timestamp */
  lastConnected?: number;
  /** Reconnection attempts */
  reconnectAttempts: number;
}

/**
 * Server event types
 */
export type MCPServerEvent =
  | { type: 'stateChanged'; name: string; state: MCPServerState; error?: string }
  | { type: 'toolsChanged'; name: string }
  | { type: 'resourcesChanged'; name: string }
  | { type: 'error'; name: string; error: string };

// ============================================================================
// MCPServerManager
// ============================================================================

/**
 * MCP Server Manager
 *
 * Manages the lifecycle of MCP servers including:
 * - Starting/stopping servers
 * - Graceful shutdown with signal escalation
 * - Reconnection logic for remote servers
 * - Health monitoring
 */
export class MCPServerManager extends EventEmitter {
  private servers: Map<string, MCPServerInstance> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000;

  /**
   * Start an MCP server
   */
  async startServer(name: string, config: McpServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      warn('mcp', `Server ${name} already running`);
      return;
    }

    info('mcp', `Starting server: ${name}`);

    const instance: MCPServerInstance = {
      name,
      config,
      state: 'disconnected',
      reconnectAttempts: 0,
    };

    this.servers.set(name, instance);
    this.updateState(name, 'connecting');

    try {
      if (config.type === 'stdio' && config.command) {
        await this.startStdioServer(instance);
      } else if ((config.type === 'sse' || config.type === 'http') && config.url) {
        // Remote servers are managed by MCPClientManager
        // This just tracks the state
        this.updateState(name, 'connected');
        instance.lastConnected = Date.now();
      } else {
        throw new Error(`Unsupported config type for ${name}`);
      }

      this.emit('stateChanged', { type: 'stateChanged', name, state: 'connected' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateState(name, 'error', message);
      this.emit('stateChanged', { type: 'stateChanged', name, state: 'error', error: message });
      throw err;
    }
  }

  /**
   * Start a stdio-based MCP server (child process)
   */
  private async startStdioServer(instance: MCPServerInstance): Promise<void> {
    const { name, config } = instance;
    const stdioConfig = config as import('./types').McpStdioServerConfig;

    // Build environment
    const env = this.buildProcessEnv(stdioConfig.env);

    // Spawn child process
    const child = spawn(stdioConfig.command, stdioConfig.args || [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    instance.process = child;

    // Handle stderr
    let stderrBuffer = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      // Cap stderr at 64MB
      if (stderrBuffer.length > 64 * 1024 * 1024) {
        stderrBuffer = stderrBuffer.slice(-1024 * 1024);
      }
    });

    // Handle exit
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      child.on('spawn', () => {
        clearTimeout(timeout);
        this.updateState(name, 'connected');
        instance.lastConnected = Date.now();
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          const stderr = stderrBuffer.slice(-1000);
          logError('mcp', `Server ${name} exited with code ${code}: ${stderr}`);
        }
      });
    });
  }

  /**
   * Build environment variables for child process
   */
  private buildProcessEnv(configEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Add/override with config env
    if (configEnv) {
      for (const [key, value] of Object.entries(configEnv)) {
        env[key] = value;
      }
    }

    return env;
  }

  /**
   * Stop an MCP server with graceful shutdown
   */
  async stopServer(name: string): Promise<void> {
    const instance = this.servers.get(name);
    if (!instance) {
      warn('mcp', `Server ${name} not found`);
      return;
    }

    info('mcp', `Stopping server: ${name}`);
    this.updateState(name, 'disconnected');

    if (instance.process) {
      await this.gracefulShutdown(instance.process);
    }

    this.servers.delete(name);
    this.emit('stateChanged', { type: 'stateChanged', name, state: 'disconnected' });
  }

  /**
   * Graceful shutdown with signal escalation
   *
   * SIGINT -> SIGTERM -> SIGKILL
   * 100ms -> 400ms -> kill
   */
  private async gracefulShutdown(process: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      const pid = process.pid;
      if (!pid) {
        resolve();
        return;
      }

      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const checkAndKill = () => {
        try {
          process.kill('SIGTERM'); // Attempt graceful shutdown
          return true;
        } catch {
          return false;
        }
      };

      const escalate = () => {
        if (!checkAndKill()) {
          cleanup();
          return;
        }

        // Try SIGTERM
        try {
          process.kill('SIGTERM');
        } catch {}

        setTimeout(() => {
          if (!checkAndKill()) {
            cleanup();
            return;
          }

          // SIGKILL
          try {
            process.kill('SIGKILL');
          } catch {}

          cleanup();
        }, SIGTERM_GRACE_MS);
      };

      // Start with SIGINT
      try {
        process.kill('SIGINT');
      } catch {
        cleanup();
        return;
      }

      setTimeout(escalate, SIGINT_GRACE_MS);

      // Watchdog
      setTimeout(cleanup, SHUTDOWN_TIMEOUT_MS);
    });
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const names = Array.from(this.servers.keys());
    await Promise.all(names.map(name => this.stopServer(name)));
  }

  /**
   * Update server state
   */
  private updateState(name: string, state: MCPServerState, error?: string): void {
    const instance = this.servers.get(name);
    if (instance) {
      instance.state = state;
      instance.error = error;
    }
  }

  /**
   * Get server instance
   */
  getServer(name: string): MCPServerInstance | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all server instances
   */
  getAllServers(): MCPServerInstance[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get servers by state
   */
  getServersByState(state: MCPServerState): MCPServerInstance[] {
    return this.getAllServers().filter(s => s.state === state);
  }

  /**
   * Get process ID for a stdio server
   */
  getServerPid(name: string): number | undefined {
    const instance = this.servers.get(name);
    return instance?.process?.pid;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect(name: string): void {
    const instance = this.servers.get(name);
    if (!instance) return;

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, instance.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    );

    if (instance.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.updateState(name, 'error', 'Max reconnection attempts reached');
      return;
    }

    instance.reconnectAttempts++;
    info('mcp', `Scheduling reconnect for ${name} in ${delay}ms (attempt ${instance.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.startServer(name, instance.config);
      } catch (err) {
        this.scheduleReconnect(name);
      }
    }, delay);
  }

  /**
   * Start health monitoring for all servers
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      for (const instance of this.servers.values()) {
        this.checkServerHealth(instance);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check health of a server
   */
  private checkServerHealth(instance: MCPServerInstance): void {
    if (instance.config.type === 'stdio' && instance.process?.pid) {
      try {
        process.kill(instance.process.pid, 0);
      } catch {
        // Process died
        this.updateState(instance.name, 'error', 'Process died unexpectedly');
        this.emit('stateChanged', {
          type: 'stateChanged',
          name: instance.name,
          state: 'error',
          error: 'Process died unexpectedly'
        });

        // Schedule reconnect for stdio servers (if configured)
        if ((instance.config as import('./types').McpStdioServerConfig).autoConnect) {
          this.scheduleReconnect(instance.name);
        }
      }
    }
  }

  /**
   * Restart a server
   */
  async restartServer(name: string): Promise<void> {
    const instance = this.servers.get(name);
    if (!instance) {
      throw new Error(`Server ${name} not found`);
    }

    await this.stopServer(name);
    await this.startServer(name, instance.config);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default server manager instance
 */
export const defaultMCPServerManager = new MCPServerManager();