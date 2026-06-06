/**
 * Tests for Encrypted Memory Store
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EncryptedMemoryStore } from './encrypted-store.js';

describe('EncryptedMemoryStore', () => {
  const TEST_DIR = join('/tmp', `upup-encrypted-store-test-${process.pid}`);
  const testKey = 'test-encryption-key-32-characters!';

  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    try {
      const files = ['sensitive.md', 'general.md', 'portfolio.md'];
      for (const file of files) {
        const path = join(TEST_DIR, 'memory', file);
        if (existsSync(path)) {
          unlinkSync(path);
        }
      }
      const memoryDir = join(TEST_DIR, 'memory');
      if (existsSync(memoryDir)) {
        rmdirSync(memoryDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  function rmdirSync(path: string): void {
    try {
      const { readdirSync, rmdirSync, unlinkSync } = require('fs');
      const entries = readdirSync(path);
      for (const entry of entries) {
        const fullPath = join(path, entry);
        try {
          unlinkSync(fullPath);
        } catch {
          // ignore
        }
      }
      rmdirSync(path);
    } catch {
      // ignore
    }
  }

  describe('encryption detection', () => {
    it('auto-detects encryption from env when enabled', () => {
      process.env.UPUP_ENCRYPTION_KEY = testKey;
      const store = new EncryptedMemoryStore(TEST_DIR);
      expect(store.isActive()).toBe(true);
      delete process.env.UPUP_ENCRYPTION_KEY;
    });

    it('disables encryption when no key available', () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { enabled: true });
      expect(store.isActive()).toBe(false);
    });

    it('respects enabled=false option', () => {
      const store = new EncryptedMemoryStore(TEST_DIR, {
        enabled: false,
        key: testKey,
      });
      expect(store.isActive()).toBe(false);
    });
  });

  describe('write/read operations', () => {
    it('writes plaintext when encryption disabled', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { enabled: false });
      await store.write('general.md', 'Plain text content');

      const content = await store.read('general.md', 'general');
      expect(content).toBe('Plain text content');
    });

    it('writes encrypted content when encryption enabled', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { key: testKey });
      await store.write('sensitive.md', 'Secret data', 'investment');

      // Read raw file - should be encrypted
      const rawPath = join(TEST_DIR, 'memory', 'sensitive.md');
      const rawContent = require('fs').readFileSync(rawPath, 'utf-8');
      expect(rawContent).toContain('"alg":"aes-256-gcm"');
      expect(rawContent).not.toContain('Secret data');
    });

    it('decrypts content when reading encrypted file', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { key: testKey });
      await store.write('sensitive.md', 'Secret data', 'investment');

      const content = await store.read('sensitive.md', 'investment');
      expect(content).toBe('Secret data');
    });

    it('auto-detects sensitive categories for encryption', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { key: testKey });

      // These categories should be encrypted
      await store.write('test1.md', 'Data 1', 'portfolio');
      await store.write('test2.md', 'Data 2', 'trade');
      await store.write('test3.md', 'Data 3', 'sensitive');

      // These should not be encrypted
      await store.write('test4.md', 'Data 4', 'reference');
      await store.write('test5.md', 'Data 5', 'general');
    });

    it('skips encryption for plaintext categories', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { key: testKey });
      await store.write('ref.md', 'Plain text', 'reference');

      const rawPath = join(TEST_DIR, 'memory', 'ref.md');
      const rawContent = require('fs').readFileSync(rawPath, 'utf-8');
      expect(rawContent).toBe('Plain text');
    });
  });

  describe('runtime configuration', () => {
    it('enables encryption at runtime', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { enabled: false });
      expect(store.isActive()).toBe(false);

      store.setKey(testKey);
      store.setEnabled(true);
      expect(store.isActive()).toBe(true);

      await store.write('memory/test.md', 'Encrypted content', 'investment');
      const content = await store.read('memory/test.md', 'investment');
      expect(content).toBe('Encrypted content');
    });

    it('disables encryption at runtime', async () => {
      const store = new EncryptedMemoryStore(TEST_DIR, { key: testKey });
      expect(store.isActive()).toBe(true);

      store.setEnabled(false);
      expect(store.isActive()).toBe(false);

      await store.write('memory/test.md', 'Plain content');
      const content = await store.read('memory/test.md');
      expect(content).toBe('Plain content');
    });
  });

  describe('getStore()', () => {
    it('returns underlying store for non-encrypted operations', () => {
      const store = new EncryptedMemoryStore(TEST_DIR);
      const underlying = store.getStore();
      expect(underlying).toBeDefined();
    });
  });
});
