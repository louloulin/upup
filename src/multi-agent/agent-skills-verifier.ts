/**
 * Agent Skills Verifier - Agent配置Skills验证 (v1.1)
 */

import {
  getAgentLoader,
  resetAgentLoader,
  type MarkdownAgentDefinition,
} from './agent-loader.js';
import { getAllSpecializedSkills } from '../skills/bundled/index.js';
import { info } from '../utils/logging/logger.js';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runVerification(): Promise<void> {
  console.log('\n\x1b[36m============================================================');
  console.log('  Agent Skills Configuration Verification (v1.1)');
  console.log('============================================================\x1b[0m\n');

  const results: VerificationResult[] = [];
  const addResult = (r: VerificationResult) => {
    results.push(r);
    const icon = r.passed ? '\x1b[32m✅' : '\x1b[31m❌';
    console.log(`${icon}\x1b[0m ${r.name}: ${r.message}`);
    if (r.details) console.log(`   \x1b[90m${r.details}\x1b[0m`);
  };

  try {
    // Reset loader
    resetAgentLoader();
    const loader = getAgentLoader();

    // 1. Check available specialized skills
    const specializedSkills = getAllSpecializedSkills();
    addResult({
      name: 'Specialized Skills Available',
      passed: specializedSkills.length >= 5,
      message: `${specializedSkills.length} specialized skills`,
      details: specializedSkills.map(s => s.name).join(', '),
    });

    // 2. Load all agents
    const allAgents = loader.loadAll();
    addResult({
      name: 'Load All Agents',
      passed: allAgents.length >= 4,
      message: `Loaded ${allAgents.length} agents`,
    });

    // 3. Find agents with skills configured
    const agentsWithSkills = allAgents.filter(a => a.skills && a.skills.length > 0);
    addResult({
      name: 'Agents with Skills Config',
      passed: agentsWithSkills.length >= 2,
      message: `${agentsWithSkills.length} agents configured with skills`,
      details: agentsWithSkills.map(a => `${a.name}([${a.skills?.join(', ')}])`).join(', '),
    });

    // 4. Check skill parsing from frontmatter
    const finAgent = allAgents.find(a => a.name.toLowerCase().includes('financial'));
    addResult({
      name: 'Skills Parsing (Frontmatter)',
      passed: !!(finAgent?.skills && finAgent.skills.length >= 2),
      message: `Financial agent has ${finAgent?.skills?.length || 0} skills configured`,
      details: finAgent?.skills?.join(', ') || 'none',
    });

    // 5. Check skill references in agent prompts
    const agentWithDream = allAgents.find(a => 
      a.skills?.some(s => s.toLowerCase() === 'dream')
    );
    addResult({
      name: 'Skill Reference: dream',
      passed: !!agentWithDream,
      message: agentWithDream ? `Found in: ${agentWithDream.name}` : 'Not found',
    });

    const agentWithVerify = allAgents.find(a => 
      a.skills?.some(s => s.toLowerCase() === 'verify')
    );
    addResult({
      name: 'Skill Reference: verify',
      passed: !!agentWithVerify,
      message: agentWithVerify ? `Found in: ${agentWithVerify.name}` : 'Not found',
    });

    const agentWithHunter = allAgents.find(a => 
      a.skills?.some(s => s.toLowerCase() === 'hunter')
    );
    addResult({
      name: 'Skill Reference: hunter',
      passed: !!agentWithHunter,
      message: agentWithHunter ? `Found in: ${agentWithHunter.name}` : 'Not found',
    });

    // 6. Test getAgentsBySkill
    const dreamAgents = loader.getAgentsBySkill('dream');
    addResult({
      name: 'getAgentsBySkill(dream)',
      passed: dreamAgents.length > 0,
      message: `${dreamAgents.length} agents use dream skill`,
    });

    const verifyAgents = loader.getAgentsBySkill('verify');
    addResult({
      name: 'getAgentsBySkill(verify)',
      passed: verifyAgents.length > 0,
      message: `${verifyAgents.length} agents use verify skill`,
    });

    // 7. Test skill metadata integration
    const availableSkills = loader.getAvailableSkills();
    addResult({
      name: 'Available Skills Metadata',
      passed: availableSkills.length >= specializedSkills.length,
      message: `${availableSkills.length} skills with metadata`,
    });

    // 8. Test system prompt with skills section
    if (finAgent) {
      const promptWithSkills = loader.buildSystemPromptWithSkills(finAgent);
      addResult({
        name: 'System Prompt with Skills',
        passed: promptWithSkills.includes('Available Skills') || promptWithSkills.includes('/dream'),
        message: `Prompt length: ${promptWithSkills.length} chars`,
        details: promptWithSkills.includes('Available Skills') ? 'Skills section present' : 'No skills section',
      });
    }

    // 9. Register agents and verify
    const registered = loader.registerAll();
    addResult({
      name: 'Register Agents',
      passed: registered >= 4,
      message: `Registered ${registered} agents with skills`,
    });

    // 10. Verify agent types
    const types = new Set(allAgents.map(a => a.agentType));
    addResult({
      name: 'Agent Types',
      passed: types.size >= 4,
      message: `${types.size} unique agent types`,
      details: Array.from(types).filter(Boolean).join(', '),
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
    console.log('\x1b[32m🎉 Agent Skills配置验证通过！\x1b[0m');
  } else if (pct >= 70) {
    console.log('\x1b[33m⚠️ 部分验证通过\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 验证失败\x1b[0m');
  }

  // Show skill-agent mapping
  console.log('\n\x1b[36m=== Skill -> Agent Mapping ===\x1b[0m');
  const loader = getAgentLoader();
  const specializedSkills = getAllSpecializedSkills();
  for (const skill of specializedSkills) {
    const agents = loader.getAgentsBySkill(skill.name);
    if (agents.length > 0) {
      console.log(`  ${skill.name}: ${agents.map(a => a.name).join(', ')}`);
    }
  }

  console.log('\n\x1b[36m============================================================\x1b[0m');

  return;
}

// Run if executed directly - 禁用自动运行
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runVerification()
//     .then(() => process.exit(0))
//     .catch(e => { console.error(e); process.exit(1); });
// }

export { runVerification };
