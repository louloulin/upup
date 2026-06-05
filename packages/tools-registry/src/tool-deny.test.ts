/**
 * Unit tests for Tool Deny Rules
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  ToolDenyManager,
  TOOL_DENY_RULES,
  DANGEROUS_TOOLS,
  EXPERIMENTAL_TOOLS,
  DEPRECATED_TOOLS,
  getToolDenyManager,
  resetToolDenyManager,
  isToolDenied,
  getToolDenialReason,
  type ToolDenyRule,
} from './tool-deny.js';

describe('ToolDenyManager', () => {
  let manager: ToolDenyManager;

  beforeEach(() => {
    resetToolDenyManager();
    manager = new ToolDenyManager();
  });

  describe('Basic denial checks', () => {
    test('allows safe tools', () => {
      const result = manager.check('read_file');
      expect(result.denied).toBe(false);
    });

    test('denies dangerous tools', () => {
      const result = manager.check('rm_rf');
      expect(result.denied).toBe(true);
      expect(result.rule?.reason).toBe('dangerous');
    });

    test('warns experimental tools', () => {
      const result = manager.check('experimental_ai');
      expect(result.denied).toBe(false);
      expect(result.warnOnly).toBe(true);
    });

    test('warns deprecated tools', () => {
      const result = manager.check('old_tool_v1');
      expect(result.denied).toBe(false);
      expect(result.warnOnly).toBe(true);
    });
  });

  describe('Dangerous tool patterns', () => {
    test('denies recursive delete patterns', () => {
      const result = manager.check('delete_all_files');
      expect(result.denied).toBe(true);
      // Will match dangerous-delete_all_files first due to priority
      expect(result.rule?.reason).toBe('dangerous');
    });

    test('denies system-level operations', () => {
      const result = manager.check('sysadmin');
      expect(result.denied).toBe(true);
      expect(result.rule?.reason).toBe('dangerous');
    });

    test('denies network probing tools', () => {
      const result = manager.check('nmap_scan');
      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('dangerous-network');
    });
  });

  describe('Custom rules', () => {
    test('adds custom rule', () => {
      const customRule: ToolDenyRule = {
        id: 'custom-block',
        pattern: 'custom_tool',
        reason: 'custom',
        description: 'Custom blocked tool',
        priority: 50,
      };

      manager.addRule(customRule);
      const result = manager.check('custom_tool');

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('custom-block');
    });

    test('removes rule by ID', () => {
      const removed = manager.removeRule('dangerous-rm_rf');
      expect(removed).toBe(true);

      const result = manager.check('rm_rf');
      expect(result.denied).toBe(false);
    });

    test('returns false for non-existent rule', () => {
      const removed = manager.removeRule('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Pattern matching', () => {
    test('matches exact patterns', () => {
      const result = manager.check('format_disk');
      expect(result.denied).toBe(true);
    });

    test('matches wildcard patterns', () => {
      const result = manager.check('rm_recursive_all');
      expect(result.denied).toBe(true);
    });

    test('matches regex patterns', () => {
      const customRule: ToolDenyRule = {
        id: 'test-regex',
        pattern: /^test_.*_dangerous$/i,
        reason: 'custom',
        description: 'Test regex pattern',
        priority: 50,
      };

      manager.addRule(customRule);
      const result = manager.check('test_tool_dangerous');

      expect(result.denied).toBe(true);
    });
  });

  describe('Batch operations', () => {
    test('checkMultiple returns map of results', () => {
      const tools = ['read_file', 'rm_rf', 'experimental_ai'];
      const results = manager.checkMultiple(tools);

      expect(results.get('read_file')?.denied).toBe(false);
      expect(results.get('rm_rf')?.denied).toBe(true);
      expect(results.get('experimental_ai')?.warnOnly).toBe(true);
    });

    test('filterTools separates tools correctly', () => {
      const tools = ['read_file', 'rm_rf', 'experimental_ai'];
      const { allowed, denied, warned } = manager.filterTools(tools);

      expect(allowed).toContain('read_file');
      expect(denied).toContain('rm_rf');
      expect(warned).toContain('experimental_ai');
    });

    test('filterTools allowWarnings option', () => {
      const tools = ['experimental_ai', 'deprecated_tool'];
      const { allowed, warned } = manager.filterTools(tools, { allowWarnings: true });

      expect(allowed).toContain('experimental_ai');
      expect(allowed).toContain('deprecated_tool');
      expect(warned).toHaveLength(0);
    });
  });

  describe('Denial logging', () => {
    test('logs denied tools', () => {
      manager.check('rm_rf');
      manager.check('format_disk');

      const log = manager.getDenialLog();
      expect(log).toHaveLength(2);
    });

    test('does not log warn-only tools', () => {
      manager.check('experimental_ai');
      manager.check('old_tool_v1');

      const log = manager.getDenialLog();
      expect(log).toHaveLength(0);
    });

    test('clears denial log', () => {
      manager.check('rm_rf');
      manager.check('format_disk');

      manager.clearDenialLog();

      expect(manager.getDenialLog()).toHaveLength(0);
    });
  });

  describe('Helper methods', () => {
    test('isDangerous detects dangerous tools', () => {
      expect(manager.isDangerous('rm_rf')).toBe(true);
      expect(manager.isDangerous('format_disk')).toBe(true);
      expect(manager.isDangerous('read_file')).toBe(false);
    });

    test('isExperimental detects experimental tools', () => {
      expect(manager.isExperimental('experimental_ai')).toBe(true);
      expect(manager.isExperimental('beta_feature')).toBe(true);
      expect(manager.isExperimental('read_file')).toBe(false);
    });

    test('isDeprecated detects deprecated tools', () => {
      expect(manager.isDeprecated('old_tool_v1')).toBe(true);
      expect(manager.isDeprecated('legacy_api')).toBe(true);
      expect(manager.isDeprecated('read_file')).toBe(false);
    });
  });

  describe('Rule queries', () => {
    test('getRules returns all rules', () => {
      const rules = manager.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    test('rules are sorted by priority', () => {
      const rules = manager.getRules();
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });
});

describe('Singleton functions', () => {
  test('getToolDenyManager returns same instance', () => {
    resetToolDenyManager();
    const mgr1 = getToolDenyManager();
    const mgr2 = getToolDenyManager();

    expect(mgr1).toBe(mgr2);
  });

  test('resetToolDenyManager clears instance', () => {
    const mgr1 = getToolDenyManager();
    resetToolDenyManager();
    const mgr2 = getToolDenyManager();

    expect(mgr1).not.toBe(mgr2);
  });
});

describe('Convenience functions', () => {
  test('isToolDenied checks tool', () => {
    resetToolDenyManager();

    expect(isToolDenied('read_file')).toBe(false);
    expect(isToolDenied('rm_rf')).toBe(true);
  });

  test('getToolDenialReason returns reason', () => {
    resetToolDenyManager();

    expect(getToolDenialReason('read_file')).toBeUndefined();
    expect(getToolDenialReason('rm_rf')).toBeDefined();
  });
});

describe('Built-in constants', () => {
  test('DANGEROUS_TOOLS contains expected tools', () => {
    expect(DANGEROUS_TOOLS).toContain('rm_rf');
    expect(DANGEROUS_TOOLS).toContain('format_disk');
    expect(DANGEROUS_TOOLS).toContain('sudo');
  });

  test('EXPERIMENTAL_TOOLS contains expected tools', () => {
    expect(EXPERIMENTAL_TOOLS).toContain('experimental_ai');
    expect(EXPERIMENTAL_TOOLS).toContain('beta_feature');
  });

  test('DEPRECATED_TOOLS contains expected tools', () => {
    expect(DEPRECATED_TOOLS).toContain('old_tool_v1');
    expect(DEPRECATED_TOOLS).toContain('legacy_api');
  });
});

describe('TOOL_DENY_RULES', () => {
  test('has dangerous rules', () => {
    const dangerousRules = TOOL_DENY_RULES.filter(r => r.reason === 'dangerous');
    expect(dangerousRules.length).toBeGreaterThan(0);
  });

  test('dangerous rules have warnOnly false', () => {
    const dangerousRules = TOOL_DENY_RULES.filter(r => r.reason === 'dangerous');
    expect(dangerousRules.every(r => r.warnOnly === false)).toBe(true);
  });

  test('experimental rules have warnOnly true', () => {
    const experimentalRules = TOOL_DENY_RULES.filter(r => r.reason === 'experimental');
    expect(experimentalRules.every(r => r.warnOnly === true)).toBe(true);
  });

  test('deprecated rules have warnOnly true', () => {
    const deprecatedRules = TOOL_DENY_RULES.filter(r => r.reason === 'deprecated');
    expect(deprecatedRules.every(r => r.warnOnly === true)).toBe(true);
  });

  test('all rules have valid priorities', () => {
    for (const rule of TOOL_DENY_RULES) {
      expect(rule.priority).toBeGreaterThan(0);
      expect(rule.priority).toBeLessThanOrEqual(100);
    }
  });

  test('all rules have unique IDs', () => {
    const ids = TOOL_DENY_RULES.map(r => r.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });
});
