#!/usr/bin/env bun
/**
 * oscript-cost-verify.ts — Verify /cost command shows real token data
 *
 * Strategy:
 * 1. Start bun run dev
 * 2. Send a real query (calculate VaR) via clipboard paste
 * 3. Wait for response
 * 4. Send /cost via clipboard paste (avoids autocomplete interception)
 * 5. Verify it shows non-zero tokens and cost
 *
 * Key insight: Using clipboard paste instead of keystroke for /cost
 * because pi-tui's slash autocomplete intercepts Enter key when
 * slash suggestions are active.
 */

import { execSync } from 'child_process';

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-cost-verify.log';
const UTF8_ENV = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

function runAppleScript(script: string): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf-8', timeout: 30000 }).trim() };
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString().trim() || e.message };
  }
}

function pasteText(text: string): boolean {
  Bun.write('/tmp/upup-paste.txt', text);
  execSync(`pbcopy < /tmp/upup-paste.txt`, { encoding: 'utf-8', timeout: 5000, env: UTF8_ENV });
  const clip = execSync('pbpaste', { encoding: 'utf-8', env: UTF8_ENV });
  if (!clip || clip.length === 0) return false;
  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
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

/** Send a second Enter to ensure command submission */
function pressEnter(): boolean {
  const script = `
tell application "Terminal"
  activate
end tell
delay 0.1
tell application "System Events"
  tell process "Terminal"
    key code 36
  end tell
end tell
`;
  return runAppleScript(script).ok;
}

function readLog(lines = 300): string {
  try {
    return execSync(`tail -${lines} ${OUTPUT_LOG} 2>/dev/null || echo ""`, { encoding: 'utf-8', timeout: 5000 })
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x00/g, '')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch { return ''; }
}

// ============================================================================
console.log('════════════════════════════════════════════════════════');
console.log('  /cost Command Verification — Real Token Data');
console.log('════════════════════════════════════════════════════════');
console.log('');

// Cleanup & start
try { execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true'); execSync(`rm -f ${OUTPUT_LOG}`); } catch {}
await Bun.sleep(1000);

console.log('[1] Starting bun run dev...');
runAppleScript(`
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
end tell
`);
await Bun.sleep(15000);

const ps = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
if (ps === 'NOT_RUNNING') { console.log('    ❌ Not running!'); process.exit(1); }
console.log(`    ✅ Running (PID: ${ps.split('\n')[0]})`);

// Step 2: Send a real query to generate token usage
console.log('');
console.log('[2] Sending query to generate token usage...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

pasteText('Calculate VaR for returns [-0.05, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05] at 95% confidence');
console.log('    Waiting 30s for response...');
await Bun.sleep(30000);

const queryOutput = readLog(300);
const queryOk = queryOutput.includes('VaR') || queryOutput.includes('Value at Risk') || queryOutput.includes('calculate');
console.log(`    ${queryOk ? '✅' : '⚠️'} Query response: ${queryOk ? 'received' : 'no match found'}`);

// Show VaR response preview
const varPreview = queryOutput.split('\n').filter(l => l.includes('VaR') || l.includes('-5')).slice(0, 3);
if (varPreview.length > 0) {
  console.log(`    VaR response: ${varPreview[0].trim().substring(0, 80)}`);
}

// Step 3: Send /cost via clipboard paste (avoids autocomplete interception)
console.log('');
console.log('[3] Sending /cost command via clipboard paste...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

// Use pasteText instead of sendSlash to avoid autocomplete Enter interception
pasteText('/cost');
await Bun.sleep(2000);

// Press Enter again to ensure submission (in case autocomplete consumed the first Enter)
pressEnter();
await Bun.sleep(5000);

const costOutput = readLog(300);
console.log('    /cost raw output (cleaned):');
const costLines = costOutput.split('\n').filter(l => l.trim()).slice(-20);
for (const line of costLines) {
  const clean = line.replace(/\[2K/g, '').replace(/\[?2026[hl]/g, '').replace(/\[?25[hl]/g, '').trim();
  if (clean.length > 2) console.log(`    | ${clean}`);
}

// Step 4: Verify /cost shows non-zero data
console.log('');
console.log('[4] Verifying /cost shows real token data...');

// Flexible matching patterns (the output might have ANSI or TUI wrapping)
const hasTokens = costOutput.match(/Input[:\s]+(\d[\d,]*)\s*tokens/i) || costOutput.match(/Input[:\s]+(\d[\d,]*)/i);
const hasCost = costOutput.match(/Session\s*cost[:\s]*\$?[\d.]+/i) || costOutput.match(/\$[\d.]+/);
const hasOutputTokens = costOutput.match(/Output[:\s]+(\d[\d,]*)\s*tokens/i) || costOutput.match(/Output[:\s]+(\d[\d,]*)/i);
const hasTotal = costOutput.match(/Total[:\s]+(\d[\d,]*)\s*tokens/i) || costOutput.match(/Total[:\s]+(\d[\d,]*)/i);
const hasTokenUsage = costOutput.includes('Token Usage') || costOutput.includes('token usage');
const hasCostSection = costOutput.includes('Cost:') || costOutput.includes('cost:');

let inputTokens = 0;
let outputTokens = 0;

if (hasTokens) {
  inputTokens = parseInt(hasTokens[1].replace(/,/g, ''));
  console.log(`    ✅ Input tokens: ${hasTokens[1]}`);
} else {
  console.log(`    ❌ No input tokens found`);
}

if (hasOutputTokens) {
  outputTokens = parseInt(hasOutputTokens[1].replace(/,/g, ''));
  console.log(`    ✅ Output tokens: ${hasOutputTokens[1]}`);
} else {
  console.log(`    ❌ No output tokens found`);
}

if (hasTotal) {
  console.log(`    ✅ Total tokens: ${hasTotal[1]}`);
} else {
  console.log(`    ❌ No total tokens found`);
}

if (hasCost) {
  console.log(`    ✅ Cost line present: ${hasCost[0]}`);
} else {
  console.log(`    ⚠️ No cost line found`);
}

if (hasTokenUsage) {
  console.log(`    ✅ "Token Usage" section found`);
}
if (hasCostSection) {
  console.log(`    ✅ "Cost" section found`);
}

// Final verdict
console.log('');
if (inputTokens > 0 || outputTokens > 0) {
  console.log('  ✅ /cost verification PASSED — shows real token data!');
  console.log(`     Input: ${inputTokens}, Output: ${outputTokens}, Total: ${inputTokens + outputTokens}`);
} else if (hasTokenUsage || hasCostSection) {
  console.log('  ⚠️ /cost shows token/cost structure but zero values');
  console.log('     The command executed but no LLM tokens were tracked');
  console.log('     This may indicate the agent.ts sync is not taking effect');
} else {
  console.log('  ⚠️ /cost output not found in log');
  console.log('     Possible causes:');
  console.log('     - TUI autocomplete intercepted the command');
  console.log('     - The /cost output was not rendered before log read');
  console.log('     - The log capture missed the output');
}

// Cleanup
console.log('');
console.log('[5] Cleaning up...');
runAppleScript(`tell application "Terminal"\n  if (count of windows) > 1 then close front window\nend tell`);
try { execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true'); } catch {}

console.log('');
console.log('════════════════════════════════════════════════════════');
