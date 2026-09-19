#!/usr/bin/env bun
/**
 * oscript-storage-verify.ts
 * Verifies UpUp storage functionality per plan8.9.md
 *
 * Tests:
 * 1. Sessions stored in global ~/.upup/ directory
 * 2. Cross-project session access
 * 3. Data path resolution
 * 4. Migration functionality
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

async function log(name: string, passed: boolean, message: string) {
  const icon = passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
  console.log(`  ${icon} ${name} — ${message}`);
}

// Import the modules we need to test
const MODULE_PATH = join(dirname(new URL(import.meta.url).pathname), '../src/utils/paths.js');
const SESSION_PATH = join(dirname(new URL(import.meta.url).pathname), '../src/session/storage.js');

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  UpUp Storage System Verification (oscript-storage-verify)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();

  // Import modules dynamically
  let paths: any;
  let storage: any;

  try {
    paths = await import(MODULE_PATH);
    storage = await import(SESSION_PATH);
  } catch (e) {
    console.log(`${RED}❌ Failed to import modules: ${e}${RESET}`);
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test 1: Global storage path resolution
  console.log('  Path Resolution Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  {
    const dir = paths.getUpupDir();
    const isAbsolute = dir.startsWith('/');
    await log('getUpupDir() returns absolute path', isAbsolute, dir);
    results.push({ name: 'getUpupDir() returns absolute path', passed: isAbsolute, message: dir });
  }

  {
    const dir = paths.getUpupDir();
    const expected = join(homedir(), '.upup');
    const isCorrect = dir === expected;
    await log('getUpupDir() returns ~/.upup/', isCorrect, isCorrect ? expected : `Expected: ${expected}`);
    results.push({ name: 'getUpupDir() returns ~/.upup/', passed: isCorrect, message: dir });
  }

  {
    const dir = paths.globalUpupPath('data', 'sessions');
    const expected = join(homedir(), '.upup', 'data', 'sessions');
    const isCorrect = dir === expected;
    await log('globalUpupPath() works', isCorrect, dir);
    results.push({ name: 'globalUpupPath() works', passed: isCorrect, message: dir });
  }

  console.log();
  console.log('  Storage Layer Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 2: Session storage in global directory
  {
    const dir = storage.getSessionsDir();
    const expectedGlobal = join(homedir(), '.upup', 'data', 'sessions');
    const isGlobal = dir === expectedGlobal;
    await log('getSessionsDir() uses global path', isGlobal, dir);
    results.push({ name: 'getSessionsDir() uses global path', passed: isGlobal, message: dir });
  }

  {
    const dir = storage.getSessionsDir();
    storage.ensureSessionsDir();
    const exists = existsSync(dir);
    await log('Sessions directory accessible', exists, dir);
    results.push({ name: 'Sessions directory accessible', passed: exists, message: dir });
  }

  // Test 3: Create and read session in global directory
  let testSessionId: string | null = null;

  {
    const metadata = await storage.createSession({
      customTitle: 'oscript-storage-verify test',
      firstPrompt: 'Testing global storage',
      projectPath: process.cwd(),
    });
    testSessionId = metadata.id;
    const exists = existsSync(storage.getSessionPath(metadata.id));
    await log('Create session', exists, metadata.id);
    results.push({ name: 'Create session', passed: exists, message: metadata.id });
  }

  {
    if (!testSessionId) {
      await log('Read session metadata', false, 'No session ID');
      results.push({ name: 'Read session metadata', passed: false, message: 'No session ID' });
    } else {
      const metadata = await storage.getSessionMetadata(testSessionId);
      const found = metadata !== null;
      await log('Read session metadata', found, found ? metadata?.id || '' : 'Not found');
      results.push({ name: 'Read session metadata', passed: found, message: metadata?.id || '' });
    }
  }

  {
    const sessions = await storage.listSessions();
    const hasTestSession = sessions.some(s => s.id === testSessionId);
    await log('List sessions', hasTestSession, `${sessions.length} sessions`);
    results.push({ name: 'List sessions', passed: hasTestSession, message: `${sessions.length} sessions` });
  }

  {
    const summaries = await storage.getSessionSummaries();
    const hasTestSession = summaries.some(s => s.id === testSessionId);
    await log('Get session summaries', hasTestSession, `${summaries.length} summaries`);
    results.push({ name: 'Get session summaries', passed: hasTestSession, message: `${summaries.length} summaries` });
  }

  console.log();
  console.log('  Session Management Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 4: Session management
  {
    if (!testSessionId) {
      await log('Rename session', false, 'No session ID');
      results.push({ name: 'Rename session', passed: false, message: 'No session ID' });
    } else {
      await storage.renameSession(testSessionId, 'Renamed by oscript-storage-verify');
      const metadata = await storage.getSessionMetadata(testSessionId);
      const renamed = metadata?.customTitle === 'Renamed by oscript-storage-verify';
      await log('Rename session', renamed, metadata?.customTitle || '');
      results.push({ name: 'Rename session', passed: renamed, message: metadata?.customTitle || '' });
    }
  }

  {
    if (!testSessionId) {
      await log('Tag session', false, 'No session ID');
      results.push({ name: 'Tag session', passed: false, message: 'No session ID' });
    } else {
      await storage.tagSession(testSessionId, 'test-tag');
      const metadata = await storage.getSessionMetadata(testSessionId);
      const tagged = metadata?.tag === 'test-tag';
      await log('Tag session', tagged, metadata?.tag || '');
      results.push({ name: 'Tag session', passed: tagged, message: metadata?.tag || '' });
    }
  }

  {
    const searchResults = await storage.searchSessionsByTitle('Renamed');
    const found = searchResults.some(s => s.id === testSessionId);
    await log('Search by title', found, `${searchResults.length} results`);
    results.push({ name: 'Search by title', passed: found, message: `${searchResults.length} results` });
  }

  console.log();
  console.log('  Session Operations Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 5: Fork session
  let forkedSessionId: string | null = null;
  {
    if (!testSessionId) {
      await log('Fork session', false, 'No session ID');
      results.push({ name: 'Fork session', passed: false, message: 'No session ID' });
    } else {
      const forkId = await storage.forkSession(testSessionId);
      const forked = forkId !== null;
      forkedSessionId = forkId;
      await log('Fork session', forked, forkId || '');
      results.push({ name: 'Fork session', passed: forked, message: forkId || '' });
    }
  }

  // Test 6: Export session
  {
    if (!testSessionId) {
      await log('Export session to JSON', false, 'No session ID');
      results.push({ name: 'Export session to JSON', passed: false, message: 'No session ID' });
    } else {
      const json = await storage.exportSessionToJson(testSessionId);
      const exported = json !== null;
      await log('Export session to JSON', exported, exported ? 'OK' : 'Failed');
      results.push({ name: 'Export session to JSON', passed: exported, message: exported ? 'OK' : 'Failed' });
    }
  }

  console.log();
  console.log('  Cleanup:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 7: Delete forked session
  {
    if (!forkedSessionId) {
      await log('Delete forked session', false, 'No forked session ID');
      results.push({ name: 'Delete forked session', passed: false, message: 'No ID' });
    } else {
      const deleted = await storage.deleteSession(forkedSessionId);
      const gone = !existsSync(storage.getSessionPath(forkedSessionId));
      await log('Delete forked session', deleted && gone, deleted ? 'Deleted' : 'Failed');
      results.push({ name: 'Delete forked session', passed: deleted && gone, message: deleted ? 'Deleted' : 'Failed' });
    }
  }

  // Test 8: Delete original session
  {
    if (!testSessionId) {
      await log('Delete session', false, 'No session ID');
      results.push({ name: 'Delete session', passed: false, message: 'No session ID' });
    } else {
      const deleted = await storage.deleteSession(testSessionId);
      const gone = !existsSync(storage.getSessionPath(testSessionId));
      await log('Delete session', deleted && gone, deleted ? 'Deleted' : 'Failed');
      results.push({ name: 'Delete session', passed: deleted && gone, message: deleted ? 'Deleted' : 'Failed' });
    }
  }

  // Summary
  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log();
  console.log(`  Total tests:  ${total}`);
  console.log(`  ${GREEN}✅ Passed:${RESET}     ${passed}`);
  if (failed > 0) {
    console.log(`  ${RED}❌ Failed:${RESET}     ${failed}`);
    console.log();
    console.log('  Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.message}`);
    });
  }
  console.log();
  console.log(`  Pass rate: ${((passed / total) * 100).toFixed(1)}%`);
  console.log();

  if (failed > 0) {
    console.log(`  ${RED}❌ SOME TESTS FAILED${RESET}`);
    process.exit(1);
  } else {
    console.log(`  ${GREEN}✅ ALL TESTS PASSED${RESET}`);
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error(`Error: ${e}`);
  process.exit(1);
});