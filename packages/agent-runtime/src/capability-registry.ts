/**
 * Capability Registry — Investment Agent Capability Management
 *
 * This module provides a lightweight capability registry for investment-specific
 * capabilities, following the same singleton pattern used by ToolHookExecutor.
 *
 * Capabilities represent investment-specific abilities:
 * - Tool capabilities (which tools can be used)
 * - Data source capabilities (which data providers are available)
 * - Analysis capabilities (which analysis methods are enabled)
 * - Execution capabilities (which actions can be performed)
 */

import { info, warn } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

/**
 * Capability category
 */
export type CapabilityCategory =
  | 'tool'           // Tool execution capabilities
  | 'data-source'    // Data provider capabilities
  | 'analysis'       // Analysis method capabilities
  | 'execution'      // Action/execution capabilities
  | 'monitor'        // Monitoring capabilities;

/**
 * Capability definition
 */
export interface Capability {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the capability */
  description: string;
  /** Category */
  category: CapabilityCategory;
  /** Required permissions */
  permissions: string[];
  /** Dependencies (other capabilities required) */
  dependencies?: string[];
  /** Is capability enabled by default */
  enabled?: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capability check result
 */
export interface CapabilityCheck {
  /** Whether the check passed */
  allowed: boolean;
  /** Reason if denied */
  reason?: string;
  /** Missing permissions */
  missingPermissions?: string[];
}

// ============================================================================
// Registry Implementation
// ============================================================================

/**
 * Lightweight capability registry for investment agent capabilities.
 * Uses singleton pattern consistent with ToolHookExecutor.
 */
export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();
  private permissionMap: Map<string, Set<string>> = new Map(); // permission -> Set<capabilityId>

  constructor() {
    // Register default investment capabilities
    this.registerDefaults();
  }

  /**
   * Register default investment capabilities
   */
  private registerDefaults(): void {
    // Tool capabilities
    this.register({
      id: 'tool:read-market-data',
      name: 'Read Market Data',
      description: 'Read real-time and historical market data',
      category: 'tool',
      permissions: ['market-data:read'],
      enabled: true,
    });

    this.register({
      id: 'tool:read-financials',
      name: 'Read Financial Statements',
      description: 'Read company financial statements and metrics',
      category: 'tool',
      permissions: ['financials:read'],
      enabled: true,
    });

    this.register({
      id: 'tool:read-filings',
      name: 'Read SEC Filings',
      description: 'Read SEC filings (10-K, 10-Q, 8-K)',
      category: 'tool',
      permissions: ['filings:read'],
      enabled: true,
    });

    this.register({
      id: 'tool:analyze-valuation',
      name: 'Analyze Valuation',
      description: 'Perform valuation analysis (DCF, comparables)',
      category: 'analysis',
      permissions: ['valuation:analyze'],
      enabled: true,
    });

    this.register({
      id: 'tool:calculate-risk',
      name: 'Calculate Risk Metrics',
      description: 'Calculate risk metrics (VaR, Sharpe, drawdown)',
      category: 'analysis',
      permissions: ['risk:calculate'],
      enabled: true,
    });

    this.register({
      id: 'tool:manage-portfolio',
      name: 'Manage Portfolio',
      description: 'Add, update, remove portfolio positions',
      category: 'execution',
      permissions: ['portfolio:write'],
      enabled: true,
    });

    this.register({
      id: 'tool:send-notification',
      name: 'Send Notifications',
      description: 'Send alerts and notifications',
      category: 'monitor',
      permissions: ['notification:send'],
      enabled: true,
    });

    this.register({
      id: 'data-source:fmp',
      name: 'FMP Data Provider',
      description: 'Access to FMP (Financial Modeling Prep) data',
      category: 'data-source',
      permissions: ['data-source:fmp'],
      enabled: true,
    });

    this.register({
      id: 'data-source:tushare',
      name: 'Tushare Data Provider',
      description: 'Access to Tushare A-share data',
      category: 'data-source',
      permissions: ['data-source:tushare'],
      enabled: true,
    });

    // Write operations require extra approval
    this.register({
      id: 'tool:write-file',
      name: 'Write Files',
      description: 'Write to filesystem (requires explicit approval)',
      category: 'tool',
      permissions: ['filesystem:write', 'approval:required'],
      enabled: true,
    });

    this.register({
      id: 'tool:execute-bash',
      name: 'Execute Bash Commands',
      description: 'Execute shell commands (requires explicit approval)',
      category: 'tool',
      permissions: ['bash:execute', 'approval:required'],
      enabled: true,
    });
  }

