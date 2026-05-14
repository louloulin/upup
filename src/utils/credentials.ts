/**
 * Credentials Manager
 *
 * Provides encrypted storage for sensitive credentials (API keys, tokens).
 * Uses AES-256-GCM encryption with a machine-derived key.
 *
 * Part of Plan12 P1 implementation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { CREDENTIALS_FILE } from './storage-paths.js';

// AES-256-GCM encryption
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Credentials stored encrypted on disk
 */
interface StoredCredentials {
  [provider: string]: string; // encrypted value
}

/**
 * Credentials Manager for encrypted credential storage
 */
export class CredentialsManager {
  private key: Buffer;
  private credentialsPath: string;

  constructor(credentialsPath?: string) {
    this.credentialsPath = credentialsPath ?? CREDENTIALS_FILE;
    this.key = this.deriveKey();
  }

  /**
   * Derive encryption key from machine-specific data
   * Uses a combination of home directory and a fixed salt
   */
  private deriveKey(): Buffer {
    // Machine-specific salt derived from environment
    const machineId = `${homedir()}-upup-credentials-v1`;
    const salt = Buffer.from('upup-credentials-salt-v1');

    // Simple key derivation (in production, use PBKDF2 or similar)
    const key = Buffer.alloc(KEY_LENGTH);
    for (let i = 0; i < KEY_LENGTH; i++) {
      const charCode = machineId.charCodeAt(i % machineId.length);
      const saltByte = salt[i % salt.length];
      key[i] = (charCode * 31 + saltByte * 17) % 256;
    }

    return key;
  }

  /**
   * Check if credentials file exists
   */
  hasCredentialsFile(): boolean {
    return existsSync(this.credentialsPath);
  }

  /**
   * Load credentials from disk (encrypted)
   */
  private loadStoredCredentials(): StoredCredentials {
    if (!existsSync(this.credentialsPath)) {
      return {};
    }

    try {
      const content = readFileSync(this.credentialsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Save credentials to disk (encrypted)
   */
  private saveStoredCredentials(credentials: StoredCredentials): boolean {
    try {
      const dir = dirname(this.credentialsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.credentialsPath, JSON.stringify(credentials, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt a credential value
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a credential value
   */
  decrypt(encryptedData: string): string | null {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        return null;
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return null;
    }
  }

  /**
   * Save a credential for a provider
   */
  saveCredential(provider: string, value: string): boolean {
    const credentials = this.loadStoredCredentials();
    credentials[provider] = this.encrypt(value);
    return this.saveStoredCredentials(credentials);
  }

  /**
   * Get a credential for a provider
   */
  getCredential(provider: string): string | null {
    const credentials = this.loadStoredCredentials();
    const encrypted = credentials[provider];

    if (!encrypted) {
      return null;
    }

    return this.decrypt(encrypted);
  }

  /**
   * Check if a credential exists for a provider
   */
  hasCredential(provider: string): boolean {
    const credentials = this.loadStoredCredentials();
    return !!credentials[provider];
  }

  /**
   * Remove a credential for a provider
   */
  removeCredential(provider: string): boolean {
    const credentials = this.loadStoredCredentials();

    if (!credentials[provider]) {
      return false;
    }

    delete credentials[provider];
    return this.saveStoredCredentials(credentials);
  }

  /**
   * List all providers with stored credentials
   */
  listProviders(): string[] {
    const credentials = this.loadStoredCredentials();
    return Object.keys(credentials);
  }

  /**
   * Clear all stored credentials
   */
  clearAll(): boolean {
    return this.saveStoredCredentials({});
  }
}

// Singleton instance for convenience
let credentialsManager: CredentialsManager | null = null;

/**
 * Get the singleton CredentialsManager instance
 */
export function getCredentialsManager(): CredentialsManager {
  if (!credentialsManager) {
    credentialsManager = new CredentialsManager();
  }
  return credentialsManager;
}

/**
 * Convenience function to save an API key
 */
export function saveApiKey(provider: string, apiKey: string): boolean {
  return getCredentialsManager().saveCredential(provider, apiKey);
}

/**
 * Convenience function to get an API key
 */
export function getApiKey(provider: string): string | null {
  return getCredentialsManager().getCredential(provider);
}

/**
 * Convenience function to check if an API key exists
 */
export function hasApiKey(provider: string): boolean {
  return getCredentialsManager().hasCredential(provider);
}
