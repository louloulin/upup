#!/usr/bin/env bun
/**
 * oscript-approval-test.ts — macOS Terminal approval popup test
 *
 * Tests:
 * 1. write_file triggers approval popup
 * 2. User can select an option (1/2/3) and press Enter
 * 3. Session persistence file is created
 * 4. Second run does NOT show popup again
 */

import { execSync } from 'child_process';

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-approval-test.log';
const STARTUP_WAIT_MS = 14000;

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function runAS(script: string): { ok: boolean; output: string } {
  try {
    const output = execSync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
      { encoding: 'utf-8', timeout: 20000 },
    ).trim();
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString().trim() || e.message };
  }
}

function pasteText(text: string): boolean {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  const tmpFile = '/tmp/upup-paste-test.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000, env });
  } catch { return false; }
  return runAS(`
tell application "Terminal" to activate
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "v" using command down
    delay 0.4
    key code 36
  end tell
end tell
  `).ok;
}

// Send a number key directly (for VimSelectList numeric prefix support)
function sendNumber(n: number): boolean {
  return runAS(`
tell application "Terminal" to activate
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "${n}"
  end tell
end tell
  `).ok;
}

function sendEnter(): boolean {
  return runAS(`
tell application "Terminal" to activate
delay 0.1
tell application "System Events"
  tell process "Terminal"
    key code 36
  end tell
end tell
  `).ok;
}

function readLog(lines = 300): string {
  try {
    return execSync(`tail -${lines} ${OUTPUT_LOG} 2>/dev/null || echo ""`, {
      encoding: 'utf-8', timeout: 5000,
    }).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x00/g, '');
  } catch { return ''; }
}

