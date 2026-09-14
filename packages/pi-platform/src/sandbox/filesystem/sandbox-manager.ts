/**
 * Sandbox Manager - Singleton for managing sandbox configuration.
 *
 * Provides centralized access to sandbox settings and status.
 */

import { loadSandboxConfig, type SandboxConfig, type SandboxMode } from './sandbox-config.js';
import { getSandboxRulesManager, type RuleScope } from './sandbox-rules.js';
import { logger } from '@upup/utils/logging';
import { registerSandboxPort } from '../../runtime/pi/agent-port.js';

export class SandboxManager {
  private config: SandboxConfig;
  private static instance: SandboxManager | null = null;

  private constructor() {
    this.config = loadSandboxConfig();
  }

  /**
   * Get the singleton instance of SandboxManager.
   */
  static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  /**
   * Check if sandboxing is currently enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled && this.config.mode !== 'disabled';
  }

  /**
   * Check if auto-allow mode is enabled for bash commands.
   */
  isAutoAllowEnabled(): boolean {
    return this.config.autoAllowBash && this.isEnabled();
  }

  /**
   * Check if unsandboxed commands are allowed.
   */
  isUnsandboxedAllowed(): boolean {
    return this.config.allowUnsandboxedCommands;
  }

  /**
   * Get current sandbox mode.
   */
  getMode(): SandboxMode {
    return this.config.mode;
  }

  /**
   * Get the list of additional allowed directories.
   */
  getAdditionalDirs(): string[] {
    return [...this.config.additionalDirs];
  }

  /**
   * Update sandbox configuration.
   */
  setConfig(config: Partial<SandboxConfig>): void {
    const oldMode = this.config.mode;
    this.config = { ...this.config, ...config };
    logger.debug('tools', `[sandbox] Config updated: mode=${this.config.mode}, enabled=${this.config.enabled}, autoAllow=${this.config.autoAllowBash}`);
    if (oldMode !== this.config.mode) {
      logger.info('tools', `[sandbox] Sandbox mode changed: ${oldMode} → ${this.config.mode}`);
    }
  }

  /**
   * Get current sandbox configuration.
   */
  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }

  /**
   * Reset configuration to defaults.
   */
  reset(): void {
    this.config = loadSandboxConfig();
    logger.debug('tools', '[sandbox] Configuration reset to defaults');
  }

  /**
   * Get a summary of current sandbox status for display.
   */
  getStatusSummary(): string {
    const modeStr = this.config.mode;
    const enabledStr = this.config.enabled ? 'enabled' : 'disabled';
    const autoStr = this.config.autoAllowBash ? 'auto-allow' : 'manual';
    return `Sandbox(${modeStr}, ${enabledStr}, ${autoStr})`;
  }

  /**
   * Check if access is allowed for a path using rule-based evaluation.
   * Requires sandbox to be enabled.
   */
  isPathAllowed(path: string, scope: RuleScope = 'read', tool?: string): boolean {
    if (!this.isEnabled()) {
      return true; // Sandbox disabled, allow all
    }
    const rulesManager = getSandboxRulesManager();
    return rulesManager.isAllowed(path, scope, tool);
  }

  /**
   * Check if a specific path is allowed based on current sandbox mode.
   * This is a simpler check than rule-based evaluation.
   */
  isPathAllowedSimple(path: string): boolean {
    if (!this.isEnabled()) {
      return true;
    }

    // In strict mode, only allow cwd
    if (this.config.mode === 'strict') {
      const cwd = process.cwd();
      return path.startsWith(cwd) || this.isInAdditionalDirs(path);
    }

    // In relaxed mode, allow cwd + additional dirs
    return this.isInAllowedArea(path);
  }

  /**
   * Check if a path is in the allowed area (cwd + additional dirs).
   */
  private isInAllowedArea(path: string): boolean {
    const cwd = process.cwd();
    if (path.startsWith(cwd)) {
      return true;
    }
    return this.isInAdditionalDirs(path);
  }

  /**
   * Check if a path is in additional allowed directories.
   */
  private isInAdditionalDirs(path: string): boolean {
    for (const dir of this.config.additionalDirs) {
      if (dir && path.startsWith(dir)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Run sandbox dependency check and return results.
   */
  async runDependencyCheck(): Promise<import('./sandbox-dependencies.js').SandboxDependencyCheck> {
    const { checkSandboxDependencies } = await import('./sandbox-dependencies.js');
    return await checkSandboxDependencies();
  }
}

// Export singleton accessor
export function getSandboxManager(): SandboxManager {
  return SandboxManager.getInstance();
}

registerSandboxPort({
  getStatus: () => {
    const manager = getSandboxManager();
    return {
      mode: manager.getMode(),
      enabled: manager.isEnabled(),
      autoAllow: manager.isAutoAllowEnabled(),
      additionalDirs: manager.getAdditionalDirs(),
    };
  },
  checkDependencies: () => getSandboxManager().runDependencyCheck(),
});
