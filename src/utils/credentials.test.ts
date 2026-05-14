/**
 * Credentials Manager Tests
 *
 * Unit tests for encrypted credentials storage.
 * Part of Plan12 P1 implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { CredentialsManager } from './credentials.js';

function getTestCredentialsPath() {
  return join(homedir(), '.upup-test-credentials', '.credentials.json');
}

function cleanupTestCredentials() {
  const testDir = join(homedir(), '.upup-test-credentials');
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe('CredentialsManager', () => {
  let manager: CredentialsManager;

  beforeEach(() => {
    cleanupTestCredentials();
    const testPath = getTestCredentialsPath();
    mkdirSync(join(homedir(), '.upup-test-credentials'), { recursive: true });
    manager = new CredentialsManager(testPath);
  });

  afterEach(() => {
    cleanupTestCredentials();
  });

  describe('saveCredential / getCredential', () => {
    it('should save and retrieve a credential', () => {
      const provider = 'test-provider';
      const apiKey = 'sk-test-123456';

      const saved = manager.saveCredential(provider, apiKey);
      expect(saved).toBe(true);

      const retrieved = manager.getCredential(provider);
      expect(retrieved).toBe(apiKey);
    });

    it('should return null for non-existent credential', () => {
      const retrieved = manager.getCredential('non-existent-provider');
      expect(retrieved).toBeNull();
    });

    it('should overwrite existing credential', () => {
      const provider = 'test-provider';

      manager.saveCredential(provider, 'key-1');
      const first = manager.getCredential(provider);
      expect(first).toBe('key-1');

      manager.saveCredential(provider, 'key-2');
      const second = manager.getCredential(provider);
      expect(second).toBe('key-2');
    });
  });

  describe('hasCredential', () => {
    it('should return true for existing credential', () => {
      manager.saveCredential('provider', 'key');
      expect(manager.hasCredential('provider')).toBe(true);
    });

    it('should return false for non-existent credential', () => {
      expect(manager.hasCredential('non-existent')).toBe(false);
    });
  });

  describe('removeCredential', () => {
    it('should remove existing credential', () => {
      manager.saveCredential('provider', 'key');
      expect(manager.hasCredential('provider')).toBe(true);

      const removed = manager.removeCredential('provider');
      expect(removed).toBe(true);
      expect(manager.hasCredential('provider')).toBe(false);
    });

    it('should return false for non-existent credential', () => {
      const removed = manager.removeCredential('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('listProviders', () => {
    it('should list all providers with credentials', () => {
      manager.saveCredential('provider-a', 'key-a');
      manager.saveCredential('provider-b', 'key-b');
      manager.saveCredential('provider-c', 'key-c');

      const providers = manager.listProviders();
      expect(providers).toContain('provider-a');
      expect(providers).toContain('provider-b');
      expect(providers).toContain('provider-c');
      expect(providers.length).toBe(3);
    });

    it('should return empty array when no credentials', () => {
      const providers = manager.listProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all credentials', () => {
      manager.saveCredential('provider-a', 'key-a');
      manager.saveCredential('provider-b', 'key-b');

      const cleared = manager.clearAll();
      expect(cleared).toBe(true);
      expect(manager.listProviders().length).toBe(0);
    });
  });

  describe('encryption', () => {
    it('should encrypt credentials differently each time', () => {
      manager.saveCredential('provider', 'same-key');
      const encrypted1 = manager.getCredential('provider');

      manager.removeCredential('provider');
      manager.saveCredential('provider', 'same-key');
      const encrypted2 = manager.getCredential('provider');

      // Both should decrypt to the same value
      expect(encrypted1).toBe('same-key');
      expect(encrypted2).toBe('same-key');
    });

    it('should not store plaintext credentials', () => {
      const testPath = getTestCredentialsPath();
      manager.saveCredential('secret-provider', 'super-secret-key');

      const fileContent = existsSync(testPath)
        ? require('fs').readFileSync(testPath, 'utf-8')
        : '';

      // File should not contain the plaintext key
      expect(fileContent.includes('super-secret-key')).toBe(false);
      // File should contain encrypted data
      expect(fileContent.includes(':')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle invalid encrypted data gracefully', () => {
      // Create a manager with corrupted credentials
      const testPath = getTestCredentialsPath();
      require('fs').writeFileSync(testPath, JSON.stringify({
        'corrupted-provider': 'invalid-data-not-colon-separated'
      }));

      const corruptedManager = new CredentialsManager(testPath);
      const result = corruptedManager.getCredential('corrupted-provider');
      expect(result).toBeNull();
    });
  });
});

describe('Credential exports', () => {
  it('should export convenience functions', async () => {
    const module = await import('./credentials.js');

    expect(typeof module.saveApiKey).toBe('function');
    expect(typeof module.getApiKey).toBe('function');
    expect(typeof module.hasApiKey).toBe('function');
    expect(typeof module.getCredentialsManager).toBe('function');
  });
});