function latestSessionFile(): { path: string; content: string } | null {
  try {
    const files = execSync(
      `ls -t "${PROJECT_DIR}/.upup/data/sessions/"session_*.json 2>/dev/null | head -1`,
      { encoding: 'utf-8', timeout: 3000 },
    ).trim();
    if (!files) return null;
    const content = execSync(`cat "${files}"`, { encoding: 'utf-8', timeout: 3000 }).trim();
    return { path: files, content };
  } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  UpUp Approval Popup — macOS Terminal Test');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // Cleanup
  console.log('[1] Cleanup...');
  execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true', { encoding: 'utf-8' });
  execSync(`rm -f ${OUTPUT_LOG}`, { encoding: 'utf-8' });
  await Bun.sleep(800);

  // Start Terminal
  console.log('[2] Starting bun run dev...');
  const start = runAS(`
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
  set custom title of front window to "UpUp Approval"
end tell
`);
  if (!start.ok) {
    console.log(`  ❌ ${start.output}`);
    process.exit(1);
  }
  console.log('  ✅ Terminal started, waiting 14s...');
  await Bun.sleep(STARTUP_WAIT_MS);

  const pid = execSync('pgrep -f "bun.*run.*dev" || echo ""', { encoding: 'utf-8' }).trim().split('\n')[0];
  if (!pid) { console.log('  ❌ Not running'); process.exit(1); }
  console.log(`  ✅ Running (PID: ${pid})`);

  // Trigger approval
  console.log('');
  console.log('[3] Triggering approval popup...');
  execSync(`> ${OUTPUT_LOG}`, { encoding: 'utf-8' });
  await Bun.sleep(200);

  pasteText('Write the current date and a brief analysis to test-output.txt');
  await Bun.sleep(500);

  // Wait for popup (inline approval in chat, check for Permission or tool approval lines)
  console.log('  Waiting for popup...');
  let popupFound = false;
  for (let i = 0; i < 10; i++) {
    await Bun.sleep(2000);
    const log = readLog(300);
    // Check for full-screen overlay OR inline approval text
    if (log.includes('Do you want to allow') || log.includes('Permission required') ||
        log.includes('Yes, allow all this session') || log.includes('1. Yes')) {
      popupFound = true;
      console.log(`  ✅ Approval UI appeared after ${(i + 1) * 2}s`);
      break;
    }
    if (i === 2) {
      // After 6s, snapshot the log for debugging
      console.log('  [6s log snapshot]:');
      readLog(150).split('\n').filter(l => l.trim()).slice(-10)
        .forEach(l => console.log(`    ${l.substring(0, 100)}`));
    }
  }

  if (!popupFound) {
    console.log('  ⚠️  No approval text in log (inline UI may not be captured by tee)');
    const log = readLog(100);
    log.split('\n').slice(-10).forEach(l => console.log(`    ${l.substring(0, 100)}`));
  }

  // Select option 2 via number key + Enter
  console.log('');
  console.log('[4] Selecting option 2 (allow-session)...');
  await Bun.sleep(500);

  // Try: number key to select, then Enter
  console.log('  Sending "2" (number prefix selection)...');
  sendNumber(2);
  await Bun.sleep(300);
  console.log('  Sending Enter...');
  sendEnter();
  await Bun.sleep(4000);

  // Check log after selection
  const logAfterSelect = readLog(200);
  const stillShowing = logAfterSelect.includes('Do you want to allow') ||
                       logAfterSelect.includes('Permission required') ||
                       logAfterSelect.includes('Yes, allow all this session');
  console.log(`  Popup still showing: ${stillShowing ? '❌ YES (selection failed)' : '✅ NO (selection worked)'}`);

  // Check session file immediately
  console.log('');
  console.log('[5] Checking session file...');
  await Bun.sleep(15000); // Wait for async startSession + approveToolSync to complete
  const session = latestSessionFile();
  if (session) {
    console.log(`  ✅ Session file: ${session.path.split('/').pop()}`);
    const parsed = JSON.parse(session.content);
    console.log(`  approvedTools: [${parsed.approvedTools?.join(', ') || '(empty)'}]`);
    console.log(`  queryCount: ${parsed.metadata?.queryCount}`);
    console.log(`  updatedAt: ${parsed.metadata?.updatedAt}`);
  } else {
    console.log('  ⚠️  No session file found');
  }

  // Wait for tool to execute
  console.log('');
  console.log('[6] Waiting for tool to execute...');
  await Bun.sleep(8000);

  // Check if file was written
  let fileWritten = false;
  try {
    const content = execSync(`cat ${PROJECT_DIR}/test-output.txt`, { encoding: 'utf-8', timeout: 3000 }).trim();
    fileWritten = content.length > 0;
    console.log(`  ${fileWritten ? '✅' : '❌'} test-output.txt written: ${fileWritten ? content.substring(0, 80) : 'empty'}`);
  } catch {
    console.log('  ❌ test-output.txt not found');
  }

  // Persistence test: restart
  console.log('');
  console.log('[7] Testing persistence (restart)...');
  console.log('  Killing current process...');
  execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true', { encoding: 'utf-8' });
  await Bun.sleep(1000);

  console.log('  Starting new Terminal tab...');
  const restart = runAS(`
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
  set custom title of front window to "UpUp Restart"
end tell
`);
  console.log('  ✅ New tab, waiting 14s...');
  await Bun.sleep(STARTUP_WAIT_MS);

  execSync(`> ${OUTPUT_LOG}`, { encoding: 'utf-8' });
  await Bun.sleep(200);
  pasteText('Append the current time to test-output.txt');
  await Bun.sleep(12000);

  const log2 = readLog(300);
  const stillHasPopup = log2.includes('Do you want to allow') ||
                        log2.includes('Permission required') ||
                        log2.includes('Yes, allow all this session');
  console.log('');
  console.log(`  ${!stillHasPopup ? '✅' : '❌'} Popup on restart: ${stillHasPopup ? 'YES (bug!)' : 'NO (persistence works!)'}`);

  // Summary
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Results');
  console.log('════════════════════════════════════════════════════════════');
  const session2 = latestSessionFile();
  const approved = session2 ? JSON.parse(session2.content).approvedTools : [];
  console.log(`  Popup appeared:      ${popupFound ? '✅ YES' : '❌ NO'}`);
  console.log(`  Selection worked:   ${!stillShowing ? '✅ YES' : '⚠️ UNCLEAR'}`);
  console.log(`  File written:        ${fileWritten ? '✅ YES' : '❌ NO'}`);
  console.log(`  Session persisted:  ${approved.length > 0 ? '✅ YES' : '❌ NO'}`);
  console.log(`  No popup on restart: ${!stillHasPopup ? '✅ YES' : '❌ NO'}`);
  console.log('');
  if (popupFound && approved.includes('write_file') && !stillHasPopup) {
    console.log('  🎉 All tests PASSED!');
  } else {
    console.log('  ⚠️  Some issues detected — see above.');
  }
  console.log('════════════════════════════════════════════════════════════');

  execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true');
}

main().catch(console.error);