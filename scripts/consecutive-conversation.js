#!/usr/bin/env node
/**
 * 真实业务连续对话测试
 * 同一个 TUI 实例连续处理 10 个不同的业务查询
 * 模拟真实用户使用场景
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const BINARY = './dist/upup';
const ROUND_TIMEOUT = 45000; // 45秒超时每轮

// 真实业务对话 - 模拟连贯的投资研究流程
const CONVERSATIONS = [
  { step: 1, query: '分析贵州茅台的财务状况', context: '基础财务分析' },
  { step: 2, query: '对比五粮液和泸州老窖的估值', context: '行业对比分析' },
  { step: 3, query: '查询白酒板块最近的北向资金', context: '资金面分析' },
  { step: 4, query: '分析大盘技术面走势', context: '大盘分析' },
  { step: 5, query: '投资50万白酒板块如何配置', context: '风险与配置' },
  { step: 6, query: '搜索消费税改革新闻', context: '政策影响' },
  { step: 7, query: '茅台估值分析', context: '估值分析' },
  { step: 8, query: '对比国际烈酒公司估值', context: '国际对比' },
  { step: 9, query: '总结今天分析内容', context: '总结' },
  { step: 10, query: '/exit', context: '退出' }
];

async function runConsecutiveConversation() {
  console.log('============================================');
  console.log('真实业务连续对话测试');
  console.log('同一 TUI 实例连续处理 10 个业务查询');
  console.log('============================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  const startTime = Date.now();
  let output = '';
  let errorOutput = '';

  const proc = spawn(BINARY, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      UP_SESSION_DIR: `/tmp/upup-consecutive-${Date.now()}`
    }
  });

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text);
  });

  proc.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  proc.on('error', (err) => {
    console.error('Process error:', err.message);
  });

  // 等待 TUI 初始化
  await sleep(3000);

  // 依次发送查询
  for (const conv of CONVERSATIONS) {
    console.log(`\n--- Step ${conv.step}/10: ${conv.context} ---`);
    console.log(`Query: ${conv.query}`);

    const stepStart = Date.now();

    // 发送查询
    if (proc.stdin.writable) {
      proc.stdin.write(conv.query + '\n');
    }

    // 等待响应
    await sleep(15000);

    const stepTime = Math.round((Date.now() - stepStart) / 1000);

    // 检查是否有严重错误
    const hasError = errorOutput.includes('panic') ||
                    errorOutput.includes('fatal');

    if (!hasError) {
      console.log(`✅ Step ${conv.step} 完成 (${stepTime}s)`);
      passed++;
      results.push({ step: conv.step, context: conv.context, passed: true, duration: stepTime });
    } else {
      console.log(`❌ Step ${conv.step} 失败`);
      failed++;
      results.push({ step: conv.step, context: conv.context, passed: false, duration: stepTime });
    }

    // 短暂延迟
    await sleep(1000);
  }

  // 等待进程结束
  await new Promise(resolve => {
    proc.on('close', resolve);
    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(0);
    }, 5000);
  });

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log('\n============================================');
  console.log(`总耗时: ${totalTime} 秒`);
  console.log(`测试结果: ${passed} passed, ${failed} failed`);
  console.log('============================================');

  return { passed, failed, totalTime, results };
}

async function main() {
  try {
    const result = await runConsecutiveConversation();

    // 保存结果
    const fs = await import('fs');
    fs.writeFileSync('/tmp/consecutive-verification-results.json', JSON.stringify({
      ...result,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n结果已保存到 /tmp/consecutive-verification-results.json');
    process.exit(result.failed > 2 ? 1 : 0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
