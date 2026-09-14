/**
 * Storage Adapter System
 *
 * Multi-level storage abstraction:
 * - Global: ~/.upup/ (default)
 * - Local: ./.upup/ (project-level)
 * - Backup: ~/.upup/backups/
 * - Remote: (预留 for future)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

/**
 * Storage priority levels
 */
export enum StorageLevel {
  Remote = 0,    // Remote storage (future)
  Backup = 1,    // Backup storage
  Local = 2,     // Project-local storage
  Global = 3,    // Global storage (default)
}

/**
 * Storage adapter options
 */
export interface StorageAdapterOptions {
  /** Storage level priority (higher = lower priority) */
  level: StorageLevel;
  /** Base directory */
  baseDir: string;
  /** Enable local override */
  allowLocal?: boolean;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  /** Storage level */
  level: StorageLevel;
  /** Get path within storage */
  getPath(...segments: string[]): string;
  /** Read JSON file */
  readJson<T>(filename: string): T | null;
  /** Write JSON file */
  writeJson<T>(filename: string, data: T): boolean;
  /** Check if file exists */
  exists(filename: string): boolean;
  /** Delete file */
  delete(filename: string): boolean;
  /** List files matching pattern */
  listFiles(pattern?: string): string[];
  /** Get storage stats */
  getStats(): StorageStats;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  fileCount: number;
  totalSize: number;
  path: string;
}

// ============================================================================
// Default Constants
// ============================================================================

const DEFAULT_GLOBAL_DIR = '.upup';

/**
 * Get global UpUp directory with configurable name
 */
export function getGlobalUpupDir(dirName: string = DEFAULT_GLOBAL_DIR): string {
  return join(homedir(), dirName);
}

/**
 * Get local UpUp directory (project-level)
 */
export function getLocalUpupDir(cwd: string, dirName: string = DEFAULT_GLOBAL_DIR): string {
  return join(cwd, dirName);
}

// ============================================================================
// Base Storage Adapter
// ============================================================================

