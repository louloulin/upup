/**
 * Auto-Trigger Integration Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  AutoTriggerIntegration,
  getAutoTriggerIntegration,
  resetAutoTriggerIntegration,
  formatSkillSuggestionsMarkdown,
} from './auto-trigger.js';
import { resetIntentDetector } from '@upup/tools-registry/skills/intent-detector';
import { resetSkillTrigger } from '@upup/tools-registry/skills/skill-trigger';

describe('Auto-Trigger Integration', () => {
  beforeEach(() => {
    resetAutoTriggerIntegration();
    resetIntentDetector();
    resetSkillTrigger();
  });

  describe('detectAndSuggest', () => {
    test('returns empty for disabled integration', () => {
      const integration = new AutoTriggerIntegration({ enabled: false });
      const result = integration.detectAndSuggest('分析茅台估值');
      expect(result.intents.length).toBe(0);
      expect(result.triggers.length).toBe(0);
    });

    test('detects investment intent', () => {
      const integration = new AutoTriggerIntegration({ enabled: true });
      const result = integration.detectAndSuggest('分析贵州茅台600519的估值');
      expect(result.hasInvestmentIntent).toBe(true);
      expect(result.tickers).toContain('600519');
    });

    test('generates suggestion message', () => {
      const integration = new AutoTriggerIntegration({ enabled: true, showSuggestions: true });
      const result = integration.detectAndSuggest('DCF估值分析');
      expect(result.suggestion).toBeTruthy();
    });

    test('detects multiple intents', () => {
      const integration = new AutoTriggerIntegration({ enabled: true });
      const result = integration.detectAndSuggest('分析腾讯的技术面和基本面');
      const intentTypes = result.intents.map(i => i.type);
      expect(intentTypes).toContain('technical');
      expect(intentTypes).toContain('fundamental');
    });

    test('extracts multiple tickers', () => {
      const integration = new AutoTriggerIntegration({ enabled: true });
      const result = integration.detectAndSuggest('对比600519和000858');
      expect(result.tickers.length).toBeGreaterThanOrEqual(2);
    });

    test('triggers valuation skills for valuation intent', () => {
      const integration = new AutoTriggerIntegration({ enabled: true });
      const result = integration.detectAndSuggest('估值分析');
      const skillNames = result.triggers.map(t => t.skill);
      expect(skillNames.some(s => s.includes('dcf') || s.includes('valuation'))).toBe(true);
    });
  });

  describe('executePreResearch', () => {
    test('returns allowed without tickers', async () => {
      const integration = new AutoTriggerIntegration({ enabled: true });
      const result = await integration.executePreResearch('分析茅台', []);
      expect(result).toBeDefined();
      expect(result!.allowed).toBe(true);
    });

    test('returns allowed for disabled integration', async () => {
      const integration = new AutoTriggerIntegration({ enabled: false });
      const result = await integration.executePreResearch('分析茅台', ['600519']);
      expect(result).toBeDefined();
      expect(result!.allowed).toBe(true);
    });
  });

  describe('formatSkillSuggestionsMarkdown', () => {
    test('returns empty for no suggestion', () => {
      const result = formatSkillSuggestionsMarkdown({
        intents: [],
        triggers: [],
        suggestion: null,
        hasInvestmentIntent: false,
        tickers: [],
      });
      expect(result).toBe('');
    });

    test('formats suggestions as markdown', () => {
      const integration = new AutoTriggerIntegration({ enabled: true, showSuggestions: true });
      const detection = integration.detectAndSuggest('DCF估值分析');
      const markdown = formatSkillSuggestionsMarkdown(detection);
      expect(markdown).toBeTruthy();
    });
  });

  describe('config', () => {
    test('updateConfig works', () => {
      const integration = new AutoTriggerIntegration();
      integration.updateConfig({ mode: 'auto', highConfidenceThreshold: 0.9 });
      const config = integration.getConfig();
      expect(config.mode).toBe('auto');
      expect(config.highConfidenceThreshold).toBe(0.9);
    });

    test('getAutoTriggerIntegration returns singleton', () => {
      const instance1 = getAutoTriggerIntegration();
      const instance2 = getAutoTriggerIntegration();
      expect(instance1).toBe(instance2);
    });
  });

  describe('reset', () => {
    test('reset clears triggered skills', () => {
      const integration = new AutoTriggerIntegration();
      integration.detectAndSuggest('DCF估值分析');
      integration.reset();
      const skills = integration.getHighConfidenceSkills();
      // After reset, no skills should be in triggered state
      expect(skills.length).toBe(0);
    });
  });
});

// ============================================================================
// Extended Integration Tests
// ============================================================================

describe('Auto-Trigger Integration > Extended Tests', () => {
  test('handles Chinese investment terms', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    
    const queries = [
      '贵州茅台的现金流折现估值',
      '比亚迪的技术指标分析',
      '宁德时代的财务报告解读',
      '上证指数的风险评估',
    ];
    
    for (const query of queries) {
      const result = integration.detectAndSuggest(query);
      expect(result.hasInvestmentIntent).toBe(true);
    }
  });

  test('handles English investment terms', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    
    const queries = [
      'Analyze AAPL DCF valuation',
      'Technical analysis for TSLA',
      'Risk assessment for 600519',
    ];
    
    for (const query of queries) {
      const result = integration.detectAndSuggest(query);
      expect(result.hasInvestmentIntent).toBe(true);
    }
  });

  test('handles mixed Chinese-English queries', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('分析600519的PE ratio和DCF');
    
    expect(result.hasInvestmentIntent).toBe(true);
    expect(result.tickers.length).toBeGreaterThan(0);
  });

  test('respects disabled mode', () => {
    const integration = new AutoTriggerIntegration({ enabled: false });
    
    const result = integration.detectAndSuggest('分析茅台600519');
    expect(result.intents.length).toBe(0);
    expect(result.triggers.length).toBe(0);
    expect(result.tickers.length).toBe(0);
  });

  test('handles multiple tickers from same market', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('对比600519和000858');
    
    expect(result.tickers.length).toBeGreaterThanOrEqual(2);
  });

  test('handles multiple tickers from different markets', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('分析600519、AAPL和00700');
    
    expect(result.tickers.length).toBeGreaterThanOrEqual(2);
  });

  test('triggers appropriate skills for valuation', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('DCF现金流折现分析');
    
    const skillNames = result.triggers.map(t => t.skill);
    expect(skillNames.some(s => s.includes('dcf') || s.includes('valuation'))).toBe(true);
  });

  test('triggers appropriate skills for technical analysis', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('K线图技术分析');
    
    const skillNames = result.triggers.map(t => t.skill);
    expect(skillNames.some(s => s.includes('technical'))).toBe(true);
  });

  test('triggers appropriate skills for fund analysis', () => {
    const integration = new AutoTriggerIntegration({ enabled: true });
    const result = integration.detectAndSuggest('ETF基金净值分析');
    
    const skillNames = result.triggers.map(t => t.skill);
    expect(skillNames.some(s => s.includes('fund'))).toBe(true);
  });

  test('singleton pattern works correctly', () => {
    const first = getAutoTriggerIntegration();
    const second = getAutoTriggerIntegration();
    
    expect(first).toBe(second);
  });

  test('reset clears singleton', () => {
    const first = getAutoTriggerIntegration();
    resetAutoTriggerIntegration();
    const second = getAutoTriggerIntegration();
    
    expect(first).not.toBe(second);
  });

  test('config update works', () => {
    const integration = new AutoTriggerIntegration({ enabled: true, mode: 'suggest' });
    expect(integration.getConfig().enabled).toBe(true);
    expect(integration.getConfig().mode).toBe('suggest');
    
    integration.updateConfig({ enabled: false, mode: 'auto' });
    expect(integration.getConfig().enabled).toBe(false);
    expect(integration.getConfig().mode).toBe('auto');
  });
});
