/**
 * Full System Verifier - 完整系统验证 (v2.1)
 */

import { getSwarmCoordinator } from './coordinator.js';
import { getBackendRegistry, initializeBackends } from './backends/index.js';
import { getMultiAgentMonitor } from './monitor.js';
import { getSkillTracker } from './skill-tracker.js';
import { getBackendHealthChecker } from './backends/health-check.js';
import { getPiAgentRegistry } from './agent-registry.js';
import { getAgentLoader } from './agent-loader.js';
import { getAllSpecializedSkills } from '../skills/bundled/index.js';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runFullVerification(): Promise<void> {
  console.log('\n\x1b[35m============================================================');
  console.log('  UpUp 多智能体系统 - 完整综合验证 (v2.1)');
  console.log('============================================================\x1b[0m\n');

  const allResults: VerificationResult[] = [];

  // Initialize
  try {
    initializeBackends();
    const coordinator = getSwarmCoordinator();
    await coordinator.initialize();
  } catch (e) {
    console.error('Initialization error:', e);
  }

  // ========================================================================
  // Core System
  // ========================================================================
  console.log('\n\x1b[36m=== Core System ===\x1b[0m');

  // Backend Registry
  try {
    const registry = getBackendRegistry();
    const backends = registry.getAll();
    const available = backends.filter(b => {
      try { return b.isAvailable(); } catch { return false; }
    }).length;
    allResults.push({
      name: 'Backend Registry',
      passed: backends.length >= 4,
      message: `${available}/${backends.length} backends available`,
      details: backends.map(b => b.type).join(', '),
    });
  } catch (e) {
    allResults.push({ name: 'Backend Registry', passed: false, message: `Error: ${e}` });
  }

  // Team Manager & Agent Spawning
  try {
    const coordinator = getSwarmCoordinator();
    const teamName = `verify-team-${Date.now()}`;
    const team = coordinator.createTeam(teamName, 'Verification team');
    allResults.push({
      name: 'Team Creation',
      passed: !!team,
      message: `Team created: ${team.name}`,
    });

    // Agent Spawning - use same team
    const agent = await coordinator.spawnAgent({
      teamId: teamName,  // Use the same team name
      name: 'test-agent',
      role: 'researcher',
      prompt: 'Test',
    });
    allResults.push({
      name: 'Agent Spawning',
      passed: !!agent.id,
      message: `Agent spawned: ${agent.id.slice(0, 8)}`,
      details: `Status: ${agent.status}`,
    });
  } catch (e) {
    allResults.push({ name: 'Team/Agent', passed: false, message: `Error: ${e}` });
  }

  // AppleScript
  try {
    const { execSync } = require('child_process');
    const result = execSync('osascript -e "return 1+1"', { encoding: 'utf8' });
    allResults.push({
      name: 'AppleScript',
      passed: result.trim() === '2',
      message: 'AppleScript working',
    });
  } catch {
    allResults.push({ name: 'AppleScript', passed: false, message: 'Not available' });
  }

  // ========================================================================
  // Monitoring & Health
  // ========================================================================
  console.log('\n\x1b[36m=== Monitoring & Health ===\x1b[0m');

  try {
    const monitor = getMultiAgentMonitor();
    monitor.start();
    const metrics = monitor.getSystemMetrics();
    allResults.push({
      name: 'MultiAgent Monitor',
      passed: !!metrics,
      message: `${metrics.totalAgents} agents, ${metrics.eventsPerSecond.toFixed(2)} events/s`,
      details: `Teams: ${metrics.teamsCount}`,
    });
  } catch (e) {
    allResults.push({ name: 'MultiAgent Monitor', passed: false, message: `Error: ${e}` });
  }

  try {
    const tracker = getSkillTracker();
    const execId = tracker.trackExecutionStart('dream', { test: true });
    tracker.trackExecutionComplete(execId, 'Test result');
    const stats = tracker.getSkillStats('dream') as { totalExecutions: number; averageDurationMs: number };
    allResults.push({
      name: 'Skill Tracker',
      passed: stats.totalExecutions > 0,
      message: `${stats.totalExecutions} executions, ${stats.averageDurationMs.toFixed(0)}ms avg`,
    });
  } catch (e) {
    allResults.push({ name: 'Skill Tracker', passed: false, message: `Error: ${e}` });
  }

  try {
    const healthChecker = getBackendHealthChecker();
    healthChecker.start();
    await new Promise(r => setTimeout(r, 500));
    const health = healthChecker.getAllHealth();
    const healthyCount = Array.from(health.values()).filter(r => r.healthy).length;
    allResults.push({
      name: 'Backend Health',
      passed: healthyCount > 0,
      message: `${healthyCount}/${health.size} backends healthy`,
    });
  } catch (e) {
    allResults.push({ name: 'Backend Health', passed: false, message: `Error: ${e}` });
  }

  // ========================================================================
  // Pi Agents
  // ========================================================================
  console.log('\n\x1b[36m=== Pi Agents ===\x1b[0m');

  try {
    const registry = getPiAgentRegistry();
    const templates = registry.getTemplates();
    allResults.push({
      name: 'Agent Templates',
      passed: templates.length >= 5,
      message: `${templates.length} templates`,
      details: templates.map(t => t.name).join(', '),
    });

    const custom = registry.register({
      id: 'test-agent-' + Date.now(),
      name: 'Test Agent',
      description: 'Test description',
      systemPrompt: 'You are a test agent.',
      agentType: 'researcher',
      context: 'fork',
    });
    allResults.push({
      name: 'Pi Agent Creation',
      passed: !!custom,
      message: `Created: ${custom.name}`,
      details: `Type: ${custom.agentType}`,
    });

    const researchers = registry.getAgentsByType('researcher');
    allResults.push({
      name: 'Filter by Type',
      passed: researchers.length > 0,
      message: `${researchers.length} researcher agents`,
    });

    const exported = registry.exportConfig();
    allResults.push({
      name: 'Export Config',
      passed: exported.length > 0,
      message: `Exported ${exported.length} agents`,
    });
  } catch (e) {
    allResults.push({ name: 'Pi Agents', passed: false, message: `Error: ${e}` });
  }

  // ========================================================================
  // Markdown Loader
  // ========================================================================
  console.log('\n\x1b[36m=== Markdown Agent Loader ===\x1b[0m');

  try {
    const loader = getAgentLoader();
    const allAgents = loader.loadAll();
    allResults.push({
      name: 'Load All Agents',
      passed: allAgents.length >= 4,
      message: `Loaded ${allAgents.length} agents`,
    });

    const globalAgents = loader.getAgentsByScope('global');
    allResults.push({
      name: 'Global Agents',
      passed: globalAgents.length >= 1,
      message: `${globalAgents.length} global agents`,
    });

    const projectAgents = loader.getAgentsByScope('project');
    allResults.push({
      name: 'Project Agents',
      passed: projectAgents.length >= 1,
      message: `${projectAgents.length} project agents`,
    });

    const contexts = new Set(allAgents.map(a => a.context).filter(Boolean));
    allResults.push({
      name: 'Context Modes',
      passed: contexts.size >= 2,
      message: `${contexts.size} context modes`,
      details: Array.from(contexts).join(', '),
    });
  } catch (e) {
    allResults.push({ name: 'Markdown Loader', passed: false, message: `Error: ${e}` });
  }

  // ========================================================================
  // Agent Skills
  // ========================================================================
  console.log('\n\x1b[36m=== Agent Skills Integration ===\x1b[0m');

  try {
    const bundledSkills = getAllSpecializedSkills();
    allResults.push({
      name: 'Bundled Skills',
      passed: bundledSkills.length >= 5,
      message: `${bundledSkills.length} bundled skills`,
      details: bundledSkills.map(s => s.name).join(', '),
    });

    const loader = getAgentLoader();
    const agentsWithSkills = loader.getAllAgents().filter(a => a.skills && a.skills.length > 0);
    allResults.push({
      name: 'Agents with Skills',
      passed: agentsWithSkills.length >= 1,
      message: `${agentsWithSkills.length} agents with skills`,
    });

    const dreamAgents = loader.getAgentsBySkill('dream');
    allResults.push({
      name: 'getAgentsBySkill(dream)',
      passed: dreamAgents.length > 0,
      message: `${dreamAgents.length} agents use dream`,
    });

    const availableSkills = loader.getAvailableSkills();
    allResults.push({
      name: 'Skills Metadata',
      passed: availableSkills.length >= bundledSkills.length,
      message: `${availableSkills.length} skills with metadata`,
    });
  } catch (e) {
    allResults.push({ name: 'Agent Skills', passed: false, message: `Error: ${e}` });
  }

  // ========================================================================
  // Print Summary
  // ========================================================================
  console.log('\n\x1b[35m============================================================\x1b[0m');
  
  const passed = allResults.filter(r => r.passed).length;
  const total = allResults.length;
  const pct = Math.round((passed / total) * 100);
  
  const statusColor = pct >= 90 ? '\x1b[32m' : pct >= 70 ? '\x1b[33m' : '\x1b[31m';
  
  console.log(`\n${statusColor}验证结果: ${passed}/${total} 通过 (${pct}%)\x1b[0m`);
  
  if (pct >= 90) {
    console.log('\x1b[32m🎉 多智能体系统验证通过！\x1b[0m');
  }

  // Show failed tests
  const failed = allResults.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log('\n\x1b[31mFailed Tests:\x1b[0m');
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.message}`);
    }
  }

  console.log('\n\x1b[35m============================================================\x1b[0m\n');

  return;
}

// Run if executed directly - 禁用自动运行
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runFullVerification()
//     .then(() => process.exit(0))
//     .catch(e => { console.error(e); process.exit(1); });
// }

export { runFullVerification };
