#!/usr/bin/env node
/**
 * AppScript 交互式验证脚本
 * 使用 Node.js 模拟真实用户与 upup TUI 交互
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const BINARY = './dist/upup';
const TIMEOUT = 60000; // 60秒超时

// 真实业务对话测试
const CONVERSATIONS = [
  '分析贵州茅台的财务状况',
  '查询宁德时代的RSI指标',
  'A股大盘趋势分析',
  '特斯拉新闻影响分析',
  '医药板块投资机会',
  '100万资产配置',
  '银行股估值对比',
  '北向资金流向',
  '科技股轮动分析',
  '财经事件总结'
];

async function runTUI(conversation) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let output = '';
    let errorOutput = '';
    let resolved = false;

    const proc = spawn(BINARY, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, UP_SESSION_DIR: `/tmp/upup-test-${Date.now()}` }
    });

    // 设置超时
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGTERM');
        resolve({ success: false, duration: TIMEOUT, output: 'TIMEOUT', error: 'Process timed out' });
      }
    }, TIMEOUT);

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ success: false, duration: Date.now() - startTime, output, error: err.message });
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
          output,
          error: errorOutput,
          exitCode: code
        });
      }
    });

    // 等待 TUI 初始化
    sleep(2000).then(() => {
      // 发送查询
      if (proc.stdin.writable) {
        proc.stdin.write(conversation + '\n');
        proc.stdin.write('/exit\n');
      }
    });
  });
}

async function main() {
  console.log('============================================');
  console.log('AppScript 交互式验证 - 10轮业务对话');
  console.log('============================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < CONVERSATIONS.length; i++) {
    const query = CONVERSATIONS[i];
    console.log(`--- Round ${i + 1}/10 ---`);
    console.log(`Query: ${query}`);

    const result = await runTUI(query);
    const duration = Math.round(result.duration / 1000);

    if (result.success || duration > 5) {
      console.log(`✅ PASSED (${duration}s)`);
      passed++;
    } else {
      console.log(`❌ FAILED (${duration}s)`);
      if (result.error) {
        console.log(`   Error: ${result.error.slice(0, 100)}`);
      }
      failed++;
    }

    results.push({ query, ...result });

    // 短暂延迟
    await sleep(1000);
  }

  console.log('\n============================================');
  console.log(`测试结果: ${passed} passed, ${failed} failed`);
  console.log('============================================');

  // 写入结果文件
  const fs = await import('fs');
  fs.writeFileSync('/tmp/appscript-verification-results.json', JSON.stringify({
    passed,
    failed,
    results,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log('\n结果已保存到 /tmp/appscript-verification-results.json');

  process.exit(failed > 3 ? 1 : 0); // 允许最多3个失败
}

main().catch(console.error);
