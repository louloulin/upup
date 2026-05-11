#!/usr/bin/env bun
import { config } from 'dotenv';
import { checkStartup, printStartupBanner, getOnboardingInstructions } from './onboarding/index.js';
import { runCli } from './cli.js';

// Load environment variables
config({ quiet: true });

// Check if onboarding is needed
const startupCheck = await checkStartup();
printStartupBanner(startupCheck);

// If not configured, show instructions and exit with helpful message
if (startupCheck.needsOnboarding) {
  console.log(getOnboardingInstructions());
  process.exit(0);
}

// Continue with normal CLI
await runCli();
