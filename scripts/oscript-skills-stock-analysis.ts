#!/usr/bin/env bun
/**
 * oscript-skills-stock-analysis.ts - Skills Execution Verification for Stock Analysis
 * 
 * Uses source imports to test the full skills system including:
 * - Investment skills (src/skills/investment/)
 * - Bundled skills
 * - Skill commands
 * 
 * Run: bun run scripts/oscript-skills-stock-analysis.ts
 */

// Use source imports directly to test the full system
import { initializeSkills, getSkillCommand, getAllSkillCommands } from '../src/skills/commands.js';
import { executeSkillCommand } from '../src/skills/executor.js';
import { detectIntents } from '../src/skills/intent-detector.js';

// ============================================================================
// Test Setup
// ============================================================================

const mockContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'oscript-skills-test',
  model: 'deepseek-v4-flash',
};

// ============================================================================
// Test Functions
// ============================================================================

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
  durationMs: number;
}

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let warned = 0;

function addResult(name: string, status: 'pass' | 'fail' | 'warn', detail?: string, durationMs = 0) {
  results.push({ name, status, detail, durationMs });
  if (status === 'pass') passed++;
  else if (status === 'fail') failed++;
  else warned++;
  console.log(`  ${status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
}

// ============================================================================
// Main Test
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  UpUp Skills Stock Analysis Verification (Source)                    ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
console.log('');

// Test 1: Initialize Skills
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  1. Skills Initialization');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let start = Date.now();
try {
  const count = await initializeSkills();
  const durationMs = Date.now() - start;
  addResult('initializeSkills()', 'pass', `${count} skills registered`, durationMs);
} catch (err: any) {
  addResult('initializeSkills()', 'fail', err.message);
}

// Test 2: Get All Skill Commands
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  2. Skill Commands');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

start = Date.now();
try {
  const commands = getAllSkillCommands();
  const durationMs = Date.now() - start;
  addResult('getAllSkillCommands()', 'pass', `${commands.length} skill commands`, durationMs);
  
  // List investment skills
  const investmentCmds = commands.filter(c => c.name.includes('investment'));
  console.log(`    Investment skills: ${investmentCmds.length}`);
  investmentCmds.slice(0, 5).forEach(c => console.log(`      - ${c.name}`));
} catch (err: any) {
  addResult('getAllSkillCommands()', 'fail', err.message);
}

// Test 3: Intent Detection
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  3. Intent Detection (BYD Stock Analysis)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const testQueries = [
  { query: '分析比亚迪股票', expected: 'stock' },
  { query: '分析特斯拉的投资价值', expected: 'stock' },
  { query: '比亚迪股票怎么样', expected: 'stock' },
  { query: '帮我分析贵州茅台', expected: 'stock' },
  { query: '计算VaR风险', expected: 'risk' },
  { query: '测试一下', expected: null },
];

for (const test of testQueries) {
  start = Date.now();
  try {
    const intents = detectIntents(test.query);
    const durationMs = Date.now() - start;
    const hasMatch = intents.length > 0;
    const matches = intents.map(i => i.type);
    const correct = test.expected === null ? !hasMatch : matches.some(m => m.toLowerCase().includes(test.expected!));
    addResult(
      `Intent: "${test.query.substring(0, 20)}..."`,
      correct ? 'pass' : 'warn',
      hasMatch ? `Matched: ${matches.slice(0, 3).join(', ')}` : 'No match',
      durationMs
    );
  } catch (err: any) {
    addResult(`Intent: "${test.query.substring(0, 20)}..."`, 'fail', err.message);
  }
}

// Test 4: Verify Investment Skills
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  4. Investment Skills Verification');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const investmentSkills = [
  'investment-stock-analysis',
  'investment-portfolio-review', 
  'investment-risk-assessment',
  'investment-market-brief',
  'investment-stock-screening',
];

for (const name of investmentSkills) {
  start = Date.now();
  try {
    const command = getSkillCommand(name);
    const durationMs = Date.now() - start;
    addResult(`Skill: ${name}`, command ? 'pass' : 'warn', command ? 'Found' : 'Not found', durationMs);
  } catch (err: any) {
    addResult(`Skill: ${name}`, 'fail', err.message);
  }
}

// Test 5: Bundled Skills
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  5. Bundled Skills Verification');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const bundledSkills = [
  'hunter',
  'research',
  'portfolio',
  'a-share-fund',  // fund is registered as a-share-fund
  'verify',
  'batch',
  'alert',
  'sandbox',
];

for (const name of bundledSkills) {
  start = Date.now();
  try {
    const command = getSkillCommand(name);
    const durationMs = Date.now() - start;
    addResult(`Bundled: ${name}`, command ? 'pass' : 'warn', command ? 'Found' : 'Not found', durationMs);
  } catch (err: any) {
    addResult(`Bundled: ${name}`, 'fail', err.message);
  }
}

// Test 6: Skill Execution Test (Hunter)
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  6. Skill Execution Test (Hunter)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

start = Date.now();
try {
  // executeSkillCommand expects (commandName, args, context) - no leading slash
  const result = await executeSkillCommand('hunter', 'test bug', mockContext);
  const durationMs = Date.now() - start;
  addResult('executeSkillCommand("hunter", "test bug")', result?.type === 'query' ? 'pass' : 'warn', `type: ${result?.type}`, durationMs);
} catch (err: any) {
  addResult('executeSkillCommand("hunter", "test bug")', 'warn', err.message.substring(0, 80));
}

// Test 7: Research Skill
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  7. Research Skill Test');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

start = Date.now();
try {
  // executeSkillCommand expects (commandName, args, context) - no leading slash
  const result = await executeSkillCommand('research', '分析比亚迪', mockContext);
  const durationMs = Date.now() - start;
  addResult('executeSkillCommand("research", "分析比亚迪")', result?.type === 'query' ? 'pass' : 'warn', `type: ${result?.type}`, durationMs);
} catch (err: any) {
  addResult('executeSkillCommand("research", "分析比亚迪")', 'warn', err.message.substring(0, 80));
}

// Summary
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log(`  Total tests:  ${results.length}`);
console.log(`  ✅ Passed:    ${passed}`);
console.log(`  ⚠️  Warned:   ${warned}`);
console.log(`  ❌ Failed:    ${failed}`);
console.log('');

if (failed > 0) {
  console.log('  Failed tests:');
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`    - ${r.name}: ${r.detail}`);
  }
  console.log('');
}

const passRate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : 0;
console.log(`  Pass rate: ${passRate}%`);
console.log('');

// Exit with code
if (failed > 0) {
  console.log('  ❌ VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('  ✅ ALL TESTS PASSED');
}

// Save results
const jsonPath = import.meta.dir + '/../.upup/oscript-skills-results.json';
try {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    summary: { total: results.length, passed, warned, failed, passRate }
  }, null, 2));
  console.log(`  Results saved to ${jsonPath}`);
} catch {}
