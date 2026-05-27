/**
 * Quick test to verify skill execution
 */

import { initializeSkills } from '../src/skills/commands.js';
import { getSkillCommandRegistry } from '../src/skills/slash-command.js';

async function main() {
  console.log('=== Skill Execution Test ===\n');

  await initializeSkills();

  const registry = getSkillCommandRegistry();

  // Check if a-share-fund exists
  const fundCmd = registry.getSkillCommand('a-share-fund');
  console.log('a-share-fund registered:', !!fundCmd);

  if (!fundCmd) {
    console.log('Available commands:', registry.getAllSkillCommands().map(c => c.name).join(', '));
    return;
  }

  // Execute with args
  console.log('\nExecuting a-share-fund with args "搜索ETF"...');
  const result = await fundCmd.getPromptForCommand('搜索ETF', { cwd: process.cwd() });

  console.log('Result length:', result[0].text.length);
  console.log('First 500 chars:\n', result[0].text.slice(0, 500));

  // Check if shell commands were executed
  const text = result[0].text;
  if (text.includes('```!')) {
    console.log('\n❌ Shell commands NOT executed (still has ```!)');
  } else if (text.includes('{"') || text.includes('[{"')) {
    console.log('\n✅ Shell commands executed - real data present');
  } else if (text.includes('Tushare') || text.includes('AKShare')) {
    console.log('\n⚠️ Shell commands ran but may have failed (check errors above)');
  }
}

main().catch(console.error);