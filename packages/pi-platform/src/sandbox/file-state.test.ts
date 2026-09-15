/**
 * Tests for File State Tracking (read-before-write staleness detection)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  trackRead,
  checkStaleness,
  updateAfterWrite,
  clearState,
  clearAllState,
  getTrackedCount,
} from './file-state';

const TEST_DIR = join(tmpdir(), 'upup-file-state-test');
const TEST_FILE = join(TEST_DIR, 'test-file.txt');

describe('file-state tracking', () => {
  beforeEach(async () => {
    clearAllState();
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(TEST_FILE, 'initial content', 'utf-8');
  });

  afterEach(async () => {
    clearAllState();
    try {
      await unlink(TEST_FILE);
    } catch {
      // ignore
    }
  });

  it('tracks read state', () => {
    trackRead(TEST_FILE, 'hello world');
    expect(getTrackedCount()).toBe(1);
  });

  it('detects no staleness for unchanged file', async () => {
    const content = 'hello world';
    trackRead(TEST_FILE, content);

    const result = await checkStaleness(TEST_FILE, content);
    expect(result.stale).toBe(false);
  });

  it('detects staleness for modified content', async () => {
    const original = 'hello world';
    trackRead(TEST_FILE, original);

    // Simulate external modification
    const result = await checkStaleness(TEST_FILE, 'modified content');
    expect(result.stale).toBe(true);
    expect(result.reason).toContain('content hash mismatch');
  });

  it('allows edit when no read state exists', async () => {
    const result = await checkStaleness(TEST_FILE, 'any content');
    expect(result.stale).toBe(false);
  });

  it('updateAfterWrite refreshes tracked state', async () => {
    trackRead(TEST_FILE, 'original');

    // After our own edit, update the state
    updateAfterWrite(TEST_FILE, 'our edit');

    // Now check with the post-edit content — should NOT be stale
    const result = await checkStaleness(TEST_FILE, 'our edit');
    expect(result.stale).toBe(false);
  });

  it('detects external modification after our edit', async () => {
    trackRead(TEST_FILE, 'original');
    updateAfterWrite(TEST_FILE, 'our edit');

    // External modification after our edit
    const result = await checkStaleness(TEST_FILE, 'external change');
    expect(result.stale).toBe(true);
  });

  it('clears state for a specific file', () => {
    trackRead(TEST_FILE, 'content');
    expect(getTrackedCount()).toBe(1);

    clearState(TEST_FILE);
    expect(getTrackedCount()).toBe(0);
  });

  it('clears all state', () => {
    trackRead('/file1', 'content1');
    trackRead('/file2', 'content2');
    expect(getTrackedCount()).toBe(2);

    clearAllState();
    expect(getTrackedCount()).toBe(0);
  });

  it('respects max tracked files limit', () => {
    // Fill up to the limit
    for (let i = 0; i < 1000; i++) {
      trackRead(`/file${i}`, `content${i}`);
    }
    expect(getTrackedCount()).toBe(1000);

    // Adding one more should evict the oldest
    trackRead('/file-new', 'new content');
    expect(getTrackedCount()).toBe(1000);
  });

  it('handles real file with real I/O', async () => {
    // Read the real file
    const content = await readFile(TEST_FILE, 'utf-8');
    trackRead(TEST_FILE, content);

    // File hasn't changed — should not be stale
    const currentContent = await readFile(TEST_FILE, 'utf-8');
    const result1 = await checkStaleness(TEST_FILE, currentContent);
    expect(result1.stale).toBe(false);

    // Modify the file externally
    await writeFile(TEST_FILE, 'externally modified', 'utf-8');

    // Now it should be stale
    const newContent = await readFile(TEST_FILE, 'utf-8');
    const result2 = await checkStaleness(TEST_FILE, newContent);
    expect(result2.stale).toBe(true);
  });
});
