#!/usr/bin/env bun
/**
 * UpUp - Onboarding CLI
 *
 * Usage:
 *   bun run src/index.tsx              # Show help
 *   bun run src/index.tsx --status    # Show configuration status
 *   bun run src/index.tsx --check     # Run pre-flight checks
 *   bun run src/index.tsx --wizard    # Start onboarding wizard
 *   bun run src/index.tsx --doctor     # Run diagnostics
 */

import { config } from 'dotenv';
import { OnboardingChecklist, OnboardingWizard, OnboardingValidator } from './onboarding/index.js';
import { PROVIDERS } from './providers.js';
import { DEFAULT_PROVIDER } from './model/llm.js';
import { checkApiKeyExistsForProvider } from './utils/env.js';

config({ quiet: true });

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const args = process.argv.slice(2);
const flags = new Set(args);

function isFlag(flag: string): boolean {
  return flags.has('--' + flag);
}

function showHelp() {
  console.log(`
${BOLD}UpUp Onboarding CLI${RESET}

${BOLD}Usage:${RESET}
  ${CYAN}bun run src/index.tsx${RESET}           # Show this help
  ${CYAN}bun run src/index.tsx --status${RESET}   # Show configuration status
  ${CYAN}bun run src/index.tsx --check${RESET}    # Run pre-flight checks
  ${CYAN}bun run src/index.tsx --wizard${RESET}   # Start onboarding wizard
  ${CYAN}bun run src/index.tsx --doctor${RESET}   # Run diagnostics
`);
}

async function showStatus() {
  console.log(`\n${BLUE}${BOLD}[Status]${RESET}\n`);

  for (const p of PROVIDERS) {
    const hasKey = checkApiKeyExistsForProvider(p.id);
    const status = hasKey ? `${GREEN}[ok]` : `${YELLOW}[--]`;
    console.log(`  ${status} ${p.displayName}`);
  }
  console.log('');
}

async function runCheck() {
  console.log(`\n${BLUE}${BOLD}[Check]${RESET}\n`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  for (const item of checklist.getItems()) {
    const icon = item.status === 'passed' ? GREEN + 'ok' : item.status === 'warning' ? YELLOW + '!' : RED + 'x';
    console.log(`  [${icon}${RESET}] ${item.label}`);
  }

  console.log(checklist.isReady() ? `\n${GREEN}Ready${RESET}\n` : `\n${YELLOW}Needs setup${RESET}\n`);
}

async function runWizard() {
  console.log(`\n${CYAN}${BOLD}[Wizard]${RESET}\n`);

  const wizard = new OnboardingWizard();
  const providers = wizard.getProviderOptions();

  console.log('  Available providers:');
  for (let i = 0; i < providers.length; i++) {
    const hasKey = checkApiKeyExistsForProvider(providers[i].id);
    const keyStatus = hasKey ? ` ${GREEN}[ok]${RESET}` : '';
    console.log(`    ${i + 1}. ${providers[i].label}${keyStatus}`);
  }

  console.log(`\n  Current: ${DEFAULT_PROVIDER}`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  console.log('');
  for (const item of checklist.getItems()) {
    const icon = item.status === 'passed' ? GREEN + 'ok' : item.status === 'warning' ? YELLOW + '!' : RED + 'x';
    console.log(`  [${icon}${RESET}] ${item.label}`);
  }

  console.log(`\n${GREEN}Done${RESET}\n`);
}

async function runDoctor() {
  console.log(`\n${BLUE}${BOLD}[Doctor]${RESET}\n`);

  const validator = new OnboardingValidator();
  const checks = await validator.runAllChecks(DEFAULT_PROVIDER);

  for (const check of checks) {
    const icon = check.status === 'passed' ? GREEN + 'ok' : check.status === 'warning' ? YELLOW + '!' : RED + 'x';
    console.log(`  [${icon}${RESET}] ${check.label}`);
    if (check.status === 'failed' && check.fix) {
      console.log(`       ${check.fix}`);
    }
  }
  console.log('');
}

async function main() {
  if (isFlag('help') || args.length === 0) {
    showHelp();
    return;
  }

  if (isFlag('status')) { await showStatus(); return; }
  if (isFlag('check')) { await runCheck(); return; }
  if (isFlag('wizard')) { await runWizard(); return; }
  if (isFlag('doctor')) { await runDoctor(); return; }

  showHelp();
}

main().catch((e) => {
  console.error(`\n${RED}Error:${RESET}`, e);
  process.exit(1);
});
