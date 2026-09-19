#!/usr/bin/env bun
/**
 * oscript-byd-research-test.ts - 比亚迪股票研究验证测试
 *
 * 测试场景：
 * 1. /research 命令分析比亚迪
 * 2. 中文自然语言触发 research 技能
 * 3. 股票代码检测 (002594.SZ)
 * 4. 多市场股票分析 (特斯拉、贵州茅台)
 *
 * Run: bun run scripts/oscript-byd-research-test.ts
 */

import { initializeSkills, getSkillCommand, getAllSkillCommands } from '../src/skills/commands';
import { executeSkillCommand } from '../src/skills/executor';
import { detectIntents, extractTickers } from '../src/skills/intent-detector';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_CASES = [
  // 比亚迪测试
  { query: '分析比亚迪股票 002594.SZ', expected: 'research', description: '比亚迪 + 股票代码' },
  { query: '帮我分析比亚迪', expected: 'research', description: '比亚迪中文' },
  { query: '/research 比亚迪', expected: 'research', description: 'slash命令 + 比亚迪' },
  { query: '/research 002594.SZ', expected: 'research', description: 'slash命令 + 代码' },

  // 其他股票测试
  { query: '分析特斯拉 TSLA', expected: 'research', description: '特斯拉' },
  { query: '帮我看看贵州茅台 600519', expected: 'research', description: '茅台' },
  { query: '分析苹果 AAPL', expected: 'research', description: '苹果' },

  // 投资分析测试
  { query: '帮我做投资研究', expected: 'research', description: '投资研究' },
  { query: '行业分析', expected: 'research', description: '行业分析' },
];

// ============================================================================
// Test Functions
// ============================================================================

interface TestCase {
  query: string;
  expected: string;
  description: string;
}

interface TestResult {
  query: string;
  description: string;
  detected: string[];
  tickers: string[];
  intents: string;
  skillMatched: boolean;
  status: 'pass' | 'fail';
  details?: string;
}

const results: TestResult[] = [];

// ============================================================================
// Main Test
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  比亚迪股票研究测试 (Research Skill Verification)                 ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
console.log('');

// Initialize
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  0. 初始化');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

await initializeSkills();

// Get all skill commands
const allCommands = getAllSkillCommands();
console.log(`  ✅ 总技能命令数: ${allCommands.length}`);

// Check if research skill exists
const researchCmd = getSkillCommand('research');
if (researchCmd) {
  console.log(`  ✅ Research 技能已注册`);
  console.log(`     - 名称: ${researchCmd.name}`);
  console.log(`     - 描述: ${researchCmd.description}`);
} else {
  console.log(`  ❌ Research 技能未找到!`);
}

// Test skill commands
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  1. 股票代码检测');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const tickerQueries = [
  '002594.SZ',
  '600519.SH',
  'TSLA',
  'AAPL',
  '比亚迪 002594',
];

for (const query of tickerQueries) {
  const tickers = extractTickers(query);
  if (tickers.length > 0) {
    const tickerStr = tickers.map(t => `${t.normalized}(${t.market})`).join(', ');
    console.log(`  ✅ "${query}" -> 检测到: ${tickerStr}`);
  } else {
    console.log(`  ⚠️  "${query}" -> 未检测到股票代码`);
  }
}

// Test intent detection
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  2. 意图检测');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const intentQueries = [
  '分析比亚迪股票',
  '帮我分析贵州茅台',
  '特斯拉投资分析',
  '帮我做投资研究',
];

for (const query of intentQueries) {
  const intents = detectIntents(query);
  const intentTypes = intents.map(i => i.type).join(', ') || 'none';
  const confidence = intents.length > 0 ? Math.max(...intents.map(i => i.confidence)).toFixed(2) : '0';
  console.log(`  ${intents.length > 0 ? '✅' : '⚠️'} "${query}"`);
  console.log(`     意图: ${intentTypes}, 置信度: ${confidence}`);
}

// Run test cases
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  3. 研究技能匹配测试');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

for (const { query, expected, description } of TEST_CASES) {
  // Test 1: 意图检测
  const intents = detectIntents(query);
  const detectedTypes = intents.map(i => i.type);

  // Test 2: 股票代码检测
  const tickers = extractTickers(query);

  // Test 3: Skill 命令匹配
  const hasResearchIntent = detectedTypes.includes('research') || detectedTypes.includes('ticker');
  const skillMatched = hasResearchIntent && researchCmd !== undefined;

  const result: TestResult = {
    query,
    description,
    detected: detectedTypes,
    tickers: tickers.map(t => t.normalized),
    intents: detectedTypes.join(', ') || 'none',
    skillMatched,
    status: skillMatched ? 'pass' : 'fail',
    details: tickers.length > 0 ? `股票代码: ${tickers.map(t => t.normalized).join(', ')}` : undefined,
  };

  results.push(result);

  const icon = result.status === 'pass' ? '✅' : '❌';
  console.log(`  ${icon} [${description}] "${query}"`);
  console.log(`     检测意图: ${result.intents}`);
  if (result.tickers.length > 0) {
    console.log(`     股票代码: ${result.tickers.join(', ')}`);
  }
}

// Execute research skill
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  4. 执行 Research 技能 (比亚迪)');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const researchQueries = [
  '比亚迪',
  '002594.SZ',
  '特斯拉',
];

for (const query of researchQueries) {
  try {
    const result = await executeSkillCommand('research', query, {
      cwd: process.cwd(),
      env: process.env,
    });

    if (result?.type === 'query' && result.text) {
      console.log(`  ✅ /research ${query}`);
      console.log(`     生成提示 ${result.text.length} 字符`);
      // Show first 200 chars
      const preview = result.text.substring(0, 200).replace(/\n/g, ' ');
      console.log(`     预览: ${preview}...`);
    } else {
      console.log(`  ⚠️  /research ${query} - 无查询生成`);
    }
  } catch (err: any) {
    console.log(`  ❌ /research ${query}: ${err.message}`);
  }
}

// Summary
console.log('');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('  测试总结');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;

console.log(`  总测试用例:  ${results.length}`);
console.log(`  ✅ 通过:     ${passed}`);
console.log(`  ❌ 失败:     ${failed}`);
console.log('');

const passRate = results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : 0;
console.log(`  通过率: ${passRate}%`);
console.log('');

// Exit with code
if (failed > 0) {
  console.log('  ❌ 部分测试失败');
  process.exit(1);
} else {
  console.log('  ✅ 所有测试通过!');
}
