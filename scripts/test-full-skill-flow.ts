/**
 * Comprehensive test of the skill execution flow
 * Tests exactly what happens when user types: /a-share-fund 搜索基金
 */

import { initializeSkills } from '../src/skills/commands.js';
import { getSkillCommandRegistry } from '../src/skills/slash-command.js';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           Full Skill Execution Flow Test                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Initialize skills
  console.log('[Step 1] Initializing skills...');
  await initializeSkills();
  console.log('✅ Skills initialized\n');

  // Step 2: Get registry
  const registry = getSkillCommandRegistry();
  console.log(`[Step 2] Registry has ${registry.skillCommandCount} skills\n`);

  // Step 3: Simulate user input
  const userInput = '/a-share-fund 搜索基金';
  console.log(`[Step 3] User input: "${userInput}"\n`);

  // Step 4: Parse command (same logic as cli.ts handleSubmit)
  const rawCommand = userInput.slice(1).trim();
  const spaceIdx = rawCommand.indexOf(' ');
  const commandName = (spaceIdx === -1 ? rawCommand : rawCommand.slice(0, spaceIdx)).toLowerCase();
  const commandArgs = spaceIdx === -1 ? '' : rawCommand.slice(spaceIdx + 1).trim();

  console.log('[Step 4] Parsed command:');
  console.log(`  commandName: "${commandName}"`);
  console.log(`  commandArgs: "${commandArgs}"\n`);

  // Step 5: Check if skill exists
  const skillCmd = registry.getSkillCommand(commandName);
  console.log(`[Step 5] Skill in registry: ${!!skillCmd}`);
  if (!skillCmd) {
    console.log('Available skills:', registry.getAllSkillCommands().map(s => s.name).slice(0, 10).join(', '));
    return;
  }
  console.log(`  Name: ${skillCmd.name}`);
  console.log(`  Type: ${skillCmd.type}`);
  console.log(`  Description: ${skillCmd.description.slice(0, 100)}...\n`);

  // Step 6: Execute skill (same logic as cli.ts handleSlashCommand)
  console.log('[Step 6] Executing skill via getPromptForCommand...');
  const content = await skillCmd.getPromptForCommand(commandArgs, { cwd: process.cwd() });
  const prompt = content.map(c => c.text).join('\n\n');
  console.log(`  Prompt length: ${prompt.length} chars\n`);

  // Step 7: Analyze prompt content
  console.log('[Step 7] Analyzing prompt content:');

  // Check for args substitution
  if (prompt.includes('搜索基金')) {
    console.log('  ✅ Args substituted: "搜索基金" found in prompt');
  } else {
    console.log('  ❌ Args NOT substituted: "搜索基金" NOT found in prompt');
  }

  // Check for shell commands
  if (prompt.includes('```!')) {
    console.log('  ⚠️  Shell commands NOT executed (still has ```!)');
  } else if (prompt.includes('python3') || prompt.includes('curl')) {
    console.log('  ✅ Shell commands present in prompt');
  }

  // Check for data results
  if (prompt.includes('{"') || prompt.includes('[{')) {
    console.log('  ✅ JSON data found in prompt');
  } else if (prompt.includes('[stderr]') || prompt.includes('Error')) {
    console.log('  ⚠️  Errors found in prompt');
  }

  // Check for Tushare response
  if (prompt.includes('tushare')) {
    console.log('  ✅ Tushare mentioned in prompt');
  }

  console.log('\n[Step 8] Prompt preview (first 1500 chars):');
  console.log('─'.repeat(60));
  console.log(prompt.slice(0, 1500));
  console.log('─'.repeat(60));

  // Step 9: Summary
  console.log('\n[Step 9] Summary:');
  console.log('─'.repeat(60));
  if (skillCmd && prompt.includes('Base directory')) {
    console.log('✅ Skill was executed successfully');
    console.log('✅ Skill content is available for agent to process');
  } else {
    console.log('❌ Skill execution FAILED');
  }
  console.log('─'.repeat(60));
  console.log('\n✅ Test complete');
}

main().catch(console.error);