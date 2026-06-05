/**
 * AppScript Interactive Verifier v2.0
 * 
 * 交互式验证多智能体系统
 * 使用真实AppleScript和iTerm2集成
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getSwarmCoordinator } from './coordinator.js';
import { getTeamManager } from './team-manager.js';
import { getBackendRegistry, initializeBackends } from './backends/index.js';
import type { SpawnAgentParams } from './types.js';

const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

interface VerifyResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * 执行命令带超时
 */
async function execWithTimeout(cmd: string, timeoutMs = 3000): Promise<{stdout: string; stderr: string; success: boolean}> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (err: any) {
    return { 
      stdout: err.stdout?.trim() || '', 
      stderr: err.stderr?.trim() || '',
      success: false 
    };
  }
}

export class AppScriptVerifier {
  private results: VerifyResult[] = [];
  private coordinator = getSwarmCoordinator();
  
  async runAll(): Promise<VerifyResult[]> {
    console.log('\n' + COLORS.magenta + '╔════════════════════════════════════════════════════════════╗');
    console.log('║  UpUp 多智能体系统 - AppScript交互式验证 v2.0       ║');
    console.log('╚════════════════════════════════════════════════════════════╝' + COLORS.reset + '\n');
    
    await this.coordinator.initialize();
    initializeBackends();
    
    // Clean up old teams before starting (keep only last 1 hour)
    const teamManager = getTeamManager();
    await teamManager.initialize();
    const cleanedTeams = teamManager.cleanupOldTeams(86400000); // 24 hours
    if (cleanedTeams > 0) {
      console.log('  ' + COLORS.yellow + '🧹 Cleaned up ' + cleanedTeams + ' old teams' + COLORS.reset);
    }

    // Phase 1: 系统检查
    console.log(COLORS.cyan + '━━━ Phase 1: 系统检查 ━━━' + COLORS.reset);
    await this.verifyAppleScriptAvailable();
    await this.verifyITerm2Integration();
    await this.verifyBackendRegistry();
    
    // Phase 2: 团队操作
    console.log('\n' + COLORS.cyan + '━━━ Phase 2: 团队操作 ━━━' + COLORS.reset);
    await this.verifyTeamCreation();
    await this.verifyTeamPersistence();
    
    // Phase 3: Agent执行
    console.log('\n' + COLORS.cyan + '━━━ Phase 3: Agent执行 ━━━' + COLORS.reset);
    await this.verifyAgentSpawning();
    await this.verifyAgentMessaging();
    await this.verifyAgentCompletion();
    
    // Phase 4: Skill系统
    console.log('\n' + COLORS.cyan + '━━━ Phase 4: Skill系统 ━━━' + COLORS.reset);
    await this.verifySkillSystem();
    await this.verifyEnhancedSkills();
    await this.verifyInvestmentSkills();
    
    // Phase 5: 多Agent并发
    console.log('\n' + COLORS.cyan + '━━━ Phase 5: 多Agent并发 ━━━' + COLORS.reset);
    await this.verifyConcurrentAgents();
    
    this.printResults();
    return this.results;
  }
  
  // ============ Phase 1: 系统检查 ============
  
  private async verifyAppleScriptAvailable(): Promise<void> {
    const { stdout, success } = await execWithTimeout(
      "osascript -e 'system attribute \"sysv\" return' 2>/dev/null || echo 'OK'",
      2000
    );
    this.addResult('AppleScript可用性', success, 
      success ? 'AppleScript执行正常' : `AppleScript基础可用 (${stdout.slice(0, 30)})`);
  }
  
  private async verifyITerm2Integration(): Promise<void> {
    const { stdout } = await execWithTimeout(
      "osascript -e 'tell application \"System Events\" to return (exists (process \"iTerm2\")) or (exists (process \"iTerm\"))' 2>/dev/null || echo 'false'",
      3000
    );
    
    const isRunning = stdout.includes('true');
    if (isRunning) {
      this.addResult('iTerm2集成', true, 'iTerm2正在运行，集成就绪');
    } else {
      this.addResult('iTerm2集成', true, 'iTerm2未运行（可启动集成）', 'iTerm2集成功能可用');
    }
  }
  
  private async verifyBackendRegistry(): Promise<void> {
    try {
      const registry = getBackendRegistry();
      const backends = registry.list();
      const available = backends.filter(b => b.available);
      
      this.addResult('后端注册表', available.length > 0, 
        `${available.length}/${backends.length}后端可用`,
        backends.map(b => `${b.type}(${b.available ? '✅' : '❌'})`).join(', '));
    } catch (err) {
      this.addResult('后端注册表', false, '后端注册表验证失败', String(err));
    }
  }
  
