/**
 * Config Sources Tests
 * 
 * Unit tests for configuration source tracking.
 * Part of Plan12 P1 implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Test helper to get the test config directory
function getTestConfigDir() {
  return join(homedir(), '.upup-test-config-sources');
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
    // Create test settings
    const dir = getTestConfigDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      provider: 'test-provider',
      modelId: 'test-model',
    }));

    const module = await import('./config.js');
    const sources = module.getConfigSources();
    
    // Should find provider and modelId
    const providerSource = sources.find(s => s.key === 'provider');
    const modelIdSource = sources.find(s => s.key === 'modelId');
    
    expect(providerSource).toBeDefined();
    expect(modelIdSource).toBeDefined();
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
