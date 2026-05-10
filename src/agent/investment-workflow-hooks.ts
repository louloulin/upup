/**
 * Investment Workflow Hooks — Investment-specific workflow automation
 *
 * Provides investment-specific hooks for workflow automation:
 * - Pre/Post research hooks
 * - Decision hooks
 * - Alert hooks
 * - Review hooks
 *
 * This extends the base ToolHookExecutor with investment-specific events.
 */

import { info, warn, error } from '../utils/logging/logger.js';
import { getCapabilityRegistry, checkCapability, type CapabilityCheck } from './capability-registry.js';

// ============================================================================
// Hook Event Types
// ============================================================================

/**
 * Investment-specific hook events
 */
export type InvestmentHookEvent =
  // Research lifecycle
  | 'PreResearch'
  | 'PostResearch'
  | 'ResearchComplete'
  // Decision hooks
  | 'PreDecision'
  | 'PostDecision'
  | 'DecisionRejected'
  // Alert hooks
  | 'AlertTriggered'
  | 'AlertAcknowledged'
  | 'AlertEscalated'
  // Review hooks
  | 'ReviewScheduled'
  | 'ReviewComplete'
  // Portfolio hooks
  | 'PositionOpened'
  | 'PositionClosed'
  | 'PositionModified'
  // Risk hooks
  | 'RiskThresholdExceeded'
  | 'RiskAssessmentComplete'
  // Notification hooks
  | 'NotificationPending'
  | 'NotificationSent';

/**
 * Investment hook parameters
 */
export interface PreResearchParams {
  query: string;
  tickers?: string[];
  depth?: 'quick' | 'standard' | 'deep';
  context?: Record<string, unknown>;
}

export interface PostResearchParams {
  query: string;
  tickers?: string[];
  findings: ResearchFinding[];
  duration: number;
  confidence: number;
}

export interface ResearchFinding {
  type: 'positive' | 'negative' | 'neutral' | 'warning';
  category: string;
  title: string;
  description: string;
  evidence?: string[];
  source?: string;
}

export interface PreDecisionParams {
  decision: 'buy' | 'sell' | 'hold' | 'watch';
  ticker: string;
  price?: number;
  quantity?: number;
  rationale: string;
  riskAssessment?: string;
}

export interface PostDecisionParams extends PreDecisionParams {
  approved: boolean;
  approvalReason?: string;
  alternativeViews?: string[];
}

