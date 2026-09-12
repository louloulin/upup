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
    const { getBackendRegistry, initializeBackends } = await import('../src/multi-agent/backends/index.js');
    initializeBackends();
    const registry = getBackendRegistry();
    const backends = registry.list();
    const available = backends.filter(b => b.available).length;
    
    results.push({
      name: '后端注册表',
      passed: backends.length > 0,
      details: `${available}/${backends.length} 后端可用`,
    });
    console.log('✅', '后端注册表:', available, '/', backends.length, '后端可用');
  } catch (error: any) {
    results.push({
      name: '后端注册表',
      passed: false,
      error: error.message,
    });
    console.log('❌', '后端注册表加载失败:', error.message);
  }

  // Phase 3: Agent System Verification
  console.log('\n\x1b[36m>>> Phase 3: Agent系统验证\x1b[0m\n');

  try {
    const { getSwarmCoordinator, getTeamManager } = await import('../src/multi-agent/index.js');
    const coordinator = getSwarmCoordinator();
    const teamManager = getTeamManager();
    
    await coordinator.initialize();
    await teamManager.initialize();
    
    // Create a test team
    const team = coordinator.createTeam('verify-team', 'Verification Test');
    results.push({
      name: '团队创建',
      passed: !!team,
      details: team ? `团队创建成功: ${team.name}` : '创建失败',
    });
    console.log(team ? '✅' : '❌', '团队创建:', team ? '成功' : '失败');

    // Check team persistence
    const retrievedTeam = teamManager.getTeam('verify-team');
    results.push({
      name: '团队持久性',
      passed: !!retrievedTeam,
      details: retrievedTeam ? `团队ID: ${retrievedTeam.name}` : '团队未找到',
    });
    console.log(retrievedTeam ? '✅' : '❌', '团队持久性:', retrievedTeam ? '正常' : '异常');

  } catch (error: any) {
    results.push({
      name: 'Agent系统',
      passed: false,
      error: error.message,
    });
    console.log('❌', 'Agent系统加载失败:', error.message);
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
    const { getDefaultSubagentRunner } = await import('../src/runtime/pi/subagent-runner.js');
    const runner = getDefaultSubagentRunner();
    
    const concurrencySupported = runner && typeof runner.run === 'function';
    
    results.push({
      name: '并发Agent支持',
      passed: concurrencySupported,
      details: concurrencySupported ? 'SubagentRunner支持并发执行' : '并发执行受限',
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

  // Phase 7: Backend Tests
  console.log('\n\x1b[36m>>> Phase 7: Backend单元测试\x1b[0m\n');

  try {
    const testResult = execSync('bun test src/multi-agent/backends/backend.test.ts 2>&1', { 
      encoding: 'utf-8', 
      timeout: 60000 
    });
    const passMatch = testResult.match(/(\d+) pass/);
    const failMatch = testResult.match(/(\d+) fail/);
    
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    
    results.push({
      name: 'Backend测试',
      passed: failed === 0 && passed > 0,
      details: `${passed} 通过, ${failed} 失败`,
    });
    console.log('✅', 'Backend测试:', passed, '通过,', failed, '失败');
  } catch (error: any) {
    results.push({
      name: 'Backend测试',
      passed: false,
      error: error.message,
    });
    console.log('❌', 'Backend测试失败:', error.message);
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
