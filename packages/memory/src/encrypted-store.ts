/**
 * Encrypted Memory Store
 *
 * Wraps MemoryStore with AES-256-GCM encryption for sensitive investment data.
 * Automatically encrypts/decrypts memory content when encryption is enabled.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MemoryStore } from './store';
import { encrypt, decrypt, setMasterKey, isEncryptionAvailable } from './crypto';

export interface EncryptedMemoryStoreOptions {
  /** Enable encryption (default: auto-detect from env) */
  enabled?: boolean;
  /** Encryption key (default: from UPUP_ENCRYPTION_KEY env) */
  key?: string;
  /** Categories to always encrypt */
  encryptedCategories?: string[];
  /** Categories to never encrypt */
  plaintextCategories?: string[];
}

const DEFAULT_ENCRYPTED_CATEGORIES = ['investment', 'portfolio', 'trade', 'position', 'sensitive'];
const DEFAULT_PLAINTEXT_CATEGORIES = ['reference', 'general'];

export class EncryptedMemoryStore {
  private store: MemoryStore;
  private encryptionEnabled: boolean;
  private key: string | null;
  private encryptedCategories: Set<string>;
  private plaintextCategories: Set<string>;

  constructor(baseDir?: string, options: EncryptedMemoryStoreOptions = {}) {
    this.store = new MemoryStore(baseDir);

    // Determine if encryption should be enabled
    this.encryptionEnabled = options.enabled ?? isEncryptionAvailable();
    this.key = options.key ?? process.env.UPUP_ENCRYPTION_KEY ?? null;
    this.encryptedCategories = new Set(options.encryptedCategories ?? DEFAULT_ENCRYPTED_CATEGORIES);
    this.plaintextCategories = new Set(options.plaintextCategories ?? DEFAULT_PLAINTEXT_CATEGORIES);

    // If key provided, set it as master key
    if (this.key) {
      setMasterKey(this.key);
    }
  }

  /**
   * Ensure the directory for a given path exists
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const resolved = join(this.store.getMemoryDir(), filePath);
    const dir = dirname(resolved);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Check if content should be encrypted based on category
   */
  private shouldEncrypt(category?: string): boolean {
    if (!this.encryptionEnabled || !this.key) {
      return false;
    }

    if (!category) {
      return false; // Unknown category - don't encrypt by default
    }

    const lowerCategory = category.toLowerCase();

    // Check if this category should never be encrypted
    for (const exempt of this.plaintextCategories) {
      if (lowerCategory.includes(exempt)) {
        return false;
      }
    }

    // Check if this category should be encrypted
    for (const sensitive of this.encryptedCategories) {
      if (lowerCategory.includes(sensitive)) {
        return true;
      }
    }

    return false; // Default: don't encrypt
  }

  /**
   * Read and decrypt memory content
   */
  async read(path: string, category?: string): Promise<string> {
    const content = await this.store.readMemoryFile(path);

    if (!content || !this.shouldEncrypt(category)) {
      return content;
    }

    try {
      const payload = JSON.parse(content);
      // Check if content is encrypted
      if (payload.alg === 'aes-256-gcm') {
        return decrypt(payload, this.key!);
      }
    } catch {
      // Not encrypted JSON, return as-is
    }

    return content;
  }

  /**
   * Encrypt and write memory content
   */
  async write(path: string, content: string, category?: string): Promise<void> {
    await this.ensureDirectory(path);
    if (this.shouldEncrypt(category)) {
      const encrypted = encrypt(content, this.key!);
      await this.store.writeMemoryFile(path, JSON.stringify(encrypted));
    } else {
      await this.store.writeMemoryFile(path, content);
    }
  }

  /**
   * Append encrypted memory content
   */
  async append(path: string, content: string, category?: string): Promise<void> {
    await this.ensureDirectory(path);
    if (this.shouldEncrypt(category)) {
      const encrypted = encrypt(content, this.key!);
      await this.store.appendMemoryFile(path, JSON.stringify(encrypted));
    } else {
      await this.store.appendMemoryFile(path, content);
    }
  }

  /**
   * Edit memory content (re-encrypts if needed)
   */
  async edit(path: string, oldText: string, newText: string, category?: string): Promise<boolean> {
    if (this.shouldEncrypt(category)) {
      // Read current content
      const content = await this.read(path, category);

      if (!content.includes(oldText)) {
        return false;
      }

      const updated = content.replace(oldText, newText);
      await this.write(path, updated, category);
      return true;
    } else {
      return this.store.editInMemoryFile(path, oldText, newText);
    }
  }

  /**
   * Delete from memory file
   */
  async delete(path: string, textToDelete: string, category?: string): Promise<boolean> {
    return this.store.deleteFromMemoryFile(path, textToDelete);
  }

  /**
   * Get the underlying store (for non-encrypted operations)
   */
  getStore(): MemoryStore {
    return this.store;
  }

  /**
   * Check if encryption is currently active
   */
  isActive(): boolean {
    return this.encryptionEnabled && !!this.key;
  }

  /**
   * Enable/disable encryption at runtime
   */
  setEnabled(enabled: boolean): void {
    this.encryptionEnabled = enabled;
  }

  /**
   * Set encryption key at runtime
   */
  setKey(key: string): void {
    this.key = key;
    setMasterKey(key);
  }
}
