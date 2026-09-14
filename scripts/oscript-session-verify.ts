#!/usr/bin/env bun
/**
 * oscript-session-verify.ts — Session System Verification Script
 *
 * Tests session-related commands:
 * - /session - Session manager
 * - /resume - Resume session
 * - /continue - Continue recent session
 *
 * Also tests session storage functions directly.
 *
 * Run: bun run scripts/oscript-session-verify.ts
 */

import { getAllSlashCommands } from '@upup/commands';
import type { CommandContext } from '@upup/commands';
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  renameSession,
  tagSession,
  searchSessionsByTitle,
  forkSession,
  exportSessionToJson,
  exportSessionToMarkdown,
} from '../src/session/storage.js';
import {
  loadSessionForResume,
  processResumedConversation,
  resolveResumeTarget,
  getMostRecentSession,
} from '../src/session/restore.js';

// ============================================================================
// Test Setup
// ============================================================================

const commands = getAllSlashCommands();
const testSessionIds: string[] = [];

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Session System Verification (oscript-session-verify)');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');

// Mock context for commands
const mockContext: CommandContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'oscript-session-test',
  model: 'gpt-4o',
};

// ============================================================================
// Test Results
// ============================================================================

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  error?: string;
}

const results: TestResult[] = [];

// ============================================================================
// Storage Layer Tests
// ============================================================================

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Storage Layer Tests');
console.log('═══════════════════════════════════════════════════════════════════');

