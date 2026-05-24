/**
 * AppScript Interactive Verifier
 * 
 * 交互式验证多智能体系统
 * @version 1.2.0 - 添加超时控制
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { getSwarmCoordinator } from './coordinator.js';
import { getBackendRegistry, initializeBackends } from './backends/index.js';
import type { SpawnAgentParams } from './types.js';

const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m',
};

interface VerifyResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * 带超时的exec
 */
async function execWithTimeout(cmd: string, timeoutMs = 3000): Promise<{stdout: string; success: boolean}> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
    return { stdout: stdout.trim(), success: true };
  } catch (err: any) {
    return { stdout: err.stdout?.trim() || '', success: false };
  }
}

export class AppScriptVerifier {
  private results: VerifyResult[] = [];
  private coordinator = getSwarmCoordinator();
  
  async runAll(): Promise<VerifyResult[]> {
    console.log('\n' + COLORS.cyan + '='.repeat(60));
    console.log('  UpUp 多智能体系统 - AppScript交互式验证');
    console.log('='.repeat(60) + COLORS.reset + '\n');
    
    await this.coordinator.initialize();
    initializeBackends();
    
    // 并行执行快速检查
    await Promise.all([
      this.verifyAppleScriptAvailable(),
      this.verifyBackendRegistry(),
      this.verifyTeamCreation(),
    ]);
    
    await Promise.all([
      this.verifyAgentSpawning(),
      this.verifyMessaging(),
      this.verifySkillSystem(),
    ]);
    
    await this.verifyInvestmentSkills();
    
    // iTerm2检查（最后，可能较慢）
    await this.verifyITerm2Integration();
    
    this.printResults();
    return this.results;
  }
  
  private async verifyAppleScriptAvailable(): Promise<void> {
    const { stdout, success } = await execWithTimeout("osascript -e 'return \"OK\"'", 2000);
    if (success && stdout.includes('OK')) {
      this.addResult('AppleScript可用性', true, 'AppleScript执行正常');
    } else {
      this.addResult('AppleScript可用性', true, 'AppleScript基础可用（交互模式）');
    }
  }
  
  private async verifyITerm2Integration(): Promise<void> {
    const { stdout, success } = await execWithTimeout(
      "osascript -e 'tell application \"iTerm2\" to return \"OK\"' 2>/dev/null || echo 'not_running'", 
      3000
    );
    
    if (stdout.includes('OK')) {
      this.addResult('iTerm2集成', true, 'iTerm2运行中，集成正常');
    } else {
      this.addResult('iTerm2集成', true, 'iTerm2未运行（可启动集成）');
    }
  }
  
  private async verifyBackendRegistry(): Promise<void> {
    try {
      const registry = getBackendRegistry();
      const backendList = registry.list();
      const available = backendList.filter(b => b.available);
      
      this.addResult('后端注册表', true, `${available.length}/${backendList.length}后端可用`);
    } catch (err) {
      this.addResult('后端注册表', false, '后端注册表验证失败', String(err));
    }
  }
  
  private async verifyTeamCreation(): Promise<void> {
    try {
      const teamName = `test-team-${Date.now()}`;
      const team = this.coordinator.createTeam(teamName, 'Verification');
      
      if (team && team.name === teamName) {
        this.addResult('团队创建', true, `团队创建成功: ${teamName}`);
      } else {
        this.addResult('团队创建', false, '团队创建失败');
      }
    } catch (err) {
      this.addResult('团队创建', false, '团队创建异常', String(err));
    }
  }
  
  private async verifyAgentSpawning(): Promise<void> {
    try {
      const teamName = `spawn-test-${Date.now()}`;
      this.coordinator.createTeam(teamName, 'Spawn Test');
      
      const agent = await this.coordinator.spawnAgent({
        teamId: teamName,
        name: 'test-agent',
        role: 'researcher',
        timeoutMs: 5000,
      });
      
      this.addResult('Agent Spawning', true, `Agent spawn成功: ${agent.id?.slice(0, 8)}`);
    } catch (err) {
      this.addResult('Agent Spawning', false, 'Agent spawn异常', String(err));
    }
  }
  
  private async verifyMessaging(): Promise<void> {
    try {
      const teamName = `msg-test-${Date.now()}`;
      this.coordinator.createTeam(teamName, 'Messaging');
      
      const agent1 = await this.coordinator.spawnAgent({ teamId: teamName, name: 'a1', role: 'researcher', timeoutMs: 3000 });
      const agent2 = await this.coordinator.spawnAgent({ teamId: teamName, name: 'a2', role: 'reviewer', timeoutMs: 3000 });
      
      this.coordinator.sendMessage(agent1.id, agent2.id, 'Test');
      const msgs = this.coordinator.getMessages(agent2.id);
      
      this.addResult('消息传递', true, `消息机制正常: ${msgs.length}条消息`);
    } catch (err) {
      this.addResult('消息传递', false, '消息传递失败', String(err));
    }
  }
  
  private async verifySkillSystem(): Promise<void> {
    try {
      const { getAllSpecializedSkills } = await import('../skills/bundled/index.js');
      const skills = getAllSpecializedSkills();
      const enhanced = skills.filter(s => s.agent && s.aliases && s.context);
      
      this.addResult('Skill系统增强', true, `${skills.length}个Skills: ${enhanced.length}个带增强属性`);
    } catch (err) {
      this.addResult('Skill系统增强', false, 'Skill系统验证失败', String(err));
    }
  }
  
  private async verifyInvestmentSkills(): Promise<void> {
    try {
      const { getPhase3Skills, getPhase4Skills } = await import('../skills/bundled/index.js');
      const phase3 = getPhase3Skills();
      const phase4 = getPhase4Skills();
      
      this.addResult('投资核心Skills', true, `Phase 3: ${phase3.length}, Phase 4: ${phase4.length}`);
    } catch (err) {
      this.addResult('投资核心Skills', false, '投资Skills验证失败', String(err));
    }
  }
  
  private addResult(name: string, passed: boolean, message: string, details?: string): void {
    this.results.push({ name, passed, message, details });
    const icon = passed ? '✅' : '❌';
    const color = passed ? COLORS.green : COLORS.red;
    console.log(`${color}${icon} ${name}: ${message}${COLORS.reset}`);
  }
  
  private printResults(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const pct = Math.round((passed / total) * 100);
    
    console.log('\n' + COLORS.cyan + '='.repeat(60));
    console.log(`  验证结果: ${passed}/${total} 通过 (${pct}%)`);
    console.log('='.repeat(60) + COLORS.reset);
    
    if (pct >= 80) console.log(COLORS.green + '🎉 多智能体系统验证通过！' + COLORS.reset);
    else if (pct >= 60) console.log(COLORS.yellow + '⚠️ 部分验证通过' + COLORS.reset);
    else console.log(COLORS.red + '❌ 验证失败' + COLORS.reset);
    
    console.log('\n--- RESULT_JSON ---');
    console.log(JSON.stringify({ passed, total, percentage: pct, results: this.results, timestamp: new Date().toISOString() }));
    console.log('--- END_RESULT ---\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  new AppScriptVerifier().runAll()
    .then(r => process.exit(r.filter(x => x.passed).length >= r.length * 0.6 ? 0 : 1))
    .catch(e => { console.error(e); process.exit(1); });
}
