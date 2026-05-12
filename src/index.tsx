#!/usr/bin/env bun
import { config } from 'dotenv';
import { runCli } from './cli.js';
import { runOnboarding } from './commands/onboarding.js';
import { runDoctor } from './commands/doctor.js';
import { createStdioServer } from './stdio/server.js';

config({ quiet: true });

// Parse CLI subcommands
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

async function main() {
  // Check for --stdio mode (for external tool integration)
  // In stdio mode, we run a pure JSON-RPC server without any CLI UI
  if (args.includes('--stdio')) {
    const server = createStdioServer();
    server.start();
    // Keep process alive - server handles its own lifecycle
    // Use a promise that never resolves to keep the process running
    await new Promise(() => {});
    return;
  }

  switch (command) {
    case 'setup':
      // Interactive setup wizard
      await runOnboarding();
      process.exit(0);
      break;

    case 'doctor':
      // Health check
      await runDoctor();
      process.exit(0);
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log('UpUp v2026.05.11');
      process.exit(0);
      break;

    default:
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      // No command - start interactive CLI
      await runCli();
  }
}

function printHelp() {
  console.log(`
UpUp - AI Agent for Deep Financial Research

Usage:
  upup              Start interactive CLI
  upup setup        Run interactive setup wizard
  upup doctor       Run health check
  upup help         Show this help message
  upup version      Show version

Examples:
  upup              Start the agent
  upup setup        Configure API keys and settings
  upup doctor       Check system health
`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
