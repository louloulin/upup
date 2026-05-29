#!/usr/bin/env bun
/**
 * x11-skills-test.ts - Skills综合执行测试并写入x11.md
 *
 * 执行多个skills带参数，收集结果并写入x11.md
 *
 * Run: bun run scripts/x11-skills-test.ts
 */

import { initializeSkills, getAllSkillCommands, getSkillCommand } from '../src/skills/commands.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_CASES = [
  // 宏观分析
  { skill: 'macro-china', args: 'GDP', name: '宏观GDP数据' },
  { skill: 'macro-china', args: 'CPI', name: '宏观CPI数据' },
  { skill: 'macro-china', args: 'PMI', name: '宏观PMI数据' },
  { skill: 'macro-china', args: 'M2', name: '宏观M2数据' },
  { skill: 'macro-china', args: '利率', name: '宏观利率数据' },

  // A股数据
  { skill: 'a-share-data', args: '600519', name: '贵州茅台' },
  { skill: 'a-share-data', args: '300750', name: '宁德时代' },
  { skill: 'a-share-data', args: '000858', name: '五粮液' },
  { skill: 'a-share-data', args: '600036', name: '招商银行' },
  { skill: 'a-share-data', args: '000001', name: '平安银行' },

  // 财务分析
  { skill: 'financial-data', args: '贵州茅台', name: '茅台财务分析' },
  { skill: 'a-share-filings', args: '600519', name: '茅台公告' },
  { skill: 'a-share-screening', args: '白酒', name: '白酒行业筛选' },

  // 技术分析
  { skill: 'technical-analysis', args: '600519', name: '茅台技术分析' },

  // Web搜索
  { skill: 'web-search', args: '苹果公司最新消息', name: 'Web搜索测试' },

  // 基金分析
  { skill: 'fund-analysis', args: '510310', name: 'ETF基金分析' },

  // 风险评估
  { skill: 'risk-assessment', args: '600519', name: '茅台风险评估' },

  // 估值对比
  { skill: 'valuation-comparison', args: '600519 000858', name: '茅台五粮液对比' },

  // 资金流
  { skill: 'money-flow', args: '白酒', name: '白酒资金流' },

  // 板块分析
  { skill: 'sector-analysis', args: '医药', name: '医药板块分析' },

  // 舆情分析
  { skill: 'sentiment-analysis', args: '新能源车', name: '新能源车舆情' },
];

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  skill: string;
  args: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  outputLength: number;
  outputPreview: string;
  error?: string;
  duration: number;
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Skills综合执行测试 - 结果写入x11.md                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  0. 初始化');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  await initializeSkills();

  const allCommands = getAllSkillCommands();
  console.log(`  ✅ 总共注册了 ${allCommands.length} 个技能命令\n`);

  // Test each case
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  1. Skills执行测试');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const tc of TEST_CASES) {
    const startTime = Date.now();
    const cmd = getSkillCommand(tc.skill);

    if (!cmd) {
      console.log(`  ⏭️  /${tc.skill} - 未注册，跳过`);
      results.push({
        skill: tc.skill,
        args: tc.args,
        name: tc.name,
        status: 'skip',
        outputLength: 0,
        outputPreview: '',
        error: 'Not registered',
        duration: Date.now() - startTime,
      });
      skipped++;
      continue;
    }

    try {
      const content = await cmd.getPromptForCommand(tc.args, { cwd: process.cwd() });
      const text = content.map(c => c.text).join('');
      const duration = Date.now() - startTime;

      // 检查是否有实际输出
      const hasOutput = text.length > 100 &&
        (text.includes('```!') || text.includes('{"') || text.includes('[{') ||
         text.includes('数据') || text.includes('分析') || text.includes('报告'));

      if (hasOutput) {
        console.log(`  ✅ /${tc.skill} ${tc.args} - ${text.length} chars (${duration}ms)`);
        results.push({
          skill: tc.skill,
          args: tc.args,
          name: tc.name,
          status: 'pass',
          outputLength: text.length,
          outputPreview: text.slice(0, 500),
          duration,
        });
        passed++;
      } else {
        console.log(`  ⚠️  /${tc.skill} ${tc.args} - 输出太短: ${text.length} chars`);
        results.push({
          skill: tc.skill,
          args: tc.args,
          name: tc.name,
          status: 'skip',
          outputLength: text.length,
          outputPreview: text.slice(0, 500),
          duration,
        });
        skipped++;
      }
    } catch (err: any) {
      console.log(`  ❌ /${tc.skill} ${tc.args} - ${err.message.substring(0, 50)}`);
      results.push({
        skill: tc.skill,
        args: tc.args,
        name: tc.name,
        status: 'fail',
        outputLength: 0,
        outputPreview: '',
        error: err.message,
        duration: Date.now() - startTime,
      });
      failed++;
    }
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  测试总结');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log(`  ✅ 通过:     ${passed}`);
  console.log(`  ⚠️  跳过:    ${skipped}`);
  console.log(`  ❌ 失败:     ${failed}`);
  console.log(`  📊 总计:     ${results.length}`);
  console.log('');

  // Generate x11.md
  const x11Content = generateX11Content(results);

  const x11Path = join(process.cwd(), 'x11.md');
  writeFileSync(x11Path, x11Content, 'utf-8');
  console.log(`  📝 结果已写入: ${x11Path}`);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  测试完成');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  return { passed, failed, skipped, results };
}

