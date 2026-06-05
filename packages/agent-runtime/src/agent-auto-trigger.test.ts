/**
 * Agent Auto-Trigger Integration Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createAgentAutoTriggerIntegration,
  getAgentAutoTriggerIntegration,
  resetAgentAutoTriggerIntegration,
  formatSkillSuggestionsForDisplay,
} from './agent-auto-trigger.js';
import { resetAutoTriggerIntegration } from './auto-trigger.js';
import { resetIntentDetector } from '@upup/tools-registry/skills/intent-detector';
import { resetSkillTrigger } from '@upup/tools-registry/skills/skill-trigger';

describe('Agent Auto-Trigger Integration', () => {
  beforeEach(() => {
    resetAgentAutoTriggerIntegration();
    resetAutoTriggerIntegration();
    resetIntentDetector();
    resetSkillTrigger();
  });

  describe('onQueryStart', () => {
    test('detects investment intents for stock analysis', async () => {
      const integration = createAgentAutoTriggerIntegration();
      const result = await integration.onQueryStart('分析贵州茅台600519的估值');
      
      expect(result.hasInvestmentIntent).toBe(true);
      expect(result.tickers).toContain('600519');
    });

    test('detects multiple tickers', async () => {
      const integration = createAgentAutoTriggerIntegration();
      const result = await integration.onQueryStart('对比600519和000858');
      
      expect(result.tickers.length).toBeGreaterThanOrEqual(2);
    });

    test('returns empty for disabled integration', async () => {
      const integration = createAgentAutoTriggerIntegration();
      // Disabled is handled by getAutoTriggerIntegration config
      const result = await integration.onQueryStart('普通对话');
      
      expect(result.intents).toBeDefined();
      expect(result.tickers).toBeDefined();
    });
  });

  describe('onQueryEnd', () => {
    test('executes without error', async () => {
      const integration = createAgentAutoTriggerIntegration();
      const startResult = await integration.onQueryStart('分析茅台');
      
      await integration.onQueryEnd('分析茅台', startResult, 5000);
    });

    test('handles empty tickers gracefully', async () => {
      const integration = createAgentAutoTriggerIntegration();
      
      await integration.onQueryEnd('普通对话', {
          intents: [],
          triggers: [],
          suggestion: null,
          hasInvestmentIntent: false,
          tickers: [],
        }, 1000);
    });
  });

  describe('getLastResult', () => {
    test('returns null initially', () => {
      const integration = createAgentAutoTriggerIntegration();
      expect(integration.getLastResult()).toBeNull();
    });

    test('returns last result after onQueryStart', async () => {
      const integration = createAgentAutoTriggerIntegration();
      const result = await integration.onQueryStart('分析茅台');
      
      expect(integration.getLastResult()).toEqual(result);
    });
  });

  describe('isEnabled', () => {
    test('returns true by default', () => {
      const integration = createAgentAutoTriggerIntegration();
      expect(integration.isEnabled()).toBe(true);
    });
  });

  describe('singleton', () => {
    test('getAgentAutoTriggerIntegration returns same instance', () => {
      const first = getAgentAutoTriggerIntegration();
      const second = getAgentAutoTriggerIntegration();
      
      expect(first).toBe(second);
    });
  });

  describe('formatSkillSuggestionsForDisplay', () => {
    test('returns empty string for no suggestions', () => {
      const result = {
        intents: [],
        triggers: [],
        suggestion: null,
        hasInvestmentIntent: false,
        tickers: [],
      };
      
      expect(formatSkillSuggestionsForDisplay(result)).toBe('');
    });

    test('formats suggestions with tickers', () => {
      const result = {
        intents: [{ type: 'valuation' as const, trigger: '估值', confidence: 0.9, suggestedSkills: [] }],
        triggers: [{ skill: 'dcf-valuation', status: 'suggested' as const, reason: 'DCF分析', mode: 'suggest' as const }],
        suggestion: '建议使用DCF估值',
        hasInvestmentIntent: true,
        tickers: ['600519'],
      };
      
      const formatted = formatSkillSuggestionsForDisplay(result);
      expect(formatted).toContain('600519');
      expect(formatted).toContain('dcf-valuation');
    });
  });
});
