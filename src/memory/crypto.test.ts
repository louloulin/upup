/**
 * Memory Encryption Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_DIR = path.join(os.tmpdir(), `dexter-crypto-test-${process.pid}`);

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

describe('Memory Crypto', () => {
  it('should encrypt and decrypt text', async () => {
    const { encrypt, decrypt } = await import('./crypto.js');
    
    const plaintext = 'Sensitive investment data: Portfolio value $1,000,000';
    const key = 'test-master-key-12345';
    
    const encrypted = encrypt(plaintext, key);
    
    expect(encrypted.alg).toBe('aes-256-gcm');
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.data).toBeDefined();
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.v).toBe(1);
    
    // Data should not contain plaintext
    expect(encrypted.data).not.toContain('Sensitive');
    
    // Decrypt should return original
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext', async () => {
    const { encrypt } = await import('./crypto.js');
    
    const plaintext = 'Same content';
    const key = 'test-key';
    
    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);
    
    // Different IVs mean different ciphertexts
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.data).not.toBe(encrypted2.data);
  });

  it('should fail decryption with wrong key', async () => {
    const { encrypt, decrypt } = await import('./crypto.js');
    
    const plaintext = 'Secret data';
    const encrypted = encrypt(plaintext, 'correct-key');
    
    expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
  });

  it('should encrypt and decrypt file', async () => {
    const { encryptToFile, decryptFromFile } = await import('./crypto.js');
    
    const filePath = path.join(TEST_DIR, 'encrypted.json');
    const plaintext = 'Investment portfolio data with sensitive info';
    const key = 'file-test-key';
    
    await encryptToFile(filePath, plaintext, key);
    
    // File should exist and be JSON
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.alg).toBe('aes-256-gcm');
    
    // Decrypt
    const decrypted = await decryptFromFile(filePath, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should detect encrypted content', async () => {
    const { isEncrypted, encrypt } = await import('./crypto.js');
    
    const encrypted = encrypt('test', 'key');
    const encryptedJson = JSON.stringify(encrypted);
    
    expect(isEncrypted(encryptedJson)).toBe(true);
    expect(isEncrypted('plain text content')).toBe(false);
    expect(isEncrypted('{"not":"encrypted"}')).toBe(false);
  });

  it('should generate master key', async () => {
    const { generateMasterKey } = await import('./crypto.js');
    
    const key1 = generateMasterKey();
    const key2 = generateMasterKey();
    
    expect(key1).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(key1).not.toBe(key2);  // Should be unique
  });

  it('should check encryption availability', async () => {
    const { isEncryptionAvailable, setMasterKey } = await import('./crypto.js');
    
    // Without key set and no env var
    const originalEnv = process.env.DEXTER_ENCRYPTION_KEY;
    delete process.env.DEXTER_ENCRYPTION_KEY;
    
    setMasterKey('test-key');
    expect(isEncryptionAvailable()).toBe(true);
    
    // Clean up
    setMasterKey('');
    if (originalEnv) process.env.DEXTER_ENCRYPTION_KEY = originalEnv;
  });
});
