#!/usr/bin/env bun
/**
 * 简单Skills测试脚本 - 直接测试skills executor
 */

import { join } from 'path';

// 测试用例
const testCases = [
  // macro-china 系列
  { name: 'macro-china', args: 'GDP' },
  { name: 'macro-china', args: 'CPI' },
  { name: 'macro-china', args: 'PMI' },
  { name: 'macro-china', args: 'M2' },
  { name: 'macro-china', args: '利率' },
  
  // a-share-data 系列
  { name: 'a-share-data', args: '600519' },
  { name: 'a-share-data', args: '300750' },
  { name: 'a-share-data', args: '000858' },
  { name: 'a-share-data', args: '600036' },
  { name: 'a-share-data', args: '000001' },
  
  // financial-data
  { name: 'financial-data', args: '贵州茅台' },
  
  // 技术分析
  { name: 'technical-analysis', args: '600519' },
  
  // 风险评估
  { name: 'risk-assessment', args: '600519' },
  
  // 板块分析
  { name: 'sector-analysis', args: '医药' },
  { name: 'sector-analysis', args: '银行' },
  
  // 舆情分析
  { name: 'sentiment-analysis', args: '新能源车' },
  
  // 基金分析
  { name: 'fund-analysis', args: '510310' },
  
  // 估值对比
  { name: 'valuation-comparison', args: '600519 000858' },
  
  // 资金流
  { name: 'money-flow', args: '白酒' },
  
  // 公告查询
  { name: 'a-share-filings', args: '600519' },
  
  // 行业筛选
  { name: 'a-share-screening', args: '白酒' },
  
  // 更多测试
  { name: 'dcf', args: '600519' },
  { name: 'dividend-analysis', args: '600519' },
  { name: 'institutional-holding', args: '600519' },
  { name: 'stock-comparison', args: '600519 601318' },
  { name: 'cash-flow-analysis', args: '600519' },
  { name: 'shareholder-analysis', args: '600519' },
  { name: 'earnings-calendar', args: '2024-03' },
  { name: 'fund-comparison', args: '510310 159915' },
  { name: 'growth-investing', args: '300750' },
  { name: 'value-investing', args: '600036' },
  { name: 'momentum-investing', args: '白酒' },
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Skills 带参数执行测试 - v11.0 Complete                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');
  
  // 动态导入并初始化
  const { initializeSkills, getSkillCommand } = await import('../src/skills/commands.ts');
  
  // 初始化skills
  await initializeSkills();
  
  const results: { name: string; args: string; status: string; length: number; time: number; error?: string }[] = [];
  
  for (const tc of testCases) {
    const start = Date.now();
    try {
      // 从SkillCommandRegistry获取命令
      const cmd = getSkillCommand(tc.name);
      if (!cmd) {
        results.push({ 
          name: tc.name, 
          args: tc.args, 
          status: '❌', 
          length: 0, 
          time: Date.now() - start,
          error: 'Skill命令不存在'
        });
        console.log(`  ❌ /${tc.name} ${tc.args} - Skill命令不存在`);
        continue;
      }
      
      // 获取prompt
      const content = await cmd.getPromptForCommand(tc.args, { cwd: process.cwd() });
      const elapsed = Date.now() - start;
      
      if (content && content.length > 0) {
        const output = content.map(c => c.text).join('\n\n');
        
        if (output.length > 100) {
          results.push({ 
            name: tc.name, 
            args: tc.args, 
            status: '✅', 
            length: output.length, 
            time: elapsed,
          });
          console.log(`  ✅ /${tc.name} ${tc.args} - ${output.length} chars (${elapsed}ms)`);
        } else {
          results.push({ 
            name: tc.name, 
            args: tc.args, 
            status: '⏭️', 
            length: output.length, 
            time: elapsed,
            error: '输出太短'
          });
          console.log(`  ⏭️ /${tc.name} ${tc.args} - ${output.length} chars [输出太短] (${elapsed}ms)`);
        }
      } else {
        results.push({ 
          name: tc.name, 
          args: tc.args, 
          status: '❌', 
          length: 0, 
          time: Date.now() - start,
          error: '无内容'
        });
        console.log(`  ❌ /${tc.name} ${tc.args} - 无内容`);
      }
    } catch (err: any) {
      results.push({ 
        name: tc.name, 
        args: tc.args, 
        status: '❌', 
        length: 0, 
        time: Date.now() - start,
        error: err.message
      });
      console.log(`  ❌ /${tc.name} ${tc.args} - ${err.message}`);
    }
  }
  
  // 统计
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
  
  // 生成x11.md
  const content = generateX11Report(results);
  await Bun.write('x11.md', content);
  console.log('\n📝 结果已写入: x11.md');
  
  return passed >= total * 0.7;
}

function generateX11Report(results: any[]) {
  const passed = results.filter(r => r.status === '✅');
  const skipped = results.filter(r => r.status === '⏭️');
  const failed = results.filter(r => r.status === '❌');
  const total = results.length;
  const passRate = total > 0 ? ((passed.length / total) * 100).toFixed(1) : '0';
  
  let content = `# Skills 执行结果报告 (x11.md)

> 生成时间: ${new Date().toISOString()}
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
    content += `### /${r.name} ${r.args}

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
      content += `### /${r.name} ${r.args}

- **状态**: ⏭️ 跳过
- **输出长度**: ${r.length} chars
- **执行时间**: ${r.time}ms
- **原因**: ${r.error}

`;
    }
  }
  
  if (failed.length > 0) {
    content += `---

## ❌ 失败的测试 (${failed.length})

`;
    for (const r of failed) {
      content += `### /${r.name} ${r.args}

- **状态**: ❌ 失败
- **执行时间**: ${r.time}ms
- **错误**: ${r.error}

`;
    }
  }
  
  content += `---

## 🔍 详细测试用例

| # | Skill | 参数 | 状态 | 长度 | 时间 |
|---|-------|------|------|------|------|
`;
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    content += `| ${i + 1} | /${r.name} | ${r.args} | ${r.status} | ${r.length} | ${r.time}ms |\n`;
  }
  
  content += `
---

*报告生成时间: ${new Date().toISOString()}*
*版本: v11.0 Complete*
`;
  
  return content;
}

main().then(success => {
  console.log(`\n${success ? '✅ 测试通过' : '⚠️ 测试未达标'}`);
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
