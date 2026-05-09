#!/usr/bin/env bun
/**
 * oscript-cjk-diag.ts — Diagnostic: Does Chinese text actually reach UpUp?
 *
 * Strategy:
 * 1. Start bun run dev
 * 2. Send a Chinese query via clipboard paste
 * 3. Wait for processing
 * 4. Send /history to check if UpUp recorded the Chinese query
 * 5. Check output for evidence of Chinese query processing
 */

import { execSync } from 'child_process';

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-cjk-diag.log';

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

function escapeShellArg(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function pasteText(text: string): boolean {
  // CRITICAL: pbcopy needs LANG=en_US.UTF-8 for Chinese text.
  // Default "C" locale converts UTF-8 → GB2312 (garbled).
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

  const tmpFile = '/tmp/upup-cjk-paste.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000, env });
  } catch (e: any) {
    console.log(`    ❌ pbcopy failed: ${e.message}`);
    return false;
  }

  // Verify clipboard
  const clipboard = execSync('pbpaste', { encoding: 'utf-8', env });
  if (clipboard !== text) {
    console.log(`    ⚠️ Clipboard mismatch:`);
    console.log(`      expected: "${text}"`);
    console.log(`      got: "${clipboard}"`);
    return false;
  }
  console.log(`    ✅ Clipboard verified: "${text}" (${Buffer.byteLength(text, 'utf8')} bytes)`);

  const script = `
tell application "Terminal"
  activate
end tell
delay 0.2
tell application "System Events"
  tell process "Terminal"
    keystroke "v" using command down
    delay 0.5
    key code 36
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

function sendSlashCommand(cmd: string): boolean {
  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    keystroke "${cmd}"
    delay 0.2
    key code 36
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

function readRawLog(): Buffer {
  try {
    return execSync(`cat ${OUTPUT_LOG} 2>/dev/null || true`, {
      encoding: 'buffer',
      timeout: 5000,
    });
  } catch {
    return Buffer.alloc(0);
  }
}

// ============================================================================
// Main
// ============================================================================

console.log('════════════════════════════════════════════════════════');
console.log('  CJK Input Diagnostic — Does Chinese text reach UpUp?');
console.log('════════════════════════════════════════════════════════');
console.log('');

// Cleanup
try {
  execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true');
  execSync(`rm -f ${OUTPUT_LOG}`);
} catch {}
await Bun.sleep(1000);

// Start UpUp
console.log('[1] Starting bun run dev...');
const startScript = `
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
end tell
`;
runAppleScript(startScript);
await Bun.sleep(12000);

const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
if (psCheck === 'NOT_RUNNING') {
  console.log('    ❌ bun run dev not running!');
  process.exit(1);
}
console.log(`    ✅ bun run dev running (PID: ${psCheck.split('\n')[0]})`);

// ============================================================================
// Test 1: Send Chinese query
// ============================================================================
console.log('');
console.log('[2] Sending Chinese query: "分析比亚迪"');

// Clear log
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

const chineseQuery = '分析比亚迪，给出投资建议';
const pasted = pasteText(chineseQuery);
if (!pasted) {
  console.log('    ❌ Failed to paste Chinese text');
} else {
  console.log('    ✅ Chinese text pasted + Enter sent');
}

// Wait for processing (20 seconds for complex query)
console.log('    Waiting 20s for UpUp to process...');
await Bun.sleep(20000);

// ============================================================================
// Test 2: Check raw output for UTF-8 bytes
// ============================================================================
console.log('');
console.log('[3] Analyzing output log...');

const rawLog = readRawLog();
console.log(`    Log size: ${rawLog.length} bytes`);

// Check for any non-ASCII bytes
let nonAsciiCount = 0;
let cjkCount = 0;
const cjkRanges = [
  [0xE4, 0xB8, 0x80], // 一 (start of CJK Unified)
  [0xE6, 0xAF, 0x94], // 比
  [0xE4, 0xBA, 0x9A], // 亚
  [0xE8, 0xBF, 0xAA], // 迪
];

for (let i = 0; i < rawLog.length; i++) {
  if (rawLog[i] > 0x7F) {
    nonAsciiCount++;
  }
}
console.log(`    Non-ASCII bytes: ${nonAsciiCount}`);

// Search for specific Chinese character byte sequences
const searchTerms: Record<string, Buffer> = {
  '比亚迪': Buffer.from('比亚迪', 'utf8'),
  '分析': Buffer.from('分析', 'utf8'),
  'BYD': Buffer.from('BYD', 'utf8'),
  '投资': Buffer.from('投资', 'utf8'),
  '建议': Buffer.from('建议', 'utf8'),
};

for (const [label, needle] of Object.entries(searchTerms)) {
  const idx = rawLog.indexOf(needle);
  if (idx >= 0) {
    console.log(`    ✅ Found "${label}" at byte offset ${idx}`);
  } else {
    console.log(`    ❌ NOT found "${label}" (${needle.toString('hex')})`);
  }
}

// Also search for the raw query text
const queryBytes = Buffer.from(chineseQuery, 'utf8');
const queryIdx = rawLog.indexOf(queryBytes);
console.log(`    Query text "${chineseQuery}" in log: ${queryIdx >= 0 ? `YES at offset ${queryIdx}` : 'NO'}`);

// ============================================================================
// Test 3: Send /history to check if UpUp recorded the query
// ============================================================================
console.log('');
console.log('[4] Sending /history to check if UpUp recorded Chinese query...');

// Clear log
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

sendSlashCommand('/history');
await Bun.sleep(5000);

const historyLog = readRawLog();
console.log(`    History log size: ${historyLog.length} bytes`);

// Search history for Chinese text
const historySearchTerms = ['比亚迪', '分析', 'BYD', 'history', 'History', 'conversation'];
for (const term of historySearchTerms) {
  const needle = Buffer.from(term, 'utf8');
  const idx = historyLog.indexOf(needle);
  if (idx >= 0) {
    // Get surrounding context
    const start = Math.max(0, idx - 20);
    const end = Math.min(historyLog.length, idx + needle.length + 40);
    const context = historyLog.slice(start, end).toString('utf8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    console.log(`    ✅ /history contains "${term}" → context: "${context.substring(0, 80)}"`);
  } else {
    console.log(`    ❌ /history does NOT contain "${term}"`);
  }
}

// ============================================================================
// Test 4: Send English equivalent to verify the response mechanism works
// ============================================================================
console.log('');
console.log('[5] Sending English equivalent: "Analyze BYD stock"...');

try { execSync(`> ${OUTPUT_LOG}`); } catch {}

const englishQuery = 'Analyze BYD (BYDDY) stock price and fundamentals';
const pasted2 = pasteText(englishQuery);
await Bun.sleep(20000);

const englishLog = readRawLog();
const englishTerms = ['BYD', 'BYDDY', 'price', 'fundamental', 'stock'];
for (const term of englishTerms) {
  const needle = Buffer.from(term, 'utf8');
  const idx = englishLog.indexOf(needle);
  if (idx >= 0) {
    console.log(`    ✅ English response contains "${term}" at offset ${idx}`);
  } else {
    console.log(`    ❌ English response does NOT contain "${term}"`);
  }
}

// ============================================================================
// Cleanup
// ============================================================================
console.log('');
console.log('[6] Cleaning up...');
const cleanupScript = `
tell application "Terminal"
  if (count of windows) > 1 then
    close front window
  end if
end tell
`;
runAppleScript(cleanupScript);
try { execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true'); } catch {}

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Diagnostic Complete');
console.log('════════════════════════════════════════════════════════');
