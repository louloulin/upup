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

// Parse global flags
function getFlag(flags: string[]): string | undefined {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx >= 0) {
      // Return next arg if it doesn't look like a flag
      const next = args[idx + 1];
      if (next && !next.startsWith('-')) return next;
      return ''; // flag without value
    }
  }
  return undefined;
}

function hasFlag(flags: string[]): boolean {
  return flags.some(f => args.includes(f));
}

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

  // Handle session resume flags before command switch
  const resumeTarget = getFlag(['-r', '--resume']);
  const shouldContinue = hasFlag(['-c', '--continue']);
  const shouldFork = hasFlag(['--fork-session']);

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
      console.log('UpUp v2026.05.13');
      process.exit(0);
      break;

    default: {
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      // Start interactive CLI with resume context
      await runCli({
        resumeTarget: resumeTarget ?? undefined,
        continue: shouldContinue,
        fork: shouldFork,
      });
    }
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

Session Commands:
  upup -r [id]     Resume a previous session
  upup -c          Continue the most recent session
  upup --resume [id]  Resume session by ID or search term
  upup --continue   Continue most recent session
  upup --fork-session  Fork instead of resuming in place

Examples:
  upup              Start the agent
  upup setup        Configure API keys and settings
  upup doctor       Check system health
  upup -r           Show session picker to resume
  upup -r abc123    Resume session matching "abc123"
  upup -c           Continue the most recent session
`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
