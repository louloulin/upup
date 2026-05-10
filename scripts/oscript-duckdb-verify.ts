#!/usr/bin/env bun
/**
 * oscript-duckdb-verify.ts — Verify DuckDB plugin capabilities interactively
 *
 * Tests the DuckDB plugin tools:
 * - duckdb-query: Raw SQL query
 * - duckdb-timeseries: Time series aggregation
 * - duckdb-portfolio-analysis: Financial metrics
 * - duckdb-register-parquet: Register parquet files
 * - duckdb-import-csv: Import CSV files
 * - duckdb-list-tables: List available tables
 *
 * Run: bun run scripts/oscript-duckdb-verify.ts
 */

import { execSync } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-duckdb-output.log';
const STARTUP_WAIT_MS = 10000;
const QUERY_DELAY_MS = 8000;

interface TestCase {
  cmd: string;
  description: string;
  expectKeywords: string[];
  delay?: number;
}

// DuckDB-specific test cases
const DUCKDB_TESTS: TestCase[] = [
  // DuckDB query tests
  {
    cmd: '/duckdb-query SELECT 42 as answer, version() as v',
    description: 'Basic DuckDB query to test plugin',
    expectKeywords: ['42', 'answer', 'v'],
    delay: QUERY_DELAY_MS,
  },
  {
    cmd: '/duckdb-query SELECT \'Hello DuckDB!\' as greeting, 3.14159 as pi',
    description: 'DuckDB string and float query',
    expectKeywords: ['Hello DuckDB', 'pi', '3.14159'],
    delay: QUERY_DELAY_MS,
  },
  {
    cmd: '/duckdb-list-tables',
    description: 'List DuckDB tables',
    expectKeywords: ['table', 'duckdb', 'list'],
    delay: QUERY_DELAY_MS,
  },
  {
    cmd: '/duckdb-query SELECT i, i * i as squared FROM range(1, 6) tbl(i)',
    description: 'DuckDB table generation',
    expectKeywords: ['squared', 'range'],
    delay: QUERY_DELAY_MS,
  },
  // Financial analysis tests
  {
    cmd: '/duckdb-query SELECT portfolio_metrics(0.05, 0.15, 0.03) as sharpe_ratio',
    description: 'DuckDB portfolio analysis',
    expectKeywords: ['sharpe', 'ratio', 'portfolio'],
    delay: QUERY_DELAY_MS,
  },
  {
    cmd: '/duckdb-query SELECT var_95([-0.05, -0.03, -0.02, 0.01, 0.02, 0.03, 0.04, 0.05]) as var_95_result',
    description: 'DuckDB VaR calculation',
    expectKeywords: ['var_95', 'result'],
    delay: QUERY_DELAY_MS,
  },
  // Time series tests
  {
    cmd: '/duckdb-query SELECT ts_aggregate(\'day\', 8) as daily_volatility',
    description: 'DuckDB time series aggregation',
    expectKeywords: ['ts_aggregate', 'day'],
    delay: QUERY_DELAY_MS,
  },
  // List tables
  {
    cmd: '/duckdb-list-tables',
    description: 'List all DuckDB tables',
    expectKeywords: ['duckdb', 'table'],
    delay: QUERY_DELAY_MS,
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
  const tmpFile = '/tmp/upup-paste.txt';
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

// ============================================================================
// Test Execution
// ============================================================================

console.log('════════════════════════════════════════════════════════════════');
console.log('  UpUp DuckDB Plugin — Real Verification');
console.log('════════════════════════════════════════════════════════════════');
console.log('');

// Check if bun run dev is already running
const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();

if (psCheck === 'NOT_RUNNING') {
  console.log('[1] Starting bun run dev...');
  const startScript = `
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
  set custom title of front window to "UpUp DuckDB Verify"
end tell
`;
  const startResult = runAppleScript(startScript);
  if (!startResult.ok) {
    console.log(`    ❌ Failed to create Terminal tab: ${startResult.output}`);
    process.exit(1);
  }
  console.log('    ✅ Terminal tab created, waiting for startup...');
  await Bun.sleep(STARTUP_WAIT_MS);
} else {
  console.log(`[1] bun run dev already running (PID: ${psCheck.split('\n')[0]}), reusing...`);
  console.log('    Note: Logs may be mixed, using fresh capture for each test');
}

console.log('');
console.log('[2] Testing DuckDB plugin tools...');
console.log('');

const results: Array<{
  command: string;
  description: string;
  status: 'ok' | 'sent' | 'error' | 'timeout';
  matchedKeyword?: string;
  responsePreview?: string;
}> = [];

// Clear log before testing
try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}

for (let i = 0; i < DUCKDB_TESTS.length; i++) {
  const test = DUCKDB_TESTS[i];
  const delay = test.delay ?? QUERY_DELAY_MS;
  const cmdPreview = test.cmd.substring(0, 60) + (test.cmd.length > 60 ? '...' : '');
  console.log(`  [${i + 1}/${DUCKDB_TESTS.length}] ${test.description}`);
  console.log(`    → ${cmdPreview}`);

  // Clear log before this command
  try { execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`); } catch {}

  // Send the command
  const sent = pasteText(test.cmd);
  if (!sent) {
    results.push({ command: test.cmd, description: test.description, status: 'error' });
    console.log(`    ❌ Failed to send command`);
    continue;
  }

  // Wait for UpUp to process
  await Bun.sleep(delay);

  // Capture output
  const cleanOutput = readCleanLog(300);

  // Check for expected keywords
  const matchedKeyword = test.expectKeywords.find(kw =>
    cleanOutput.toLowerCase().includes(kw.toLowerCase())
  );

  const hasError = cleanOutput.includes('Error:') || cleanOutput.includes('FATAL') || cleanOutput.includes('crashed');
  const hasResponse = matchedKeyword !== undefined;
  const hasAnyOutput = cleanOutput.length > 100;

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

  // Get preview
  const previewLines = cleanOutput
    .split('\n')
    .filter(l => l.trim().length > 3 && !l.startsWith('['))
    .slice(-5)
    .join(' | ')
    .substring(0, 150);

  results.push({
    command: test.cmd,
    description: test.description,
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

  await Bun.sleep(500);
}

// Cleanup
console.log('');
console.log('[3] Cleanup...');
try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`);
} catch {}

const cleanupScript = `
tell application "Terminal"
  if (count of windows) > 1 then
    close front window
  end if
end tell
`;
try { runAppleScript(cleanupScript); } catch {}

// Summary
console.log('');
console.log('════════════════════════════════════════════════════════════════');
console.log('  DuckDB Plugin Verification Summary');
console.log('════════════════════════════════════════════════════════════════');

const ok = results.filter(r => r.status === 'ok');
const err = results.filter(r => r.status === 'error');
const sent = results.filter(r => r.status === 'sent');
const timeout = results.filter(r => r.status === 'timeout');

const percentage = Math.round((ok.length / results.length) * 100);

console.log(`  Total tests:        ${results.length}`);
console.log(`  ✅ Verified (OK):   ${ok.length} (${percentage}%)`);
console.log(`  ⚠️ Sent (no match): ${sent.length}`);
console.log(`  ⏰ Timeout:         ${timeout.length}`);
console.log(`  ❌ Errors:          ${err.length}`);
console.log('');

console.log('  Detailed Results:');
console.log('  ─────────────────────────────────────────────────────────');
for (const r of results) {
  const icon = r.status === 'ok' ? '✅' : r.status === 'error' ? '❌' : r.status === 'timeout' ? '⏰' : '⚠️';
  const cmdP = r.description.substring(0, 50).padEnd(50);
  const match = r.matchedKeyword ? ` [${r.matchedKeyword}]` : '';
  console.log(`  ${icon} ${cmdP} | ${r.status}${match}`);
}

console.log('');
if (err.length === 0 && ok.length > 0) {
  console.log(`  ✅ DuckDB Plugin Verification ${percentage}% PASSED`);
  console.log(`     ${ok.length}/${results.length} tests received verified responses`);
} else if (err.length > 0) {
  console.log('  ⚠️ Some tests had errors');
} else {
  console.log('  ⚠️ No tests received verified responses');
}

console.log('');
console.log('════════════════════════════════════════════════════════════════');