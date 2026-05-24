#!/usr/bin/env bun
/**
 * Multi-Agent System Verification CLI
 * 
 * 运行所有验证器测试多智能体系统
 */

import { runEnhancedVerification } from './src/multi-agent/enhanced-verifier.js';
import { runFullVerification } from './src/multi-agent/full-verifier.js';
import { runVerification as runScheduler } from './src/multi-agent/scheduler-verifier.js';
import { runVerification as runSystem } from './src/multi-agent/system-verifier.js';

const args = process.argv.slice(2);
const target = args[0] || 'all';

async function main() {
  console.log('\n\x1b[35m╔════════════════════════════════════════════════════════════╗');
  console.log('║  UpUp 多智能体系统 - 验证工具                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\x1b[0m\n');

  const startTime = Date.now();
  let totalPassed = 0;
  let totalFailed = 0;

  try {
    if (target === 'all' || target === 'enhanced') {
      console.log('\n\x1b[36m>>> 运行增强验证器...\x1b[0m');
      const report = await runEnhancedVerification();
      totalPassed += report.passed;
      totalFailed += report.failed;
    }

    if (target === 'all' || target === 'full') {
      console.log('\n\x1b[36m>>> 运行综合验证器...\x1b[0m');
      await runFullVerification();
    }

    if (target === 'all' || target === 'scheduler') {
      console.log('\n\x1b[36m>>> 运行调度器验证器...\x1b[0m');
      await runScheduler();
    }

    if (target === 'all' || target === 'system') {
      console.log('\n\x1b[36m>>> 运行系统验证器...\x1b[0m');
      await runSystem();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n\x1b[35m╔════════════════════════════════════════════════════════════╗');
    console.log('║                    验证完成                           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  总耗时: ${duration}s                                        ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\x1b[0m\n');

  } catch (error) {
    console.error('\n\x1b[31m验证失败:', error, '\x1b[0m');
    process.exit(1);
  }
}

main();
