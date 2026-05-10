/**
 * Investment Workflow Hooks Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getInvestmentWorkflowHooks,
  resetInvestmentWorkflowHooks,
  executePreResearchHooks,
  executePostResearchHooks,
  executePreDecisionHooks,
  executeAlertHooks,
  checkDecisionAllowed,
  type PreDecisionParams,
  type AlertParams,
} from './investment-workflow-hooks.js';

describe('InvestmentWorkflowHooks', () => {
  beforeEach(() => {
    resetInvestmentWorkflowHooks();
  });

  afterEach(() => {
    resetInvestmentWorkflowHooks();
  });

  describe('getInvestmentWorkflowHooks', () => {
    it('should return singleton instance', () => {
      const hooks1 = getInvestmentWorkflowHooks();
      const hooks2 = getInvestmentWorkflowHooks();
      expect(hooks1).toBe(hooks2);
    });

    it('should initialize with default hooks', () => {
      const hooks = getInvestmentWorkflowHooks();
      const riskHooks = hooks.getHooks('RiskThresholdExceeded');
      const alertHooks = hooks.getHooks('AlertTriggered');
      expect(riskHooks.length).toBeGreaterThan(0);
      expect(alertHooks.length).toBeGreaterThan(0);
    });
  });

  describe('executePreResearchHooks', () => {
    it('should execute pre-research hooks', async () => {
      const output = await executePreResearchHooks({
        query: 'Analyze AAPL fundamentals',
        tickers: ['AAPL'],
        depth: 'standard',
      });

      expect(output).toBeDefined();
      expect(output.continue).toBe(true);
    });
  });

  describe('executePostResearchHooks', () => {
    it('should execute post-research hooks', async () => {
      const output = await executePostResearchHooks({
        query: 'Analyze AAPL fundamentals',
        tickers: ['AAPL'],
        findings: [
          {
            type: 'positive',
            category: 'earnings',
            title: 'Strong Revenue Growth',
            description: 'Revenue grew 10% YoY',
          },
        ],
        duration: 5000,
        confidence: 85,
      });

      expect(output).toBeDefined();
      expect(output.continue).toBe(true);
    });
  });

  describe('executePreDecisionHooks', () => {
    it('should allow decision with elevated permissions', async () => {
      const output = await executePreDecisionHooks({
        decision: 'buy',
        ticker: 'AAPL',
        price: 175.5,
        quantity: 100,
        rationale: 'Strong fundamentals, undervalued',
      });

      expect(output).toBeDefined();
      // Without permissions, should be rejected
      expect(output.decision).toBe('reject');
    });

    it('should allow hold decisions without elevated permissions', async () => {
      const output = await executePreDecisionHooks({
        decision: 'hold',
        ticker: 'AAPL',
        rationale: 'Wait for better entry point',
      });

      expect(output).toBeDefined();
      // Hold should be allowed without write permissions
      expect(output.continue).toBe(true);
    });

    it('should allow watch decisions without elevated permissions', async () => {
      const output = await executePreDecisionHooks({
        decision: 'watch',
        ticker: 'AAPL',
        rationale: 'Monitor for entry point',
      });

      expect(output).toBeDefined();
      expect(output.continue).toBe(true);
    });
  });

  describe('executeAlertHooks', () => {
    it('should execute alert hooks', async () => {
      const alert: AlertParams = {
        alertId: 'test-alert-1',
        severity: 'warning',
        ticker: 'AAPL',
        title: 'Price Alert',
        message: 'AAPL crossed $180',
        timestamp: Date.now(),
      };

      const output = await executeAlertHooks(alert);

      expect(output).toBeDefined();
      expect(output.continue).toBe(true);
    });

    it('should handle critical alerts', async () => {
      const alert: AlertParams = {
        alertId: 'test-alert-2',
        severity: 'critical',
        ticker: 'TSLA',
        title: 'Risk Alert',
        message: 'TSLA position down 15%',
        timestamp: Date.now(),
        metadata: { positionPnl: -15 },
      };

      const output = await executeAlertHooks(alert);

      expect(output).toBeDefined();
      expect(output.continue).toBe(true);
    });
  });

  describe('checkDecisionAllowed', () => {
    it('should reject buy without portfolio permission', async () => {
      const check = await checkDecisionAllowed({
        decision: 'buy',
        ticker: 'AAPL',
        rationale: 'Buy opportunity',
      });

      expect(check.allowed).toBe(false);
    });

    it('should allow hold without portfolio permission', async () => {
      const check = await checkDecisionAllowed({
        decision: 'hold',
        ticker: 'AAPL',
        rationale: 'Hold for now',
      });

      expect(check.allowed).toBe(true);
    });

    it('should reject sell without portfolio permission', async () => {
      const check = await checkDecisionAllowed({
        decision: 'sell',
        ticker: 'AAPL',
        rationale: 'Take profits',
      });

      expect(check.allowed).toBe(false);
    });
  });

  describe('register and unregister', () => {
    it('should register custom hook', () => {
      const hooks = getInvestmentWorkflowHooks();

      hooks.register({
        id: 'test-custom-hook',
        name: 'Test Custom Hook',
        event: 'PreResearch',
        type: 'filter',
        handler: async () => ({ continue: true }),
      });

      const preResearchHooks = hooks.getHooks('PreResearch');
      const found = preResearchHooks.some(h => h.id === 'test-custom-hook');
      expect(found).toBe(true);
    });

    it('should unregister custom hook', () => {
      const hooks = getInvestmentWorkflowHooks();

      hooks.register({
        id: 'test-remove-hook',
        name: 'Test Remove Hook',
        event: 'PreResearch',
        type: 'filter',
        handler: async () => ({ continue: true }),
      });

      const result = hooks.unregister('test-remove-hook');
      expect(result).toBe(true);

      const preResearchHooks = hooks.getHooks('PreResearch');
      const found = preResearchHooks.some(h => h.id === 'test-remove-hook');
      expect(found).toBe(false);
    });
  });

  describe('context management', () => {
    it('should set global context', () => {
      const hooks = getInvestmentWorkflowHooks();

      hooks.setGlobalContext({
        sessionId: 'test-session-123',
        userId: 'user-456',
      });

      const context = (hooks as any).globalContext;
      expect(context.sessionId).toBe('test-session-123');
      expect(context.userId).toBe('user-456');
    });
  });

  describe('integration with capability registry', () => {
    it('should check capabilities on pre-decision', async () => {
      const hooks = getInvestmentWorkflowHooks();
      const output = await hooks.executeHooks('PreDecision', {
        decision: 'buy',
        ticker: 'AAPL',
        rationale: 'Buy opportunity',
      } as PreDecisionParams);

      // Buy decision should be rejected without permissions
      expect(output.decision).toBe('reject');
      expect(output.reason).toContain('permission');
    });
  });
});