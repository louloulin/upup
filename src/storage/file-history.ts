/**
 * File History System
 *
 * Implements file versioning and history:
 * - Track file changes before edits
 * - Create backups at specified versions
 * - Store in ~/.upup/file-history/{sessionId}/
 * - Restore file to any previous version
 * - Smart change detection (stat + mtime + content)
 * - Diff statistics (insertions/deletions)
 * - Incremental snapshots (only changed files)
 *
 * Reference: Claude Code's src/utils/fileHistory.ts
 */

import { globalUpupPath } from '../utils/storage-paths.js';
import { hashFile } from './crypto-utils.js';
import { getMaxSnapshots } from './storage-adapter.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum number of snapshots to keep
 */
const MAX_SNAPSHOTS = getMaxSnapshots();

// ============================================================================
// Types
// ============================================================================

/**
 * File history backup
 */
export interface FileHistoryBackup {
  /** Backup file name */
  backupFileName: string;
  /** Version number */
  version: number;
  /** Backup timestamp */
  backupTime: number;
}

/**
 * File history snapshot
 */
export interface FileHistorySnapshot {
  /** Associated message ID */
  messageId: string;
  /** Map of file paths to backups */
  trackedFileBackups: Record<string, FileHistoryBackup | null>;
  /** Snapshot timestamp */
  timestamp: number;
}

/**
 * File history state
 */
export interface FileHistoryState {
  /** All snapshots */
  snapshots: FileHistorySnapshot[];
  /** Currently tracked files */
  trackedFiles: Set<string>;
  /** Snapshot sequence number */
  snapshotSequence: number;
}

/**
 * Tracked file info
 */
export interface TrackedFile {
  /** File path */
  path: string;
  /** File hash (SHA256) */
  hash: string;
  /** Current version */
  version: number;
  /** Backup directory */
  backupDir: string;
  /** Last backup time */
  lastBackupTime: number;
  /** Last known file stats */
  lastStats?: FileStats;
}

/**
 * File stats for change detection
 */
export interface FileStats {
  /** File size */
  size: number;
  /** Last modified time */
  mtime: number;
  /** File permissions */
  mode: number;
}

/**
 * Diff statistics
 */
export interface DiffStats {
  /** Files that changed */
  filesChanged: string[];
  /** Total insertions */
  insertions: number;
  /** Total deletions */
  deletions: number;
}

/**
 * Change detection result
 */
