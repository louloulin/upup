#!/usr/bin/env bun
/**
 * oscript-pid-verify.ts
 * Verifies PID session mapping functionality per plan8.9.md
 *
 * Tests:
 * 1. PID registration on session start
 * 2. PID cleanup on session end
 * 3. getAllActiveSessions returns running processes
 * 4. Session lookup by PID and sessionId
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

// Import modules
const MODULE_PATH = join(dirname(new URL(import.meta.url).pathname), '../src/session/pid-manager.js');

async function log(name: string, passed: boolean, message: string) {
  const icon = passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
  console.log(`  ${icon} ${name} — ${message}`);
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  PID Session Manager Verification (oscript-pid-verify)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log();

  // Import pid-manager
  let pidManager: any;
  try {
    pidManager = await import(MODULE_PATH);
  } catch (e) {
    console.log(`${RED}❌ Failed to import pid-manager: ${e}${RESET}`);
    process.exit(1);
  }

  const results: TestResult[] = [];

  console.log('  PID Registration Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 1: Register session PID
  let testSessionId = 'test-session-' + Date.now();
  {
    pidManager.registerSessionPid(testSessionId);
    const hasSession = pidManager.hasCurrentSession();
    await log('registerSessionPid', hasSession, hasSession ? 'Registered' : 'Failed');
    results.push({ name: 'registerSessionPid', passed: hasSession, message: String(hasSession) });
  }

  // Test 2: Get session by PID
  {
    const info = pidManager.getSessionByPid(process.pid);
    const found = info !== null && info.sessionId === testSessionId;
    await log('getSessionByPid', found, found ? info?.sessionId || '' : 'Not found');
    results.push({ name: 'getSessionByPid', passed: found, message: info?.sessionId || '' });
  }

  // Test 3: Get session by sessionId
  {
    const info = pidManager.getSessionBySessionId(testSessionId);
    const found = info !== null && info.pid === process.pid;
    await log('getSessionBySessionId', found, found ? `PID ${info?.pid}` : 'Not found');
    results.push({ name: 'getSessionBySessionId', passed: found, message: String(found) });
  }

  // Test 4: Get all active sessions includes our test session
  {
    const sessions = pidManager.getAllActiveSessions();
    const hasTest = sessions.some(s => s.sessionId === testSessionId);
    await log('getAllActiveSessions includes test', hasTest, `${sessions.length} active`);
    results.push({ name: 'getAllActiveSessions includes test', passed: hasTest, message: String(hasTest) });
  }

  // Test 5: Active session count
  {
    const count = pidManager.getActiveSessionCount();
    const valid = count >= 1;
    await log('getActiveSessionCount', valid, `${count} sessions`);
    results.push({ name: 'getActiveSessionCount', passed: valid, message: String(count) });
  }

  console.log();
  console.log('  PID File Structure Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 6: PID file exists at correct location
  {
    const expectedPath = join(homedir(), '.upup', 'sessions', `${process.pid}.json`);
    const exists = existsSync(expectedPath);
    await log('PID file at global path', exists, expectedPath);
    results.push({ name: 'PID file at global path', passed: exists, message: expectedPath });
  }

  // Test 7: PID file contains correct data
  {
    const expectedPath = join(homedir(), '.upup', 'sessions', `${process.pid}.json`);
    if (existsSync(expectedPath)) {
      const content = readFileSync(expectedPath, 'utf-8');
      const data = JSON.parse(content);
      const valid = data.pid === process.pid && data.sessionId === testSessionId;
      await log('PID file content valid', valid, `PID: ${data.pid}`);
      results.push({ name: 'PID file content valid', passed: valid, message: String(valid) });
    } else {
      await log('PID file content valid', false, 'File not found');
      results.push({ name: 'PID file content valid', passed: false, message: 'File not found' });
    }
  }

  console.log();
  console.log('  Update Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 8: Update session PID
  {
    pidManager.updateSessionPid({ cwd: '/test/path' });
    const info = pidManager.getSessionByPid(process.pid);
    const updated = info?.cwd === '/test/path';
    await log('updateSessionPid', updated, updated ? 'Updated' : 'Not updated');
    results.push({ name: 'updateSessionPid', passed: updated, message: String(updated) });
  }

  console.log();
  console.log('  Cleanup Tests:');
  console.log('  ──────────────────────────────────────────────────────────────');

  // Test 9: Unregister session PID
  {
    pidManager.unregisterSessionPid();
    const hasSession = pidManager.hasCurrentSession();
    const unregistered = !hasSession;
    await log('unregisterSessionPid', unregistered, unregistered ? 'Cleaned up' : 'Still exists');
    results.push({ name: 'unregisterSessionPid', passed: unregistered, message: String(unregistered) });
  }

  // Test 10: PID file removed after unregister
  {
    const expectedPath = join(homedir(), '.upup', 'sessions', `${process.pid}.json`);
    const notExists = !existsSync(expectedPath);
    await log('PID file removed', notExists, notExists ? 'Removed' : 'Still exists');
    results.push({ name: 'PID file removed', passed: notExists, message: String(notExists) });
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