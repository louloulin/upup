#!/usr/bin/env bun
/**
 * Onboard CLI Command
 *
 * Usage:
 *   bun run src/onboarding/cli.ts          # Run full wizard
 *   bun run src/onboarding/cli.ts check    # Run only check
 *   bun run src/onboarding/cli.ts status   # Show status
 *   bun run src/onboarding/cli.ts doctor   # Run diagnostics
 */

import { OnboardingValidator } from './validator.js';
import { OnboardingWizard } from './wizard.js';
import { OnboardingChecklist } from './checklist.js';
import { TemplateManager } from './templates.js';
import { PROVIDERS } from '../providers.js';
import { DEFAULT_PROVIDER } from '../model/llm.js';
import { checkApiKeyExistsForProvider, getApiKeyNameForProvider } from '../utils/env.js';
import { needsOnboarding, quickValidation } from './index.js';

const args = process.argv.slice(2);
const command = args[0] || 'wizard';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

async function printStatus() {
  console.log(`\n${BLUE}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║${RESET}               ${BOLD}Onboarding Status${RESET}                          ${BLUE}║${RESET}`);
  console.log(`${BLUE}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const status = await quickValidation();
  const needOnboard = await needsOnboarding();

  console.log(`  Provider: ${DEFAULT_PROVIDER}`);
  console.log(`  Configured: ${checkApiKeyExistsForProvider(DEFAULT_PROVIDER) ? GREEN + 'Yes' + RESET : YELLOW + 'No' + RESET}`);
  console.log(`  Ready: ${status.ready ? GREEN + 'Yes' + RESET : YELLOW + 'No' + RESET}`);
  console.log(`  Needs Onboarding: ${needOnboard ? YELLOW + 'Yes' + RESET : GREEN + 'No' + RESET}`);
  console.log('');

  console.log(`  ${BOLD}Checks:${RESET}`);
  for (const check of status.checks) {
    const icon = check.status === 'passed' ? GREEN + '✓' : check.status === 'warning' ? YELLOW + '⚠' : RED + '✗';
    console.log(`    ${icon} ${check.name}: ${check.status}`);
  }
  console.log('');
}

async function runCheck() {
  console.log(`\n${BLUE}${BOLD}Running Pre-flight Checks...${RESET}\n`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  console.log(checklist.render());

  if (checklist.isReady()) {
    console.log(`\n${GREEN}${BOLD}✓ System is ready!${RESET}\n`);
  } else {
    console.log(`\n${YELLOW}${BOLD}⚠ Some checks need attention. Run 'bun run src/onboarding/cli.ts wizard' to setup.${RESET}\n`);
  }
}

async function runWizard() {
  console.log(`\n${CYAN}${BOLD}Starting Onboarding Wizard...${RESET}\n`);

  const wizard = new OnboardingWizard();

  console.log(`  Welcome to UpUp Onboarding!\n`);
  console.log(`  This wizard will help you set up your environment.\n`);

  const options = wizard.getProviderOptions();
  console.log(`  Available providers:`);
  for (let i = 0; i < options.length; i++) {
    const hasKey = checkApiKeyExistsForProvider(options[i].id);
    const keyStatus = hasKey ? GREEN + ' [configured]' : '';
    console.log(`    ${i + 1}. ${options[i].label}${keyStatus}${RESET}`);
  }
  console.log('');

  console.log(`  ${BOLD}Step 1: Select Provider${RESET}`);
  console.log(`  Current: ${DEFAULT_PROVIDER}`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  console.log(`\n  ${BOLD}Pre-flight Checks:${RESET}`);
  for (const item of checklist.getItems()) {
    const icon = item.status === 'passed' ? GREEN + '✓' : item.status === 'warning' ? YELLOW + '⚠' : RED + '✗';
    console.log(`    ${icon} ${item.label}`);
  }

  console.log(`\n${GREEN}${BOLD}✓ Onboarding configuration complete!${RESET}`);
  console.log(`  Run 'bun run src/cli.ts' to start using UpUp.\n`);
}

async function runDoctor() {
  console.log(`\n${BLUE}${BOLD}Running Diagnostics...${RESET}\n`);

  const validator = new OnboardingValidator();
  const checks = await validator.runAllChecks(DEFAULT_PROVIDER);

  for (const check of checks) {
    const icon = check.status === 'passed' ? GREEN + '✓' : check.status === 'warning' ? YELLOW + '⚠' : RED + '✗';
    console.log(`  ${icon} ${check.label}`);
    console.log(`      ${check.description}`);
    if (check.status === 'failed' && check.fix) {
      console.log(`      ${YELLOW}Fix: ${check.fix}${RESET}`);
    }
  }

  console.log('');
}

async function printHelp() {
  console.log(`
${BLUE}${BOLD}Onboard CLI${RESET} - UpUp Onboarding System

${BOLD}Usage:${RESET}
  bun run src/onboarding/cli.ts [command]

${BOLD}Commands:${RESET}
  wizard    Start the interactive onboarding wizard (default)
  check     Run pre-flight checks
  status    Show onboarding status
  doctor    Run diagnostics
  help      Show this help message

${BOLD}Examples:${RESET}
  bun run src/onboarding/cli.ts          # Start wizard
  bun run src/onboarding/cli.ts check     # Run checks
  bun run src/onboarding/cli.ts status    # Show status
  bun run src/onboarding/cli.ts doctor    # Run diagnostics

${BOLD}Also available as:${RESET}
  bun run src/onboarding/oscript-onboarding.ts  # Full verification
`);
}

const RED = '\x1b[31m';

switch (command) {
  case 'status':
    await printStatus();
    break;
  case 'check':
    await runCheck();
    break;
  case 'wizard':
    await runWizard();
    break;
  case 'doctor':
    await runDoctor();
    break;
  case 'help':
  case '--help':
  case '-h':
    await printHelp();
    break;
  default:
    console.error(`\n${RED}Unknown command: ${command}\n`);
    await printHelp();
    process.exit(1);
}
