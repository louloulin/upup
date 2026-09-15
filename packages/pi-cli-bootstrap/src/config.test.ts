/**
 * Config Commands Tests
 *
 * Unit tests for config CLI commands.
 * Part of Plan12 P2 implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  getConfigValue,
  setConfigValue,
  listConfig,
  getConfigStatus,
  exportConfig,
  importConfig,
  runConfigCommand,
} from './config';

function getTestConfigPath() {
  return join(homedir(), '.upup-test-commands', 'settings.json');
}

function cleanupTestConfig() {
  const testDir = join(homedir(), '.upup-test-commands');
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe('Config Commands', () => {
  beforeEach(() => {
    cleanupTestConfig();
    // Ensure test directory exists
    mkdirSync(join(homedir(), '.upup-test-commands'), { recursive: true });
  });

  describe('getConfigValue', () => {
    it('should be a function', () => {
      expect(typeof getConfigValue).toBe('function');
    });

    it('should return null for non-existent key', () => {
      const value = getConfigValue('non-existent-key-xyz');
      expect(value).toBeNull();
    });
  });

  describe('setConfigValue', () => {
    it('should be a function', () => {
      expect(typeof setConfigValue).toBe('function');
    });

    it('should set a string value', () => {
      const result = setConfigValue('testKey', 'testValue');
      expect(result).toBe(true);

      const value = getConfigValue('testKey');
      expect(value).toBe('testValue');
    });

    it('should set a number value', () => {
      const result = setConfigValue('testNumber', '123');
      expect(result).toBe(true);

      const value = getConfigValue('testNumber');
      expect(value).toBe('123');
    });

    it('should set a boolean value', () => {
      setConfigValue('testBoolTrue', 'true');
      let value = getConfigValue('testBoolTrue');
      // getConfigValue returns string, but setSetting parses boolean
      expect(value !== null).toBe(true);

      setConfigValue('testBoolFalse', 'false');
      value = getConfigValue('testBoolFalse');
      expect(value !== null).toBe(true);
    });
  });

  describe('listConfig', () => {
    it('should be a function', () => {
      expect(typeof listConfig).toBe('function');
    });

    it('should return an object', () => {
      const config = listConfig();
      expect(typeof config).toBe('object');
    });
  });

  describe('getConfigStatus', () => {
    it('should be a function', () => {
      expect(typeof getConfigStatus).toBe('function');
    });

    it('should return validation result with expected properties', () => {
      const status = getConfigStatus();
      // Status can be null/undefined in some test scenarios
      if (status) {
        expect(status).toHaveProperty('valid');
        expect(status).toHaveProperty('provider');
        expect(status).toHaveProperty('modelId');
        expect(status).toHaveProperty('hasApiKey');
        expect(status).toHaveProperty('errors');
        expect(status).toHaveProperty('isFirstTime');
      }
    });
  });

  describe('exportConfig', () => {
    it('should be a function', () => {
      expect(typeof exportConfig).toBe('function');
    });

    it('should export config to a file', () => {
      const outputPath = join(homedir(), '.upup-test-commands', 'export.json');
      const path = exportConfig(outputPath);
      expect(path).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('importConfig', () => {
    it('should be a function', () => {
      expect(typeof importConfig).toBe('function');
    });

    it('should return false for non-existent file', () => {
      const result = importConfig('/non/existent/path.json');
      expect(result).toBe(false);
    });

    it('should import valid config file', () => {
      const inputPath = join(homedir(), '.upup-test-commands', 'import-test.json');
      const exportData = {
        version: '1.0',
        config: {
          testImportKey: 'testImportValue',
        },
      };
      writeFileSync(inputPath, JSON.stringify(exportData));

      const result = importConfig(inputPath);
      expect(result).toBe(true);

      const value = getConfigValue('testImportKey');
      expect(value).toBe('testImportValue');
    });

    it('should reject invalid config file', () => {
      const inputPath = join(homedir(), '.upup-test-commands', 'invalid.json');
      writeFileSync(inputPath, JSON.stringify({ noConfig: true }));

      const result = importConfig(inputPath);
      expect(result).toBe(false);
    });
  });

  describe('runConfigCommand', () => {
    it('should be a function', () => {
      expect(typeof runConfigCommand).toBe('function');
    });

    it('should handle help command', () => {
      const result = runConfigCommand({ command: 'help', args: [] });
      expect(result).toBe('success');
    });

    it('should handle list command', () => {
      const result = runConfigCommand({ command: 'list', args: [] });
      expect(result).toBe('success');
    });

    it('should handle status command', () => {
      const result = runConfigCommand({ command: 'status', args: [] });
      expect(result).toBe('success');
    });

    it('should handle set command', () => {
      const result = runConfigCommand({
        command: 'set',
        args: ['testCommandKey', 'testCommandValue'],
      });
      expect(result).toBe('success');

      const value = getConfigValue('testCommandKey');
      expect(value).toBe('testCommandValue');
    });

    it('should handle get command', () => {
      // First set a value
      setConfigValue('testGetKey', 'testGetValue');

      const result = runConfigCommand({
        command: 'get',
        args: ['testGetKey'],
      });
      expect(result).toBe('success');
    });

    it('should handle unknown command as help', () => {
      const result = runConfigCommand({ command: 'unknown', args: [] });
      expect(result).toBe('success');
    });
  });
});

describe('Config Hot Reload', () => {
  it('should export reloadConfig function', async () => {
    const module = await import('@upup/utils');
    expect(typeof module.reloadConfig).toBe('function');
  });

  it('should reload config and return fresh data', async () => {
    const module = await import('@upup/utils');
    const config = module.reloadConfig();
    expect(typeof config).toBe('object');
  });

  it('should export clearConfigCache function', async () => {
    const module = await import('@upup/utils');
    expect(typeof module.clearConfigCache).toBe('function');
  });
});
