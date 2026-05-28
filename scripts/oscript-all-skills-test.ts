#!/usr/bin/env bun
/**
 * oscript-all-skills-test.ts - 全量Skills验证测试
 *
 * 测试所有已注册的skills命令，确保都能正确执行
 *
 * Run: bun run scripts/oscript-all-skills-test.ts
 */

import { initializeSkills, getAllSkillCommands, getSkillCommand } from '../src/skills/commands.js';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_SKILLS = [
  // 核心研究技能
  'research',
  'risk-assessment',
  'stock-screen',
  'portfolio-review',

  // 特殊技能
  'hunter',
  'verify',
  'dream',
  'batch',
  'alert',
  'sandbox',
  'portfolio',

  // 投资技能
  'a-share-fund',
  'fund-analysis',
  'technical-analysis',
  'sentiment-analysis',
  'dcf-valuation',
  'macro-analysis',
  'portfolio-management',
];

// ============================================================================
// Types
// ============================================================================

interface SkillTestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  promptLength: number;
  error?: string;
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  全量Skills验证测试                                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  0. 初始化');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  await initializeSkills();

  const allCommands = getAllSkillCommands();
  console.log(`  ✅ 总共注册了 ${allCommands.length} 个技能命令`);

  // Group by source
  const bySource = new Map<string, number>();
  for (const cmd of allCommands) {
    const source = cmd.source || 'unknown';
    bySource.set(source, (bySource.get(source) || 0) + 1);
  }

  console.log('  按来源分组:');
  for (const [source, count] of bySource) {
    console.log(`    - ${source}: ${count}`);
  }

  // Test each skill
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  1. 技能执行测试');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const results: SkillTestResult[] = [];
  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const skillName of TEST_SKILLS) {
    const cmd = getSkillCommand(skillName);

    if (!cmd) {
      console.log(`  ❌ /${skillName} - 未注册`);
      results.push({ name: skillName, status: 'fail', promptLength: 0, error: 'Not registered' });
      failed++;
      continue;
    }

    try {
      const content = await cmd.getPromptForCommand('test', { cwd: process.cwd() });
      const text = content.map(c => c.text).join('');
      const length = text.length;

      if (length > 100) {
        console.log(`  ✅ /${skillName} - ${length} chars`);
        results.push({ name: skillName, status: 'pass', promptLength: length });
        passed++;
      } else if (length > 0) {
        console.log(`  ⚠️  /${skillName} - 太短: ${length} chars`);
        results.push({ name: skillName, status: 'warn', promptLength: length });
        warned++;
      } else {
        console.log(`  ❌ /${skillName} - 空内容`);
        results.push({ name: skillName, status: 'fail', promptLength: 0, error: 'Empty content' });
        failed++;
      }
    } catch (err: any) {
      console.log(`  ❌ /${skillName} - ${err.message.substring(0, 50)}`);
      results.push({ name: skillName, status: 'fail', promptLength: 0, error: err.message });
      failed++;
    }
  }

  // Test all registered commands
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  2. 批量测试所有注册命令');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  let batchPassed = 0;
  let batchFailed = 0;
  let batchSkipped = 0;

  // Sample 20 random commands to test
  const shuffled = [...allCommands].sort(() => Math.random() - 0.5);
  const sampleSize = Math.min(20, shuffled.length);

  for (let i = 0; i < sampleSize; i++) {
    const cmd = shuffled[i];

    try {
      const content = await cmd.getPromptForCommand('test', { cwd: process.cwd() });
      const text = content.map(c => c.text).join('');

      if (text.length > 50) {
        batchPassed++;
      } else {
        batchSkipped++;
      }
    } catch {
      batchFailed++;
    }

    if ((i + 1) % 5 === 0) {
      process.stdout.write('.');
    }
  }
  console.log('');

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  测试总结');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log('  指定技能测试:');
  console.log(`    ✅ 通过:     ${passed}`);
  console.log(`    ⚠️  警告:    ${warned}`);
  console.log(`    ❌ 失败:     ${failed}`);

  console.log('\n  随机采样测试 (n=' + sampleSize + '):');
  console.log(`    ✅ 通过:     ${batchPassed}`);
  console.log(`    ⚠️  跳过:    ${batchSkipped}`);
  console.log(`    ❌ 失败:     ${batchFailed}`);

  console.log('');

  const totalPassed = passed + batchPassed;
  const totalFailed = failed + batchFailed;
  const totalTests = results.length + sampleSize;
  const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;

  console.log(`  总计: ${totalTests} 测试`);
  console.log(`  通过率: ${passRate}%`);
  console.log('');

  // Save results
  const jsonPath = import.meta.dir + '/../.upup/oscript-all-skills-results.json';
  try {
    const { writeFileSync, mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: { total: totalTests, passed: totalPassed, failed: totalFailed, passRate }
    }, null, 2));
    console.log(`  结果已保存到 ${jsonPath}`);
  } catch {
    // ignore
  }

  // Exit with code
  if (totalFailed > 0) {
    console.log('  ❌ 部分测试失败');
    process.exit(1);
  } else {
    console.log('  ✅ 所有测试通过!');
  }
}

main().catch(console.error);
