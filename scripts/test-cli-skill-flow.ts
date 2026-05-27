/**
 * Test the exact CLI skill flow
 * Simulates what happens when user types: /a-share-fund 搜索基金
 */

import { initializeSkills } from '../src/skills/commands.js';
import { getSkillCommandRegistry } from '../src/skills/slash-command.js';
import { executeSkillCommand } from '../src/skills/executor.js';

async function testCliSkillFlow() {
  console.log('=== CLI Skill Flow Test ===\n');

  // Initialize skills
  await initializeSkills();
  const registry = getSkillCommandRegistry();

  // Simulate what happens when user types: /a-share-fund 搜索基金
  const input = '/a-share-fund 搜索基金';
  console.log(`Input: "${input}"`);

  // Parse like cli.ts does
  const rawCommand = input.slice(1).trim(); // Remove leading /
  const spaceIdx = rawCommand.indexOf(' ');
  const commandName = spaceIdx === -1 ? rawCommand : rawCommand.slice(0, spaceIdx);
  const commandArgs = spaceIdx === -1 ? '' : rawCommand.slice(spaceIdx + 1).trim();

  console.log(`\nParsed:`);
  console.log(`  commandName: "${commandName}"`);
  console.log(`  commandArgs: "${commandArgs}"`);

  // Check if skill exists in registry
  console.log(`\n[Step 1] Checking registry...`);
  const skillCmd = registry.getSkillCommand(commandName);
  console.log(`  Skill found: ${!!skillCmd}`);
  if (skillCmd) {
    console.log(`  Skill name: ${skillCmd.name}`);
    console.log(`  Skill type: ${skillCmd.type}`);
  }

  // List all registered skills (for debugging)
  const allSkills = registry.getAllSkillCommands();
  console.log(`\n[Step 2] Total registered skills: ${allSkills.length}`);
  const shareSkills = allSkills.filter(s => s.name.includes('share') || s.name.includes('fund'));
  console.log(`  Share/Fund skills: ${shareSkills.map(s => s.name).join(', ')}`);

  // Execute the skill command (like handleSlashCommand does)
  console.log(`\n[Step 3] Calling executeSkillCommand...`);
  try {
    const result = await executeSkillCommand(commandName, commandArgs, {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      sessionId: 'test-session',
      model: 'haiku',
    });

    console.log(`\n[Step 4] Result:`);
    console.log(`  result is null: ${result === null}`);
    if (result) {
      console.log(`  type: ${result.type}`);
      console.log(`  text length: ${result.text?.length || 0}`);
      console.log(`  first 300 chars: ${result.text?.slice(0, 300)}`);
    }
  } catch (error) {
    console.error(`\n[Step 4] Error:`, error);
  }

  console.log('\n=== Test Complete ===');
}

testCliSkillFlow().catch(console.error);