/**
 * Final Features Verification
 *
 * Tests:
 * - Project Storage (projects/)
 * - File History (file-history/)
 * - Shell Snapshots (shell-snapshots/)
 * - Session Stats (stats-cache)
 */

import {
  ProjectStorage,
  getProjectStorage,
  sanitizePath,
  getProjectsDir,
} from '../src/storage/project-storage.js';

import {
  FileHistoryManager,
  getFileHistoryManager,
  getFileHistoryDir,
  FileHistoryBackup,
} from '../src/storage/file-history.js';

import {
  ShellSnapshotManager,
  getShellSnapshotManager,
  getShellSnapshotsDir,
  detectShellType,
} from '../src/storage/shell-snapshots.js';

import {
  StatsCacheManager,
  getStatsCacheManager,
  getStatsCachePath,
  SessionStats,
} from '../src/storage/stats-cache.js';

// ============================================================================
// Project Storage Tests
// ============================================================================

async function testProjectStorage(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Project Storage Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: ProjectStorage creation
  const storage = new ProjectStorage();
  if (storage) {
    console.log(`  ✅ ProjectStorage creation working`);
    passed++;
  } else {
    console.log(`  ❌ ProjectStorage creation failed`);
    failed++;
  }

  // Test 2: sanitizePath
  const sanitized = sanitizePath('/Users/test/my-project');
  if (sanitized && !sanitized.includes('/')) {
    console.log(`  ✅ sanitizePath working: ${sanitized}`);
    passed++;
  } else {
    console.log(`  ❌ sanitizePath failed`);
    failed++;
  }

  // Test 3: getProjectsDir
  const projectsDir = getProjectsDir();
  if (projectsDir.includes('.upup') && projectsDir.includes('projects')) {
    console.log(`  ✅ getProjectsDir working: ${projectsDir}`);
    passed++;
  } else {
    console.log(`  ❌ getProjectsDir failed`);
    failed++;
  }

  // Test 4: getProjects
  const projects = await storage.getProjects();
  if (Array.isArray(projects)) {
    console.log(`  ✅ getProjects working (${projects.length} projects)`);
    passed++;
  } else {
    console.log(`  ❌ getProjects failed`);
    failed++;
  }

  // Test 5: getStats
  const stats = await storage.getStats();
  if (typeof stats.totalProjects === 'number' && typeof stats.totalSessions === 'number') {
    console.log(`  ✅ getStats working (${stats.totalProjects} projects, ${stats.totalSessions} sessions)`);
    passed++;
  } else {
    console.log(`  ❌ getStats failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// File History Tests
// ============================================================================

async function testFileHistory(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  File History Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: FileHistoryManager creation
  const manager = new FileHistoryManager('test-session');
  if (manager) {
    console.log(`  ✅ FileHistoryManager creation working`);
    passed++;
  } else {
    console.log(`  ❌ FileHistoryManager creation failed`);
    failed++;
  }

  // Test 2: getFileHistoryDir
  const dir = getFileHistoryDir('test');
  if (dir.includes('.upup') && dir.includes('file-history')) {
    console.log(`  ✅ getFileHistoryDir working: ${dir}`);
    passed++;
  } else {
    console.log(`  ❌ getFileHistoryDir failed`);
    failed++;
  }

  // Test 3: setSessionId
  manager.setSessionId('new-session');
  const stats = manager.getStats();
  if (stats.trackedFileCount === 0) {
    console.log(`  ✅ setSessionId working`);
    passed++;
  } else {
    console.log(`  ❌ setSessionId failed`);
    failed++;
  }

  // Test 4: getTrackedFiles
  const tracked = manager.getTrackedFiles();
  if (Array.isArray(tracked)) {
    console.log(`  ✅ getTrackedFiles working (${tracked.length} tracked)`);
    passed++;
  } else {
    console.log(`  ❌ getTrackedFiles failed`);
    failed++;
  }

  // Test 5: createSnapshot
  const snapshot = manager.createSnapshot('msg-123');
  if (snapshot && snapshot.messageId === 'msg-123') {
    console.log(`  ✅ createSnapshot working`);
    passed++;
  } else {
    console.log(`  ❌ createSnapshot failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Shell Snapshots Tests
// ============================================================================

async function testShellSnapshots(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Shell Snapshots Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: ShellSnapshotManager creation
  const manager = new ShellSnapshotManager();
  if (manager) {
    console.log(`  ✅ ShellSnapshotManager creation working`);
    passed++;
  } else {
    console.log(`  ❌ ShellSnapshotManager creation failed`);
    failed++;
  }

  // Test 2: getShellSnapshotsDir
  const dir = getShellSnapshotsDir();
  if (dir.includes('.upup') && dir.includes('shell-snapshots')) {
    console.log(`  ✅ getShellSnapshotsDir working: ${dir}`);
    passed++;
  } else {
    console.log(`  ❌ getShellSnapshotsDir failed`);
    failed++;
  }

  // Test 3: detectShellType
  const shellType = detectShellType();
  if (['bash', 'zsh', 'fish', 'sh'].includes(shellType)) {
    console.log(`  ✅ detectShellType working: ${shellType}`);
    passed++;
  } else {
    console.log(`  ❌ detectShellType failed`);
    failed++;
  }

  // Test 4: createSnapshot
  const snapshot = manager.createSnapshot('bash');
  if (snapshot && snapshot.shellType === 'bash' && snapshot.path.endsWith('.sh')) {
    console.log(`  ✅ createSnapshot working: ${snapshot.id}`);
    passed++;
    // Clean up
    manager.deleteSnapshot(snapshot.id);
  } else {
    console.log(`  ❌ createSnapshot failed`);
    failed++;
  }

  // Test 5: getStats
  const stats = manager.getStats();
  if (typeof stats.snapshotCount === 'number' && typeof stats.totalSize === 'number') {
    console.log(`  ✅ getStats working (${stats.snapshotCount} snapshots)`);
    passed++;
  } else {
    console.log(`  ❌ getStats failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Session Stats Tests
// ============================================================================

async function testSessionStats(): Promise<{ passed: number; failed: number }> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Session Stats Tests');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 1: StatsCacheManager creation
  const manager = new StatsCacheManager();
  if (manager) {
    console.log(`  ✅ StatsCacheManager creation working`);
    passed++;
  } else {
    console.log(`  ❌ StatsCacheManager creation failed`);
    failed++;
  }

  // Test 2: getStatsCachePath
  const path = getStatsCachePath();
  if (path.includes('.upup') && path.includes('stats-cache.json')) {
    console.log(`  ✅ getStatsCachePath working: ${path}`);
    passed++;
  } else {
    console.log(`  ❌ getStatsCachePath failed`);
    failed++;
  }

  // Test 3: recordSession
  const sessionStats: SessionStats = {
    sessionId: 'test-session-123',
    duration: 60000,
    messageCount: 10,
    timestamp: new Date().toISOString(),
  };
  manager.recordSession(sessionStats);
  const cache = manager.getCache();
  if (cache.totalSessions > 0) {
    console.log(`  ✅ recordSession working (total: ${cache.totalSessions})`);
    passed++;
  } else {
    console.log(`  ❌ recordSession failed`);
    failed++;
  }

  // Test 4: getTotalActivity
  const activity = manager.getTotalActivity();
  if (typeof activity.totalSessions === 'number') {
    console.log(`  ✅ getTotalActivity working (${activity.totalSessions} sessions)`);
    passed++;
  } else {
    console.log(`  ❌ getTotalActivity failed`);
    failed++;
  }

  // Test 5: getModelUsageSummary
  manager.recordModelUsage('claude-3-sonnet', 1000, 2000);
  const usage = manager.getModelUsageSummary();
  if (Array.isArray(usage) && usage.length > 0) {
    console.log(`  ✅ recordModelUsage & getModelUsageSummary working`);
    passed++;
  } else {
    console.log(`  ❌ Model usage tracking failed`);
    failed++;
  }

  return { passed, failed };
}

// ============================================================================
// Main Execution
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        UpUp Final Features Verification                           ║');
  console.log('║            Project, FileHistory, ShellSnapshot, Stats          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const results = await Promise.all([
    testProjectStorage(),
    testFileHistory(),
    testShellSnapshots(),
    testSessionStats(),
  ]);

  // Summary
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  FINAL FEATURES TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log(`  Project Storage:     ✅ ${results[0].passed}/${results[0].passed + results[0].failed}`);
  console.log(`  File History:       ✅ ${results[1].passed}/${results[1].passed + results[1].failed}`);
  console.log(`  Shell Snapshots:    ✅ ${results[2].passed}/${results[2].passed + results[2].failed}`);
  console.log(`  Session Stats:      ✅ ${results[3].passed}/${results[3].passed + results[3].failed}`);

  console.log(`\n  Total new tests:  ${totalPassed + totalFailed}`);
  console.log(`  ✅ Passed:         ${totalPassed}`);
  console.log(`  ❌ Failed:         ${totalFailed}`);
  console.log(`  Pass rate:         ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed === 0) {
    console.log('\n  ✅ ALL FINAL FEATURES TESTS PASSED!\n');
  } else {
    console.log('\n  ❌ SOME TESTS FAILED\n');
  }
}

runAllTests().catch(console.error);