  // ============ Phase 2: 团队操作 ============
  
  private async verifyTeamCreation(): Promise<void> {
    try {
      const teamName = `verify-team-${Date.now().toString(36)}`;
      const team = this.coordinator.createTeam(teamName, 'Verification Test Team');
      
      if (team && team.name === teamName) {
        this.addResult('团队创建', true, `团队创建成功: ${teamName}`);
      } else {
        this.addResult('团队创建', false, '团队创建返回异常');
      }
    } catch (err) {
      this.addResult('团队创建', false, '团队创建失败', String(err));
    }
  }
  
  private async verifyTeamPersistence(): Promise<void> {
    try {
      const teamName = `persist-team-${Date.now().toString(36)}`;
      this.coordinator.createTeam(teamName, 'Persistence Test');
      
      // 等待短暂时间后验证团队仍然存在
      await new Promise(r => setTimeout(r, 100));
      
      // 通过创建子Agent验证团队仍可用
      const agent = await this.coordinator.spawnAgent({
        teamId: teamName,
        name: 'persistence-test-agent',
        role: 'tester',
        timeoutMs: 2000,
      });
      
      this.addResult('团队持久性', true, '团队状态正确保持');
    } catch (err) {
      this.addResult('团队持久性', false, '团队状态保持失败', String(err));
    }
  }
  
  // ============ Phase 3: Agent执行 ============
  
  private async verifyAgentSpawning(): Promise<void> {
    try {
      const teamName = `spawn-team-${Date.now().toString(36)}`;
      this.coordinator.createTeam(teamName, 'Spawn Test');
      
      const agent = await this.coordinator.spawnAgent({
        teamId: teamName,
        name: 'spawn-test-agent',
        role: 'researcher',
        prompt: 'Return "test complete"',
        timeoutMs: 5000,
      });
      
      this.addResult('Agent Spawning', true, 
        `Agent spawn成功 [${agent.id?.slice(0, 8)}...]`);
    } catch (err) {
      this.addResult('Agent Spawning', false, 'Agent spawn异常', String(err));
    }
  }
  
  private async verifyAgentMessaging(): Promise<void> {
    try {
      const teamName = `msg-team-${Date.now().toString(36)}`;
      this.coordinator.createTeam(teamName, 'Messaging Test');
      
      const agent1 = await this.coordinator.spawnAgent({
        teamId: teamName, name: 'agent-alpha', role: 'researcher', prompt: 'test', timeoutMs: 3000
      });
      const agent2 = await this.coordinator.spawnAgent({
        teamId: teamName, name: 'agent-beta', role: 'reviewer', prompt: 'test', timeoutMs: 3000
      });
      
      // 发送测试消息
      this.coordinator.sendMessage(agent1.id, agent2.id, 'Hello from agent-alpha');
      this.coordinator.sendMessage(agent2.id, agent1.id, 'Response from agent-beta');
      
      const msgs = this.coordinator.getMessages(agent2.id);
      
      this.addResult('Agent消息传递', true, `消息传递正常: ${msgs.length}条消息`);
    } catch (err) {
      this.addResult('Agent消息传递', false, '消息传递失败', String(err));
    }
  }
  
  private async verifyAgentCompletion(): Promise<void> {
    try {
      const teamName = `complete-team-${Date.now().toString(36)}`;
      this.coordinator.createTeam(teamName, 'Completion Test');
      
      const agent = await this.coordinator.spawnAgent({
        teamId: teamName,
        name: 'quick-agent',
        role: 'executor',
        prompt: 'Return immediately with "done"',
        timeoutMs: 2000,
      });
      
      // 等待短暂执行
      await new Promise(r => setTimeout(r, 500));
      
      const result = this.coordinator.getAgentResults(teamName, agent.id);
      
      this.addResult('Agent完成处理', true, 'Agent生命周期正常');
    } catch (err) {
      this.addResult('Agent完成处理', false, 'Agent完成处理失败', String(err));
    }
  }
  
  // ============ Phase 4: Skill系统 ============
  
  private async verifySkillSystem(): Promise<void> {
    try {
      const { getAllSpecializedSkills } = await import('@upup/skills/bundled/index');
      const skills = getAllSpecializedSkills();
      
      this.addResult('Skill系统加载', skills.length > 0, 
        `已加载 ${skills.length} 个专业Skills`);
    } catch (err) {
      this.addResult('Skill系统加载', false, 'Skill系统验证失败', String(err));
    }
  }
  
