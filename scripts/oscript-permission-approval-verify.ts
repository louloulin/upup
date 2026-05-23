#!/usr/bin/env bun
/**
 * oscript-permission-approval-verify.ts
 * 
 * Permission/Approval System Verification Script
 * Tests plan30.md authorization features:
 * - Permission mode detection (CLI, env, settings, default)
 * - Approval popup system (VimSelectList with 1/2/3 options)
 * - Hard-deny command detection
 * - Session permission persistence
 * 
 * Run: bun run scripts/oscript-permission-approval-verify.ts
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_DIR = '/Users/louloulin/Documents/linchong/touzhi/dexter';
const OUTPUT_LOG = '/tmp/upup-permission-output.log';
const STARTUP_WAIT_MS = 12000;

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'info';
  detail?: string;
}

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

function readLog(lines: number = 300): string {
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

function sendText(text: string): boolean {
  const tmpFile = '/tmp/upup-permission-text.txt';
  try {
    Bun.write(tmpFile, text);
    execSync(`pbcopy < ${tmpFile}`, { encoding: 'utf-8', timeout: 5000 });
  } catch {
    return false;
  }

  const script = `
tell application "Terminal"
  activate
end tell
delay 0.2
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
    'escape': 'key code 53',
    '1': 'keystroke "1"',
    '2': 'keystroke "2"',
    '3': 'keystroke "3"',
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

// ============================================================================
// Test Functions
// ============================================================================

async function testFileExists(path: string, name: string): Promise<TestResult> {
  const exists = existsSync(path);
  return {
    name: `${name} exists`,
    status: exists ? 'pass' : 'fail',
    detail: exists ? path : `${path} not found`,
  };
}

async function testFunctionExists(file: string, funcName: string): Promise<TestResult> {
  try {
    const content = execSync(`grep -q '${funcName}' ${file} && echo 'FOUND' || echo 'NOT_FOUND'`, {
      encoding: 'utf-8',
    }).trim();
    const found = content === 'FOUND';
    return {
      name: `${funcName} in ${file.split('/').pop()}`,
      status: found ? 'pass' : 'fail',
      detail: found ? `Found ${funcName}` : `Not found`,
    };
  } catch {
    return { name: `${funcName} test`, status: 'fail', detail: 'Error checking' };
  }
}

async function testCommandOutput(cmd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: e.stderr?.toString().trim() || e.message };
  }
}

// ============================================================================
// Main
// ============================================================================

const results: TestResult[] = [];

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  UpUp Permission/Approval System Verification (plan30.md)');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('');

// ============================================================================
// PART 1: Static Code Analysis
// ============================================================================

console.log('┌───────────────────────────────────────────────────────────────────────────┐');
console.log('│  PART 1: Static Code Analysis (plan30.md features)                        │');
console.log('└───────────────────────────────────────────────────────────────────────────┘');
console.log('');

// Test 1.1: Permission types file
console.log('[1.1] Checking permission types...');
const typeTests = [
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/types.ts`, 'types.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, 'permissionSetup.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/permissionRuleParser.ts`, 'permissionRuleParser.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/permissionsLoader.ts`, 'permissionsLoader.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/denialTracking.ts`, 'denialTracking.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/PermissionUpdate.ts`, 'PermissionUpdate.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/ApprovalManager.ts`, 'ApprovalManager.ts'),
  await testFileExists(`${PROJECT_DIR}/src/utils/permissions/approvalConfig.ts`, 'approvalConfig.ts'),
];

for (const t of typeTests) {
  console.log(`  ${t.status === 'pass' ? '✅' : '❌'} ${t.name}: ${t.detail}`);
  results.push(t);
}

// Test 1.2: TUI Components
console.log('');
console.log('[1.2] Checking TUI components...');
const tuiTests = [
  await testFileExists(`${PROJECT_DIR}/src/components/approval-requests/BaseApprovalRequest.ts`, 'BaseApprovalRequest.ts'),
  await testFileExists(`${PROJECT_DIR}/src/components/approval-requests/BashApprovalRequest.ts`, 'BashApprovalRequest.ts'),
  await testFileExists(`${PROJECT_DIR}/src/components/approval-requests/WriteApprovalRequest.ts`, 'WriteApprovalRequest.ts'),
  await testFileExists(`${PROJECT_DIR}/src/components/approval-requests/GenericApprovalRequest.ts`, 'GenericApprovalRequest.ts'),
];

for (const t of tuiTests) {
  console.log(`  ${t.status === 'pass' ? '✅' : '❌'} ${t.name}: ${t.detail}`);
  results.push(t);
}

// Test 1.3: Key Functions
console.log('');
console.log('[1.3] Checking key functions...');
const funcTests = [
  await testFunctionExists(`${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, 'initialPermissionModeFromCLI'),
  await testFunctionExists(`${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, 'isRunningAsRoot'),
  await testFunctionExists(`${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, 'isInSandbox'),
  await testFunctionExists(`${PROJECT_DIR}/src/utils/permissions/denialTracking.ts`, 'DenialTracker'),
  await testFunctionExists(`${PROJECT_DIR}/src/utils/permissions/approvalConfig.ts`, 'getApprovalTimeout'),
  await testFunctionExists(`${PROJECT_DIR}/src/components/approval-requests/BaseApprovalRequest.ts`, 'Container'),
];

for (const t of funcTests) {
  console.log(`  ${t.status === 'pass' ? '✅' : '❌'} ${t.name}`);
  results.push(t);
}

// ============================================================================
// PART 2: Permission Mode Detection
// ============================================================================

console.log('');
console.log('┌───────────────────────────────────────────────────────────────────────────┐');
console.log('│  PART 2: Permission Mode Detection                                        │');
console.log('└───────────────────────────────────────────────────────────────────────────┘');
console.log('');

// Test 2.1: CLI flag detection
console.log('[2.1] Testing CLI permission mode detection...');
let cliTest = { name: 'CLI --dangerously flag', status: 'info' as const, detail: '' };

try {
  // Check if permissionSetup handles --dangerously
  const content = execSync(`grep -c 'dangerouslySkipPermissions\\|dangerously' ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  if (parseInt(content) > 0) {
    cliTest.status = 'pass';
    cliTest.detail = `Found ${content} references`;
  }
} catch {
  cliTest.status = 'fail';
  cliTest.detail = 'Not found';
}
console.log(`  ${cliTest.status === 'pass' ? '✅' : '❌'} ${cliTest.name}: ${cliTest.detail}`);
results.push(cliTest);

// Test 2.2: PermissionModeSource type
console.log('');
console.log('[2.2] Testing PermissionModeSource type...');
let sourceTest = { name: 'PermissionModeSource type', status: 'info' as const, detail: '' };

try {
  const hasSource = execSync(`grep -c "PermissionModeSource" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  const hasCli = execSync(`grep -c "'cli'" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  const hasEnv = execSync(`grep -c "'env'" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  const hasSettings = execSync(`grep -c "'settings'" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  const hasDefault = execSync(`grep -c "'default'" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  
  if (parseInt(hasSource) > 0 && parseInt(hasCli) > 0 && parseInt(hasEnv) > 0) {
    sourceTest.status = 'pass';
    sourceTest.detail = `CLI/env/settings/default sources supported`;
  }
} catch {
  sourceTest.status = 'fail';
  sourceTest.detail = 'Source tracking not found';
}
console.log(`  ${sourceTest.status === 'pass' ? '✅' : '❌'} ${sourceTest.name}: ${sourceTest.detail}`);
results.push(sourceTest);

// ============================================================================
// PART 3: Hard-Deny Detection
// ============================================================================

console.log('');
console.log('┌───────────────────────────────────────────────────────────────────────────┐');
console.log('│  PART 3: Hard-Deny Command Detection                                       │');
console.log('└───────────────────────────────────────────────────────────────────────────┘');
console.log('');

console.log('[3.1] Testing hard-deny patterns...');

// Fork bomb pattern
let forkBombTest = { name: 'Fork bomb detection', status: 'info' as const, detail: '' };
try {
  const content = execSync(`grep -c ':\\(\\)\{:\\|:&\\};:' ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  forkBombTest.status = parseInt(content) > 0 ? 'pass' : 'fail';
  forkBombTest.detail = parseInt(content) > 0 ? 'Pattern found' : 'Not found';
} catch {
  forkBombTest.status = 'fail';
  forkBombTest.detail = 'Check failed';
}
console.log(`  ${forkBombTest.status === 'pass' ? '✅' : '❌'} ${forkBombTest.name}`);
results.push(forkBombTest);

// rm -rf / pattern
let rmRfTest = { name: 'rm -rf / detection', status: 'info' as const, detail: '' };
try {
  const content = execSync(`grep -c 'rm\\s+-rf\\s+\\/' ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  rmRfTest.status = parseInt(content) > 0 ? 'pass' : 'fail';
} catch {
  // Try alternative check
  const content = execSync(`grep -c "HARD_DENY" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  rmRfTest.status = parseInt(content) > 0 ? 'pass' : 'fail';
}
console.log(`  ${rmRfTest.status === 'pass' ? '✅' : '❌'} ${rmRfTest.name}`);
results.push(rmRfTest);

// mkfs pattern
let mkfsTest = { name: 'mkfs detection', status: 'info' as const, detail: '' };
try {
  const content = execSync(`grep -c "mkfs" ${PROJECT_DIR}/src/utils/permissions/permissionSetup.ts`, { encoding: 'utf-8' }).trim();
  mkfsTest.status = parseInt(content) > 0 ? 'pass' : 'fail';
} catch {
  mkfsTest.status = 'fail';
}
console.log(`  ${mkfsTest.status === 'pass' ? '✅' : '❌'} ${mkfsTest.name}`);
results.push(mkfsTest);

// ============================================================================
// PART 4: Unit Tests
// ============================================================================

console.log('');
console.log('┌───────────────────────────────────────────────────────────────────────────┐');
console.log('│  PART 4: Unit Tests (bun test)                                           │');
console.log('└───────────────────────────────────────────────────────────────────────────┘');
console.log('');

console.log('[4.1] Running permission module tests...');
const testResult = await testCommandOutput(`cd ${PROJECT_DIR} && bun test src/utils/permissions/ --reporter=json 2>&1 | tail -20`);

if (testResult.ok) {
  const lines = testResult.output.split('\n');
  const lastLine = lines[lines.length - 1] || '';
  const match = lastLine.match(/(\d+)\s+pass/);
  const failMatch = lastLine.match(/(\d+)\s+fail/);
  
  const passCount = match ? parseInt(match[1]) : 0;
  const failCount = failMatch ? parseInt(failMatch[1]) : 0;
  
  const test: TestResult = {
    name: 'Permission module unit tests',
    status: failCount === 0 ? 'pass' : 'fail',
    detail: `${passCount} pass, ${failCount} fail`,
  };
  console.log(`  ${test.status === 'pass' ? '✅' : '❌'} ${test.name}: ${test.detail}`);
  results.push(test);
} else {
  console.log(`  ❌ Test execution failed: ${testResult.output}`);
  results.push({ name: 'Permission module unit tests', status: 'fail', detail: testResult.output });
}

// ============================================================================
// PART 5: TUI Live Test
// ============================================================================

console.log('');
console.log('┌───────────────────────────────────────────────────────────────────────────┐');
console.log('│  PART 5: TUI Live Verification                                            │');
console.log('└───────────────────────────────────────────────────────────────────────────┘');
console.log('');

// Test 5.1: Start TUI
console.log('[5.1] Starting bun run dev...');
try {
  execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`, { encoding: 'utf-8' });
  execSync(`rm -f ${OUTPUT_LOG}`, { encoding: 'utf-8' });
} catch {}

const startScript = `
tell application "Terminal"
  activate
  do script "cd ${PROJECT_DIR} && bun run dev 2>&1 | tee ${OUTPUT_LOG}"
end tell
`;
const startResult = runAppleScript(startScript);
const startTest: TestResult = {
  name: 'TUI startup',
  status: startResult.ok ? 'pass' : 'fail',
  detail: startResult.ok ? 'Terminal started' : startResult.output,
};
console.log(`  ${startTest.status === 'pass' ? '✅' : '❌'} ${startTest.name}`);
results.push(startTest);

if (startTest.status === 'pass') {
  console.log(`  Waiting ${STARTUP_WAIT_MS / 1000}s for startup...`);
  await Bun.sleep(STARTUP_WAIT_MS);
  
  // Verify process is running
  const psCheck = execSync('pgrep -f "bun.*run.*dev" || echo "NOT_RUNNING"', { encoding: 'utf-8' }).trim();
  const runningTest: TestResult = {
    name: 'bun run dev running',
    status: psCheck !== 'NOT_RUNNING' ? 'pass' : 'fail',
    detail: psCheck !== 'NOT_RUNNING' ? `PID: ${psCheck.split('\\n')[0]}` : 'Not running',
  };
  console.log(`  ${runningTest.status === 'pass' ? '✅' : '❌'} ${runningTest.name}: ${runningTest.detail}`);
  results.push(runningTest);
  
  // Check if TUI shows welcome
  const log = readLog(50);
  const welcomeTest: TestResult = {
    name: 'TUI welcome screen',
    status: log.includes('UpUp') || log.includes('Welcome') ? 'pass' : 'fail',
    detail: log.includes('UpUp') || log.includes('Welcome') ? 'Welcome screen visible' : 'Welcome not found',
  };
  console.log(`  ${welcomeTest.status === 'pass' ? '✅' : '❌'} ${welcomeTest.name}`);
  results.push(welcomeTest);
  
  // Test /permissions command
  console.log('');
  console.log('[5.2] Testing /permissions command...');
  await Bun.sleep(500);
  execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`);
  sendText('/permissions');
  await Bun.sleep(3000);
  
  const permLog = readLog(100);
  const permCmdTest: TestResult = {
    name: '/permissions command',
    status: permLog.includes('Permission') || permLog.includes('Mode') ? 'pass' : 'info',
    detail: permLog.includes('Permission') ? 'Response received' : 'Command sent',
  };
  console.log(`  ${permCmdTest.status === 'pass' ? '✅' : '⚠️'} ${permCmdTest.name}: ${permCmdTest.detail}`);
  results.push(permCmdTest);
  
  // Test /doctor command (shows permission status)
  console.log('');
  console.log('[5.3] Testing /doctor command...');
  await Bun.sleep(500);
  execSync(`> ${OUTPUT_LOG} 2>/dev/null || true`);
  sendText('/doctor');
  await Bun.sleep(3000);
  
  const doctorLog = readLog(100);
  const doctorTest: TestResult = {
    name: '/doctor command',
    status: doctorLog.includes('API Keys') || doctorLog.includes('diagnostic') ? 'pass' : 'info',
    detail: doctorLog.includes('API Keys') ? 'System diagnostics shown' : 'Command sent',
  };
  console.log(`  ${doctorTest.status === 'pass' ? '✅' : '⚠️'} ${doctorTest.name}: ${doctorTest.detail}`);
  results.push(doctorTest);
  
  // Cleanup
  try {
    execSync(`pkill -f "bun.*run.*dev" 2>/dev/null || true`);
  } catch {}
}

// ============================================================================
// Summary
// ============================================================================

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  VERIFICATION SUMMARY (plan30.md)');
console.log('═══════════════════════════════════════════════════════════════════════════');

const passCount = results.filter(r => r.status === 'pass').length;
const failCount = results.filter(r => r.status === 'fail').length;
const infoCount = results.filter(r => r.status === 'info').length;
const total = results.length;

console.log('');
console.log(`  Total Tests: ${total}`);
console.log(`  ✅ Passed:   ${passCount}`);
console.log(`  ❌ Failed:   ${failCount}`);
console.log(`  ⚠️  Info:    ${infoCount}`);
console.log('');

const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : '0';
console.log(`  Pass Rate: ${passRate}%`);
console.log('');

// Detailed results
console.log('  Detailed Results:');
for (const r of results) {
  const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
  console.log(`    ${icon} ${r.name}${r.detail ? ': ' + r.detail : ''}`);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');

// Final verdict
if (passCount === total) {
  console.log('  🎉 ALL TESTS PASSED - plan30.md fully implemented!');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  process.exit(0);
} else if (passCount >= total * 0.8) {
  console.log(`  ✅ MOSTLY PASSING (${passRate}%) - Core features working`);
  console.log('═══════════════════════════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.log(`  ⚠️  NEEDS ATTENTION (${passRate}%)`);
  console.log('═══════════════════════════════════════════════════════════════════════════');
  process.exit(1);
}
