/**
 * Backend Health Check - 后端健康检查增强
 * 
 * 提供后端可用性、性能、状态监控
 * 支持自动故障转移和恢复通知
 */

import type { Backend, BackendType } from './index.js';
import { getBackendRegistry, type BackendRegistry } from './index.js';
import { info, warn, error as logError } from '@upup/utils/logging/logger';

export interface HealthCheckResult {
  backendType: BackendType;
  available: boolean;
  healthy: boolean;
  latencyMs: number;
  error?: string;
  lastCheck: number;
  consecutiveFailures: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  maxFailures: number;
  enableAutoRecovery: boolean;
  notifyOnStatusChange: boolean;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  enabled: true,
  intervalMs: 30000,
  timeoutMs: 5000,
  maxFailures: 3,
  enableAutoRecovery: true,
  notifyOnStatusChange: true,
};

export class BackendHealthChecker {
  private static instance: BackendHealthChecker;
  private config: HealthCheckConfig;
  private healthResults: Map<BackendType, HealthCheckResult> = new Map();
  private checkInterval?: ReturnType<typeof setInterval>;
  private listeners: Array<(result: HealthCheckResult) => void> = [];
  private registry: BackendRegistry | null = null;

  private constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<HealthCheckConfig>): BackendHealthChecker {
    if (!BackendHealthChecker.instance) {
      BackendHealthChecker.instance = new BackendHealthChecker(config);
    }
    return BackendHealthChecker.instance;
  }

  /**
   * Set registry reference
   */
  setRegistry(registry: BackendRegistry): void {
    this.registry = registry;
  }

  /**
   * Start health checks
   */
  start(): void {
    if (this.checkInterval) return;
    
    info('health-check', 'Starting backend health checks');
    this.runAllChecks();
    
    this.checkInterval = setInterval(() => {
      this.runAllChecks();
    }, this.config.intervalMs);
  }

  /**
   * Stop health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    info('health-check', 'Stopped backend health checks');
  }

  /**
   * Run health check on all backends
   */
  async runAllChecks(): Promise<Map<BackendType, HealthCheckResult>> {
    const results = new Map<BackendType, HealthCheckResult>();
    
    if (!this.registry) {
      this.registry = getBackendRegistry();
    }

    const backends = this.registry.getAll();
    
    for (const backend of backends) {
      const result = await this.checkBackend(backend);
      results.set(backend.type, result);
      this.healthResults.set(backend.type, result);
    }

    return results;
  }

  /**
   * Check a single backend
   */
  async checkBackend(backend: Backend): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let available = false;
    let healthy = false;
    let error: string | undefined;

    try {
      // Check availability
      available = backend.isAvailable();
      
      if (!available) {
        error = 'Backend not available';
      } else {
        // Try to list active agents as a health check
        await backend.listActive();
        healthy = true;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - startTime;
    
    const previousResult = this.healthResults.get(backend.type);
    const previousFailures = previousResult?.consecutiveFailures || 0;
    
    let consecutiveFailures = previousFailures;
    if (!healthy) {
      consecutiveFailures++;
    } else if (previousFailures > 0) {
      consecutiveFailures = 0; // Reset on success
    }

    const result: HealthCheckResult = {
      backendType: backend.type,
      available,
      healthy,
      latencyMs,
      error,
      lastCheck: Date.now(),
      consecutiveFailures,
    };

    // Notify on status change
    if (this.config.notifyOnStatusChange && previousResult) {
      if (previousResult.healthy !== healthy || previousResult.available !== available) {
        this.notifyListeners(result);
      }
    }

    return result;
  }

  /**
   * Get health status for a backend
   */
  getHealth(backendType: BackendType): HealthCheckResult | undefined {
    return this.healthResults.get(backendType);
  }

  /**
   * Get all health statuses
   */
  getAllHealth(): Map<BackendType, HealthCheckResult> {
    return new Map(this.healthResults);
  }

  /**
   * Get best available backend
   */
  getBestAvailableBackend(): { type: BackendType; backend: Backend } | null {
    if (!this.registry) return null;

    const backends = this.registry.getAvailable();
    if (backends.length === 0) return null;

    let best: { type: BackendType; backend: Backend; latency: number } | null = null;

    for (const backend of backends) {
      const health = this.healthResults.get(backend.type);
      if (health?.healthy) {
        if (!best || health.latencyMs < best.latency) {
          best = {
            type: backend.type,
            backend,
            latency: health.latencyMs,
          };
        }
      }
    }

    return best ? { type: best.type, backend: best.backend } : null;
  }

  /**
   * Get unhealthy backends
   */
  getUnhealthyBackends(): BackendType[] {
    const unhealthy: BackendType[] = [];
    
    for (const [type, result] of this.healthResults.entries()) {
      if (!result.healthy || !result.available) {
        unhealthy.push(type);
      }
    }

    return unhealthy;
  }

  /**
   * Check if any backend is available
   */
  hasAvailableBackend(): boolean {
    for (const result of this.healthResults.values()) {
      if (result.healthy && result.available) {
        return true;
      }
    }
    // Also check registry directly
    const registry = getBackendRegistry();
    return registry.getAvailable().length > 0;
  }

  /**
   * Add health check listener
   */
  addListener(listener: (result: HealthCheckResult) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify listeners
   */
  private notifyListeners(result: HealthCheckResult): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (err) {
        logError('health-check', 'Listener error', err instanceof Error ? err : undefined);
      }
    }
  }

  /**
   * Generate health report
   */
  generateReport(): string {
    const lines = [
      '',
      '=== Backend Health Report ===',
      '',
      'Backend Status:',
    ];

    for (const [type, result] of this.healthResults.entries()) {
      const status = result.healthy ? '✅' : result.available ? '⚠️' : '❌';
      const failureInfo = result.consecutiveFailures > 0 
        ? ` (${result.consecutiveFailures} failures)` 
        : '';
      
      lines.push(`  ${status} ${type}: latency=${result.latencyMs}ms${failureInfo}`);
      if (result.error) {
        lines.push(`     Error: ${result.error}`);
      }
    }

    const healthy = Array.from(this.healthResults.values()).filter(r => r.healthy).length;
    const total = this.healthResults.size;
    
    lines.push('');
    lines.push(`Overall: ${healthy}/${total} healthy`);

    return lines.join('\n');
  }
}

/**
 * Get health checker instance
 */
export function getBackendHealthChecker(): BackendHealthChecker {
  return BackendHealthChecker.getInstance();
}
