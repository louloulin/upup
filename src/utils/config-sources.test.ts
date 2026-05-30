/**
 * Config Sources Tests
 * 
 * Unit tests for configuration source tracking.
 * Part of Plan12 P1 implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { upupPath } from './storage-paths.js';

// Test helper to get the actual config directory that getConfigSources reads from
function getTestConfigDir() {
  return join(homedir(), '.upup');
}

function cleanupTestConfig() {
  const dir = getTestConfigDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('getConfigSources', () => {
  beforeEach(() => {
    cleanupTestConfig();
  });

  it('should be defined and exported', async () => {
    const module = await import('./config.js');
    expect(typeof module.getConfigSources).toBe('function');
  });

  it('should return an array of ConfigSourceInfo', async () => {
    const module = await import('./config.js');
    const sources = module.getConfigSources();
    expect(Array.isArray(sources)).toBe(true);
  });

  it('should identify settings.json as source when config exists', async () => {
    // Ensure test directory exists
    const dir = getTestConfigDir();
    mkdirSync(dir, { recursive: true });

    // Write to the actual settings file that getConfigSources reads
    const settingsFile = upupPath('settings.json');

    // Read current settings to preserve existing config
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(settingsFile)) {
      try {
        existingConfig = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      } catch { /* ignore */ }
    }

    // Add test values
    const testData = {
      ...existingConfig,
      __testProvider: 'test-provider-value',
      __testModelId: 'test-model-value',
    };
    writeFileSync(settingsFile, JSON.stringify(testData, null, 2));

    // Re-import to get fresh state
    const module = await import('./config.js');
    module.clearConfigCache(); // Clear cache before testing
    const sources = module.getConfigSources();

    // Should find test keys from settings.json
    const providerSource = sources.find(s => s.key === '__testProvider');
    const modelIdSource = sources.find(s => s.key === '__testModelId');

    expect(providerSource).toBeDefined();
    expect(providerSource?.source).toContain('settings');
    expect(modelIdSource).toBeDefined();
    expect(modelIdSource?.source).toContain('settings');

    // Clean up test values
    const finalConfig = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    delete finalConfig.__testProvider;
    delete finalConfig.__testModelId;
    writeFileSync(settingsFile, JSON.stringify(finalConfig, null, 2));
  });

  it('should return ConfigSourceInfo interface structure', async () => {
    const module = await import('./config.js');
    const sources = module.getConfigSources();
    
    // All sources should have required properties
    for (const source of sources) {
      expect(typeof source.key).toBe('string');
      expect(typeof source.source).toBe('string');
      // value can be any type
      expect(source.value).toBeDefined();
    }
  });
});

describe('ConfigSourceInfo interface', () => {
  it('should have correct structure', async () => {
    const module = await import('./config.js');
    const sources = module.getConfigSources();
    
    // Each source should be an object with key, value, and source
    for (const src of sources) {
      expect(src).toHaveProperty('key');
      expect(src).toHaveProperty('value');
      expect(src).toHaveProperty('source');
      expect(typeof src.key).toBe('string');
      expect(typeof src.source).toBe('string');
    }
  });
});
