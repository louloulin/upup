#!/usr/bin/env bun
/**
 * oscript-mac-verify.ts — Use macOS osascript to control Terminal.app
 * and verify Dexter's bun run dev interactively.
 *
 * This script:
 * 1. Creates a new Terminal window
 * 2. Runs `bun run dev` in it
 * 3. Waits for startup
 * 4. Sends slash commands via AppleScript keystroke events
 * 5. Captures output via Terminal's content
 *
 * Run: bun run scripts/oscript-mac-verify.ts
 */

import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const COMMANDS_TO_TEST = [
  '/help',
  '/status',
  '/doctor',
  '/mcp status',
  '/tools',
  '/cost',
  '/config',
  '/permissions',
  '/tasks',
];

const STARTUP_WAIT_MS = 8000; // Wait for Dexter to start
const COMMAND_DELAY_MS = 1500; // Wait between commands

// ============================================================================
// AppleScript Helpers
// ============================================================================

function runAppleScript(script: string): string {
  try {
    return execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
  } catch (e: any) {
    return `ERROR: ${e.stderr?.toString().trim() || e.message}`;
  }
}

function runAppleScriptRaw(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
    encoding: 'utf-8',
    timeout: 30000,
  }).trim();
}

// ============================================================================
// Test Execution
// ============================================================================

console.log('════════════════════════════════════════════════════════');
console.log('  Dexter macOS osascript Interactive Verification');
console.log('════════════════════════════════════════════════════════');
console.log('');

// Step 1: Create a new Terminal tab and start bun run dev
console.log('[1] Creating Terminal tab and starting bun run dev...');

const startScript = `
tell application "Terminal"
  activate
  set dexterTab to do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee /tmp/dexter-oscript-output.log"
  set custom title of front window to "Dexter oscript Verify"
end tell
`;
runAppleScriptRaw(startScript);
console.log('    ✅ Terminal tab created, bun run dev starting...');
console.log(`    Waiting ${STARTUP_WAIT_MS / 1000}s for startup...`);

// Step 2: Wait for startup
await Bun.sleep(STARTUP_WAIT_MS);

// Check if process is running
const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
if (psCheck === 'NOT_RUNNING') {
  console.log('    ❌ bun run dev is not running! Aborting.');
  process.exit(1);
}
console.log(`    ✅ bun run dev is running (PID: ${psCheck.split('\n')[0]})`);

// Step 3: Test each command via keystroke injection
console.log('');
console.log('[2] Testing interactive commands via osascript keystrokes...');
console.log('');

const results: Array<{ command: string; status: string; output?: string }> = [];

for (const cmd of COMMANDS_TO_TEST) {
  // Send the command via keystrokes
  const sendScript = `
tell application "Terminal"
  activate
  do script "${cmd}" in front window
end tell
`;
  try {
    runAppleScriptRaw(sendScript);
  } catch {
    // Fallback: use keystroke approach
    const keystrokeScript = `
tell application "System Events"
  tell process "Terminal"
    keystroke "${cmd}"
    key code 36
  end tell
end tell
`;
    try {
      runAppleScriptRaw(keystrokeScript);
    } catch (e: any) {
      results.push({ command: cmd, status: 'fail', output: e.message });
      console.log(`  ❌ ${cmd} — Failed to send: ${e.message.substring(0, 60)}`);
      continue;
    }
  }

  // Wait for command to execute
  await Bun.sleep(COMMAND_DELAY_MS);

  // Capture Terminal output
  let output = '';
  try {
    output = execSync('tail -50 /tmp/dexter-oscript-output.log 2>/dev/null || echo ""', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    output = '(could not read output)';
  }

  // Check if the command was acknowledged (look for known patterns)
  const hasOutput = output.length > 0;
  const hasError = output.includes('Error:') || output.includes('error:') || output.includes('CRASH');
  const hasResponse = output.includes('MCP') || output.includes('Tools') || output.includes('Agent') ||
                      output.includes('Token') || output.includes('Config') || output.includes('Permission') ||
                      output.includes('Available commands') || output.includes('Background') ||
                      output.includes('Memory') || output.includes('API');

  const status = hasError ? 'error' : hasResponse ? 'ok' : hasOutput ? 'sent' : 'unknown';
  results.push({ command: cmd, status, output: output.substring(0, 200) });

  const icon = status === 'ok' ? '✅' : status === 'error' ? '❌' : '⚠️';
  const preview = output.split('\n').filter(l => l.trim() && !l.includes('[?')).slice(-3).join(' | ').substring(0, 80);
  console.log(`  ${icon} ${cmd} — ${status}${preview ? ' → ' + preview : ''}`);
}

// Step 4: Cleanup — close the Terminal tab
console.log('');
console.log('[3] Cleaning up...');
await Bun.sleep(1000);

const cleanupScript = `
tell application "Terminal"
  if (count of windows) > 1 then
    close front window
  end if
end tell
`;
try {
  runAppleScript(cleanupScript);
  console.log('    ✅ Terminal tab closed');
} catch {
  console.log('    ⚠️ Could not auto-close Terminal tab (please close manually)');
}

// Kill any lingering bun run dev processes from our test
try {
  execSync('pkill -f "dexter-oscript-output.log" 2>/dev/null || true');
} catch {}

// ============================================================================
// Summary
// ============================================================================

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('════════════════════════════════════════════════════════');

const ok = results.filter(r => r.status === 'ok').length;
const err = results.filter(r => r.status === 'error').length;
const other = results.filter(r => r.status !== 'ok' && r.status !== 'error').length;

console.log(`  Total commands sent: ${results.length}`);
console.log(`  ✅ Verified:         ${ok}`);
console.log(`  ⚠️ Sent (unverified): ${other}`);
console.log(`  ❌ Errors:            ${err}`);
console.log('');

if (err > 0) {
  console.log('  Errors found:');
  for (const r of results.filter(r => r.status === 'error')) {
    console.log(`    ${r.command}: ${r.output?.substring(0, 100)}`);
  }
}

console.log('');
if (err === 0 && ok > 0) {
  console.log('  ✅ macOS osascript verification PASSED');
} else if (err > 0) {
  console.log('  ⚠️ Some commands had errors — check output above');
}
