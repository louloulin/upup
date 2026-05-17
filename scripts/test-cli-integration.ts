#!/usr/bin/env bun
/**
 * CLI Skills Integration Test
 */

import {
  initializeSkills,
  getAllSkillCommands,
  getSkillCommand,
} from '../src/skills/index.js';

console.log('\n' + '='.repeat(80));
console.log('                    CLI Skills Integration Test');
console.log('='.repeat(80) + '\n');

// Initialize
const count = await initializeSkills();
console.log('[1/4] Initialized ' + count + ' Skills');

// Test /dcf-valuation command (skill name from frontmatter)
console.log('\n[2/4] Testing /dcf-valuation command');
console.log('-'.repeat(60));

const dcfCmd = getSkillCommand('dcf-valuation');
if (dcfCmd) {
  console.log('Found /dcf-valuation command');

  const result = await dcfCmd.getPromptForCommand('贵州茅台 600519.SH');
  const content = result[0]?.text || '';

  console.log('Result length: ' + content.length + ' chars');
  console.log('Has Base directory: ' + content.includes('Base directory for this skill:'));
  console.log('Has DCF Workflow: ' + content.includes('DCF Analysis'));

  console.log('\nOutput preview:');
  console.log(content.slice(0, 500));
} else {
  console.log('ERROR: /dcf command not found');
}

// Test /a-share-analysis
console.log('\n[3/4] Testing /a-share-analysis command');
console.log('-'.repeat(60));

const aShareCmd = getSkillCommand('a-share-analysis');
if (aShareCmd) {
  console.log('Found /a-share-analysis command');

  const result = await aShareCmd.getPromptForCommand('贵州茅台');
  const content = result[0]?.text || '';

  console.log('Result length: ' + content.length + ' chars');
  console.log('Has Workflow: ' + content.includes('A-Share'));

  console.log('\nOutput preview:');
  console.log(content.slice(0, 400));
} else {
  console.log('ERROR: /a-share-analysis not found');
}

// List all commands
console.log('\n[4/4] Registered Commands');
console.log('-'.repeat(60));

const commands = getAllSkillCommands();
console.log('Total: ' + commands.length + ' commands\n');

for (const cmd of commands) {
  const hasGetPrompt = typeof cmd.getPromptForCommand === 'function';
  const status = hasGetPrompt ? '[OK]' : '[FAIL]';
  console.log(status + ' /' + cmd.name.padEnd(25) + ' ' + cmd.description.slice(0, 40) + '...');
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('                    CLI Integration Test Complete');
console.log('='.repeat(80) + '\n');
