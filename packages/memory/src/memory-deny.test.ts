/**
 * Unit tests for Memory Deny Rules
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  MemoryDenyManager,
  MEMORY_DENY_RULES,
  getMemoryDenyManager,
  resetMemoryDenyManager,
  isMemoryDenied,
  getDenialReason,
  type MemoryDenyRule,
} from './memory-deny.js';

describe('MemoryDenyManager', () => {
  let manager: MemoryDenyManager;

  beforeEach(() => {
    resetMemoryDenyManager();
    manager = new MemoryDenyManager();
  });

  describe('Basic denial checks', () => {
    test('allows non-deny content', () => {
      const content = 'The user prefers dark mode for the UI';
      const result = manager.check(content);

      expect(result.denied).toBe(false);
      expect(result.rule).toBeUndefined();
    });

    test('denies function definitions', () => {
      const content = 'export function myFunction() { }';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-function');
    });

    test('denies class definitions', () => {
      const content = 'class MyClass { }';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-class');
    });

    test('denies interface definitions', () => {
      const content = 'interface UserData { name: string }';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-interface');
    });

    test('denies type definitions', () => {
      const content = 'type UserId = string | number';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-type');
    });

    test('denies import statements', () => {
      const content = "import { useState } from 'react'";
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-import');
    });

    test('denies export statements', () => {
      const content = 'export const apiKey = "secret"';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('code-export');
    });
  });

  describe('Git content denial', () => {
    test('denies git log output', () => {
      const content = 'abc1234 Fix authentication bug';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('git_content');
    });

    test('denies git SHA', () => {
      // Git SHA is 40 hex characters
      const content = 'abc123def456789012345678901234567890abcd';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('git-sha');
    });
  });

  describe('Sensitive content denial', () => {
    test('denies passwords', () => {
      const content = 'Database password: supersecret123';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('sensitive');
      expect(result.rule?.logDenial).toBe(true);
    });

    test('denies API keys', () => {
      const content = 'api_key = "sk_live_abcdefghijklmnop"';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('sensitive');
    });

    test('denies bearer tokens', () => {
      // JWT-like token pattern
      const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.test';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('sensitive');
    });

    test('denies private keys', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAL...\n-----END RSA PRIVATE KEY-----';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('sensitive');
    });
  });

  describe('Debug content denial', () => {
    test('denies stack traces', () => {
      const content = 'at MyFunction (/app/index.js:42:15)';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('debug_info');
    });

    test('denies error messages', () => {
      const content = 'Error: Connection refused at port 8080';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('debug_info');
    });
  });

  describe('Ephemeral content denial', () => {
    test('denies temporary content', () => {
      const content = 'This is a temporary fix for testing';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('ephemeral');
    });

    test('denies session content', () => {
      const content = 'session: abc123_user_data';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('ephemeral');
    });
  });

  describe('Obvious content denial', () => {
    test('denies TODO comments', () => {
      const content = '// TODO: Implement this feature';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('obvious');
    });

    test('denies FIXME comments', () => {
      const content = '# FIXME: This needs to be fixed';
      const result = manager.check(content);

      expect(result.denied).toBe(true);
      expect(result.rule?.category).toBe('obvious');
    });
  });

  describe('Custom rules', () => {
    test('adds custom rule', () => {
      const customRule: MemoryDenyRule = {
        id: 'custom-rule',
        description: 'Custom denial rule',
        category: 'redundant',
        pattern: /custom_pattern/,
        priority: 50,
        logDenial: false,
      };

      manager.addRule(customRule);
      const result = manager.check('This contains custom_pattern');

      expect(result.denied).toBe(true);
      expect(result.rule?.id).toBe('custom-rule');
    });

    test('removes rule by ID', () => {
      const removed = manager.removeRule('code-function');

      expect(removed).toBe(true);

      const content = 'export function test() {}';
      const result = manager.check(content);

      // Should not match function rule anymore
      expect(result.rule?.id).not.toBe('code-function');
    });

    test('returns false when removing non-existent rule', () => {
      const removed = manager.removeRule('non-existent-rule');
      expect(removed).toBe(false);
    });
  });

  describe('Batch operations', () => {
    test('checkMultiple returns map of results', () => {
      const contents = [
        'Normal memory content',
        'export function test() {}',
        'class MyClass {}',
      ];

      const results = manager.checkMultiple(contents);

      expect(results.get(contents[0])?.denied).toBe(false);
      expect(results.get(contents[1])?.denied).toBe(true);
      expect(results.get(contents[2])?.denied).toBe(true);
    });

    test('filterDenials separates allowed and denied', () => {
      const contents = [
        'Allowed content',
        'password = "secret"',
        'Another allowed',
        'export class Test {}',
      ];

      const { allowed, denied } = manager.filterDenials(contents);

      expect(allowed).toHaveLength(2);
      expect(denied).toHaveLength(2);
      expect(allowed).toContain('Allowed content');
      expect(allowed).toContain('Another allowed');
    });
  });

  describe('Denial logging', () => {
    test('logs denial for sensitive content', () => {
      const content = 'api_key = "sk_test_12345678"';
      manager.check(content);

      const log = manager.getDenialLog();
      expect(log).toHaveLength(1);
      expect(log[0].rule.id).toBe('sensitive-api-key');
    });

    test('clears denial log', () => {
      manager.check('password = "secret"');
      manager.check('api_key = "sk_test_12345678"');

      expect(manager.getDenialLog()).toHaveLength(2);

      manager.clearDenialLog();

      expect(manager.getDenialLog()).toHaveLength(0);
    });
  });

  describe('Rule queries', () => {
    test('getRules returns all rules', () => {
      const rules = manager.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    test('getRulesByCategory filters correctly', () => {
      const sensitiveRules = manager.getRulesByCategory('sensitive');
      const codeRules = manager.getRulesByCategory('code_pattern');

      expect(sensitiveRules.every(r => r.category === 'sensitive')).toBe(true);
      expect(codeRules.every(r => r.category === 'code_pattern')).toBe(true);
    });
  });
});

describe('Singleton functions', () => {
  test('getMemoryDenyManager returns same instance', () => {
    resetMemoryDenyManager();
    const manager1 = getMemoryDenyManager();
    const manager2 = getMemoryDenyManager();

    expect(manager1).toBe(manager2);
  });

  test('resetMemoryDenyManager clears instance', () => {
    const manager1 = getMemoryDenyManager();
    resetMemoryDenyManager();
    const manager2 = getMemoryDenyManager();

    expect(manager1).not.toBe(manager2);
  });
});

describe('Convenience functions', () => {
  test('isMemoryDenied checks content', () => {
    resetMemoryDenyManager();

    expect(isMemoryDenied('Normal content')).toBe(false);
    expect(isMemoryDenied('export function test() {}')).toBe(true);
    expect(isMemoryDenied('password = "secret"')).toBe(true);
  });

  test('getDenialReason returns reason for denied content', () => {
    resetMemoryDenyManager();

    expect(getDenialReason('Normal content')).toBeUndefined();
    expect(getDenialReason('export function test() {}')).toBeDefined();
  });
});

describe('MEMORY_DENY_RULES', () => {
  test('has required categories', () => {
    const categories = new Set(MEMORY_DENY_RULES.map(r => r.category));

    expect(categories.has('code_pattern')).toBe(true);
    expect(categories.has('git_content')).toBe(true);
    expect(categories.has('debug_info')).toBe(true);
    expect(categories.has('sensitive')).toBe(true);
    expect(categories.has('ephemeral')).toBe(true);
    expect(categories.has('obvious')).toBe(true);
  });

  test('rules have valid priorities', () => {
    for (const rule of MEMORY_DENY_RULES) {
      expect(rule.priority).toBeGreaterThan(0);
      expect(rule.priority).toBeLessThanOrEqual(100);
    }
  });

  test('sensitive rules have logDenial enabled', () => {
    const sensitiveRules = MEMORY_DENY_RULES.filter(r => r.category === 'sensitive');

    expect(sensitiveRules.every(r => r.logDenial === true)).toBe(true);
  });

  test('all rules have unique IDs', () => {
    const ids = MEMORY_DENY_RULES.map(r => r.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });
});
