/**
 * Onboarding Startup Integration
 *
 * Automatically checks and prompts for onboarding when needed
 */

import { needsOnboarding, quickValidation } from './index.js';
import { checkApiKeyExistsForProvider } from '../utils/env.js';
import { DEFAULT_PROVIDER } from '../model/llm.js';
import { PROVIDERS } from '../providers.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

export interface StartupCheck {
  needsOnboarding: boolean;
  configured: boolean;
  provider: string;
  ready: boolean;
  messages: string[];
}

/**
 * Check if onboarding is needed at startup
 */
export async function checkStartup(): Promise<StartupCheck> {
  const messages: string[] = [];
  const configured = checkApiKeyExistsForProvider(DEFAULT_PROVIDER);
  const needOnboard = await needsOnboarding();
  const status = await quickValidation();

  return {
    needsOnboarding: needOnboard,
    configured,
    provider: DEFAULT_PROVIDER,
    ready: status.ready,
    messages,
  };
}

/**
 * Print startup banner with status
 */
export function printStartupBanner(check: StartupCheck): void {
  console.log();
  console.log(`${CYAN}╔═══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}║${RESET}                         ${BOLD}UpUp${RESET}                                   ${CYAN}║${RESET}`);
  console.log(`${CYAN}╚═══════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log();
  console.log(`  ${check.configured ? GREEN + '✓' : YELLOW + '⚠'}${RESET}  Provider: ${check.provider}`);
  console.log(`  ${check.ready ? GREEN + '✓' : YELLOW + '⚠'}${RESET}  Status: ${check.ready ? GREEN + 'Ready' : YELLOW + 'Needs Setup'}${RESET}`);

  if (check.needsOnboarding) {
    console.log();
    console.log(`  ${YELLOW}!${RESET}  ${YELLOW}Onboarding required${RESET}`);
    console.log(`     Run ${CYAN}bun run src/onboarding/cli.ts wizard${RESET} to set up`);
    console.log(`     Or ${CYAN}bun run src/onboarding/cli.ts${RESET} for more options`);
  } else {
    console.log();
    console.log(`  ${GREEN}✓${RESET}  ${GREEN}System ready!${RESET}`);
  }
  console.log();
}

/**
 * Print quick status line
 */
export function printQuickStatus(): void {
  const configured = checkApiKeyExistsForProvider(DEFAULT_PROVIDER);
  const provider = DEFAULT_PROVIDER;

  if (configured) {
    console.log(`${GREEN}✓${RESET} ${provider}`);
  } else {
    console.log(`${YELLOW}⚠${RESET} Not configured - run ${CYAN}bun run src/onboarding/cli.ts${RESET}`);
  }
}

/**
 * Get onboarding instructions
 */
export function getOnboardingInstructions(): string {
  return `
${BOLD}First time setup:${RESET}

  1. ${CYAN}bun run src/onboarding/cli.ts${RESET}  # Interactive wizard
  2. Select your provider (DeepSeek, Anthropic, etc.)
  3. Enter your API key when prompted
  4. Done! Start using UpUp

${BOLD}Quick check:${RESET}
  ${CYAN}bun run src/onboarding/cli.ts status${RESET}  # Show current status
  ${CYAN}bun run src/onboarding/cli.ts check${RESET}   # Run pre-flight checks

${BOLD}Need help?${RESET}
  ${CYAN}bun run src/onboarding/cli.ts help${RESET}   # Show all options
`;
}
