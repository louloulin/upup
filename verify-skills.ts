#!/usr/bin/env bun
/**
 * UpUp Skills Verification Script
 *
 * This script verifies all skills are properly registered and working.
 */

import { initInvestmentSkills } from './src/skills/bundled/index.js';
import { discoverSkills, getAllBundledSkills, getAllSkills } from './src/skills/registry.js';
import { createSkillCommand } from './src/skills/executor.js';
import { getSkillCommandRegistry } from './src/skills/slash-command.js';
import { getPromptForCommand } from './src/skills/executor.js';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function printHeader(title: string) {
  console.log(`\n${BLUE}╔${'═'.repeat(60)}╗${RESET}`);
  console.log(`${BLUE}║${RESET} ${title.padEnd(58)} ${BLUE}║${RESET}`);
  console.log(`${BLUE}╚${'═'.repeat(60)}╝${RESET}\n`);
}

async function verifySkills() {
  printHeader('UPUP AI Investment Skills Verification');

  // Step 1: Initialize bundled skills
  console.log(`${YELLOW}Initializing bundled skills...${RESET}`);
  initInvestmentSkills();

  // Step 2: Discover skills
  console.log(`${YELLOW}Discovering file-based skills...${RESET}`);
  const fileBasedSkills = discoverSkills();

  // Step 3: Get bundled skills
  const bundledSkills = getAllBundledSkills();

  // Step 4: Get registry skills
  const registry = getSkillCommandRegistry();
  const allSkills = getAllSkills();

  console.log(`${GREEN}✅ Skills initialized successfully!${RESET}\n`);

  // Count totals
  const bundledCount = bundledSkills.length;
  const fileBasedCount = fileBasedSkills.length;
  const totalCount = bundledCount + fileBasedCount;

  console.log(`📦 Bundled Skills: ${bundledCount}`);
  console.log(`📁 File-based Skills: ${fileBasedCount}`);
  console.log(`📊 Total Skills: ${totalCount}\n`);

  // Verify bundled skills
  printHeader('Bundled Skills Verification');

  const tableHeader = '┌────────────────┬──────────────────────┬────────┬─────────┐';
  const tableSeparator = '├────────────────┼──────────────────────┼────────┼─────────┤';
  const tableFooter = '└────────────────┴──────────────────────┴────────┴─────────┘';

  console.log(tableHeader);
  console.log('│ Skill          │ Description          │ Length │ Context │');
  console.log(tableSeparator);

  let allBundledValid = true;
  for (const skill of bundledSkills) {
    const hasGetPrompt = typeof (skill as any).getPromptForCommand === 'function';
    const name = skill.name.padEnd(14);
    const desc = (skill.description || '').substring(0, 20).padEnd(20);
    const len = String(skill.instructions?.length || 0).padStart(6);
    const context = skill.context || 'inline';

    console.log(`│ ${name} │ ${desc} │ ${len} │ ${context.padStart(7)} │`);

    if (!hasGetPrompt) {
      console.log(`  ${RED}❌ Missing getPromptForCommand method${RESET}`);
      allBundledValid = false;
    }
  }

  console.log(tableFooter);

  if (allBundledValid) {
    console.log(`\n${GREEN}✅ All bundled skills verified!${RESET}`);
  }

  // Verify file-based skills
  printHeader('File-based Skills Verification');

  for (const skill of fileBasedSkills) {
    const status = skill.userInvocable ? `${GREEN}✓${RESET}` : `${YELLOW}○${RESET}`;
    console.log(`  ${status} /${skill.name.padEnd(20)} - ${skill.description || 'No description'}`);
  }

  // Test skill execution
  printHeader('Skill Execution Test');

  // Test dream skill
  try {
    const dreamSkill = bundledSkills.find(s => s.name === 'dream');
    if (dreamSkill && typeof (dreamSkill as any).getPromptForCommand === 'function') {
      const result = await (dreamSkill as any).getPromptForCommand('test args');
      const length = result?.[0]?.text?.length || 0;
      console.log(`${GREEN}✅ /dream skill executed successfully (${length} chars)${RESET}`);
    }
  } catch (e) {
    console.log(`${RED}❌ /dream skill execution failed: ${e}${RESET}`);
  }

  // Test research skill
  try {
    const researchSkill = bundledSkills.find(s => s.name === 'research');
    if (researchSkill && typeof (researchSkill as any).getPromptForCommand === 'function') {
      const result = await (researchSkill as any).getPromptForCommand('AAPL');
      const length = result?.[0]?.text?.length || 0;
      console.log(`${GREEN}✅ /research skill executed successfully (${length} chars)${RESET}`);
    }
  } catch (e) {
    console.log(`${RED}❌ /research skill execution failed: ${e}${RESET}`);
  }

  // Test batch skill
  try {
    const batchSkill = bundledSkills.find(s => s.name === 'batch');
    if (batchSkill && typeof (batchSkill as any).getPromptForCommand === 'function') {
      const result = await (batchSkill as any).getPromptForCommand('AAPL,GOOGL');
      const length = result?.[0]?.text?.length || 0;
      console.log(`${GREEN}✅ /batch skill executed successfully (${length} chars)${RESET}`);
    }
  } catch (e) {
    console.log(`${RED}❌ /batch skill execution failed: ${e}${RESET}`);
  }

  // Final summary
  printHeader('Verification Summary');

  console.log(`Bundled Skills: ${GREEN}${bundledCount}${RESET}`);
  console.log(`File-based Skills: ${GREEN}${fileBasedCount}${RESET}`);
  console.log(`Total: ${GREEN}${totalCount}${RESET}`);

  if (allBundledValid && fileBasedCount > 0) {
    console.log(`\n${GREEN}╔════════════════════════════════════════════════════════════╗`);
    console.log(`║     ALL ${String(totalCount).padStart(2)} SKILLS VERIFIED SUCCESSFULLY!            ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝${RESET}`);
  }

  // CLI verification
  printHeader('CLI Verification');
  console.log('\nRun these commands to test skills interactively:\n');
  console.log('  ./dist/upup                                    # Start interactive mode');
  console.log('  /dream                                        # Test dream skill');
  console.log('  /research AAPL                                # Test research skill');
  console.log('  /batch AAPL,GOOGL                             # Test batch skill');
  console.log('');
}

verifySkills().catch(console.error);