  /**
   * Register a new capability
   */
  register(capability: Capability): void {
    this.capabilities.set(capability.id, capability);

    // Build permission index
    for (const permission of capability.permissions) {
      if (!this.permissionMap.has(permission)) {
        this.permissionMap.set(permission, new Set());
      }
      this.permissionMap.get(permission)!.add(capability.id);
    }

    info('system', `Registered capability: ${capability.id}`);
  }

  /**
   * Unregister a capability
   */
  unregister(id: string): boolean {
    const capability = this.capabilities.get(id);
    if (!capability) return false;

    // Remove from permission index
    for (const permission of capability.permissions) {
      this.permissionMap.get(permission)?.delete(id);
    }

    this.capabilities.delete(id);
    info('system', `Unregistered capability: ${id}`);
    return true;
  }

  /**
   * Get a capability by ID
   */
  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * List all capabilities
   */
  list(): Capability[] {
    return [...this.capabilities.values()];
  }

  /**
   * List capabilities by category
   */
  listByCategory(category: CapabilityCategory): Capability[] {
    return this.list().filter(c => c.category === category);
  }

  /**
   * Check if a capability is allowed for a given set of permissions
   */
  check(capabilityId: string, userPermissions: string[]): CapabilityCheck {
    const capability = this.capabilities.get(capabilityId);

    if (!capability) {
      return {
        allowed: false,
        reason: `Capability not found: ${capabilityId}`,
      };
    }

    if (!capability.enabled) {
      return {
        allowed: false,
        reason: `Capability disabled: ${capabilityId}`,
      };
    }

    // Check dependencies
    if (capability.dependencies) {
      for (const depId of capability.dependencies) {
        const depCapability = this.capabilities.get(depId);
        if (!depCapability?.enabled) {
          return {
            allowed: false,
            reason: `Missing dependency: ${depId}`,
          };
        }
      }
    }

    // Check permissions
    const userPermSet = new Set(userPermissions);
    const missingPermissions = capability.permissions.filter(
      p => !userPermSet.has(p)
    );

    if (missingPermissions.length > 0) {
      return {
        allowed: false,
        reason: `Missing permissions: ${missingPermissions.join(', ')}`,
        missingPermissions,
      };
    }

    return { allowed: true };
  }

  /**
   * Get all capabilities that require a given permission
   */
  getCapabilitiesForPermission(permission: string): Capability[] {
    const capabilityIds = this.permissionMap.get(permission);
    if (!capabilityIds) return [];

    return [...capabilityIds]
      .map(id => this.capabilities.get(id))
      .filter((c): c is Capability => c !== undefined);
  }

  /**
   * Enable or disable a capability
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const capability = this.capabilities.get(id);
    if (!capability) return false;

    capability.enabled = enabled;
    info('system', `Capability ${id} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<CapabilityCategory, number>;
    enabled: number;
    disabled: number;
  } {
    const byCategory: Record<CapabilityCategory, number> = {
      tool: 0,
      'data-source': 0,
      analysis: 0,
      execution: 0,
      monitor: 0,
    };

    let enabled = 0;
    let disabled = 0;

    for (const capability of this.capabilities.values()) {
      byCategory[capability.category]++;
      if (capability.enabled) enabled++;
      else disabled++;
    }

    return {
      total: this.capabilities.size,
      byCategory,
      enabled,
      disabled,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let capabilityRegistry: CapabilityRegistry | null = null;

export function getCapabilityRegistry(): CapabilityRegistry {
  if (!capabilityRegistry) {
    capabilityRegistry = new CapabilityRegistry();
  }
  return capabilityRegistry;
}

export function resetCapabilityRegistry(): void {
  capabilityRegistry = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if a capability is allowed
 */
export function checkCapability(
  capabilityId: string,
  userPermissions: string[] = []
): CapabilityCheck {
  return getCapabilityRegistry().check(capabilityId, userPermissions);
}

/**
 * List all available capabilities
 */
export function listCapabilities(category?: CapabilityCategory): Capability[] {
  const registry = getCapabilityRegistry();
  return category ? registry.listByCategory(category) : registry.list();
}

/**
 * Get default permissions for standard user role
 */
export function getDefaultUserPermissions(): string[] {
  return [
    'market-data:read',
    'financials:read',
    'filings:read',
    'valuation:analyze',
    'risk:calculate',
    'notification:send',
    'data-source:fmp',
    'data-source:tushare',
  ];
}

/**
 * Get permissions required for elevated operations
 */
export function getElevatedPermissions(): string[] {
  return [
    ...getDefaultUserPermissions(),
    'filesystem:write',
    'bash:execute',
    'portfolio:write',
  ];
}
