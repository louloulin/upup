#!/usr/bin/env bun
/**
 * UpUp - Unified Entry Point
 *
 * Single command for all operations:
 *   bun run dev                    # Start with status check
 *   bun run dev --status          # Show configuration status
 *   bun run dev --check           # Run pre-flight checks
 *   bun run dev --wizard          # Run onboarding wizard
 *   bun run dev --doctor          # Run diagnostics
 *   bun run dev --help            # Show help
 */

import { config } from 'dotenv';
import { checkStartup, printStartupBanner, getOnboardingInstructions } from './onboarding/index.js';
import { OnboardingChecklist, OnboardingWizard, OnboardingValidator, TemplateManager } from './onboarding/index.js';
import { PROVIDERS } from './providers.js';
import { DEFAULT_PROVIDER } from './model/llm.js';
import { checkApiKeyExistsForProvider, getApiKeyNameForProvider } from './utils/env.js';
import { runCli } from './cli.js';

// Load environment variables
config({ quiet: true });

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

// Parse arguments
const args = process.argv.slice(2);
const flags = new Set(args);

function isFlag(flag: string): boolean {
  return flags.has('--' + flag) || flags.has('-' + flag.charAt(0));
}

function showHelp() {
  console.log(`
${BOLD}UpUp - AI Assistant for Financial Research${RESET}

${BOLD}Usage:${RESET}
  ${CYAN}bun run dev${RESET}                  Start UpUp with status check
  ${CYAN}bun run dev${RESET} ${GREEN}--status${RESET}        Show configuration status
  ${CYAN}bun run dev${RESET} ${GREEN}--check${RESET}         Run pre-flight checks
  ${CYAN}bun run dev${RESET} ${GREEN}--wizard${RESET}        Start onboarding wizard
  ${CYAN}bun run dev${RESET} ${GREEN}--doctor${RESET}         Run diagnostics
  ${CYAN}bun run dev${RESET} ${GREEN}--help${RESET}           Show this help

${BOLD}Quick Start:${RESET}
  ${CYAN}bun run dev${RESET}                  # Start (shows status if not configured)
  ${CYAN}bun run dev --wizard${RESET}          # First time setup
`);
}

async function showStatus() {
  console.log(`\n${BLUE}${BOLD}╔═══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║${RESET}               ${BOLD}Configuration Status${RESET}                          ${BLUE}║${RESET}`);
  console.log(`${BLUE}╚═══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const startupCheck = await checkStartup();

  console.log(`  ${startupCheck.configured ? GREEN + '✓' : YELLOW + '⚠'}${RESET}  Provider: ${startupCheck.provider}`);
  console.log(`  ${startupCheck.ready ? GREEN + '✓' : YELLOW + '⚠'}${RESET}  Ready: ${startupCheck.ready ? GREEN + 'Yes' : YELLOW + 'No'}${RESET}`);
  console.log(`  ${startupCheck.needsOnboarding ? YELLOW + '⚠' : GREEN + '✓'}${RESET}  Onboarding: ${startupCheck.needsOnboarding ? YELLOW + 'Required' : GREEN + 'Complete'}${RESET}`);
  console.log('');

  console.log(`  ${BOLD}Available Providers:${RESET}`);
  for (const p of PROVIDERS) {
    const hasKey = checkApiKeyExistsForProvider(p.id);
    const status = hasKey ? `${GREEN}[configured]${RESET}` : `${YELLOW}[not set]${RESET}`;
    console.log(`    ${p.displayName}: ${status}`);
  }
  console.log('');
}

async function runCheck() {
  console.log(`\n${BLUE}${BOLD}Running Pre-flight Checks...${RESET}\n`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  console.log(checklist.render());
  console.log('');

  if (checklist.isReady()) {
    console.log(`${GREEN}${BOLD}✓ System is ready!${RESET}\n`);
  } else {
    console.log(`${YELLOW}${BOLD}⚠ Some checks need attention. Run ${CYAN}bun run dev --wizard${YELLOW} to setup.${RESET}\n`);
  }
}

async function runWizard() {
  console.log(`\n${CYAN}${BOLD}Starting Onboarding Wizard...${RESET}\n`);

  const wizard = new OnboardingWizard();

  console.log(`  Welcome to UpUp Onboarding!\n`);
  console.log(`  This wizard will help you set up your environment.\n`);

  const options = wizard.getProviderOptions();
  console.log(`  ${BOLD}Available providers:${RESET}`);
  for (let i = 0; i < options.length; i++) {
    const hasKey = checkApiKeyExistsForProvider(options[i].id);
    const keyStatus = hasKey ? ` ${GREEN}[configured]${RESET}` : '';
    console.log(`    ${i + 1}. ${options[i].label}${keyStatus}`);
  }
  console.log('');

  console.log(`  Current provider: ${DEFAULT_PROVIDER}`);

  const checklist = new OnboardingChecklist(DEFAULT_PROVIDER);
  await checklist.runChecks();

  console.log(`\n  ${BOLD}Pre-flight Checks:${RESET}`);
  for (const item of checklist.getItems()) {
    const icon = item.status === 'passed' ? GREEN + '✓' : item.status === 'warning' ? YELLOW + '⚠' : RED + '✗';
    console.log(`    ${icon} ${item.label}`);
  }

  console.log(`\n${GREEN}${BOLD}✓ Configuration complete!${RESET}`);
  console.log(`  Run ${CYAN}bun run dev${RESET} to start UpUp.\n`);
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

// Main entry point
async function main() {
  // Help
  if (isFlag('help') || isFlag('h')) {
    showHelp();
    return;
  }

  // Status
  if (isFlag('status') || isFlag('s')) {
    await showStatus();
    return;
  }

  // Check
  if (isFlag('check') || isFlag('c')) {
    await runCheck();
    return;
  }

  // Wizard
  if (isFlag('wizard') || isFlag('w')) {
    await runWizard();
    return;
  }

  // Doctor
  if (isFlag('doctor') || isFlag('d')) {
    await runDoctor();
    return;
  }

  // Default: check status and start TUI
  const startupCheck = await checkStartup();
  printStartupBanner(startupCheck);

  if (startupCheck.needsOnboarding) {
    console.log(getOnboardingInstructions());
    return;
  }

  // Continue with normal CLI
  await runCli();
}

main().catch((error) => {
  console.error(`\n${RED}Error:${RESET}`, error);
  process.exit(1);
});
