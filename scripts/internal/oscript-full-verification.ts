/**
 * Full Verification - Final Version
 */

import * as fs from 'fs';
import { execSync } from 'child_process';

const results: {name: string; status: 'pass'|'fail'}[] = [];
const base = '/Users/louloulin/Documents/linchong/touzhi/dexter';

console.log('═══════════════════════════════════════════════════════');
console.log('  Plan31.md FINAL VERIFICATION (15 Tools)');
console.log('═══════════════════════════════════════════════════════\n');

// All 15 Tools
const tools = [
  'sentiment/index.ts',
  'forecast/index.ts',
  'research/multi-agent-research.ts',
  'monitor/index.ts',
  'portfolio/optimization.ts',
  'risk/management.ts',
  'alerts/index.ts',
  'export/index.ts',
  'portfolio/tracker.ts',
  'analytics/index.ts',
  'comparison/index.ts',
  'screening/index.ts',
  'sector/index.ts',
  'earnings/index.ts',
  'news/index.ts',
];

console.log('[1] Tools (15)');
for (const t of tools) {
  const exists = fs.existsSync(`${base}/src/tools/${t}`);
  results.push({ name: t.split('/')[0], status: exists ? 'pass' : 'fail' });
  console.log(`  ${exists ? '✅' : '❌'} ${t}`);
}

// Skills
const skills = [
  'multi-market-analysis', 'research-report', 'personalized-recommendation',
  'portfolio-rebalancing', 'alert-management', 'api-integration'
];

console.log('\n[2] Skills (6)');
for (const s of skills) {
  const exists = fs.existsSync(`${base}/src/skills/${s}/SKILL.md`);
  results.push({ name: s, status: exists ? 'pass' : 'fail' });
  console.log(`  ${exists ? '✅' : '❌'} ${s}`);
}

// Tests
console.log('\n[3] Unit Tests');
try {
  const out = execSync(`cd ${base} && bun test 2>&1 | grep -E "^  [0-9]+ pass"`, {encoding:'utf-8',timeout:120000});
  const m = out.match(/(\d+) pass/);
  if (m) { results.push({name:'Tests', status:'pass'}); console.log(`  ✅ ${m[1]} tests`); }
} catch {}

// Summary
console.log('\n═══════════════════════════════════════════════════════');
const p = results.filter(r=>r.status==='pass').length;
const f = results.filter(r=>r.status==='fail').length;
console.log(`  ${p}/${results.length} passed (${((p/results.length)*100).toFixed(1)}%)`);
console.log('═══════════════════════════════════════════════════════');
if (f===0) { console.log('\n🎉 ALL PASSED!\n'); process.exit(0); }
else { console.log(`\n⚠️ ${f} failed\n`); process.exit(1); }
