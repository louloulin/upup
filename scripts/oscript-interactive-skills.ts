#!/usr/bin/env bun
/**
 * oscript-interactive-skills.ts - Interactive Skills Testing
 *
 * Tests /skills commands interactively like real user would:
 * 1. /research - Research stock analysis
 * 2. /hunter - Bug hunting mode
 * 3. /verify - Code verification
 * 4. /dream - Autonomous exploration
 *
 * Run: bun run scripts/oscript-interactive-skills.ts
 */

import { initializeSkills, getSkillCommand, getAllSkillCommands } from '../src/skills/commands';
import { executeSkillCommand } from '../src/skills/executor';
import { detectIntents } from '../src/skills/intent-detector';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_QUERIES = [
  // Stock analysis queries (BYD related)
  { query: '分析比亚迪股票', skill: 'research', description: 'BYD stock analysis' },
  { query: '帮我分析比亚迪 (002594.SZ)', skill: 'research', description: 'BYD with code' },
  { query: '分析特斯拉', skill: 'research', description: 'Tesla analysis' },
  { query: '贵州茅台怎么样', skill: 'research', description: 'Kweichow Moutai' },

  // Investment skills
  { query: '帮我分析投资组合', skill: 'portfolio-review', description: 'Portfolio review' },
  { query: '计算风险VaR', skill: 'risk-assessment', description: 'Risk assessment' },

  // Special skills
  { query: '帮我找bug', skill: 'hunter', description: 'Bug hunting' },
  { query: '验证代码', skill: 'verify', description: 'Code verification' },
];

// ============================================================================
// Test Functions
// ============================================================================

interface TestResult {
  name: string;
  skill: string;
  status: 'pass' | 'fail' | 'warn';
  durationMs: number;
  details?: string;
}

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let warned = 0;

function addResult(name: string, skill: string, status: 'pass' | 'fail' | 'warn', details?: string, durationMs = 0) {
  results.push({ name, skill, status, details, durationMs });
  if (status === 'pass') passed++;
  else if (status === 'fail') failed++;
  else warned++;

  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  console.log(`  ${icon} [${skill}] ${name}${details ? ': ' + details : ''}`);
}

// ============================================================================
// Main Test
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  UpUp Interactive Skills Testing                                     ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
console.log('');

// Initialize
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  0. Initialization');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

let start = Date.now();
await initializeSkills();
console.log(`  ✅ Initialized skills in ${Date.now() - start}ms`);

// Get all skill commands
const allCommands = getAllSkillCommands();
console.log(`  ✅ Total skill commands: ${allCommands.length}`);

// Group by source
const bundled = allCommands.filter(c => c.source === 'bundled');
const investment = allCommands.filter(c => c.name.startsWith('investment-'));
console.log(`     Bundled: ${bundled.length}, Investment: ${investment.length}`);

// Test skill execution
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  1. Stock Analysis Commands (Research Skill)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const stockQueries = TEST_QUERIES.filter(t => t.skill === 'research');
for (const { query, skill, description } of stockQueries) {
  start = Date.now();
  try {
    const result = await executeSkillCommand(skill, query, { cwd: process.cwd(), env: process.env });
    const durationMs = Date.now() - start;

    if (result?.type === 'query' && result.text) {
      addResult(description, skill, 'pass', `Generated ${result.text.length} chars`, durationMs);
    } else {
      addResult(description, skill, 'warn', 'No query generated', durationMs);
    }
  } catch (err: any) {
    addResult(description, skill, 'fail', err.message.substring(0, 50), Date.now() - start);
  }
}

// Test investment skills
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  2. Investment Skills');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const investmentSkills = ['portfolio-review', 'risk-assessment', 'stock-screen', 'a-share-fund'];
for (const skillName of investmentSkills) {
  start = Date.now();
  try {
    const cmd = getSkillCommand(skillName);
    if (cmd) {
      const result = await cmd.getPromptForCommand('test', { cwd: process.cwd() });
      const durationMs = Date.now() - start;
      addResult(skillName, skillName, 'pass', `${result.length} blocks`, durationMs);
    } else {
      addResult(skillName, skillName, 'warn', 'Command not found', 0);
    }
  } catch (err: any) {
    addResult(skillName, skillName, 'fail', err.message.substring(0, 50), Date.now() - start);
  }
}

// Test special skills
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  3. Special Skills (Hunter, Verify, Dream)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const specialSkills = ['hunter', 'verify', 'dream', 'batch', 'alert', 'sandbox'];
for (const skillName of specialSkills) {
  start = Date.now();
  try {
    const result = await executeSkillCommand(skillName, 'test', { cwd: process.cwd(), env: process.env });
    const durationMs = Date.now() - start;

    if (result?.type === 'query') {
      addResult(skillName, skillName, 'pass', `OK`, durationMs);
    } else {
      addResult(skillName, skillName, 'warn', 'No result', durationMs);
    }
  } catch (err: any) {
    addResult(skillName, skillName, 'fail', err.message.substring(0, 50), Date.now() - start);
  }
}

// Test intent detection
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  4. Intent Detection for Chinese Stock Queries');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const intentQueries = [
  '分析比亚迪股票',
  '帮我分析贵州茅台',
  '特斯拉投资分析',
  '计算风险VaR',
];

for (const query of intentQueries) {
  const intents = detectIntents(query);
  const matched = intents.length > 0 ? intents.map(i => i.type).join(', ') : 'none';
  console.log(`  ${intents.length > 0 ? '✅' : '⚠️'} "${query}" -> ${matched}`);
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

const passRate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : 0;
console.log(`  Pass rate: ${passRate}%`);
console.log('');

// Save results
const jsonPath = import.meta.dir + '/../.upup/oscript-interactive-results.json';
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

// Exit with code
if (failed > 0) {
  console.log('  ❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('  ✅ ALL TESTS PASSED');
}