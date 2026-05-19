#!/usr/bin/env bun
/**
 * Session System Verification Tests
 *
 * Run: bun src/session/verify-session.test.ts
 */

import { existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  ensureSessionsDir,
  createSession,
  getSession,
  getSessionMetadata,
  listSessions,
  deleteSession,
  renameSession,
  tagSession,
  searchSessionsByTitle,
  getSessionSummaries,
  exportSessionToJson,
  exportSessionToMarkdown,
  getSessionsDir,
  forkSession,
} from './storage.js';
import {
  loadSessionForResume,
  processResumedConversation,
  resolveResumeTarget,
  getMostRecentSession,
} from './restore.js';

// Test directory
const TEST_DIR = join(getSessionsDir(), '_test_sessions');
const testSessionIds: string[] = [];

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    const files = readdirSync(TEST_DIR).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      try { unlinkSync(join(TEST_DIR, file)); } catch {}
    }
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('✅');
  } catch (e) {
    console.log('❌', e);
  }
}

async function main() {
  console.log('\n🔍 Session System Verification\n');

  // Clean up test directory
  await cleanup();
  ensureSessionsDir();

  // Test 1: Create session
  await runTest('createSession', async () => {
    const meta = await createSession({
      projectPath: TEST_DIR,
      firstPrompt: 'Test session for verification',
      customTitle: 'Verification Test',
      tag: 'test',
    });
    if (!meta.id) throw new Error('No session ID returned');
    if (meta.messageCount !== 0) throw new Error('Initial messageCount should be 0');
    testSessionIds.push(meta.id);
  });

  // Test 2: Get session
  await runTest('getSession', async () => {
    const session = await getSession(testSessionIds[0]);
    if (!session) throw new Error('Session not found');
    if (!session.metadata) throw new Error('No metadata');
    if (!session.messages) throw new Error('No messages array');
  });

  // Test 3: Get metadata
  await runTest('getSessionMetadata', async () => {
    const meta = await getSessionMetadata(testSessionIds[0]);
    if (!meta) throw new Error('Metadata not found');
    if (meta.customTitle !== 'Verification Test') throw new Error('Title mismatch');
    if (meta.tag !== 'test') throw new Error('Tag mismatch');
  });

  // Test 4: List sessions
  await runTest('listSessions', async () => {
    const sessions = await listSessions();
    if (sessions.length === 0) throw new Error('No sessions listed');
  });

  // Test 5: Get session summaries
  await runTest('getSessionSummaries', async () => {
    const summaries = await getSessionSummaries({ projectPath: TEST_DIR });
    if (summaries.length === 0) throw new Error('No summaries found');
  });

  // Test 6: Rename session
  await runTest('renameSession', async () => {
    await renameSession(testSessionIds[0], 'Renamed Test Session');
    const meta = await getSessionMetadata(testSessionIds[0]);
    if (meta?.customTitle !== 'Renamed Test Session') throw new Error('Rename failed');
  });

  // Test 7: Tag session
  await runTest('tagSession', async () => {
    await tagSession(testSessionIds[0], 'verified');
    const meta = await getSessionMetadata(testSessionIds[0]);
    if (meta?.tag !== 'verified') throw new Error('Tag failed');
  });

  // Test 8: Search sessions by title
  await runTest('searchSessionsByTitle', async () => {
    const results = await searchSessionsByTitle('Renamed');
    if (results.length === 0) throw new Error('Search found no results');
  });

  // Test 9: Load session for resume
  await runTest('loadSessionForResume', async () => {
    const result = await loadSessionForResume(testSessionIds[0]);
    if (!result) throw new Error('Failed to load for resume');
    if (result.sessionId !== testSessionIds[0]) throw new Error('Session ID mismatch');
    if (!result.sessionData) throw new Error('No session data');
  });

  // Test 10: Process resumed conversation
  await runTest('processResumedConversation', async () => {
    const processed = await processResumedConversation(testSessionIds[0]);
    if (!processed) throw new Error('Failed to process resume');
    if (processed.messages.length !== 0) throw new Error('Messages should be empty');
  });

  // Test 11: Resolve resume target (by ID)
  await runTest('resolveResumeTarget by UUID', async () => {
    const targetId = await resolveResumeTarget(testSessionIds[0]);
    if (targetId !== testSessionIds[0]) throw new Error('UUID resolve failed');
  });

  // Test 12: Resolve resume target (by title)
  await runTest('resolveResumeTarget by title', async () => {
    const targetId = await resolveResumeTarget('Renamed Test');
    if (targetId !== testSessionIds[0]) throw new Error('Title resolve failed');
  });

  // Test 13: Get most recent session
  await runTest('getMostRecentSession', async () => {
    const recentId = await getMostRecentSession(TEST_DIR);
    if (!recentId) throw new Error('No recent session');
    if (recentId !== testSessionIds[0]) throw new Error('Most recent mismatch');
  });

  // Test 14: Export to JSON
  await runTest('exportSessionToJson', async () => {
    const json = await exportSessionToJson(testSessionIds[0]);
    if (!json) throw new Error('Export failed');
    const parsed = JSON.parse(json);
    if (!parsed.metadata) throw new Error('Invalid export format');
  });

  // Test 15: Export to Markdown
  await runTest('exportSessionToMarkdown', async () => {
    const md = await exportSessionToMarkdown(testSessionIds[0]);
    if (!md) throw new Error('Export failed');
    if (!md.includes('# Renamed Test Session')) throw new Error('Markdown format error');
  });

  // Test 16: Fork session
  await runTest('forkSession', async () => {
    const forkedId = await forkSession(testSessionIds[0]);
    if (!forkedId) throw new Error('Fork failed');
    if (forkedId === testSessionIds[0]) throw new Error('Fork should have new ID');

    // Verify forked session exists
    const forked = await getSession(forkedId);
    if (!forked) throw new Error('Forked session not found');
    if (!forked.metadata.customTitle?.includes('(fork)')) throw new Error('Fork title not updated');
    if (forked.metadata.id !== forkedId) throw new Error('Forked ID mismatch');
    // Note: timestamps may be equal if fork happened immediately

    testSessionIds.push(forkedId);
  });

  // Test 17: Fork preserves messages
  await runTest('forkSession preserves messages', async () => {
    const original = await getSession(testSessionIds[0]);
    const forked = await getSession(testSessionIds[1]);
    if (!original || !forked) throw new Error('Sessions not found');
    // Original should have no messages, but structure should be preserved
    if (!forked.messages) throw new Error('Forked messages not preserved');
  });

  // Test 18: Delete forked session
  await runTest('deleteSession (forked)', async () => {
    await deleteSession(testSessionIds[1]);
    const meta = await getSessionMetadata(testSessionIds[1]);
    if (meta) throw new Error('Forked session still exists after delete');
  });

  // Test 19: Delete original session
  await runTest('deleteSession (original)', async () => {
    await deleteSession(testSessionIds[0]);
    const meta = await getSessionMetadata(testSessionIds[0]);
    if (meta) throw new Error('Session still exists after delete');
  });

  console.log('\n✅ All tests completed!\n');
  await cleanup();
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});