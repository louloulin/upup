/**
 * Markdown Agent Loader Verifier - Markdown加载验证
 */

import {
  getAgentLoader,
  resetAgentLoader,
} from './agent-loader.js';
import { getCustomAgentRegistry } from './agent-registry.js';
import { info } from '../utils/logging/logger.js';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runVerification(): Promise<void> {
  console.log('\n\x1b[36m============================================================');
  console.log('  Markdown Agent Loader Verification (v1.0)');
  console.log('============================================================\x1b[0m\n');

  const results: VerificationResult[] = [];
  const addResult = (r: VerificationResult) => {
    results.push(r);
    const icon = r.passed ? '\x1b[32m✅' : '\x1b[31m❌';
    console.log(`${icon}\x1b[0m ${r.name}: ${r.message}`);
    if (r.details) console.log(`   \x1b[90m${r.details}\x1b[0m`);
  };

  try {
    // Reset loader for clean state
    resetAgentLoader();
    
    // Create loader
    const loader = getAgentLoader({
      enableGlobal: true,
      enableProject: true,
      autoRegister: true,
    });

    // 1. Test global directory setup
    const globalDir = loader.getGlobalDir();
    addResult({
      name: 'Global Directory',
      passed: true,
      message: `Global agents dir: ${globalDir}`,
      details: '~/.upup/agents/',
    });

    // 2. Test project directories
    const projectDirs = loader.getProjectDirs();
    addResult({
      name: 'Project Directories',
      passed: projectDirs.length === 2,
      message: `Project dirs: ${projectDirs.join(', ')}`,
    });

    // 3. Load all agents
    const allAgents = loader.loadAll();
    addResult({
      name: 'Load All Agents',
      passed: allAgents.length >= 4,
      message: `Loaded ${allAgents.length} agents`,
      details: allAgents.map(a => `${a.name}(${a.scope})`).join(', '),
    });

    // 4. Check global agents
    const globalAgents = loader.getAgentsByScope('global');
    addResult({
      name: 'Global Agents',
      passed: globalAgents.length >= 2,
      message: `${globalAgents.length} global agents`,
      details: globalAgents.map(a => a.name).join(', '),
    });

    // 5. Check project agents
    const projectAgents = loader.getAgentsByScope('project');
    addResult({
      name: 'Project Agents',
      passed: projectAgents.length >= 2,
      message: `${projectAgents.length} project agents`,
      details: projectAgents.map(a => a.name).join(', '),
    });

    // 6. Test agent properties
    const finResearcher = allAgents.find(a => a.name.toLowerCase().includes('financial'));
    addResult({
      name: 'Agent Properties',
      passed: !!finResearcher && !!finResearcher.agentType && !!finResearcher.systemPrompt,
      message: `Financial Researcher: type=${finResearcher?.agentType}, context=${finResearcher?.context}`,
      details: `Tools: ${finResearcher?.tools?.join(', ') || 'none'}`,
    });

    // 7. Test system prompt parsing
    addResult({
      name: 'System Prompt Parsing',
      passed: !!finResearcher?.systemPrompt && finResearcher.systemPrompt.length > 20,
      message: `Prompt length: ${finResearcher?.systemPrompt?.length || 0} chars`,
      details: finResearcher?.systemPrompt?.slice(0, 80) + '...',
    });

    // 8. Register all agents
    const registered = loader.registerAll();
    addResult({
      name: 'Register Agents',
      passed: registered >= 4,
      message: `Registered ${registered} agents`,
    });

    // 9. Verify registry integration
    const registry = getCustomAgentRegistry();
    const customAgents = registry.getAllAgents();
    addResult({
      name: 'Registry Integration',
      passed: customAgents.length >= 4,
      message: `Registry has ${customAgents.length} agents`,
    });

    // 10. Test reload
    const reloaded = loader.reload();
    addResult({
      name: 'Reload Agents',
      passed: reloaded.length >= 4,
      message: `Reloaded ${reloaded.length} agents`,
    });

    // 11. Check agent types
    const types = new Set(allAgents.map(a => a.agentType));
    addResult({
      name: 'Agent Types',
      passed: types.size >= 3,
      message: `${types.size} unique agent types`,
      details: Array.from(types).filter(Boolean).join(', '),
    });

    // 12. Test context modes
    const contexts = new Set(allAgents.map(a => a.context));
    addResult({
      name: 'Context Modes',
      passed: contexts.size >= 2,
      message: `${contexts.size} context modes`,
      details: Array.from(contexts).filter(Boolean).join(', '),
    });

  } catch (error) {
    addResult({
      name: 'Error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const pct = Math.round((passed / total) * 100);

  console.log('\n\x1b[36m============================================================\x1b[0m');
  console.log(`\x1b[32m验证结果: ${passed}/${total} 通过 (${pct}%)\x1b[0m`);
  
  if (pct >= 90) {
    console.log('\x1b[32m🎉 Markdown Agent Loader验证通过！\x1b[0m');
  } else if (pct >= 70) {
    console.log('\x1b[33m⚠️ 部分验证通过\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 验证失败\x1b[0m');
  }

  console.log('\n\x1b[36m============================================================\x1b[0m');
  console.log('\nLoaded agent files:');
  console.log('  Global: ~/.upup/agents/*.md');
  console.log('  Project: ./.agents/*.md or ./agents/*.md');

  return;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVerification()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

export { runVerification };
