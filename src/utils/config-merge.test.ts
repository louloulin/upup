/**
 * Investment Config Merge Tests
 * Tests for global/project config merging
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { globalUpupPath, upupPath, ensureDir } from './paths';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

// Test helper to create config files
async function createTestConfig(dir: string, files: Record<string, string>) {
  ensureDir(dir);
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(dir, filename), content, 'utf-8');
  }
}

// Cleanup helper
function cleanupConfig(dir: string) {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  } catch { /* ignore */ }
}

describe('Config Loading', () => {
  describe('loadMergedInvestmentConfig', () => {
    it('should exist and be a function', async () => {
      const { loadMergedInvestmentConfig } = await import('../agent/investment-config');
      expect(typeof loadMergedInvestmentConfig).toBe('function');
    });

    it('should load config without errors', async () => {
      const { loadMergedInvestmentConfig } = await import('../agent/investment-config');
      const config = await loadMergedInvestmentConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('goals');
      expect(config).toHaveProperty('rules');
      expect(config).toHaveProperty('governance');
    });
  });

  describe('loadInvestmentConfig', () => {
    it('should exist and be a function', async () => {
      const { loadInvestmentConfig } = await import('../agent/investment-config');
      expect(typeof loadInvestmentConfig).toBe('function');
    });

    it('should load config from specified directory', async () => {
      const { loadInvestmentConfig } = await import('../agent/investment-config');
      const config = await loadInvestmentConfig(upupPath(''));
      expect(config).toBeDefined();
    });
  });
});

describe('formatInvestmentConfig', () => {
  it('should exist and be a function', async () => {
    const { formatInvestmentConfig } = await import('../agent/investment-config');
    expect(typeof formatInvestmentConfig).toBe('function');
  });

  it('should format config with goals, rules, governance', async () => {
    const { formatInvestmentConfig } = await import('../agent/investment-config');
    const config = {
      goals: {
        rawContent: 'Test goals',
        objectives: ['Test objective'],
        analysisDepth: [],
        interactionStyle: [],
      },
      rules: null,
      governance: null,
    };
    const formatted = formatInvestmentConfig(config);
    expect(formatted).toContain('Investment Goals');
    expect(formatted).toContain('Test objective');
  });

  it('should handle null config gracefully', async () => {
    const { formatInvestmentConfig } = await import('../agent/investment-config');
    const config = { goals: null, rules: null, governance: null };
    const formatted = formatInvestmentConfig(config);
    expect(formatted).toBe('');
  });
});