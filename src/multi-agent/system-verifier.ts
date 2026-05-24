/**
 * System Verifier - 新增系统功能验证
 */

import { getAgentScheduler, AgentScheduler } from './scheduler.js';
import { getLifecycleManager, AgentLifecycleManager } from './lifecycle.js';
import { getEventBus, AgentEventBus } from './event-bus.js';
import { getAgentPersistence, AgentPersistence } from './persistence.js';

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

async function runVerification(): Promise<void> {
  console.log('\n\x1b[36m============================================================');
  console.log('  New System Features Verification (v1.0)');
  console.log('============================================================\x1b[0m\n');

  const results: VerificationResult[] = [];
  const addResult = (r: VerificationResult) => {
    results.push(r);
    const icon = r.passed ? '\x1b[32m✅' : '\x1b[31m❌';
    console.log(`${icon}\x1b[0m ${r.name}: ${r.message}`);
    if (r.details) console.log(`   \x1b[90m${r.details}\x1b[0m`);
  };

  try {
    // ========================================================================
    // Lifecycle Manager
    // ========================================================================
    AgentLifecycleManager.reset();
    const lifecycle = getLifecycleManager();

    addResult({
      name: 'Lifecycle Manager Instance',
      passed: !!lifecycle,
      message: 'Lifecycle manager created',
    });

    // Test state transitions
    const canTransition1 = lifecycle.canTransition('agent-1', 'created');
    addResult({
      name: 'State: New -> Created',
      passed: canTransition1,
      message: `Can create: ${canTransition1}`,
    });

    // Test transition
    await lifecycle.transition('agent-1', 'Test Agent', 'created');
    const state = lifecycle.getState('agent-1');
    addResult({
      name: 'State Transition',
      passed: state === 'created',
      message: `State: ${state}`,
    });

    // Test history
    const history = lifecycle.getHistory('agent-1');
    addResult({
      name: 'Lifecycle History',
      passed: history.length >= 1,
      message: `History entries: ${history.length}`,
    });

    // Test listener
    let listenerCalled = false;
    lifecycle.addListener(() => { listenerCalled = true; });
    await lifecycle.transition('agent-1', 'Test Agent', 'running');
    addResult({
      name: 'Lifecycle Listener',
      passed: listenerCalled,
      message: `Listener called: ${listenerCalled}`,
    });

    // ========================================================================
    // Event Bus
    // ========================================================================
    AgentEventBus.reset();
    const eventBus = getEventBus();

    addResult({
      name: 'Event Bus Instance',
      passed: !!eventBus,
      message: 'Event bus created',
    });

    // Test subscribe
    let eventReceived = false;
    const unsubscribe = eventBus.subscribe((e) => {
      if (e.type === 'test.event') eventReceived = true;
    });
    addResult({
      name: 'Event Subscribe',
      passed: eventBus.getSubscriberCount() >= 1,
      message: `Subscribers: ${eventBus.getSubscriberCount()}`,
    });

    // Test publish
    await eventBus.publish('test.event', 'test-source', { data: 'test' });
    addResult({
      name: 'Event Publish',
      passed: eventReceived,
      message: `Event received: ${eventReceived}`,
    });

    // Test unsubscribe
    unsubscribe();
    addResult({
      name: 'Event Unsubscribe',
      passed: eventBus.getSubscriberCount() === 0,
      message: `Subscribers after unsubscribe: ${eventBus.getSubscriberCount()}`,
    });

    // Test history
    const eventHistory = eventBus.getHistory();
    addResult({
      name: 'Event History',
      passed: eventHistory.length >= 1,
      message: `Events in history: ${eventHistory.length}`,
    });

    // ========================================================================
    // Persistence
    // ========================================================================
    AgentPersistence.reset();
    const persistence = getAgentPersistence();

    addResult({
      name: 'Persistence Instance',
      passed: !!persistence,
      message: 'Persistence manager created',
    });

    // Test save snapshot
    const snapshot = persistence.saveSnapshot('agent-1', 'Test Agent', 'running', { data: 'test' });
    addResult({
      name: 'Save Snapshot',
      passed: !!snapshot.id,
      message: `Snapshot ID: ${snapshot.id.slice(0, 8)}`,
    });

    // Test load snapshot
    const loaded = persistence.loadSnapshot('agent-1');
    addResult({
      name: 'Load Snapshot',
      passed: loaded?.agentId === 'agent-1',
      message: `Loaded: ${loaded?.name}`,
    });

    // Test stats
    const stats = persistence.getStats();
    addResult({
      name: 'Persistence Stats',
      passed: stats.total >= 1,
      message: `Total: ${stats.total}, Dirty: ${stats.dirtyCount}`,
    });

    // ========================================================================
    // Scheduler (re-verify)
    // ========================================================================
    AgentScheduler.reset();
    const scheduler = getAgentScheduler();

    addResult({
      name: 'Scheduler Instance',
      passed: !!scheduler,
      message: 'Scheduler available',
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
    console.log('\x1b[32m🎉 新系统功能验证通过！\x1b[0m');
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
