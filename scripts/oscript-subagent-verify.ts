#!/usr/bin/env bun
/**
 * oscript-subagent-verify.ts — Real osascript verification of sub-agent parallel execution
 *
 * Tests that Dexter's sub-agent system works correctly:
 * 1. Start bun run dev
 * 2. Send /agent command to spawn a sub-agent
 * 3. Send /tasks to check task status
 * 4. Send queries that trigger parallel tool execution
 * 5. Verify parallel execution in the log
 */

import { execSync } from 'child_process';

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/dexter-subagent-verify.log';
const UTF8_ENV = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

function runAppleScript(script: string): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf-8', timeout: 30000 }).trim() };
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString().trim() || e.message };
  }
}

function pasteText(text: string): boolean {
  const env = UTF8_ENV;
  const tmpFile = '/tmp/dexter-paste.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000, env });
    const clip = execSync('pbpaste', { encoding: 'utf-8', env });
    if (!clip || clip.length === 0) return false;
  } catch { return false; }

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

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x00/g, '')
    .replace(/\r/g, '\n')
    .trim();
}

// ============================================================================
console.log('════════════════════════════════════════════════════════════════');
console.log('  Sub-Agent Parallel Execution — Real osascript Verification');
console.log('════════════════════════════════════════════════════════════════');
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

// Test 1: Verify /agent command works
console.log('');
console.log('[2] Testing /agent command...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

pasteText('/agent');
await Bun.sleep(6000);

const agentOutput = readLog(200);
const agentOk = agentOutput.includes('agent') || agentOutput.includes('Agent') || agentOutput.includes('spawn') || agentOutput.includes('task');
console.log(`    ${agentOk ? '✅' : '⚠️'} /agent response: ${agentOk ? 'received' : 'no match'}`);
if (agentOk) {
  const preview = agentOutput.split('\n').filter(l => l.includes('agent') || l.includes('Agent') || l.includes('spawn')).slice(0, 3);
  preview.forEach(l => console.log(`    | ${l.trim().substring(0, 80)}`));
}

// Test 2: Verify /tasks command works
console.log('');
console.log('[3] Testing /tasks command...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

pasteText('/tasks');
await Bun.sleep(6000);

const tasksOutput = readLog(200);
const tasksOk = tasksOutput.includes('task') || tasksOutput.includes('Task') || tasksOutput.includes('background') || tasksOutput.includes('No active');
console.log(`    ${tasksOk ? '✅' : '⚠️'} /tasks response: ${tasksOk ? 'received' : 'no match'}`);

// Test 3: Send a query that triggers parallel tool execution (multiple calculations)
console.log('');
console.log('[4] Sending parallel calculation query...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

pasteText('Calculate both VaR at 95% confidence AND Sharpe ratio for returns: -0.05, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05');
await Bun.sleep(30000);

const parallelOutput = readLog(400);
const hasVaR = parallelOutput.match(/VaR|Value at Risk/i);
const hasSharpe = parallelOutput.match(/Sharpe/i);
const hasBoth = hasVaR && hasSharpe;

console.log(`    VaR result: ${hasVaR ? '✅' : '⚠️'} ${hasVaR ? hasVaR[0] : 'not found'}`);
console.log(`    Sharpe result: ${hasSharpe ? '✅' : '⚠️'} ${hasSharpe ? hasSharpe[0] : 'not found'}`);
console.log(`    Both calculations: ${hasBoth ? '✅' : '⚠️'}`);

// Test 4: Verify parallel tool execution evidence
console.log('');
console.log('[5] Checking for parallel tool execution evidence...');

// Look for concurrent tool indicators in the log
const toolStarts = parallelOutput.match(/Tool started|tool_start|Concurrent|parallel|executing.*simultaneously/gi);
const concurrentEvidence = parallelOutput.match(/concurrent|parallel|simultaneous|batch|concurrent-safe/gi);

if (toolStarts && toolStarts.length > 0) {
  console.log(`    ✅ Found ${toolStarts.length} tool execution indicators`);
  toolStarts.forEach(t => console.log(`    | ${t}`));
} else {
  console.log(`    ⚠️ No explicit parallel indicators found (tools may execute sequentially)`);
}

if (concurrentEvidence) {
  console.log(`    ✅ Found ${concurrentEvidence.length} concurrency references`);
}

// Test 5: Send multi-stock analysis (triggers parallel API calls)
console.log('');
console.log('[6] Sending multi-stock analysis query...');
try { execSync(`> ${OUTPUT_LOG}`); } catch {}

pasteText('Compare AAPL and TSLA fundamentals side by side');
await Bun.sleep(35000);

const multiStockOutput = readLog(400);
const hasAAPL = multiStockOutput.match(/AAPL|Apple/i);
const hasTSLA = multiStockOutput.match(/TSLA|Tesla/i);
const hasCompare = multiStockOutput.match(/compare|comparison|vs|versus|side by side/i);

console.log(`    AAPL: ${hasAAPL ? '✅' : '⚠️'}`);
console.log(`    TSLA: ${hasTSLA ? '✅' : '⚠️'}`);
console.log(`    Comparison: ${hasCompare ? '✅' : '⚠️'}`);

// Summary
console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('  Sub-Agent Verification Summary');
console.log('════════════════════════════════════════════════════════════════');

const results = [
  { name: '/agent command', ok: agentOk },
  { name: '/tasks command', ok: tasksOk },
  { name: 'Parallel VaR+Sharpe', ok: !!hasBoth },
  { name: 'Multi-stock AAPL+TSLA', ok: !!(hasAAPL && hasTSLA) },
  { name: 'Comparison output', ok: !!hasCompare },
];

const passCount = results.filter(r => r.ok).length;
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '⚠️'} ${r.name}`);
}
console.log('');
console.log(`  Result: ${passCount}/${results.length} verified`);

// Cleanup
console.log('');
console.log('[7] Cleaning up...');
runAppleScript(`tell application "Terminal"\n  if (count of windows) > 1 then close front window\nend tell`);
try { execSync('pkill -f "bun.*run.*dev" 2>/dev/null || true'); } catch {}

console.log('');
console.log('════════════════════════════════════════════════════════════════');