async function testStorage() {
  // Test 1: Create session
  try {
    const session = await createSession({
      title: 'oscript-test-session',
      firstPrompt: 'Test prompt for verification',
      tags: ['test', 'oscript'],
    });
    testSessionIds.push(session.id);
    results.push({
      name: 'createSession',
      status: 'pass',
      message: `Created session: ${session.id}`,
    });
    console.log(`  ✅ createSession → ${session.id}`);
  } catch (err: any) {
    results.push({
      name: 'createSession',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ createSession → ${err.message}`);
  }

  // Test 2: Get session
  if (testSessionIds.length > 0) {
    try {
      const session = await getSession(testSessionIds[0]);
      results.push({
        name: 'getSession',
        status: session ? 'pass' : 'fail',
        message: session ? 'Retrieved session' : 'Session not found',
      });
      console.log(`  ${session ? '✅' : '❌'} getSession → ${session ? 'OK' : 'Not found'}`);
    } catch (err: any) {
      results.push({
        name: 'getSession',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ getSession → ${err.message}`);
    }
  }

  // Test 3: List sessions
  try {
    const sessions = await listSessions();
    results.push({
      name: 'listSessions',
      status: 'pass',
      message: `Found ${sessions.length} sessions`,
    });
    console.log(`  ✅ listSessions → ${sessions.length} sessions`);
  } catch (err: any) {
    results.push({
      name: 'listSessions',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ listSessions → ${err.message}`);
  }

  // Test 4: Rename session
  if (testSessionIds.length > 0) {
    try {
      await renameSession(testSessionIds[0], 'renamed-oscript-test');
      results.push({
        name: 'renameSession',
        status: 'pass',
        message: 'Session renamed',
      });
      console.log(`  ✅ renameSession → OK`);
    } catch (err: any) {
      results.push({
        name: 'renameSession',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ renameSession → ${err.message}`);
    }
  }

  // Test 5: Tag session
  if (testSessionIds.length > 0) {
    try {
      await tagSession(testSessionIds[0], 'oscript-verified');
      results.push({
        name: 'tagSession',
        status: 'pass',
        message: 'Tag added',
      });
      console.log(`  ✅ tagSession → OK`);
    } catch (err: any) {
      results.push({
        name: 'tagSession',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ tagSession → ${err.message}`);
    }
  }

  // Test 6: Search sessions
  try {
    const found = await searchSessionsByTitle('oscript');
    results.push({
      name: 'searchSessionsByTitle',
      status: 'pass',
      message: `Found ${found.length} matching sessions`,
    });
    console.log(`  ✅ searchSessionsByTitle → ${found.length} matches`);
  } catch (err: any) {
    results.push({
      name: 'searchSessionsByTitle',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ searchSessionsByTitle → ${err.message}`);
  }

  // Test 7: Export to JSON
  if (testSessionIds.length > 0) {
    try {
      const json = await exportSessionToJson(testSessionIds[0]);
      results.push({
        name: 'exportSessionToJson',
        status: json ? 'pass' : 'fail',
        message: json ? 'Exported' : 'Export returned empty',
      });
      console.log(`  ${json ? '✅' : '⚠️'} exportSessionToJson → ${json ? 'OK' : 'Empty'}`);
    } catch (err: any) {
      results.push({
        name: 'exportSessionToJson',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ exportSessionToJson → ${err.message}`);
    }
  }

  // Test 8: Export to Markdown
  if (testSessionIds.length > 0) {
    try {
      const md = await exportSessionToMarkdown(testSessionIds[0]);
      results.push({
        name: 'exportSessionToMarkdown',
        status: md ? 'pass' : 'fail',
        message: md ? 'Exported' : 'Export returned empty',
      });
      console.log(`  ${md ? '✅' : '⚠️'} exportSessionToMarkdown → ${md ? 'OK' : 'Empty'}`);
    } catch (err: any) {
      results.push({
        name: 'exportSessionToMarkdown',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ exportSessionToMarkdown → ${err.message}`);
    }
  }

  // Test 9: Fork session
  if (testSessionIds.length > 0) {
    try {
      const forkedId = await forkSession(testSessionIds[0]);
      if (forkedId) {
        testSessionIds.push(forkedId);
      }
      results.push({
        name: 'forkSession',
        status: forkedId ? 'pass' : 'fail',
        message: `Forked to: ${forkedId || 'null'}`,
      });
      console.log(`  ${forkedId ? '✅' : '❌'} forkSession → ${forkedId || 'null'}`);
    } catch (err: any) {
      results.push({
        name: 'forkSession',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ forkSession → ${err.message}`);
    }
  }

  // Test 10: Load session for resume
  if (testSessionIds.length > 0) {
    try {
      const loaded = await loadSessionForResume(testSessionIds[0]);
      results.push({
        name: 'loadSessionForResume',
        status: loaded ? 'pass' : 'fail',
        message: loaded ? 'Loaded' : 'Load returned null',
      });
      console.log(`  ${loaded ? '✅' : '⚠️'} loadSessionForResume → ${loaded ? 'OK' : 'Null'}`);
    } catch (err: any) {
      results.push({
        name: 'loadSessionForResume',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ loadSessionForResume → ${err.message}`);
    }
  }

  // Test 11: Resolve resume target
  if (testSessionIds.length > 0) {
    try {
      const resolved = await resolveResumeTarget(testSessionIds[0]);
      results.push({
        name: 'resolveResumeTarget (by ID)',
        status: resolved ? 'pass' : 'fail',
        message: resolved ? 'Resolved' : 'Not found',
      });
      console.log(`  ${resolved ? '✅' : '⚠️'} resolveResumeTarget → ${resolved ? 'OK' : 'Null'}`);
    } catch (err: any) {
      results.push({
        name: 'resolveResumeTarget',
        status: 'fail',
        error: err.message,
      });
      console.log(`  ❌ resolveResumeTarget → ${err.message}`);
    }
  }

  // Test 12: Get most recent session
  try {
    const recent = await getMostRecentSession();
    results.push({
      name: 'getMostRecentSession',
      status: recent ? 'pass' : 'warn',
      message: recent ? `Found: ${recent.id}` : 'No sessions',
    });
    console.log(`  ${recent ? '✅' : '⚠️'} getMostRecentSession → ${recent ? 'OK' : 'No sessions'}`);
  } catch (err: any) {
    results.push({
      name: 'getMostRecentSession',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ getMostRecentSession → ${err.message}`);
  }
}

// ============================================================================
// Command Layer Tests
// ============================================================================

console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Command Layer Tests (Slash Commands)');
console.log('═══════════════════════════════════════════════════════════════════');

async function testCommands() {
  const sessionCommands = commands.filter(c =>
    ['session', 'resume', 'continue'].includes(c.name)
  );

  console.log(`  Found ${sessionCommands.length} session commands registered`);
  for (const cmd of sessionCommands) {
    console.log(`    - /${cmd.name}`);
  }

  // Test /session command
  try {
    const input = '/session';
    const result = await registry.execute(input, mockContext);
    const hasType = result && 'type' in result;
    results.push({
      name: '/session command',
      status: hasType ? 'pass' : 'warn',
      message: hasType ? 'Executed successfully' : 'No result type',
    });
    console.log(`  ${hasType ? '✅' : '⚠️'} /session → ${hasType ? 'OK' : 'No type field'}`);
  } catch (err: any) {
    results.push({
      name: '/session command',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ /session → ${err.message}`);
  }

  // Test /resume command
  try {
    const input = '/resume';
    const result = await registry.execute(input, mockContext);
    const hasType = result && 'type' in result;
    results.push({
      name: '/resume command',
      status: hasType ? 'pass' : 'warn',
      message: hasType ? 'Executed successfully' : 'No result type',
    });
    console.log(`  ${hasType ? '✅' : '⚠️'} /resume → ${hasType ? 'OK' : 'No type field'}`);
  } catch (err: any) {
    results.push({
      name: '/resume command',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ /resume → ${err.message}`);
  }

  // Test /continue command
  try {
    const input = '/continue';
    const result = await registry.execute(input, mockContext);
    const hasType = result && 'type' in result;
    results.push({
      name: '/continue command',
      status: hasType ? 'pass' : 'warn',
      message: hasType ? 'Executed successfully' : 'No result type',
    });
    console.log(`  ${hasType ? '✅' : '⚠️'} /continue → ${hasType ? 'OK' : 'No type field'}`);
  } catch (err: any) {
    results.push({
      name: '/continue command',
      status: 'fail',
      error: err.message,
    });
    console.log(`  ❌ /continue → ${err.message}`);
  }
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Cleanup');
  console.log('═══════════════════════════════════════════════════════════════════');

  for (const id of testSessionIds) {
    try {
      await deleteSession(id);
      console.log(`  ✅ Deleted test session: ${id}`);
    } catch (err: any) {
      console.log(`  ⚠️  Could not delete ${id}: ${err.message}`);
    }
  }
}

// ============================================================================
// Summary
// ============================================================================

function printSummary() {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;
  const total = results.length;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Total tests:  ${total}`);
  console.log(`  ✅ Passed:     ${passed}`);
  console.log(`  ⚠️  Warned:    ${warned}`);
  console.log(`  ❌ Failed:     ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('  Failed tests:');
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`    ❌ ${r.name}: ${r.error}`);
    }
    console.log('');
  }

  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
  console.log(`  Pass rate: ${passRate}%`);

  return { passed, failed, warned, total, passRate };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    await testStorage();
    await testCommands();
  } finally {
    await cleanup();
  }

  const summary = printSummary();

  // Save results
  const jsonPath = import.meta.dir + '/../.upup/oscript-session-results.json';
  try {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      ...summary
    }, null, 2));
    console.log(`  Results saved to ${jsonPath}`);
  } catch {}

  // Exit with failure if any errors
  if (summary.failed > 0) {
    console.log('');
    console.log('  ❌ VERIFICATION FAILED — fix errors above');
    process.exit(1);
  } else {
    console.log('');
    console.log('  ✅ ALL TESTS PASSED');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
