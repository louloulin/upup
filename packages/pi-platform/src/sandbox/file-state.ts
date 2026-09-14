/**
 * File State Tracking — Read-before-write staleness detection
 *
 * Tracks file content at read time to detect external modifications
 * before edit operations. Prevents overwriting changes the agent never saw.
 *
 * Reference: Loucode's FileEditTool readFileState pattern
 */

import { stat } from 'node:fs/promises';

interface FileReadState {
  /** Content hash at read time (simple string hash for fast comparison) */
  contentHash: number;
  /** File mtime at read time (ms since epoch) */
  mtimeMs: number;
  /** Timestamp when we read the file */
  readAt: number;
}

/** Module-level state: path → read state */
const readFileState = new Map<string, FileReadState>();

/** Max tracked files (prevent memory leaks) */
const MAX_TRACKED_FILES = 1000;

/**
 * Simple fast hash for content comparison (djb2 variant).
 * Not cryptographic — just for detecting changes.
 */
function hashContent(content: string): number {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Track that a file was read with specific content.
 * Call this after every successful file read.
 */
export function trackRead(filePath: string, content: string): void {
  // Evict oldest entries if we're at capacity
  if (readFileState.size >= MAX_TRACKED_FILES) {
    const oldest = readFileState.keys().next().value;
    if (oldest) readFileState.delete(oldest);
  }

  readFileState.set(filePath, {
    contentHash: hashContent(content),
    mtimeMs: 0, // Will be set by checkStaleness
    readAt: Date.now(),
  });
}

/**
 * Track read with explicit mtime (for when we already have it).
 */
export function trackReadWithMtime(filePath: string, content: string, mtimeMs: number): void {
  if (readFileState.size >= MAX_TRACKED_FILES) {
    const oldest = readFileState.keys().next().value;
    if (oldest) readFileState.delete(oldest);
  }

  readFileState.set(filePath, {
    contentHash: hashContent(content),
    mtimeMs,
    readAt: Date.now(),
  });
}

/**
 * Check if a file has been modified since we last read it.
 * Returns { stale: true } if the file was externally modified.
 */
export async function checkStaleness(
  filePath: string,
  currentContent: string,
): Promise<{ stale: boolean; reason?: string }> {
  const state = readFileState.get(filePath);
  if (!state) {
    // No read state tracked — allow the edit but warn
    return { stale: false };
  }

  // Check mtime first (fast)
  try {
    const fileStat = await stat(filePath);
    const currentMtime = fileStat.mtimeMs;

    if (state.mtimeMs > 0 && currentMtime > state.mtimeMs) {
      // File was modified on disk since we read it
      // Double-check with content hash to handle false positives
      // (cloud sync, antivirus, etc. can update mtime without changing content)
      const currentHash = hashContent(currentContent);
      if (currentHash !== state.contentHash) {
        return {
          stale: true,
          reason: `File was modified externally since last read (mtime changed from ${new Date(state.mtimeMs).toISOString()} to ${new Date(currentMtime).toISOString()})`,
        };
      }
      // mtime changed but content is the same — not actually stale
    }
  } catch {
    // Can't stat file — proceed with content check only
  }

  // Content hash check (always, as defense-in-depth)
  const currentHash = hashContent(currentContent);
  if (currentHash !== state.contentHash) {
    return {
      stale: true,
      reason: 'File content has changed since last read (content hash mismatch)',
    };
  }

  return { stale: false };
}

/**
 * Update tracked state after a successful write/edit.
 * This prevents the next edit from seeing our own write as "stale".
 */
export function updateAfterWrite(filePath: string, newContent: string): void {
  const existing = readFileState.get(filePath);
  readFileState.set(filePath, {
    contentHash: hashContent(newContent),
    mtimeMs: existing?.mtimeMs ?? 0, // mtime will be updated by the OS
    readAt: Date.now(),
  });
}

/**
 * Clear tracked state for a file (e.g., when file is deleted).
 */
export function clearState(filePath: string): void {
  readFileState.delete(filePath);
}

/**
 * Clear all tracked state (for testing or session reset).
 */
export function clearAllState(): void {
  readFileState.clear();
}

/**
 * Get the number of tracked files (for diagnostics).
 */
export function getTrackedCount(): number {
  return readFileState.size;
}