/**
 * Base storage adapter with common functionality
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  level: StorageLevel;
  protected baseDir: string;

  constructor(options: StorageAdapterOptions) {
    this.level = options.level;
    this.baseDir = options.baseDir;
    this.ensureDir();
  }

  /**
   * Ensure directory exists
   */
  protected ensureDir(): void {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Get full path
   */
  getPath(...segments: string[]): string {
    return join(this.baseDir, ...segments);
  }

  /**
   * Read JSON file
   */
  readJson<T>(filename: string): T | null {
    const path = this.getPath(filename);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Write JSON file
   */
  writeJson<T>(filename: string, data: T): boolean {
    const path = this.getPath(filename);
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  exists(filename: string): boolean {
    return existsSync(this.getPath(filename));
  }

  /**
   * Delete file
   */
  delete(filename: string): boolean {
    const path = this.getPath(filename);
    if (!existsSync(path)) {
      return false;
    }
    try {
      rmSync(path, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files (override in subclass for pattern support)
   */
  listFiles(_pattern?: string): string[] {
    const { readdirSync } = require('fs');
    try {
      return readdirSync(this.baseDir);
    } catch {
      return [];
    }
  }

  /**
   * Get storage stats
   */
  getStats(): StorageStats {
    const { readdirSync, statSync } = require('fs');
    let fileCount = 0;
    let totalSize = 0;

    try {
      const files = readdirSync(this.baseDir);
      fileCount = files.length;
      for (const file of files) {
        try {
          const stats = statSync(this.getPath(file));
          totalSize += stats.size;
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Directory doesn't exist or inaccessible
    }

    return {
      fileCount,
      totalSize,
      path: this.baseDir,
    };
  }
}

// ============================================================================
// Global Storage Adapter
// ============================================================================

/**
 * Global storage adapter (~/.upup/)
 */
export class GlobalStorageAdapter extends BaseStorageAdapter {
  constructor(dirName: string = DEFAULT_GLOBAL_DIR) {
    super({
      level: StorageLevel.Global,
      baseDir: getGlobalUpupDir(dirName),
    });
  }
}

// ============================================================================
// Local Storage Adapter
// ============================================================================

/**
 * Local storage adapter (.upup/ in cwd)
 */
export class LocalStorageAdapter extends BaseStorageAdapter {
  private cwd: string;

  constructor(cwd: string, dirName: string = DEFAULT_GLOBAL_DIR) {
    super({
      level: StorageLevel.Local,
      baseDir: getLocalUpupDir(cwd, dirName),
    });
    this.cwd = cwd;
  }

  /**
   * List files with optional pattern
   */
  listFiles(pattern?: string): string[] {
    const { readdirSync } = require('fs');
    try {
      let files = readdirSync(this.baseDir);
      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        files = files.filter((f: string) => regex.test(f));
      }
      return files;
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Backup Storage Adapter
// ============================================================================

/**
 * Backup storage adapter (~/.upup/backups/)
 */
export class BackupStorageAdapter extends BaseStorageAdapter {
  constructor(globalDir?: string, dirName: string = DEFAULT_GLOBAL_DIR) {
    const baseDir = join(
      getGlobalUpupDir(dirName),
      'backups'
    );
    super({
      level: StorageLevel.Backup,
      baseDir,
    });
  }

  /**
   * Create backup of a file
   */
  createBackup(filename: string, sourcePath: string): boolean {
    const { copyFileSync } = require('fs');
    const timestamp = Date.now();
    const ext = basename(sourcePath).split('.').pop() || '';
    const backupName = `${filename}.${timestamp}.bak`;
    const destPath = this.getPath(backupName);

    try {
      copyFileSync(sourcePath, destPath);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Hierarchical Storage Manager
// ============================================================================

/**
 * Hierarchical storage manager supporting multiple levels
 */
export class HierarchicalStorageManager {
  private globalAdapter: GlobalStorageAdapter;
  private localAdapter?: LocalStorageAdapter;
  private backupAdapter: BackupStorageAdapter;
  private cwd: string;
  private dirName: string;

  constructor(cwd: string = process.cwd(), dirName: string = DEFAULT_GLOBAL_DIR) {
    this.cwd = cwd;
    this.dirName = dirName;
    this.globalAdapter = new GlobalStorageAdapter(dirName);
    this.backupAdapter = new BackupStorageAdapter(undefined, dirName);
    this.localAdapter = new LocalStorageAdapter(cwd, dirName);
  }

  /**
   * Get storage for specific level
   */
  getStorage(level: StorageLevel): StorageAdapter {
    switch (level) {
      case StorageLevel.Local:
        return this.localAdapter!;
      case StorageLevel.Backup:
        return this.backupAdapter;
      case StorageLevel.Global:
      default:
        return this.globalAdapter;
    }
  }

  /**
   * Get path with level priority
   * Lower level = higher priority (search order: local > global > backup)
   */
  getPath(...segments: string[]): string {
    return this.globalAdapter.getPath(...segments);
  }

  /**
   * Read value from highest priority storage
   * Search order: local > global
   */
  read<T>(filename: string): T | null {
    // Try local first
    if (this.localAdapter?.exists(filename)) {
      return this.localAdapter.readJson<T>(filename);
    }
    // Fall back to global
    if (this.globalAdapter.exists(filename)) {
      return this.globalAdapter.readJson<T>(filename);
    }
    return null;
  }

  /**
   * Write to specific level
   */
  write<T>(filename: string, data: T, level?: StorageLevel): boolean {
    const adapter = level !== undefined
      ? this.getStorage(level)
      : this.globalAdapter;
    return adapter.writeJson(filename, data);
  }

  /**
   * Check if exists in any storage
   */
  exists(filename: string): boolean {
    return (this.localAdapter?.exists(filename)) ||
           this.globalAdapter.exists(filename);
  }

  /**
   * Delete from specific level
   */
  delete(filename: string, level?: StorageLevel): boolean {
    const adapter = level !== undefined
      ? this.getStorage(level)
      : this.globalAdapter;
    return adapter.delete(filename);
  }

  /**
   * Get merged stats from all levels
   */
  getStats(): StorageStats {
    const global = this.globalAdapter.getStats();
    const local = this.localAdapter?.getStats();
    const backup = this.backupAdapter.getStats();

    return {
      fileCount: (local?.fileCount || 0) + global.fileCount + backup.fileCount,
      totalSize: (local?.totalSize || 0) + global.totalSize + backup.totalSize,
      path: global.path,
    };
  }

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Get configured directory name
   */
  getDirName(): string {
    return this.dirName;
  }
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultManager: HierarchicalStorageManager | null = null;

export function getHierarchicalStorage(cwd?: string): HierarchicalStorageManager {
  if (!defaultManager) {
    defaultManager = new HierarchicalStorageManager(cwd || process.cwd());
  }
  return defaultManager;
}

export function resetHierarchicalStorage(): void {
  defaultManager = null;
}

// ============================================================================
// Configuration Constants (Externalized)
// ============================================================================

/**
 * Default configuration values
 * These can be overridden via environment variables or config files
 */
export const STORAGE_DEFAULTS = {
  // Directory names
  DIR_NAME: DEFAULT_GLOBAL_DIR,

  // Cache settings
  CACHE_TTL_MS: 5000,          // 5 seconds (was hardcoded in project-storage.ts)
  CACHE_MAX_AGE_MS: 30000,     // 30 seconds max cache age

  // Stats settings
  STATS_DAYS_LIMIT: 365,       // Keep last 365 days (was hardcoded in stats-cache.ts)
  STATS_HOURS_COUNT: 24,        // Hour distribution buckets

  // File history settings
  MAX_SNAPSHOTS: 100,          // Max snapshots to keep
  BACKUP_VERSIONS: 10,         // Max backup versions per file

  // Storage limits
  MAX_TRANSCRIPT_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILE_SIZE: 10 * 1024 * 1024,       // 10MB
} as const;

// ============================================================================
// Environment Variable Overrides
// ============================================================================

/**
 * Get configuration from environment with fallback
 */
export function getConfig<T>(key: keyof typeof STORAGE_DEFAULTS, envKey: string, defaultValue: T): T {
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed)) {
      return parsed as unknown as T;
    }
    return envValue as unknown as T;
  }
  return defaultValue;
}

// ============================================================================
// Externalized Configuration Getters
// ============================================================================

/**
 * Get cache TTL with environment override
 */
export function getCacheTTL(): number {
  return getConfig('CACHE_TTL_MS', 'UPUP_CACHE_TTL_MS', STORAGE_DEFAULTS.CACHE_TTL_MS);
}

/**
 * Get stats days limit with environment override
 */
export function getStatsDaysLimit(): number {
  return getConfig('STATS_DAYS_LIMIT', 'UPUP_STATS_DAYS_LIMIT', STORAGE_DEFAULTS.STATS_DAYS_LIMIT);
}

/**
 * Get max snapshots with environment override
 */
export function getMaxSnapshots(): number {
  return getConfig('MAX_SNAPSHOTS', 'UPUP_MAX_SNAPSHOTS', STORAGE_DEFAULTS.MAX_SNAPSHOTS);
}

/**
 * Get storage directory name with environment override
 */
export function getStorageDirName(): string {
  return getConfig('DIR_NAME', 'UPUP_DIR_NAME', STORAGE_DEFAULTS.DIR_NAME);
}

/**
 * Get backup versions limit with environment override
 */
export function getBackupVersionsLimit(): number {
  return getConfig('BACKUP_VERSIONS', 'UPUP_BACKUP_VERSIONS', STORAGE_DEFAULTS.BACKUP_VERSIONS);
}