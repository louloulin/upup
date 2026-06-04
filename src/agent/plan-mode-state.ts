/**
 * Plan Mode State Manager
 *
 * Tracks whether the agent is in plan mode and controls tool execution flow.
 * When in plan mode, only plan-related tools are allowed.
 */

import { info, warn } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Plan mode state
 */
export interface PlanModeState {
  /** Whether plan mode is active */
  active: boolean;
  /** Plan ID if in plan mode */
  planId?: string;
  /** Tools that are always allowed during plan mode */
  allowedTools: Set<string>;
}

/**
 * Plan mode configuration
 */
export interface PlanModeConfig {
  /** Tools allowed during plan mode */
  allowedTools?: string[];
}

// ============================================================================
// Default allowed tools during plan mode
// ============================================================================

const DEFAULT_ALLOWED_TOOLS = [
  'enter_plan_mode',
  'exit_plan_mode',
  'add_plan_step',
  'update_plan_step',
  'list_plan_steps',
  'get_plan',
];

// ============================================================================
// Plan Mode State Manager
// ============================================================================

/**
 * Manages plan mode state for the agent loop.
 *
 * When in plan mode:
 * - Only plan-related tools are allowed
 * - Other tools are blocked with a warning message
 * - User must call exit_plan_mode to exit plan mode
 */
export class PlanModeStateManager {
  private state: PlanModeState;
  private readonly config: Required<PlanModeConfig>;

  constructor(config: PlanModeConfig = {}) {
    this.config = {
      allowedTools: config.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
    };
    this.state = {
      active: false,
      allowedTools: new Set(this.config.allowedTools),
    };
  }

  /**
   * Check if plan mode is active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get current plan ID
   */
  getPlanId(): string | undefined {
    return this.state.planId;
  }

  /**
   * Enter plan mode
   */
  enter(planId?: string): void {
    this.state.active = true;
    this.state.planId = planId;
    info('agent', `Entered plan mode (plan: ${planId ?? 'none'})`);
  }

  /**
   * Exit plan mode
   */
  exit(): void {
    const hadPlan = this.state.planId;
    this.state.active = false;
    this.state.planId = undefined;
    info('agent', `Exited plan mode (was: ${hadPlan ?? 'none'})`);
  }

  /**
   * Check if a tool is allowed in the current state
   */
  isToolAllowed(toolName: string): boolean {
    // Always allow if not in plan mode
    if (!this.state.active) {
      return true;
    }

    // Check if tool is in allowed list
    return this.state.allowedTools.has(toolName);
  }

  /**
   * Get blocked tool warning message
   */
  getBlockedMessage(toolName: string): string {
    return `Tool "${toolName}" is blocked during plan mode. ` +
      `Please complete your plan using ${Array.from(this.state.allowedTools).join(', ')} ` +
      `or call exit_plan_mode to exit plan mode.`;
  }

  /**
   * Add a tool to the allowed list
   */
  allowTool(toolName: string): void {
    this.state.allowedTools.add(toolName);
  }

  /**
   * Remove a tool from the allowed list
   */
  disallowTool(toolName: string): void {
    this.state.allowedTools.delete(toolName);
  }

  /**
   * Get current state (for debugging)
   */
  getState(): Readonly<PlanModeState> {
    return { ...this.state };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state.active = false;
    this.state.planId = undefined;
    this.state.allowedTools = new Set(this.config.allowedTools);
  }
}

// ============================================================================
// Singleton for agent loop integration
// ============================================================================

let planModeState: PlanModeStateManager | null = null;

export function getPlanModeState(): PlanModeStateManager {
  if (!planModeState) {
    planModeState = new PlanModeStateManager();
  }
  return planModeState;
}

export function resetPlanModeState(): void {
  planModeState = null;
}

// ============================================================================
// Self-registration with public port registry
// ============================================================================
// Allow packages/commands/ (and any cross-package consumer) to read plan-mode
// state without a fragile 4-level `await import('../../../../src/agent/...')`
// path. Registration is a one-time side effect of importing this module.
import { registerPlanModePort, type PlanModePort } from './agent-port.js';

let registered = false;
function registerSelf(): void {
  if (registered) return;
  registered = true;
  const port: PlanModePort = {
    isActive: () => planModeState?.isActive() ?? false,
    getPlanId: () => planModeState?.getPlanId(),
    enter: (planId: string) => getPlanModeState().enter(planId),
    exit: () => getPlanModeState().exit(),
  };
  registerPlanModePort(port);
}
registerSelf();