interface ChangeDetectionResult {
  /** Whether file has changed */
  changed: boolean;
  /** Reason for change */
  reason: 'none' | 'stats' | 'content';
  /** New hash if changed */
  newHash?: string;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get file history directory
 */
export function getFileHistoryDir(sessionId?: string): string {
  return globalUpupPath('file-history', sessionId || 'default');
}

/**
 * Get backup file path using SHA256 hash
 */
export function getBackupPath(
  sessionId: string,
  fileHash: string,
  version: number
): string {
  const dir = getFileHistoryDir(sessionId);
  return path.join(dir, `${fileHash}@v${version}`);
}

/**
 * Generate SHA256 hash for file path
 */
function hashFilePath(filePath: string): string {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Get file stats safely
 */
function getFileStats(filePath: string): FileStats | null {
  try {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      mtime: stats.mtimeMs,
      mode: stats.mode,
    };
  } catch {
    return null;
  }
}

/**
 * Check if file content has changed by comparing hashes
 */
function hasContentChanged(filePath: string, oldHash: string): boolean {
  const newHash = hashFile(filePath);
  return newHash !== oldHash;
}

/**
 * Detect if file has changed using smart detection
 * Priority: stats check first (fast), then content check (slow)
 */
function detectFileChange(
  filePath: string,
  lastStats?: FileStats
): ChangeDetectionResult {
  const currentStats = getFileStats(filePath);

  // File deleted
  if (!currentStats) {
    if (lastStats) {
      return { changed: true, reason: 'stats' };
    }
    return { changed: false, reason: 'none' };
  }

  // New file (no previous stats)
  if (!lastStats) {
    return { changed: true, reason: 'stats' };
  }

  // Check size first (fast)
  if (currentStats.size !== lastStats.size) {
    return { changed: true, reason: 'stats' };
  }

  // Check mtime (if file was modified after last backup, verify content)
  if (currentStats.mtime > lastStats.mtime) {
    const newHash = hashFile(filePath);
    // We can't compare hashes without storing them, so always backup on mtime change
    return { changed: true, reason: 'content', newHash };
  }

  // Check mode (permissions changed)
  if (currentStats.mode !== lastStats.mode) {
    return { changed: true, reason: 'stats' };
  }

  return { changed: false, reason: 'none' };
}

// ============================================================================
// Diff Statistics
// ============================================================================

/**
 * Compute diff between two files
 */
function computeDiff(
  originalContent: string,
  backupContent: string
): { insertions: number; deletions: number } {
  const originalLines = originalContent.split('\n');
  const backupLines = backupContent.split('\n');

  // Simple line-by-line diff
  const originalSet = new Set(originalLines);
  const backupSet = new Set(backupLines);

  let insertions = 0;
  let deletions = 0;

  // Lines in backup but not in original (insertions)
  for (const line of backupLines) {
    if (!originalSet.has(line)) {
      insertions++;
    }
  }

  // Lines in original but not in backup (deletions)
  for (const line of originalLines) {
    if (!backupSet.has(line)) {
      deletions++;
    }
  }

  return { insertions, deletions };
}

/**
 * Calculate diff stats for a file compared to its backup
 */
export function fileHistoryGetDiffStats(
  filePath: string,
  backup: FileHistoryBackup,
  sessionId: string = 'default'
): DiffStats {
  const backupPath = path.join(getFileHistoryDir(sessionId), backup.backupFileName);

  let insertions = 0;
  let deletions = 0;
  const filesChanged: string[] = [];

  try {
    const originalContent = fs.readFileSync(filePath, 'utf-8');
    const backupContent = fs.existsSync(backupPath)
      ? fs.readFileSync(backupPath, 'utf-8')
      : '';

    const diff = computeDiff(originalContent, backupContent);
    insertions = diff.insertions;
    deletions = diff.deletions;

    if (insertions > 0 || deletions > 0) {
      filesChanged.push(filePath);
    }
  } catch {
    // File or backup doesn't exist
  }

  return { filesChanged, insertions, deletions };
}

// ============================================================================
// List Backups
// ============================================================================

/**
 * List backup files for a hash
 */
export function listBackupsForFile(
  sessionId: string,
  fileHash: string
): FileHistoryBackup[] {
  const dir = getFileHistoryDir(sessionId);

  if (!fs.existsSync(dir)) {
    return [];
  }

  const prefix = `${fileHash}@v`;
  const files = fs.readdirSync(dir).filter((f: string) => f.startsWith(prefix));

  return files.map((f: string) => {
    const version = parseInt(f.replace(prefix, '').replace('.bak', ''), 10);
    const stats = fs.statSync(path.join(dir, f));
    return {
      backupFileName: f,
      version,
      backupTime: stats.mtimeMs,
    };
  }).sort((a: FileHistoryBackup, b: FileHistoryBackup) => a.version - b.version);
}

// ============================================================================
// File History Manager
// ============================================================================

/**
 * File History Manager with smart change detection
 */
export class FileHistoryManager {
  private sessionId: string;
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private snapshots: FileHistorySnapshot[] = [];
  private snapshotSequence: number = 0;
  private backupDir: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || 'default';
    this.backupDir = getFileHistoryDir(this.sessionId);
    this.ensureBackupDir();
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.backupDir = getFileHistoryDir(sessionId);
    this.ensureBackupDir();
  }

