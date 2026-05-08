/**
 * Memory Encryption Module
 *
 * Provides AES-256-GCM encryption for sensitive investment data at rest.
 * Uses Node.js crypto module for encryption/decryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';

// ============================================================================
// Types
// ============================================================================

export interface EncryptionConfig {
  /** Whether encryption is enabled */
  enabled: boolean;
  /** Key derivation salt (stored alongside data) */
  salt?: string;
}

export interface EncryptedPayload {
  /** Algorithm used */
  alg: 'aes-256-gcm';
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded auth tag */
  tag: string;
  /** Base64-encoded ciphertext */
  data: string;
  /** Key derivation salt */
  salt: string;
  /** Version for future migration */
  v: 1;
}

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128-bit IV for GCM
const TAG_LENGTH = 16;      // 128-bit auth tag
const KEY_LENGTH = 32;      // 256-bit key
const SALT_LENGTH = 32;     // 256-bit salt
const KEY_COST = 16384;     // scrypt N parameter

// ============================================================================
// Key Management
// ============================================================================

let _masterKey: string | null = null;

/**
 * Set the master encryption key (call once at startup)
 * Falls back to DEXTER_ENCRYPTION_KEY env var
 */
export function setMasterKey(key: string): void {
  _masterKey = key;
}

/**
 * Get master key from env or stored value
 */
function getMasterKey(): string {
  if (_masterKey) return _masterKey;
  const envKey = process.env.DEXTER_ENCRYPTION_KEY;
  if (envKey) return envKey;
  throw new Error('Encryption key not set. Call setMasterKey() or set DEXTER_ENCRYPTION_KEY env var.');
}

/**
 * Derive a 256-bit encryption key from master key + salt using scrypt
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH, { N: KEY_COST });
}

// ============================================================================
// Encryption / Decryption
// ============================================================================

/**
 * Encrypt a string using AES-256-GCM
 */
export function encrypt(plaintext: string, masterKey?: string): EncryptedPayload {
  const key = masterKey ?? getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(key, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
    salt: salt.toString('base64'),
    v: 1,
  };
}

/**
 * Decrypt an encrypted payload using AES-256-GCM
 */
export function decrypt(payload: EncryptedPayload, masterKey?: string): string {
  if (payload.alg !== 'aes-256-gcm') {
    throw new Error(`Unsupported encryption algorithm: ${payload.alg}`);
  }

  const key = masterKey ?? getMasterKey();
  const salt = Buffer.from(payload.salt, 'base64');
  const derivedKey = deriveKey(key, salt);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: TAG_LENGTH,
  });

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// ============================================================================
// File-level Encryption
// ============================================================================

/**
 * Encrypt and write content to a file
 */
export async function encryptToFile(
  filePath: string,
  plaintext: string,
  masterKey?: string,
): Promise<void> {
  const payload = encrypt(plaintext, masterKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload), 'utf-8');
}

/**
 * Read and decrypt content from a file
 */
export async function decryptFromFile(
  filePath: string,
  masterKey?: string,
): Promise<string | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const payload = JSON.parse(raw) as EncryptedPayload;

    if (!payload.alg || !payload.iv || !payload.tag || !payload.data) {
      // Not an encrypted file, return as-is
      return raw;
    }

    return decrypt(payload, masterKey);
  } catch {
    return null;
  }
}

/**
 * Check if a file content appears to be encrypted
 */
export function isEncrypted(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return !!(parsed?.alg === 'aes-256-gcm' && parsed?.iv && parsed?.tag && parsed?.data);
  } catch {
    return false;
  }
}

/**
 * Generate a new random master key (for initial setup)
 */
export function generateMasterKey(): string {
  return randomBytes(32).toString('hex');
}

// ============================================================================
// Encryption Status
// ============================================================================

/**
 * Check if encryption is configured (key available)
 */
export function isEncryptionAvailable(): boolean {
  return !!(_masterKey || process.env.DEXTER_ENCRYPTION_KEY);
}
