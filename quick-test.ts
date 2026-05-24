#!/usr/bin/env bun
// 快速验证多智能体系统基本功能

import { initializeBackends } from './src/multi-agent/backends/initialize.js';
import { getBackendRegistry } from './src/multi-agent/backends/index.js';
import { getAgentLoader } from './src/multi-agent/agent-loader.js';
import { getAgentScheduler } from './src/multi-agent/scheduler.js';
import { getAllSpecializedSkills } from './src/skills/bundled/index.js';

console.log('\n\x1b[36m=== Quick System Test ===\x1b[0m\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`\x1b[32m✅ ${name}\x1b[0m`);
    passed++;
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m: ${e}`);
    failed++;
  }
}

// Initialize first
initializeBackends();

// 1. Backend Registry
test('Backend Registry', () => {
  const registry = getBackendRegistry();
  const backends = registry.getAll();
  if (backends.length < 4) throw new Error(`Expected 4 backends, got ${backends.length}`);
});

// 2. Skills
test('Bundled Skills', () => {
  const skills = getAllSpecializedSkills();
  if (skills.length < 5) throw new Error(`Expected 5+ skills, got ${skills.length}`);
});

// 3. Agent Loader
test('Agent Loader', () => {
  const loader = getAgentLoader();
  const agents = loader.loadAll();
  if (agents.length < 4) throw new Error(`Expected 4+ agents, got ${agents.length}`);
});

// 4. Scheduler
test('Scheduler', () => {
  const scheduler = getAgentScheduler();
  const policy = scheduler.getPolicy();
  if (policy.maxConcurrentAgents !== 10) throw new Error(`Expected maxConcurrent=10`);
});

// 5. Skills metadata
test('Skills Metadata', () => {
  const loader = getAgentLoader();
  const skills = loader.getAvailableSkills();
  if (skills.length < 5) throw new Error(`Expected 5+ skills metadata`);
});

console.log(`\n\x1b[36m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m\n`);
process.exit(failed > 0 ? 1 : 0);