  /**
   * Start tracking a file
   */
  trackFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      return; // File doesn't exist yet
    }

    const hash = hashFile(filePath);
    const stats = getFileStats(filePath);
    const version = 1;

    this.trackedFiles.set(filePath, {
      path: filePath,
      hash,
      version,
      backupDir: this.backupDir,
      lastBackupTime: Date.now(),
      lastStats: stats || undefined,
    });

    // Create initial backup
    this.createBackup(filePath, 'initial');
  }

  /**
   * Stop tracking a file
   */
  untrackFile(filePath: string): void {
    this.trackedFiles.delete(filePath);
  }

  /**
   * Get all tracked files
   */
  getTrackedFiles(): string[] {
    return [...this.trackedFiles.keys()];
  }

  /**
   * Check if file is tracked
   */
  isTracked(filePath: string): boolean {
    return this.trackedFiles.has(filePath);
  }

  /**
   * Check if file has any changes compared to a snapshot
   */
  hasAnyChanges(filePath: string, snapshotIndex: number): boolean {
    const snapshot = this.snapshots[snapshotIndex];
    if (!snapshot) return false;

    const snapshotBackup = snapshot.trackedFileBackups[filePath];
    if (!snapshotBackup) return false;

    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) return false;

    // Compare with current state
    const currentStats = getFileStats(filePath);
    if (!currentStats) return true; // File was deleted

    const changeResult = detectFileChange(filePath, tracked.lastStats);
    return changeResult.changed;
  }

  /**
   * Create a backup for a file (smart: only if changed)
   */
  createBackup(filePath: string, reason: string = 'edit'): FileHistoryBackup | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) {
      // Auto-track if not already tracked
      this.trackFile(filePath);
      return this.createBackup(filePath, reason);
    }

    // Smart change detection
    const changeResult = detectFileChange(filePath, tracked.lastStats);

    // If file hasn't changed, reuse existing backup info
    if (!changeResult.changed) {
      return {
        backupFileName: tracked.hash + '@v' + tracked.version,
        version: tracked.version,
        backupTime: tracked.lastBackupTime,
      };
    }

    // File has changed, create new backup
    tracked.version++;
    const newVersion = tracked.version;

    // Recalculate hash
    const newHash = hashFile(filePath);
    tracked.hash = newHash;

    // Update stats
    tracked.lastStats = getFileStats(filePath) || undefined;
    tracked.lastBackupTime = Date.now();

    // Create backup file with SHA256 hash prefix
    const backupPath = getBackupPath(this.sessionId, newHash, newVersion);
    fs.copyFileSync(filePath, backupPath);

    const backup: FileHistoryBackup = {
      backupFileName: `${newHash}@v${newVersion}`,
      version: newVersion,
      backupTime: tracked.lastBackupTime,
    };

    return backup;
  }

  /**
   * Restore file to a specific version
   */
  async restoreToVersion(
    filePath: string,
    version: number
  ): Promise<boolean> {
    const tracked = this.trackedFiles.get(filePath);

    if (!tracked) {
      return false;
    }

    // Get all backups for current hash
    const backups = listBackupsForFile(this.sessionId, tracked.hash);
    const backup = backups.find(b => b.version === version);

    if (!backup) {
      return false;
    }

    const backupPath = path.join(this.backupDir, backup.backupFileName);

    if (!fs.existsSync(backupPath)) {
      return false;
    }

    // Restore from backup
    fs.copyFileSync(backupPath, filePath);

    // Update tracked file
    const newHash = hashFile(filePath);
    tracked.hash = newHash;
    tracked.version++;
    tracked.lastStats = getFileStats(filePath) || undefined;
    tracked.lastBackupTime = Date.now();

    return true;
  }

  /**
   * Get list of backup versions for a file
   */
  getBackupVersions(filePath: string): FileHistoryBackup[] {
    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) {
      return [];
    }
    return listBackupsForFile(this.sessionId, tracked.hash);
  }

  /**
   * Create a snapshot of all tracked files (incremental: only changed files)
   */
  createSnapshot(messageId: string): FileHistorySnapshot {
    const trackedFileBackups: Record<string, FileHistoryBackup | null> = {};

    for (const [filePath] of this.trackedFiles) {
      // Create backup only if file has changed (incremental)
      const backup = this.createBackup(filePath, 'snapshot');
      trackedFileBackups[filePath] = backup;
    }

    const snapshot: FileHistorySnapshot = {
      messageId,
      trackedFileBackups,
      timestamp: Date.now(),
    };

    this.snapshots.push(snapshot);
    this.snapshotSequence++;

    // Enforce MAX_SNAPSHOTS limit
    while (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): FileHistorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get snapshot by index
   */
  getSnapshot(index: number): FileHistorySnapshot | null {
    return this.snapshots[index] ?? null;
  }

  /**
   * Get snapshot by message ID
   */
  getSnapshotByMessageId(messageId: string): FileHistorySnapshot | null {
    return this.snapshots.find(s => s.messageId === messageId) ?? null;
  }

  /**
   * Revert to a previous snapshot
   */
  async revertToSnapshot(snapshotIndex: number): Promise<void> {
    const snapshot = this.snapshots[snapshotIndex];
    if (!snapshot) {
      return;
    }

    for (const [filePath, backup] of Object.entries(snapshot.trackedFileBackups)) {
      if (backup) {
        await this.restoreToVersion(filePath, backup.version);
      }
    }
  }

  /**
   * Get diff stats for a snapshot
   */
  getSnapshotDiffStats(snapshotIndex: number): DiffStats {
    const snapshot = this.snapshots[snapshotIndex];
    if (!snapshot) {
      return { filesChanged: [], insertions: 0, deletions: 0 };
    }

    const result: DiffStats = {
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    };

    for (const [filePath, backup] of Object.entries(snapshot.trackedFileBackups)) {
      if (backup && fs.existsSync(filePath)) {
        const diff = fileHistoryGetDiffStats(filePath, backup, this.sessionId);
        if (diff.filesChanged.length > 0) {
          result.filesChanged.push(filePath);
          result.insertions += diff.insertions;
          result.deletions += diff.deletions;
        }
      }
    }

    return result;
  }

  /**
   * Copy file history for session resume with hardlink + copy fallback
   */
  async copyForResume(targetSessionId: string): Promise<void> {
    if (!fs.existsSync(this.backupDir)) {
      return;
    }

    const targetDir = getFileHistoryDir(targetSessionId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy all backup files with hardlink support
    const files = fs.readdirSync(this.backupDir);
    for (const file of files) {
      const sourcePath = path.join(this.backupDir, file);
      const targetPath = path.join(targetDir, file);

      try {
        // Try hardlink first (faster, saves space)
        fs.linkSync(sourcePath, targetPath);
      } catch {
        // Fallback to copy if hardlink fails (cross-device, permissions)
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  /**
   * Shorten file path relative to cwd for display
   */
  maybeShortenFilePath(filePath: string, cwd: string): string {
    try {
      // Try to make path relative to cwd
      const relativePath = path.relative(cwd, filePath);
      // If the result is shorter, use it
      if (relativePath.length < filePath.length && !relativePath.startsWith('..')) {
        return relativePath;
      }
      return filePath;
    } catch {
      return filePath;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    trackedFileCount: number;
    snapshotCount: number;
    backupFileCount: number;
    backupSizeBytes: number;
    maxSnapshots: number;
  } {
    let backupFileCount = 0;
    let backupSizeBytes = 0;

    if (fs.existsSync(this.backupDir)) {
      const files = fs.readdirSync(this.backupDir);
      backupFileCount = files.length;

      for (const file of files) {
        try {
          const stats = fs.statSync(path.join(this.backupDir, file));
          backupSizeBytes += stats.size;
        } catch {
          // Skip inaccessible files
        }
      }
    }

    return {
      trackedFileCount: this.trackedFiles.size,
      snapshotCount: this.snapshots.length,
      backupFileCount,
      backupSizeBytes,
      maxSnapshots: MAX_SNAPSHOTS,
    };
  }

  /**
   * Clear all history
   */
  clear(): void {
    if (fs.existsSync(this.backupDir)) {
      fs.rmSync(this.backupDir, { recursive: true });
    }

    this.trackedFiles.clear();
    this.snapshots = [];
    this.snapshotSequence = 0;
    this.ensureBackupDir();
  }

  // ============================================================================
  // Debug Utilities (F20)
  // ============================================================================

  /**
   * Dump current state for debugging (F20)
   */
  maybeDumpStateForDebug(): void {
    // Only dump in development or when UPUP_DEBUG is set
    if (process.env.NODE_ENV === 'production' && !process.env.UPUP_DEBUG) {
      return;
    }

    const stats = this.getStats();
    const state = {
      sessionId: this.sessionId,
      backupDir: this.backupDir,
      trackedFiles: [...this.trackedFiles.keys()],
      snapshotCount: this.snapshots.length,
      trackedFileCount: stats.trackedFileCount,
      backupFileCount: stats.backupFileCount,
      backupSizeBytes: stats.backupSizeBytes,
      maxSnapshots: stats.maxSnapshots,
    };

    if (process.env.UPUP_DEBUG === 'verbose') {
      console.log('[FileHistory Debug]', JSON.stringify(state, null, 2));
    } else {
      console.log('[FileHistory Debug]', JSON.stringify(state));
    }
  }

  /**
   * Export state for persistence
   */
  export(): FileHistoryState {
    return {
      snapshots: this.snapshots,
      trackedFiles: new Set(this.trackedFiles.keys()),
      snapshotSequence: this.snapshotSequence,
    };
  }

  /**
   * Import state from persistence
   */
  import(state: FileHistoryState): void {
    this.snapshots = state.snapshots;
    this.snapshotSequence = state.snapshotSequence;

    for (const filePath of state.trackedFiles) {
      if (this.trackedFiles.has(filePath)) {
        // Already tracked
        continue;
      }
      this.trackFile(filePath);
    }
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalManager: FileHistoryManager | null = null;

export function getFileHistoryManager(sessionId?: string): FileHistoryManager {
  if (!globalManager) {
    globalManager = new FileHistoryManager(sessionId);
  }
  return globalManager;
}

export function resetFileHistoryManager(): void {
  globalManager = null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Track file edit and create backup (smart)
 */
export async function fileHistoryTrackEdit(
  filePath: string,
  sessionId?: string
): Promise<FileHistoryBackup | null> {
  const manager = getFileHistoryManager(sessionId);
  return manager.createBackup(filePath, 'edit');
}

/**
 * Record file history snapshot (incremental)
 */
export function recordFileHistorySnapshot(
  messageId: string,
  sessionId?: string
): FileHistorySnapshot {
  const manager = getFileHistoryManager(sessionId);
  return manager.createSnapshot(messageId);
}

/**
 * Check if file has any changes
 */
export function fileHistoryHasAnyChanges(
  filePath: string,
  snapshotIndex: number,
  sessionId?: string
): boolean {
  const manager = getFileHistoryManager(sessionId);
  return manager.hasAnyChanges(filePath, snapshotIndex);
}

/**
 * Get diff stats for a snapshot
 */
export function fileHistoryGetSnapshotDiffStats(
  snapshotIndex: number,
  sessionId?: string
): DiffStats {
  const manager = getFileHistoryManager(sessionId);
  return manager.getSnapshotDiffStats(snapshotIndex);
}