// ============================================================================
// Generate x11.md Content
// ============================================================================

function generateX11Content(results: TestResult[]): string {
  const now = new Date().toISOString().split('T')[0];
  const passed = results.filter(r => r.status === 'pass');
  const failed = results.filter(r => r.status === 'fail');
  const skipped = results.filter(r => r.status === 'skip');

  let content = `# Skills 执行结果报告 (x11.md)

> 生成时间: ${now}
> 测试环境: bun runtime

---

## 📊 执行总结

| 指标 | 数值 |
|------|------|
| 总测试数 | ${results.length} |
| 通过 | ${passed.length} |
| 失败 | ${failed.length} |
| 跳过 | ${skipped.length} |
| 通过率 | ${results.length > 0 ? ((passed.length / results.length) * 100).toFixed(1) : 0}% |

---

## ✅ 通过的测试 (${passed.length})

`;

  for (const r of passed) {
    content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ✅ 通过
- **输出长度**: ${r.outputLength} chars
- **执行时间**: ${r.duration}ms
- **输出预览**:
\`\`\`
${r.outputPreview.slice(0, 300)}${r.outputPreview.length > 300 ? '...' : ''}
\`\`\`

---
`;
  }

  if (failed.length > 0) {
    content += `\n## ❌ 失败的测试 (${failed.length})\n\n`;

    for (const r of failed) {
      content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ❌ 失败
- **错误**: ${r.error || 'Unknown error'}
- **执行时间**: ${r.duration}ms

---
`;
    }
  }

  if (skipped.length > 0) {
    content += `\n## ⏭️ 跳过的测试 (${skipped.length})\n\n`;

    for (const r of skipped) {
      content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ⏭️ 跳过
- **输出长度**: ${r.outputLength} chars
- **原因**: ${r.error || '输出太短'}

---
`;
    }
  }

  content += `
---

## 📋 Skills 覆盖范围

| 类别 | Skills | 测试数 | 通过数 |
|------|--------|--------|--------|
| 宏观分析 | /macro-china | ${results.filter(r => r.skill === 'macro-china').length} | ${results.filter(r => r.skill === 'macro-china' && r.status === 'pass').length} |
| A股数据 | /a-share-data | ${results.filter(r => r.skill === 'a-share-data').length} | ${results.filter(r => r.skill === 'a-share-data' && r.status === 'pass').length} |
| 财务分析 | /financial-data | ${results.filter(r => r.skill === 'financial-data').length} | ${results.filter(r => r.skill === 'financial-data' && r.status === 'pass').length} |
| 技术分析 | /technical-analysis | ${results.filter(r => r.skill === 'technical-analysis').length} | ${results.filter(r => r.skill === 'technical-analysis' && r.status === 'pass').length} |
| Web搜索 | /web-search | ${results.filter(r => r.skill === 'web-search').length} | ${results.filter(r => r.skill === 'web-search' && r.status === 'pass').length} |
| 基金分析 | /fund-analysis | ${results.filter(r => r.skill === 'fund-analysis').length} | ${results.filter(r => r.skill === 'fund-analysis' && r.status === 'pass').length} |
| 风险评估 | /risk-assessment | ${results.filter(r => r.skill === 'risk-assessment').length} | ${results.filter(r => r.skill === 'risk-assessment' && r.status === 'pass').length} |
| 舆情分析 | /sentiment-analysis | ${results.filter(r => r.skill === 'sentiment-analysis').length} | ${results.filter(r => r.skill === 'sentiment-analysis' && r.status === 'pass').length} |
| 板块分析 | /sector-analysis | ${results.filter(r => r.skill === 'sector-analysis').length} | ${results.filter(r => r.skill === 'sector-analysis' && r.status === 'pass').length} |
| 公告查询 | /a-share-filings | ${results.filter(r => r.skill === 'a-share-filings').length} | ${results.filter(r => r.skill === 'a-share-filings' && r.status === 'pass').length} |
| 行业筛选 | /a-share-screening | ${results.filter(r => r.skill === 'a-share-screening').length} | ${results.filter(r => r.skill === 'a-share-screening' && r.status === 'pass').length} |
| 资金流 | /money-flow | ${results.filter(r => r.skill === 'money-flow').length} | ${results.filter(r => r.skill === 'money-flow' && r.status === 'pass').length} |
| 估值对比 | /valuation-comparison | ${results.filter(r => r.skill === 'valuation-comparison').length} | ${results.filter(r => r.skill === 'valuation-comparison' && r.status === 'pass').length} |

---

## 🔍 详细测试用例

| # | Skill | 参数 | 名称 | 状态 | 长度 | 时间 |
|---|-------|------|------|------|------|------|
`;

  results.forEach((r, i) => {
    const statusEmoji = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️';
    content += `| ${i + 1} | /${r.skill} | ${r.args} | ${r.name} | ${statusEmoji} | ${r.outputLength} | ${r.duration}ms |\n`;
  });

  content += `
---

*报告生成时间: ${now}*
`;

  return content;
}

// ============================================================================
// Run
// ============================================================================

main().catch(console.error);
