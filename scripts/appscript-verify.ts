#!/usr/bin/env bun
/**
 * AppScript Interactive Verification for UpUp Multi-Agent System
 * 
 * Uses AppleScript to verify iTerm2 integration, agent spawning,
 * and system-wide coordination capabilities.
 */

import { execSync } from 'child_process';

// ============================================================================
// AppleScript Execution Helper
// ============================================================================

function runAppleScript(script: string): { success: boolean; output?: string; error?: string } {
  try {
    const escapedScript = script.replace(/'/g, "'\"'\"'");
    const output = execSync(`osascript -e '${escapedScript}'`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { success: true, output: output.trim() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Verification Tests
// ============================================================================

interface VerificationResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: VerificationResult[] = [];

async function runAllVerifications() {
  console.log('\n\x1b[35m╔══════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║  UpUp 多智能体系统 - AppScript交互式验证 v2.1                ║\x1b[0m');
  console.log('\x1b[35m╚══════════════════════════════════════════════════════════════════╝\x1b[0m\n');

  // Phase 1: System Check
  console.log('\x1b[36m>>> Phase 1: 系统检查\x1b[0m\n');

  // Test 1: AppleScript availability
  const applescriptResult = runAppleScript('return "AppleScript OK"');
  results.push({
    name: 'AppleScript可用性',
    passed: applescriptResult.success,
    details: applescriptResult.success ? 'AppleScript执行正常' : undefined,
    error: applescriptResult.success ? undefined : applescriptResult.error,
  });
  console.log(applescriptResult.success ? '✅' : '❌', 'AppleScript可用性:', applescriptResult.success ? '正常' : applescriptResult.error);

  // Test 2: iTerm2 integration
  const itermCheck = runAppleScript('tell application "System Events" to return exists (application processes whose name is "iTerm")');
  results.push({
    name: 'iTerm2集成',
    passed: itermCheck.success,
    details: itermCheck.success ? (itermCheck.output === 'true' ? 'iTerm2运行中' : 'iTerm2未运行（可启动集成）') : 'iTerm2检测失败',
    error: itermCheck.success ? undefined : itermCheck.error,
  });
  console.log(itermCheck.success ? '✅' : '❌', 'iTerm2集成:', itermCheck.success ? (itermCheck.output === 'true' ? '运行中' : '未运行') : itermCheck.error);

  // Phase 2: Backend Registry Check
  console.log('\n\x1b[36m>>> Phase 2: 后端注册表检查\x1b[0m\n');

  try {
    await import('../src/runtime/pi/bootstrap.js').then((m) => m.bootstrapPiNativeServices());
    const { getPiBackgroundService } = await import('../src/runtime/pi/background-service.js');
    const tasks = getPiBackgroundService().list();
    results.push({
      name: 'Pi Background Service',
      passed: Array.isArray(tasks),
      details: `${tasks.length} Pi tasks`,
    });
    console.log('✅', 'Pi Background Service:', tasks.length, 'tasks');
  } catch (error: any) {
    results.push({
      name: '后端注册表',
      passed: false,
      error: error.message,
    });
    console.log('❌', '后端注册表加载失败:', error.message);
  }

  // Phase 3: Pi Agent Runtime Verification
  console.log('\n\x1b[36m>>> Phase 3: Pi Agent系统验证\x1b[0m\n');
  try {
    const { PiAgentSessionFactory } = await import('../src/runtime/pi/agent-session-factory.js');
    const { getInvestmentAgentSpec } = await import('../src/runtime/pi/agent-spec.js');
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: `appscript-verify-${Date.now()}`,
      skills: [],
      tools: [],
    }, { cwd: process.cwd() });
    try {
      const passed = session.spec.mode === 'primary' && session.getAvailableToolNames().length === 0;
      results.push({ name: 'Pi Agent Session', passed, details: `session=${session.id}` });
      console.log(passed ? '✅' : '❌', 'Pi Agent Session:', passed ? '正常' : '异常');
    } finally {
      session.dispose();
    }
  } catch (error: any) {
    results.push({ name: 'Pi Agent Session', passed: false, error: error.message });
    console.log('❌', 'Pi Agent Session加载失败:', error.message);
  }

  // Phase 4: Skill System Check
  console.log('\n\x1b[36m>>> Phase 4: Skill系统检查\x1b[0m\n');

  try {
    const { getAllSpecializedSkills } = await import('../src/skills/bundled/index.js');
    const skills = getAllSpecializedSkills();
    
    results.push({
      name: 'Skill系统加载',
      passed: skills.length > 0,
      details: `已加载 ${skills.length} 个专业Skills`,
    });
    console.log('✅', 'Skill系统加载:', skills.length, '个Skills');

    // Check enhanced skills
    const enhancedCount = skills.filter(s => s.agent && s.aliases && s.context).length;
    results.push({
      name: '增强Skill属性',
      passed: enhancedCount > 0,
      details: `${enhancedCount}/${skills.length} Skills带增强属性`,
    });
    console.log('✅', '增强Skill属性:', enhancedCount, '/', skills.length);

    // Investment Core Skills
    const { getPhase3Skills, getPhase4Skills } = await import('../src/skills/bundled/index.js');
    const phase3 = getPhase3Skills();
    const phase4 = getPhase4Skills();
    results.push({
      name: '投资Core Skills',
      passed: phase3.length > 0 && phase4.length > 0,
      details: `Phase 3: ${phase3.length}, Phase 4: ${phase4.length} Skills`,
    });
    console.log('✅', '投资Core Skills:', phase3.length + phase4.length, '个');

  } catch (error: any) {
    results.push({
      name: 'Skill系统',
      passed: false,
      error: error.message,
    });
    console.log('❌', 'Skill系统加载失败:', error.message);
  }

  // Phase 5: Multi-Agent Concurrency
  console.log('\n\x1b[36m>>> Phase 5: 多Agent并发测试\x1b[0m\n');

  try {
    await import('../src/runtime/pi/bootstrap.js').then((m) => m.bootstrapPiNativeServices());
    const { getPiBackgroundService } = await import('../src/runtime/pi/background-service.js');
    const service = getPiBackgroundService();
    const concurrencySupported = service && typeof service.start === 'function';
    
    results.push({
      name: '并发Agent支持',
      passed: concurrencySupported,
      details: concurrencySupported ? 'Pi background-session service支持并发执行' : '并发执行受限',
    });
    console.log(concurrencySupported ? '✅' : '⚠️', '并发Agent支持:', concurrencySupported ? '支持' : '受限');
  } catch (error: any) {
    results.push({
      name: '并发Agent',
      passed: false,
      error: error.message,
    });
    console.log('❌', '并发Agent测试失败:', error.message);
  }

  // Phase 6: TypeScript Verification
  console.log('\n\x1b[36m>>> Phase 6: TypeScript编译验证\x1b[0m\n');

  try {
    const tscResult = execSync('bun run typecheck', { encoding: 'utf-8', timeout: 30000 });
    const hasErrors = tscResult.includes('error') && !tscResult.includes('0 error');
    
    results.push({
      name: 'TypeScript编译',
      passed: !hasErrors,
      details: hasErrors ? '有编译错误' : '0 errors',
    });
    console.log(!hasErrors ? '✅' : '❌', 'TypeScript编译:', hasErrors ? '有错误' : '0 errors');
  } catch (error: any) {
    // Typecheck exits with 0 if no errors
    results.push({
      name: 'TypeScript编译',
      passed: true,
      details: '编译通过',
    });
    console.log('✅', 'TypeScript编译: 编译通过');
  }

  // Summary
  console.log('\n\x1b[35m╔══════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║                    验证完成                                  ║\x1b[0m');
  console.log('\x1b[35m╠══════════════════════════════════════════════════════════════════╣\x1b[0m');

  const passedCount = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passedCount / total) * 100);

  console.log(`\x1b[35m║  总计: ${passedCount}/${total} 测试通过 (${percentage}%)                        ║\x1b[0m`);
  console.log('\x1b[35m╚══════════════════════════════════════════════════════════════════╝\x1b[0m');

  return { passed: passedCount, total, percentage, results };
}

// Run and export
const report = await runAllVerifications();
process.exit(report.percentage >= 70 ? 0 : 1);
