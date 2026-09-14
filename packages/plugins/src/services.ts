/**
 * UpUp Plugin System — Service Lifecycle
 *
 * Manages plugin service startup/shutdown order.
 * Based on OpenClaw's service lifecycle: start in registration order, stop in reverse.
 */

import { info, warn, error } from '../utils/logging/logger.js';
import type { PluginService } from './types.js';

// ============================================================================
// Service Context
// ============================================================================

export interface ServiceContext {
  pluginId: string;
  pluginName: string;
  config: Record<string, unknown>;
  cwd: string;
  stateDir: string;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

// ============================================================================
// Service Manager
// ============================================================================

export class ServiceManager {
  private running: Map<string, { service: PluginService; ctx: ServiceContext }[]> = new Map();
  private pending: Map<string, PluginService[]> = new Map();

  /**
   * Register a service for a plugin
   */
  register(pluginId: string, service: PluginService): void {
    if (!this.pending.has(pluginId)) {
      this.pending.set(pluginId, []);
    }
    this.pending.get(pluginId)!.push(service);
  }

  /**
   * Unregister all services for a plugin
   */
  unregister(pluginId: string): void {
    this.pending.delete(pluginId);
  }

  /**
   * Start all services for a plugin
   */
  async startServices(
    pluginId: string,
    pluginName: string,
    config: Record<string, unknown>,
    cwd: string,
    stateDir: string
  ): Promise<void> {
    const services = this.pending.get(pluginId) ?? [];
    if (services.length === 0) return;

    info('default', `Starting ${services.length} service(s) for plugin: ${pluginName}`);

    const ctx: ServiceContext = {
      pluginId,
      pluginName,
      config,
      cwd,
      stateDir,
      logger: {
        info: (msg) => info('default', `[${pluginName}] ${msg}`),
        warn: (msg) => warn('default', `[${pluginName}] ${msg}`),
        error: (msg) => error('default', `[${pluginName}] ${msg}`),
      },
    };

    const runningServices: { service: PluginService; ctx: ServiceContext }[] = [];

    for (const service of services) {
      try {
        info('default', `Starting service: ${service.name}`);
        await service.start(ctx);
        runningServices.push({ service, ctx });
      } catch (err) {
        warn('default', `Failed to start service ${service.name}: ${(err as Error).message}`);
        // Continue starting other services
      }
    }

    this.running.set(pluginId, runningServices);
  }

  /**
   * Stop all services for a plugin (reverse order)
   */
  async stopServices(pluginId: string): Promise<void> {
    const running = this.running.get(pluginId);
    if (!running || running.length === 0) return;

    info('default', `Stopping ${running.length} service(s) for plugin: ${pluginId}`);

    // Reverse order (OpenClaw pattern)
    const reversed = [...running].toReversed();

    for (const { service, ctx } of reversed) {
      try {
        info('default', `Stopping service: ${service.name}`);
        if (service.stop) {
          await service.stop(ctx);
        }
      } catch (err) {
        warn('default', `Error stopping service ${service.name}: ${(err as Error).message}`);
      }
    }

    this.running.delete(pluginId);
  }

  /**
   * Stop all services for all plugins
   */
  async stopAll(): Promise<void> {
    const pluginIds = [...this.running.keys()];
    for (const pluginId of pluginIds) {
      await this.stopServices(pluginId);
    }
  }

  /**
   * Get running services count
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Check if a plugin has running services
   */
  hasRunning(pluginId: string): boolean {
    return this.running.has(pluginId);
  }
}

// ============================================================================
// Service Manager Singleton
// ============================================================================

let serviceManager: ServiceManager | null = null;

export function getServiceManager(): ServiceManager {
  if (!serviceManager) {
    serviceManager = new ServiceManager();
  }
  return serviceManager;
}

export function resetServiceManager(): void {
  serviceManager = null;
}