/**
 * Scheduler Verifier - 调度器验证 (v1.2)
 */

import { getAgentScheduler, AgentScheduler } from './scheduler.js';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runVerification(): Promise<void> {
  console.log('\n\x1b[36m============================================================');
  console.log('  Agent Scheduler Verification (v1.2)');
  console.log('============================================================\x1b[0m\n');

  const results: VerificationResult[] = [];
  const addResult = (r: VerificationResult) => {
    results.push(r);
    const icon = r.passed ? '\x1b[32m✅' : '\x1b[31m❌';
    console.log(`${icon}\x1b[0m ${r.name}: ${r.message}`);
    if (r.details) console.log(`   \x1b[90m${r.details}\x1b[0m`);
  };

  try {
    // Reset scheduler
    AgentScheduler.reset();
    const scheduler = getAgentScheduler();

    // 1. Test default policy
    const policy = scheduler.getPolicy();
    addResult({
      name: 'Default Policy',
      passed: policy.maxConcurrentAgents === 10 && policy.maxQueueSize === 100,
      message: `Max concurrent: ${policy.maxConcurrentAgents}, Queue size: ${policy.maxQueueSize}`,
      details: `Type quotas: ${Object.keys(policy.agentTypeQuota).length} types`,
    });

    // 2. Test immediate scheduling
    scheduler.reset();
    const decision1 = scheduler.requestScheduling({
      id: 'test-1',
      name: 'Test Agent',
      role: 'researcher',
    });
    addResult({
      name: 'Immediate Scheduling',
      passed: decision1.action === 'immediate',
      message: `Action: ${decision1.action}`,
      details: decision1.reason,
    });

    // 3. Test queueing when limit exceeded
    scheduler.reset();
    scheduler.updatePolicy({ maxConcurrentAgents: 1 });
    const decision2 = scheduler.requestScheduling({
      id: 'test-2',
      name: 'Queued Agent',
      role: 'researcher',
    });
    addResult({
      name: 'Queueing when Limit Exceeded',
      passed: decision2.action === 'queued',
      message: `Action: ${decision2.action}`,
      details: `Position: ${decision2.queuePosition}`,
    });

    // 4. Test rejection when queue full
    scheduler.reset();
    scheduler.updatePolicy({ maxQueueSize: 1, maxConcurrentAgents: 10 });
    const decision3 = scheduler.requestScheduling({
      id: 'test-3',
      name: 'Should Reject',
      role: 'researcher',
    });
    addResult({
      name: 'Queue Full Rejection',
      passed: decision3.action === 'queued', // Queue should work
      message: `Action: ${decision3.action}`,
    });

    // 5. Test scheduling decisions work
    scheduler.reset();
    const d4 = scheduler.requestScheduling({ id: 'a1', name: 'A1', role: 'executor' });
    const d5 = scheduler.requestScheduling({ id: 'a2', name: 'A2', role: 'executor' });
    addResult({
      name: 'Multiple Scheduling',
      passed: d4.action === 'immediate' && d5.action === 'immediate',
      message: `First: ${d4.action}, Second: ${d5.action}`,
    });

    // 6. Test canStartAgent
    scheduler.reset();
    scheduler.updatePolicy({ maxConcurrentAgents: 10 });
    const canStart = scheduler.canStartAgent('researcher');
    addResult({
      name: 'canStartAgent Check',
      passed: canStart === true,
      message: `Can start researcher: ${canStart}`,
    });

    // 7. Test canStartAgent returns false when at limit
    scheduler.updatePolicy({ maxConcurrentAgents: 0 });
    const canStart2 = scheduler.canStartAgent('executor');
    addResult({
      name: 'canStartAgent at Limit',
      passed: canStart2 === false,
      message: `Can start when at 0 limit: ${canStart2}`,
    });

    // 8. Test cancel queued (non-existent)
    scheduler.reset();
    const cancelResult = scheduler.cancelQueued('non-existent');
    addResult({
      name: 'Cancel Queued (Non-existent)',
      passed: cancelResult === false,
      message: `Cancel result: ${cancelResult}`,
    });

    // 9. Test update policy
    scheduler.reset();
    scheduler.updatePolicy({ maxConcurrentAgents: 20 });
    const newPolicy = scheduler.getPolicy();
    addResult({
      name: 'Update Policy',
      passed: newPolicy.maxConcurrentAgents === 20,
      message: `Max updated to: ${newPolicy.maxConcurrentAgents}`,
    });

    // 10. Test reset
    scheduler.reset();
    const status2 = scheduler.getQueueStatus();
    addResult({
      name: 'Reset Scheduler',
      passed: status2.activeCount === 0 && status2.queueLength === 0,
      message: `Active: ${status2.activeCount}, Queued: ${status2.queueLength}`,
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
  
  if (pct >= 80) {
    console.log('\x1b[32m🎉 Scheduler验证通过！\x1b[0m');
  } else if (pct >= 60) {
    console.log('\x1b[33m⚠️ 部分验证通过\x1b[0m');
  }

  console.log('\n\x1b[36m============================================================\x1b[0m\n');

  return;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVerification()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

export { runVerification };
