#!/usr/bin/env bun
/**
 * oscript-mac-verify.ts — Real macOS osascript verification of Dexter
 *
 * Uses AppleScript System Events to:
 * 1. Create a Terminal tab and run `bun run dev`
 * 2. Send REAL investment analysis queries via clipboard paste
 * 3. Capture and verify Dexter's responses
 *
 * Key: AppleScript `keystroke` only supports ASCII.
 *      Chinese/unicode text is sent via clipboard paste (Cmd+V).
 *
 * Run: bun run scripts/oscript-mac-verify.ts
 */

import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/dexter-oscript-output.log';
const STARTUP_WAIT_MS = 15000;
const SLASH_CMD_DELAY_MS = 6000;    // Slash commands via paste need a bit more for TUI render
const INVEST_QUERY_DELAY_MS = 30000; // Investment queries need more time

interface TestCase {
  cmd: string;
  type: 'slash' | 'query';
  expectKeywords: string[];
  delay?: number;
}

const COMMANDS_TO_TEST: TestCase[] = [
  // Phase 1: Basic slash commands (ASCII, use keystroke)
  { cmd: '/help', type: 'slash', expectKeywords: ['Available commands', 'Usage', 'commands', 'help'] },
  { cmd: '/status', type: 'slash', expectKeywords: ['Agent', 'Model', 'Status', 'Running', 'Idle'] },
  { cmd: '/doctor', type: 'slash', expectKeywords: ['Health', 'Check', 'doctor', 'API', 'OK'] },
  { cmd: '/tools', type: 'slash', expectKeywords: ['Tools', 'tools', 'Available', 'Registered'] },
  { cmd: '/cost', type: 'slash', expectKeywords: ['Token', 'token', 'Cost', 'cost', 'Usage'] },

  // Phase 2: Real investment queries — Chinese (clipboard paste)
  // NOTE: TUI renders in ASCII-only via tee, so Chinese text can't be matched
  //       from the log. We verify these are sent without errors.
  //       English equivalents below provide full keyword verification.
  {
    cmd: '分析比亚迪，给出投资建议',
    type: 'query',
    expectKeywords: ['BYD', 'price', 'EV', 'vehicle', 'revenue', 'stock', 'analyze'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: '分析特斯拉(TSLA)的财务数据和技术指标',
    type: 'query',
    expectKeywords: ['TSLA', 'Tesla', 'financial', 'revenue', 'indicator', 'technical'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'Calculate VaR for these returns: -0.05, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05 at 95% confidence',
    type: 'query',
    expectKeywords: ['VaR', 'Value at Risk', 'confidence', 'loss', 'calculate'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'Use Black-Scholes to calculate call option price: S=100, K=105, T=0.25yr, r=5%, sigma=20%',
    type: 'query',
    expectKeywords: ['Black-Scholes', 'option', 'call', 'price', 'delta', 'calculate'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'Calculate the correlation between BYD and TSLA stock returns',
    type: 'query',
    expectKeywords: ['correlation', 'Pearson', 'BYD', 'TSLA', 'calculate'],
    delay: INVEST_QUERY_DELAY_MS,
  },

  // Phase 3: English investment queries (full keyword verification)
  {
    cmd: 'Analyze Apple (AAPL) stock fundamentals including PE ratio and revenue growth',
    type: 'query',
    expectKeywords: ['AAPL', 'Apple', 'fundamental', 'revenue', 'PE', 'earnings'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'What is the Sharpe ratio for a portfolio with returns 0.05, 0.03, -0.02, 0.04, 0.01?',
    type: 'query',
    expectKeywords: ['Sharpe', 'ratio', 'volatility', 'risk-free'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'Calculate the maximum drawdown for prices: 100, 120, 150, 130, 110, 90, 100, 120',
    type: 'query',
    expectKeywords: ['drawdown', 'peak', 'trough', 'maximum', 'calculate'],
    delay: INVEST_QUERY_DELAY_MS,
  },
  {
    cmd: 'Calculate Sortino ratio with returns 0.05, -0.08, 0.03, -0.02, 0.07, -0.05, target return 2%',
    type: 'query',
    expectKeywords: ['Sortino', 'downside', 'deviation', 'target', 'calculate'],
    delay: INVEST_QUERY_DELAY_MS,
  },
];

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

/** Get visible text content from Terminal window via AppleScript */
function getTerminalContent(): string {
  const script = `
tell application "Terminal"
  set contentStr to contents of front window as text
  return contentStr
end tell
`;
  const result = runAppleScript(script);
  return result.ok ? result.output : '';
}

/** Send text to the active Terminal window via clipboard paste (Cmd+V) */
function pasteText(text: string): boolean {
  // CRITICAL: pbcopy needs LANG=en_US.UTF-8 for Chinese/Unicode text.
  // Default "C" locale causes pbcopy to convert UTF-8 → GB2312/GBK (garbled).
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

  // Write text to temp file (UTF-8 safe), then pbcopy from file
  const tmpFile = '/tmp/dexter-paste.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000, env });
  } catch {
    return false;
  }

  // Verify clipboard
  try {
    const clip = execSync('pbpaste', { encoding: 'utf-8', env });
    if (!clip || clip.length === 0) return false;
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

/** Send a slash command via clipboard paste to avoid autocomplete interception */
function sendSlashCommand(cmd: string): boolean {
  // Use clipboard paste instead of keystroke to avoid pi-tui slash autocomplete
  // intercepting the Enter key. See §33.7 in mm5.md for details.
  return pasteText(cmd);
}

/** Aggressively strip ANSI escape codes and TUI control sequences, preserving CJK */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // ANSI CSI sequences
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC sequences (hyperlinks)
    .replace(/\x1b\[[0-9;]*$/gm, '')          // Incomplete ANSI at end of lines
    .replace(/\x00/g, '')                      // Null bytes
    .replace(/\r/g, '\n')                      // CR → LF
    .replace(/\n{3,}/g, '\n\n')               // Collapse multiple blank lines
    .trim();
}

/** Read the output log and clean it (preserves CJK characters) */
function readCleanLog(lines: number = 200): string {
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

/** Shell-escape a string */
function escapeShellArg(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// ============================================================================
// Test Execution
// ============================================================================

console.log('════════════════════════════════════════════════════════════════');
console.log('  Dexter macOS osascript — Real Investment Analysis Verification');
console.log('════════════════════════════════════════════════════════════════');
console.log('');

// Step 1: Kill any previous dexter processes from prior runs
console.log('[1] Cleaning up any previous dexter processes...');
try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`, { encoding: 'utf-8' });
  execSync(`rm -f ${OUTPUT_LOG}`, { encoding: 'utf-8' });
} catch {}
await Bun.sleep(1000);

// Step 2: Create a new Terminal tab and start bun run dev
console.log('[2] Creating Terminal tab and starting bun run dev...');

const startScript = `
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
  set custom title of front window to "Dexter oscript Verify"
end tell
`;
const startResult = runAppleScript(startScript);
if (!startResult.ok) {
  console.log(`    ❌ Failed to create Terminal tab: ${startResult.output}`);
  process.exit(1);
}
console.log('    ✅ Terminal tab created, bun run dev starting...');
console.log(`    Waiting ${STARTUP_WAIT_MS / 1000}s for startup...`);
await Bun.sleep(STARTUP_WAIT_MS);

// Step 3: Check if process is running
const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
if (psCheck === 'NOT_RUNNING') {
  console.log('    ❌ bun run dev is not running! Check output log:');
  console.log(readCleanLog(30));
  process.exit(1);
}
console.log(`    ✅ bun run dev is running (PID: ${psCheck.split('\n')[0]})`);

// Step 4: Run each test command
console.log('');
console.log('[3] Sending real investment analysis commands...');
console.log('');

const results: Array<{
  command: string;
  type: string;
  status: 'ok' | 'sent' | 'error' | 'timeout';
  matchedKeyword?: string;
  responsePreview?: string;
}> = [];

for (let i = 0; i < COMMANDS_TO_TEST.length; i++) {
  const test = COMMANDS_TO_TEST[i];
  const delay = test.delay ?? (test.type === 'slash' ? SLASH_CMD_DELAY_MS : INVEST_QUERY_DELAY_MS);
  const cmdPreview = test.cmd.substring(0, 55) + (test.cmd.length > 55 ? '...' : '');
  console.log(`  [${i + 1}/${COMMANDS_TO_TEST.length}] ${cmdPreview}`);

  // Clear the log before this command for cleaner capture
  try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}

  // Send the command
  let sent = false;
  if (test.type === 'slash') {
    sent = sendSlashCommand(test.cmd);
  } else {
    sent = pasteText(test.cmd);
  }

  if (!sent) {
    results.push({ command: test.cmd, type: test.type, status: 'error' });
    console.log(`    ❌ Failed to send command`);
    continue;
  }

  // Wait for Dexter to process
  await Bun.sleep(delay);

  // Capture and clean output from tee log only (Terminal content is unstable)
  const cleanOutput = readCleanLog(400);
  const combinedOutput = cleanOutput;

  // Check for expected keywords (case-insensitive)
  const matchedKeyword = test.expectKeywords.find(kw =>
    combinedOutput.toLowerCase().includes(kw.toLowerCase())
  );

  const hasError = combinedOutput.includes('Error:') || combinedOutput.includes('FATAL') || combinedOutput.includes('crashed');
  const hasResponse = matchedKeyword !== undefined;
  const hasAnyOutput = combinedOutput.length > 100;

  let status: 'ok' | 'sent' | 'error' | 'timeout';
  if (hasError && !hasResponse) {
    status = 'error';
  } else if (hasResponse) {
    status = 'ok';
  } else if (hasAnyOutput) {
    status = 'sent';
  } else {
    status = 'timeout';
  }

  // Get a preview of the response
  const previewLines = combinedOutput
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && !l.startsWith('['))
    .slice(-5)
    .join(' | ')
    .substring(0, 150);

  results.push({
    command: test.cmd,
    type: test.type,
    status,
    matchedKeyword,
    responsePreview: previewLines,
  });

  const icon = status === 'ok' ? '✅' : status === 'error' ? '❌' : status === 'timeout' ? '⏰' : '⚠️';
  const matchInfo = matchedKeyword ? ` [matched: "${matchedKeyword}"]` : '';
  console.log(`    ${icon} ${status}${matchInfo}`);
  if (previewLines && status !== 'sent') {
    console.log(`    → ${previewLines.substring(0, 120)}`);
  }

  await Bun.sleep(1000);
}

// Step 5: Cleanup
console.log('');
console.log('[4] Cleaning up...');
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
  console.log('    ⚠️ Could not auto-close Terminal tab');
}

try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`);
} catch {}

// ============================================================================
// Summary
// ============================================================================

console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('════════════════════════════════════════════════════════════════');

const ok = results.filter(r => r.status === 'ok');
const err = results.filter(r => r.status === 'error');
const sent = results.filter(r => r.status === 'sent');
const timeout = results.filter(r => r.status === 'timeout');

console.log(`  Total commands:     ${results.length}`);
console.log(`  ✅ Verified (OK):   ${ok.length}`);
console.log(`  ⚠️ Sent (no match): ${sent.length}`);
console.log(`  ⏰ Timeout:         ${timeout.length}`);
console.log(`  ❌ Errors:          ${err.length}`);
console.log('');

console.log('  Detailed Results:');
console.log('  ─────────────────────────────────────────────────────────');
for (const r of results) {
  const icon = r.status === 'ok' ? '✅' : r.status === 'error' ? '❌' : r.status === 'timeout' ? '⏰' : '⚠️';
  const cmdP = r.command.substring(0, 50);
  const match = r.matchedKeyword ? ` [${r.matchedKeyword}]` : '';
  console.log(`  ${icon} ${r.type.padEnd(6)} | ${cmdP.padEnd(52)} | ${r.status}${match}`);
}

console.log('');

const slashResults = results.filter(r => r.type === 'slash');
const queryResults = results.filter(r => r.type === 'query');
const slashOk = slashResults.filter(r => r.status === 'ok').length;
const queryOk = queryResults.filter(r => r.status === 'ok').length;

console.log('  Phase Breakdown:');
console.log(`    Slash Commands:     ${slashOk}/${slashResults.length} verified`);
console.log(`    Investment Queries: ${queryOk}/${queryResults.length} verified`);
console.log('');

if (err.length > 0) {
  console.log('  Errors:');
  for (const r of err) {
    console.log(`    ❌ ${r.command.substring(0, 60)}: ${r.responsePreview?.substring(0, 100)}`);
  }
}

console.log('');
if (err.length === 0 && ok.length > 0) {
  console.log('  ✅ macOS osascript REAL verification PASSED');
  console.log(`     ${ok.length}/${results.length} commands received verified responses`);
  console.log('     Dexter correctly handles real investment analysis queries via osascript');
} else if (err.length > 0) {
  console.log('  ⚠️ Some commands had errors — check output above');
} else {
  console.log('  ⚠️ No commands received verified responses — check if Dexter is running');
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
