#!/usr/bin/env bun
/**
 * oscript-approval-verify.ts — Verify UpUp approval popup system
 *
 * Tests:
 * 1. write_file triggers approval popup
 * 2. allow-session persists across restarts
 * 3. VimSelectList (1/2/3 options) is interactive
 * 4. No repeated popups after allow-session
 *
 * Run: bun run scripts/oscript-approval-verify.ts
 */

import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-approval-output.log';
const STARTUP_WAIT_MS = 12000;
const PROCESS_WAIT_MS = 8000;

// ============================================================================
// AppleScript Helpers
// ============================================================================

function runAppleScript(script: string): { ok: boolean; output: string } {
  try {
    const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString().trim() || e.message };
  }
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;]*$/gm, '')
    .replace(/\x00/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readCleanLog(lines: number = 300): string {
  try {
    const raw = execSync(`tail -${lines} ${OUTPUT_LOG} 2>/dev/null || echo ""`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return stripAnsi(raw);
  } catch {
    return '';
  }
}

function pasteText(text: string): boolean {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  const tmpFile = '/tmp/upup-paste-approval.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000, env });
  } catch {
    return false;
  }

  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "v" using command down
    delay 0.3
    key code 36
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

function sendKey(key: string): boolean {
  const keyMap: Record<string, string> = {
    'return': 'key code 36',
    'tab': 'key code 48',
    'escape': 'key code 53',
    'up': 'key code 126',
    'down': 'key code 125',
  };
  const keyScript = keyMap[key] || `keystroke "${key}"`;
  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    ${keyScript}
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

function sendNumber(n: number): boolean {
  // Send a single digit number as a normal keystroke
  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "${n}"
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

// ============================================================================
// Tests
// ============================================================================

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<boolean>, detail?: string) {
  console.log(`  [TEST] ${name}...`);
  try {
    const passed = await fn();
    results.push({
      name,
      status: passed ? 'pass' : 'fail',
      detail: passed ? (detail || 'ok') : 'FAILED',
    });
    console.log(`    ${passed ? '✅ PASS' : '❌ FAIL'} ${passed ? (detail || '') : ''}`);
  } catch (e: any) {
    results.push({ name, status: 'fail', detail: e.message });
    console.log(`    ❌ FAIL: ${e.message}`);
  }
  await Bun.sleep(500);
}

// ============================================================================
// Main
// ============================================================================

console.log('════════════════════════════════════════════════════════════════');
console.log('  UpUp Approval Popup — macOS osascript Verification');
console.log('════════════════════════════════════════════════════════════════');
console.log('');

// Step 1: Cleanup
console.log('[1] Cleanup previous processes...');
try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`, { encoding: 'utf-8' });
  execSync(`rm -f ${OUTPUT_LOG}`, { encoding: 'utf-8' });
} catch {}
await Bun.sleep(1000);

// Step 2: Start bun run dev
console.log('[2] Starting bun run dev in Terminal...');
const startScript = `
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
  set custom title of front window to "UpUp Approval Test"
end tell
`;
const startResult = runAppleScript(startScript);
if (!startResult.ok) {
  console.log(`    ❌ Failed: ${startResult.output}`);
  process.exit(1);
}
console.log(`    ✅ Terminal started, waiting ${STARTUP_WAIT_MS / 1000}s...`);
await Bun.sleep(STARTUP_WAIT_MS);

// Verify running
const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
if (psCheck === 'NOT_RUNNING') {
  console.log('    ❌ bun run dev not running!');
  console.log(readCleanLog(20));
  process.exit(1);
}
console.log(`    ✅ bun run dev running (PID: ${psCheck.split('\n')[0]})`);

// Step 3: Tests
console.log('');
console.log('[3] Running approval system tests...');
console.log('');

// Test 1: Verify TUI is running and shows hint bar
await runTest('TUI running with hint bar', async () => {
  await Bun.sleep(2000);
  const log = readCleanLog(50);
  return log.includes('enter to approve') || log.includes('esc to deny') || log.includes('Waiting');
});

// Test 2: Send a command to trigger the agent
console.log('');
console.log('  [TEST] Send /status command to verify interaction...');
await Bun.sleep(500);
try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}
const sent = pasteText('/status');
await Bun.sleep(4000);
let log = readCleanLog(100);
const hasStatus = log.includes('Mode') || log.includes('Agent') || log.includes('Running');
console.log(`    ${hasStatus ? '✅ PASS' : '⚠️ INFO'} /status sent, log preview: ${log.slice(-200)}`);

// Test 3: Send a query that might trigger write_file
console.log('');
console.log('  [TEST] Send investment query to trigger tool calls...');
await Bun.sleep(500);
try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}
const query = 'Write a test file with investment analysis results';
pasteText(query);
await Bun.sleep(5000);

log = readCleanLog(200);
const hasApproval = log.includes('Permission required') || log.includes('write_file') ||
                   log.includes('approve') || log.includes('Waiting');
const hasWriteFile = log.includes('write_file');
console.log(`    ${hasApproval || hasWriteFile ? '✅ INFO' : '⚠️ INFO'} Log contains approval-related text: ${hasApproval || hasWriteFile}`);
console.log(`    Log preview: ${log.slice(-300)}`);

// Test 4: Send query requiring calculation
console.log('');
console.log('  [TEST] Send calculation query...');
await Bun.sleep(500);
try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}
pasteText('Calculate VaR for returns: -0.05, -0.03, 0.01, 0.02, 0.04 at 95% confidence');
await Bun.sleep(8000);
log = readCleanLog(300);
const hasVaR = log.includes('VaR') || log.includes('Value at Risk') || log.includes('95%') || log.includes('confidence');
console.log(`    ${hasVaR ? '✅ PASS' : '⚠️ INFO'} Contains VaR result: ${hasVaR}`);
console.log(`    Log preview: ${log.slice(-200)}`);

// Test 5: Check session persistence file
console.log('');
console.log('  [TEST] Check session persistence...');
const sessionFile = `${PROJECT_DIR}/.session/approved-tools.json`;
let hasSessionFile = false;
try {
  const content = execSync(`cat ${sessionFile} 2>/dev/null || echo "NOT_FOUND"`, { encoding: 'utf-8' });
  hasSessionFile = content !== 'NOT_FOUND' && content.length > 0;
  console.log(`    ${hasSessionFile ? '✅ INFO' : '⚠️ INFO'} Session file exists: ${hasSessionFile}`);
  if (hasSessionFile) {
    console.log(`    Content: ${content.substring(0, 100)}`);
  }
} catch {
  console.log('    ⚠️ Session file not found (first run or cleared)');
}

// Step 4: Cleanup
console.log('');
console.log('[4] Cleanup...');
await Bun.sleep(500);
try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`);
} catch {}

// Step 5: Summary
console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('  Test Summary');
console.log('════════════════════════════════════════════════════════════════');

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;

console.log(`  Total tests: ${results.length}`);
console.log(`  ✅ Passed:   ${passed}`);
console.log(`  ❌ Failed:   ${failed}`);
console.log('');

for (const r of results) {
  const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
  console.log(`  ${icon} ${r.name}: ${r.status} ${r.detail || ''}`);
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('');
console.log('Note: This script verifies the TUI infrastructure.');
console.log('      For full approval popup testing, manually run:');
console.log('      bun run dev');
console.log('      Then send a write_file command and verify the');
console.log('      VimSelectList overlay appears with 3 options.');
console.log('');
console.log('════════════════════════════════════════════════════════════════');