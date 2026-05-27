/**
 * Test script to verify skill execution flow
 */

import { initializeSkills } from '../src/skills/commands.js';
import { getSkillCommandRegistry } from '../src/skills/slash-command.js';
import { executeSkillCommand } from '../src/skills/executor.js';

async function testSkillExecution() {
  console.log('[TEST] Starting skill execution test...\n');

  await initializeSkills();
  const registry = getSkillCommandRegistry();

  // Test a-share-fund via executeSkillCommand (full flow)
  console.log('[TEST] === Testing executeSkillCommand (full flow) ===\n');
  const result = await executeSkillCommand('a-share-fund', '搜索ETF', {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
    sessionId: 'test-session',
    model: 'haiku',
  });

  if (!result) {
    console.log('[TEST] ❌ executeSkillCommand returned null');
    return;
  }

  console.log('[TEST] Result type:', result.type);
  console.log('[TEST] Result text length:', result.text?.length || 0);

  if (result.type === 'query' && result.text) {
    console.log('\n[TEST] Query injection text (first 1000 chars):');
    console.log(result.text.slice(0, 1000));

    // Check if the prompt contains useful content
    if (result.text.includes('搜索ETF') && result.text.includes('Base directory')) {
      console.log('\n[TEST] ✅ Query contains skill prompt with args');
    }

    // Check for shell command results (real data)
    if (result.text.includes('{"') || result.text.includes('[') || result.text.includes('ETF')) {
      console.log('[TEST] ✅ Query may contain real data');
    } else {
      console.log('[TEST] ⚠️ Query may not contain real data - check shell command execution');
    }
  }

  console.log('\n\n[TEST] === Testing a-share-data ===\n');
  const dataResult = await executeSkillCommand('a-share-data', '贵州茅台', {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
    sessionId: 'test-session',
    model: 'haiku',
  });

  if (dataResult) {
    console.log('[TEST] Data result type:', dataResult.type);
    console.log('[TEST] Data result length:', dataResult.text?.length || 0);
  }
}

testSkillExecution().catch(console.error);