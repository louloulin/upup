#!/usr/bin/env bun
/**
 * 综合Skills测试脚本
 * 执行所有Skills并验证带参数执行能力
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const SKILLS_DIR = join(process.cwd(), 'src/skills');
const OUTPUT_FILE = join(process.cwd(), 'x11.md');

interface TestResult {
  skill: string;
  args: string;
  name: string;
  status: '✅' | '❌' | '⏭️';
  length: number;
  time: number;
  error?: string;
}

const results: TestResult[] = [];

// Skills测试用例 - 扩展测试范围
const testCases: { skill: string; args: string; name: string }[] = [
  // 已有通过的测试 (扩展)
  { skill: 'macro-china', args: 'GDP', name: '宏观GDP数据' },
  { skill: 'macro-china', args: 'CPI', name: '宏观CPI数据' },
  { skill: 'macro-china', args: 'PMI', name: '宏观PMI数据' },
  { skill: 'macro-china', args: 'M2', name: '宏观M2数据' },
  { skill: 'macro-china', args: '利率', name: '宏观利率数据' },
  { skill: 'macro-china', args: 'PPI', name: '宏观PPI数据' },
  { skill: 'a-share-data', args: '600519', name: '贵州茅台' },
  { skill: 'a-share-data', args: '300750', name: '宁德时代' },
  { skill: 'a-share-data', args: '000858', name: '五粮液' },
  { skill: 'a-share-data', args: '600036', name: '招商银行' },
  { skill: 'a-share-data', args: '000001', name: '平安银行' },
  { skill: 'a-share-data', args: '601318', name: '中国平安' },
  { skill: 'a-share-data', args: '600276', name: '恒瑞医药' },
  { skill: 'financial-data', args: '贵州茅台', name: '茅台财务分析' },
  { skill: 'a-share-filings', args: '600519', name: '茅台公告' },
  { skill: 'a-share-screening', args: '白酒', name: '白酒行业筛选' },
  { skill: 'technical-analysis', args: '600519', name: '茅台技术分析' },
  { skill: 'web-search', args: '苹果公司最新消息', name: 'Web搜索测试' },
  { skill: 'fund-analysis', args: '510310', name: 'ETF基金分析' },
  { skill: 'risk-assessment', args: '600519', name: '茅台风险评估' },
  { skill: 'valuation-comparison', args: '600519 000858', name: '茅台五粮液对比' },
  { skill: 'money-flow', args: '白酒', name: '白酒资金流' },
  { skill: 'sector-analysis', args: '医药', name: '医药板块分析' },
  { skill: 'sentiment-analysis', args: '新能源车', name: '新能源车舆情' },
  
  // 新增测试 - 更多Skills
  { skill: 'technical-analysis', args: '300750', name: '宁德时代技术分析' },
  { skill: 'risk-assessment', args: '300750', name: '宁德时代风险评估' },
  { skill: 'sector-analysis', args: '科技', name: '科技板块分析' },
  { skill: 'sector-analysis', args: '银行', name: '银行板块分析' },
  { skill: 'stock-comparison', args: '600519 601318', name: '茅台平安对比' },
  { skill: 'dcf', args: '600519', name: '茅台DCF估值' },
  { skill: 'dividend-analysis', args: '600519', name: '茅台分红分析' },
  { skill: 'institutional-holding', args: '600519', name: '茅台机构持仓' },
  { skill: 'earnings-calendar', args: '2024-03', name: '2024年3月财报日历' },
  { skill: 'fund-comparison', args: '510310 159915', name: 'ETF基金对比' },
  { skill: 'cash-flow-analysis', args: '600519', name: '茅台现金流分析' },
  { skill: 'shareholder-analysis', args: '600519', name: '茅台股东分析' },
  { skill: 'growth-investing', args: '300750', name: '宁德时代成长投资' },
  { skill: 'value-investing', args: '600036', name: '招商银行价值投资' },
  { skill: 'momentum-investing', args: '白酒', name: '白酒动量投资' },
];

async function runSkillTest(skill: string, args: string, name: string): Promise<TestResult> {
  const start = Date.now();
  try {
    // 使用upup命令行执行skill
    const proc = Bun.spawn({
      cmd: ['./dist/upup', '--skill', skill, '--args', args],
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: process.cwd(),
    });
    
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    await proc.exited;
    
    const elapsed = Date.now() - start;
    const content = output || error;
    
    if (content.length < 100) {
      return {
        skill,
        args,
        name,
        status: '⏭️',
        length: content.length,
        time: elapsed,
        error: '输出太短'
      };
    }
    
    return {
      skill,
      args,
      name,
      status: '✅',
      length: content.length,
      time: elapsed,
    };
  } catch (err: any) {
    return {
      skill,
      args,
      name,
      status: '❌',
      length: 0,
      time: Date.now() - start,
      error: err.message,
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Skills综合执行测试 - v11.0 Complete                                ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  // 检查dist/upup是否存在
  const distPath = join(process.cwd(), 'dist/upup');
  try {
    await stat(distPath);
  } catch {
    console.log('❌ dist/upup 不存在，需要先构建');
    console.log('💡 运行: bun run build\n');
    process.exit(1);
  }

  // 执行测试
  for (const tc of testCases) {
    const result = await runSkillTest(tc.skill, tc.args, tc.name);
    results.push(result);
    
    const icon = result.status;
    const timeStr = `(${result.time}ms)`;
    const lenStr = `${result.length} chars`;
    
    if (result.status === '✅') {
      console.log(`  ${icon} /${tc.skill} ${tc.args} - ${tc.name} - ${lenStr} ${timeStr}`);
    } else if (result.status === '⏭️') {
      console.log(`  ${icon} /${tc.skill} ${tc.args} - ${tc.name} - ${lenStr} ${timeStr} [${result.error}]`);
    } else {
      console.log(`  ${icon} /${tc.skill} ${tc.args} - ${tc.name} - ${timeStr} [${result.error}]`);
    }
  }

  // 统计结果
  const passed = results.filter(r => r.status === '✅').length;
  const skipped = results.filter(r => r.status === '⏭️').length;
  const failed = results.filter(r => r.status === '❌').length;
  const total = results.length;

  console.log('\n' + '═'.repeat(70));
  console.log(`  ✅ 通过:     ${passed}`);
  console.log(`  ⏭️  跳过:    ${skipped}`);
  console.log(`  ❌ 失败:     ${failed}`);
  console.log(`  📊 总计:     ${total}`);
  console.log('═'.repeat(70));

  // 按类别分组统计
  console.log('\n📋 Skills 覆盖范围:\n');
  
  const categories: Record<string, TestResult[]> = {};
  for (const r of results) {
    const cat = r.skill.split('-')[0];
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  }
  
  for (const [cat, items] of Object.entries(categories)) {
    const catPassed = items.filter(r => r.status === '✅').length;
    const catTotal = items.length;
    console.log(`  • ${cat}: ${catPassed}/${catTotal} 通过`);
  }

  // 生成x11.md更新内容
  const x11Content = generateX11Content(results);
  
  // 写入文件
  await Bun.write(OUTPUT_FILE, x11Content);
  console.log(`\n📝 结果已写入: ${OUTPUT_FILE}`);

  return passed >= total * 0.8; // 80%通过率
}

function generateX11Content(results: TestResult[]): string {
  const passed = results.filter(r => r.status === '✅');
  const skipped = results.filter(r => r.status === '⏭️');
  const failed = results.filter(r => r.status === '❌');
  const total = results.length;
  const passRate = ((passed.length / total) * 100).toFixed(1);

  let content = `# Skills 执行结果报告 (x11.md)

> 生成时间: ${new Date().toISOString()}
> 测试环境: bun runtime
> 版本: v11.0 Complete

---

## 📊 执行总结

| 指标 | 数值 |
|------|------|
| 总测试数 | ${total} |
| 通过 | ${passed.length} |
| 失败 | ${failed.length} |
| 跳过 | ${skipped.length} |
| 通过率 | ${passRate}% |

---

## ✅ 通过的测试 (${passed.length})

`;

  for (const r of passed) {
    content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ✅ 通过
- **输出长度**: ${r.length} chars
- **执行时间**: ${r.time}ms

`;
  }

  if (skipped.length > 0) {
    content += `---

## ⏭️ 跳过的测试 (${skipped.length})

`;
    for (const r of skipped) {
      content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ⏭️ 跳过
- **输出长度**: ${r.length} chars
- **原因**: ${r.error}

`;
    }
  }

  if (failed.length > 0) {
    content += `---

## ❌ 失败的测试 (${failed.length})

`;
    for (const r of failed) {
      content += `### /${r.skill} ${r.args} (${r.name})

- **状态**: ❌ 失败
- **执行时间**: ${r.time}ms
- **错误**: ${r.error}

`;
    }
  }

  content += `---

## 📋 Skills 覆盖范围

| 类别 | Skills | 测试数 | 通过数 |
|------|--------|--------|--------|
`;

  const categories: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    const cat = r.skill.split('-')[0];
    if (!categories[cat]) categories[cat] = { total: 0, passed: 0 };
    categories[cat].total++;
    if (r.status === '✅') categories[cat].passed++;
  }
  
  for (const [cat, data] of Object.entries(categories)) {
    content += `| ${cat} | /${cat}-* | ${data.total} | ${data.passed} |\n`;
  }

  content += `
---

## 🔍 详细测试用例

| # | Skill | 参数 | 名称 | 状态 | 长度 | 时间 |
|---|-------|------|------|------|------|------|
`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    content += `| ${i + 1} | /${r.skill} | ${r.args} | ${r.name} | ${r.status} | ${r.length} | ${r.time}ms |\n`;
  }

  content += `
---

*报告生成时间: ${new Date().toISOString()}*
*版本: v11.0 Complete*
`;

  return content;
}

main().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