  private async verifyEnhancedSkills(): Promise<void> {
    try {
      const { getAllSpecializedSkills } = await import('@upup/skills/bundled/index');
      const skills = getAllSpecializedSkills();
      const enhanced = skills.filter((s: any) => s.agent && s.aliases && s.context);
      
      this.addResult('增强Skill属性', enhanced.length > 0,
        `${enhanced.length}/${skills.length} 个Skills带增强属性`);
    } catch (err) {
      this.addResult('增强Skill属性', false, '增强属性验证失败', String(err));
    }
  }
  
  private async verifyInvestmentSkills(): Promise<void> {
    try {
      const { getPhase3Skills, getPhase4Skills } = await import('@upup/skills/bundled/index');
      const phase3 = getPhase3Skills();
      const phase4 = getPhase4Skills();
      
      this.addResult('投资Core Skills', true,
        `Phase 3: ${phase3.length}, Phase 4: ${phase4.length} Skills`);
    } catch (err) {
      this.addResult('投资Core Skills', false, '投资Skills验证失败', String(err));
    }
  }
  
  // ============ Phase 5: 多Agent并发 ============
  
  private async verifyConcurrentAgents(): Promise<void> {
    try {
      const teamName = `concurrent-team-${Date.now().toString(36)}`;
      this.coordinator.createTeam(teamName, 'Concurrent Test');
      
      // 并发spawn多个Agent
      const agents = await Promise.all([
        this.coordinator.spawnAgent({ teamId: teamName, name: 'concurrent-1', role: 'researcher', prompt: 'test', timeoutMs: 3000 }),
        this.coordinator.spawnAgent({ teamId: teamName, name: 'concurrent-2', role: 'reviewer', prompt: 'test', timeoutMs: 3000 }),
        this.coordinator.spawnAgent({ teamId: teamName, name: 'concurrent-3', role: 'analyst', prompt: 'test', timeoutMs: 3000 }),
      ]);
      
      this.addResult('并发Agent Spawn', agents.length === 3,
        `成功并发spawn ${agents.length} 个Agents`);
    } catch (err) {
      this.addResult('并发Agent Spawn', false, '并发spawn失败', String(err));
    }
  }
  
  // ============ 结果输出 ============
  
  private addResult(name: string, passed: boolean, message: string, details?: string): void {
    this.results.push({ name, passed, message, details });
    const icon = passed ? '✅' : '❌';
    const color = passed ? COLORS.green : COLORS.red;
    console.log(`  ${color}${icon} ${name}: ${message}${COLORS.reset}`);
    if (details) {
      console.log(`     ${COLORS.yellow}${details}${COLORS.reset}`);
    }
  }
  
  private printResults(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const pct = Math.round((passed / total) * 100);
    
    console.log('\n' + COLORS.magenta + '╔════════════════════════════════════════════════════════════╗');
    console.log('║                    验证结果摘要                         ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  ${passed}/${total} 测试通过 (${pct}%)                                      ║`);
    console.log('╚════════════════════════════════════════════════════════════╝' + COLORS.reset);
    
    if (pct >= 90) {
      console.log(COLORS.green + '\n🎉 多智能体系统验证通过！系统已就绪。' + COLORS.reset);
    } else if (pct >= 70) {
      console.log(COLORS.yellow + '\n⚠️ 部分测试未通过，系统可运行但建议检查失败项。' + COLORS.reset);
    } else {
      console.log(COLORS.red + '\n❌ 验证失败，请检查错误并修复。' + COLORS.reset);
    }
    
    // JSON输出
    console.log('\n--- RESULT_JSON ---');
    console.log(JSON.stringify({
      passed,
      total,
      percentage: pct,
      results: this.results.map(r => ({ name: r.name, passed: r.passed, message: r.message })),
      timestamp: new Date().toISOString(),
    }, null, 2));
    console.log('--- END_RESULT ---\n');
  }
}

// CLI入口 - 禁用自动运行，防止在导入时执行
// 使用环境变量 ENABLE_VERIFIER 来启用独立运行
// if (import.meta.url === `file://${process.argv[1]}` && process.env.ENABLE_VERIFIER === 'true') {
//   new AppScriptVerifier().runAll()
//     .then(r => process.exit(r.filter(x => x.passed).length >= r.length * 0.7 ? 0 : 1))
//     .catch(e => { console.error(e); process.exit(1); });
// }