export interface AlertParams {
  alertId: string;
  severity: 'info' | 'warning' | 'critical';
  ticker?: string;
  title: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PositionParams {
  ticker: string;
  positionId?: string;
  action: 'open' | 'close' | 'modify' | 'adjust';
  quantity?: number;
  price?: number;
  entryPrice?: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
}

// ============================================================================
// Hook Definition
// ============================================================================

export interface InvestmentHookDefinition {
  id: string;
  name: string;
  event: InvestmentHookEvent;
  type: 'filter' | 'transform' | 'notify' | 'log' | 'approve';
  handler: InvestmentHookHandler;
  enabled?: boolean;
  priority?: number;
  description?: string;
}

export type InvestmentHookHandler = (
  params: unknown,
  context?: InvestmentHookContext
) => Promise<InvestmentHookOutput>;

export interface InvestmentHookContext {
  sessionId?: string;
  userId?: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface InvestmentHookOutput {
  /** Continue with the action */
  continue?: boolean;
  /** Modified parameters (for transform hooks) */
  modifiedParams?: Record<string, unknown>;
  /** Alert to send */
  alert?: AlertParams;
  /** Approval decision */
  decision?: 'approve' | 'reject' | 'ask';
  /** Reason for decision */
  reason?: string;
  /** Log message */
  log?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Investment Workflow Hook Executor
// ============================================================================

export class InvestmentWorkflowHooks {
  private hooks: Map<InvestmentHookEvent, InvestmentHookDefinition[]> = new Map();
  private globalContext: Partial<InvestmentHookContext> = {};

  constructor() {
    // Initialize hook arrays for all event types
    const events: InvestmentHookEvent[] = [
      'PreResearch', 'PostResearch', 'ResearchComplete',
      'PreDecision', 'PostDecision', 'DecisionRejected',
      'AlertTriggered', 'AlertAcknowledged', 'AlertEscalated',
      'ReviewScheduled', 'ReviewComplete',
      'PositionOpened', 'PositionClosed', 'PositionModified',
      'RiskThresholdExceeded', 'RiskAssessmentComplete',
      'NotificationPending', 'NotificationSent',
    ];

    for (const event of events) {
      this.hooks.set(event, []);
    }

    // Register default hooks
    this.registerDefaults();
  }

  /**
   * Register default investment hooks
   */
  private registerDefaults(): void {
    // Risk threshold hook - log when risk exceeds threshold
    this.register({
      id: 'risk-threshold-logger',
      name: 'Risk Threshold Logger',
      event: 'RiskThresholdExceeded',
      type: 'log',
      handler: async (params: unknown) => {
        const p = params as { ticker?: string; risk: string; level: string };
        info('agent', `Risk threshold exceeded: ${p.ticker || 'unknown'} - ${p.risk} (${p.level})`);
        return { continue: true };
      },
    });

    // Pre-decision capability check hook
    this.register({
      id: 'pre-decision-capability-check',
      name: 'Pre-Decision Capability Check',
      event: 'PreDecision',
      type: 'approve',
      handler: async (params: unknown): Promise<InvestmentHookOutput> => {
        const p = params as PreDecisionParams;
        const registry = getCapabilityRegistry();

        // Check if user has portfolio write permission for buy/sell decisions
        if (p.decision === 'buy' || p.decision === 'sell') {
          const check = checkCapability('tool:manage-portfolio', []);
          if (!check.allowed) {
            return {
              continue: false,
              decision: 'reject',
              reason: 'Portfolio management requires elevated permissions',
              alert: {
                alertId: `perm-${Date.now()}`,
                severity: 'warning',
                ticker: p.ticker,
                title: 'Permission Required',
                message: 'User does not have portfolio:write permission',
                timestamp: Date.now(),
              },
            };
          }
        }

        return { continue: true, decision: 'approve' };
      },
    });

    // Alert logger hook
    this.register({
      id: 'alert-logger',
      name: 'Alert Logger',
      event: 'AlertTriggered',
      type: 'log',
      handler: async (params: unknown): Promise<InvestmentHookOutput> => {
        const p = params as AlertParams;
        const severity = p.severity === 'critical' ? 'error' : p.severity === 'warning' ? 'warn' : 'info';
        info('agent', `[${p.severity.toUpperCase()}] ${p.ticker || ''}: ${p.title} - ${p.message}`);
        return { continue: true };
      },
    });

    // Research logging hook
    this.register({
      id: 'research-logger',
      name: 'Research Logger',
      event: 'PostResearch',
      type: 'log',
      handler: async (params: unknown): Promise<InvestmentHookOutput> => {
        const p = params as PostResearchParams;
        info('agent', `Research complete: ${p.query} (${p.findings.length} findings, ${p.duration}ms, ${p.confidence}% confidence)`);
        return { continue: true };
      },
    });
  }

  /**
   * Set global context
   */
  setGlobalContext(context: Partial<InvestmentHookContext>): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Register a hook
   */
  register(hook: InvestmentHookDefinition): void {
    const hooks = this.hooks.get(hook.event) ?? [];
    hooks.push(hook);
    hooks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    this.hooks.set(hook.event, hooks);
    info('agent', `Registered hook: ${hook.name} for ${hook.event}`);
  }

  /**
   * Unregister a hook by ID
   */
  unregister(id: string): boolean {
    for (const [event, hooks] of this.hooks) {
      const index = hooks.findIndex(h => h.id === id);
      if (index !== -1) {
        hooks.splice(index, 1);
        info('agent', `Unregistered hook: ${id}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get hooks for an event
   */
  getHooks(event: InvestmentHookEvent): InvestmentHookDefinition[] {
    return this.hooks.get(event) ?? [];
  }

  /**
   * Execute hooks for an event
   */
  async executeHooks<T>(
    event: InvestmentHookEvent,
    params: T,
    additionalContext?: Partial<InvestmentHookContext>
  ): Promise<InvestmentHookOutput> {
    const hooks = this.getHooks(event);
    const context: InvestmentHookContext = {
      sessionId: this.globalContext.sessionId,
      userId: this.globalContext.userId,
      timestamp: Date.now(),
      ...additionalContext,
    };

    let output: InvestmentHookOutput = { continue: true };

    for (const hook of hooks) {
      if (hook.enabled === false) continue;

      try {
        const hookOutput = await hook.handler(params, context);

        // Merge output
        output = {
          ...output,
          ...hookOutput,
        };

        // If hook says stop, stop processing
        if (hookOutput.continue === false) {
          break;
        }
      } catch (err) {
        error('agent', `Hook ${hook.name} failed: ${err}`);
      }
    }

    return output;
  }

  /**
   * Check if all hooks allow continuation
   */
  async checkAllowance<T>(
    event: InvestmentHookEvent,
    params: T
  ): Promise<{ allowed: boolean; reason?: string }> {
    const output = await this.executeHooks(event, params);
    return {
      allowed: output.continue !== false,
      reason: output.reason,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let workflowHooks: InvestmentWorkflowHooks | null = null;

export function getInvestmentWorkflowHooks(): InvestmentWorkflowHooks {
  if (!workflowHooks) {
    workflowHooks = new InvestmentWorkflowHooks();
  }
  return workflowHooks;
}

export function resetInvestmentWorkflowHooks(): void {
  workflowHooks = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Execute pre-research hooks
 */
export async function executePreResearchHooks(params: PreResearchParams): Promise<InvestmentHookOutput> {
  return getInvestmentWorkflowHooks().executeHooks('PreResearch', params);
}

/**
 * Execute post-research hooks
 */
export async function executePostResearchHooks(params: PostResearchParams): Promise<InvestmentHookOutput> {
  return getInvestmentWorkflowHooks().executeHooks('PostResearch', params);
}

/**
 * Execute pre-decision hooks
 */
export async function executePreDecisionHooks(params: PreDecisionParams): Promise<InvestmentHookOutput> {
  return getInvestmentWorkflowHooks().executeHooks('PreDecision', params);
}

/**
 * Execute post-decision hooks
 */
export async function executePostDecisionHooks(params: PostDecisionParams): Promise<InvestmentHookOutput> {
  return getInvestmentWorkflowHooks().executeHooks('PostDecision', params);
}

/**
 * Execute alert hooks
 */
export async function executeAlertHooks(params: AlertParams): Promise<InvestmentHookOutput> {
  return getInvestmentWorkflowHooks().executeHooks('AlertTriggered', params);
}

/**
 * Execute position hooks
 */
export async function executePositionHooks(params: PositionParams): Promise<InvestmentHookOutput> {
  const event = params.action === 'open'
    ? 'PositionOpened'
    : params.action === 'close'
    ? 'PositionClosed'
    : 'PositionModified';

  return getInvestmentWorkflowHooks().executeHooks(event as InvestmentHookEvent, params);
}

/**
 * Check if a decision is allowed
 */
export async function checkDecisionAllowed(params: PreDecisionParams): Promise<CapabilityCheck> {
  const hooks = getInvestmentWorkflowHooks();
  const output = await hooks.executeHooks('PreDecision', params);

  if (output.decision === 'reject') {
    return {
      allowed: false,
      reason: output.reason || 'Decision rejected by hook',
    };
  }

  return { allowed: true };
}