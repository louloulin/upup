/**
 * Custom Agent Verifier - 自定义Agent系统验证
 */

import {
  getCustomAgentRegistry,
  getSwarmCoordinator,
} from './index.js';
import { info } from '@upup/utils/logging';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runVerification(): Promise<void> {
  console.log('\n\x1b[36m============================================================');
  console.log('  Custom Agent System Verification (v1.0)');
  console.log('============================================================\x1b[0m\n');

  const results: VerificationResult[] = [];
  const addResult = (r: VerificationResult) => {
    results.push(r);
    const icon = r.passed ? '\x1b[32m✅' : '\x1b[31m❌';
    console.log(`${icon}\x1b[0m ${r.name}: ${r.message}`);
    if (r.details) console.log(`   \x1b[90m${r.details}\x1b[0m`);
  };

  try {
    // Initialize registry
    const registry = getCustomAgentRegistry();

    // 1. Test templates
    const templates = registry.getTemplates();
    addResult({
      name: 'Agent Templates',
      passed: templates.length >= 5,
      message: `${templates.length} templates available`,
      details: templates.map(t => t.name).join(', '),
    });

    // 2. Test custom agent creation
    const customAgent = registry.register({
      id: 'test-custom-agent',
      name: 'Test Custom Agent',
      description: 'A test custom agent',
      systemPrompt: 'You are a test agent. Role: {role}',
      agentType: 'researcher',
      context: 'fork',
      variables: { role: 'tester' },
      maxIterations: 5,
    });
    addResult({
      name: 'Custom Agent Creation',
      passed: !!customAgent,
      message: `Created: ${customAgent.name}`,
      details: `Type: ${customAgent.agentType}, Context: ${customAgent.context}`,
    });

    // 3. Test template-based creation
    const templateAgent = registry.createFromTemplate('financial-researcher', {
      name: 'Stock Analyst',
      description: 'Analyzes stock data',
    });
    addResult({
      name: 'Template-based Creation',
      passed: !!templateAgent,
      message: `Created from template: ${templateAgent?.name}`,
      details: templateAgent?.id,
    });

    // 4. Test agent retrieval
    const retrievedAgent = registry.getAgent('test-custom-agent');
    addResult({
      name: 'Agent Retrieval',
      passed: !!retrievedAgent,
      message: retrievedAgent ? 'Agent found' : 'Agent not found',
      details: retrievedAgent?.systemPrompt.slice(0, 50) + '...',
    });

    // 5. Test filtering by type
    const researcherAgents = registry.getAgentsByType('researcher');
    addResult({
      name: 'Filter by Type',
      passed: researcherAgents.length > 0,
      message: `${researcherAgents.length} researcher agents`,
    });

    // 6. Test usage recording
    registry.recordUsage('test-custom-agent');
    const afterUsage = registry.getAgent('test-custom-agent');
    addResult({
      name: 'Usage Recording',
      passed: (afterUsage?.usageCount || 0) > 0,
      message: `Usage count: ${afterUsage?.usageCount}`,
    });

    // 7. Test team integration
    const coordinator = getSwarmCoordinator();
    await coordinator.initialize();
    const teamName = `custom-agent-team-${Date.now()}`;
    const team = coordinator.createTeam(teamName, 'Custom agent test team');
    addResult({
      name: 'Team Integration',
      passed: !!team,
      message: `Team created: ${team.name}`,
    });

    // 8. Test export/import
    const exported = registry.exportConfig();
    addResult({
      name: 'Export Config',
      passed: exported.length > 0,
      message: `Exported ${exported.length} agents`,
    });

    // 9. Test agent deletion
    const deleted = registry.unregister('test-custom-agent');
    addResult({
      name: 'Agent Deletion',
      passed: deleted,
      message: deleted ? 'Agent deleted' : 'Agent not found',
    });

    // 10. Test template categories
    const researchTemplates = registry.getTemplatesByCategory('research');
    const analysisTemplates = registry.getTemplatesByCategory('analysis');
    addResult({
      name: 'Template Categories',
      passed: researchTemplates.length > 0 && analysisTemplates.length > 0,
      message: `Research: ${researchTemplates.length}, Analysis: ${analysisTemplates.length}`,
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
    console.log('\x1b[32m🎉 Custom Agent系统验证通过！\x1b[0m');
  } else if (pct >= 70) {
    console.log('\x1b[33m⚠️ 部分验证通过\x1b[0m');
  } else {
    console.log('\x1b[31m❌ 验证失败\x1b[0m');
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
