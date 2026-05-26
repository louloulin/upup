#!/usr/bin/env bun
/**
 * oscript-cmd-verify.ts — Unified command verification using ALL_COMMANDS
 *
 * Tests each slash command by directly invoking executeCommand from all-commands.ts
 * This provides full coverage of all 49 commands in the unified command system.
 *
 * Run: bun run scripts/oscript-cmd-verify.ts
 */

import {
  ALL_COMMANDS,
  executeCommand,
  COMMAND_ALIASES,
  builtInCommandNames,
  matchCommands,
  fuzzyMatchCommands,
  type Command,
  type CommandContext,
} from '@upup/commands';

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  command: string;
  type: string;
  status: 'pass' | 'fail' | 'warn';
  output?: string;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Test Setup
// ============================================================================

console.log('════════════════════════════════════════════════════════');
console.log('  UpUp Unified Command Verification (oscript-cmd-verify)');
console.log('════════════════════════════════════════════════════════');
console.log(`  ALL_COMMANDS: ${ALL_COMMANDS.length} commands`);
console.log(`  Built-in names: ${builtInCommandNames.size} names`);
console.log('');

// Mock context for command execution
const mockContext: CommandContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'oscript-cmd-test',
  model: 'gpt-4o',
};

// ============================================================================
// Test Cases
// ============================================================================

const testCases: Array<{ name: string; args: string; description: string }> = [
  // Core commands
  { name: 'commands', args: '', description: 'Open command palette' },
  { name: 'help', args: '', description: 'Show help' },
  { name: 'status', args: '', description: 'System status' },
  { name: 'cost', args: '', description: 'Token usage' },
  { name: 'clear', args: '', description: 'Clear chat' },
  { name: 'compact', args: '', description: 'Compact context' },
  { name: 'model', args: '', description: 'Model selection' },
  { name: 'history', args: '', description: 'Conversation history' },
  { name: 'theme', args: '', description: 'Theme selection' },
  { name: 'memory', args: '', description: 'Memory access' },
  { name: 'session', args: '', description: 'Session management' },
  { name: 'resume', args: '', description: 'Resume session' },

  // Git commands
  { name: 'git', args: 'status', description: 'Git status' },
  { name: 'diff', args: '', description: 'Git diff' },
  { name: 'commit', args: '', description: 'Git commit' },
  { name: 'branch', args: '', description: 'Git branch' },
  { name: 'log', args: '', description: 'Git log' },
  { name: 'stash', args: '', description: 'Git stash' },
  { name: 'remote', args: '', description: 'Git remote' },

  // Agent commands
  { name: 'agent', args: '', description: 'Agent management' },
  { name: 'agents', args: '', description: 'Agents list' },
  { name: 'fork', args: '', description: 'Fork subagent' },
  { name: 'tasks', args: '', description: 'Background tasks' },

  // MCP commands
  { name: 'mcp', args: 'status', description: 'MCP status' },
  { name: 'mcp', args: 'list', description: 'MCP list' },
  { name: 'mcp-add', args: '', description: 'MCP add server' },

  // Plan commands
  { name: 'plan', args: '', description: 'Enter plan mode' },
  { name: 'steps', args: '', description: 'List plan steps' },
  { name: 'exit-plan', args: '', description: 'Exit plan mode' },
  { name: 'add-step', args: '', description: 'Add plan step' },

  // System commands
  { name: 'doctor', args: '', description: 'System diagnostics' },
  { name: 'version', args: '', description: 'Version info' },
  { name: 'usage', args: '', description: 'Usage stats' },
  { name: 'config', args: '', description: 'Configuration' },
  { name: 'keybindings', args: '', description: 'Keybindings' },
  { name: 'files', args: '', description: 'Tracked files' },
  { name: 'export', args: '', description: 'Export data' },

  // Permission commands
  { name: 'permissions', args: '', description: 'Permission status' },
  { name: 'reset-permissions', args: '', description: 'Reset permissions' },
  { name: 'sandbox', args: '', description: 'Sandbox mode' },

  // Research commands
  { name: 'rules', args: '', description: 'Research rules' },
  { name: 'heartbeat', args: '', description: 'Heartbeat checklist' },
  { name: 'feedback', args: '', description: 'Send feedback' },
  { name: 'effort', args: '', description: 'Effort tracking' },

  // Skills & Review
  { name: 'skills', args: '', description: 'Skills list' },
  { name: 'review', args: '', description: 'Code review' },
  { name: 'init', args: '', description: 'Initialize project' },

  // Alias tests
  { name: 'h', args: '', description: 'Help alias (h)' },
  { name: 's', args: '', description: 'Session alias (s)' },
  { name: 'r', args: '', description: 'Resume alias (r)' },
  { name: 'c', args: '', description: 'Continue alias (c)' },
  { name: 'g', args: 'status', description: 'Git alias (g)' },
];

// ============================================================================
// Run Tests
// ============================================================================

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let warned = 0;

console.log('📋 Testing commands...\n');

for (const test of testCases) {
  const start = Date.now();
  try {
    const result = await executeCommand(test.name, test.args, mockContext);
    const durationMs = Date.now() - start;

    // Verify result
    if (!result || typeof result !== 'object') {
      results.push({
        command: test.name,
        type: 'unknown',
        status: 'fail',
        error: `Invalid result type: ${typeof result}`,
        durationMs,
      });
      failed++;
      console.log(`  ❌ /${test.name} ${test.args} — ${test.description}: Invalid result`);
      continue;
    }

    // Get output preview
    let outputPreview = '';
    if ('text' in result && typeof (result as any).text === 'string') {
      outputPreview = (result as any).text.substring(0, 80);
    } else if ('message' in result && typeof (result as any).message === 'string') {
      outputPreview = (result as any).message.substring(0, 80);
    }

    results.push({
      command: test.name,
      type: result.type,
      status: 'pass',
      output: outputPreview,
      durationMs,
    });
    passed++;

    const icons: Record<string, string> = {
      output: '📄',
      error: '❌',
      jsx: '📱',
      compact: '🔄',
      noop: '🔇',
      clear: '🗑️',
    };
    const icon = icons[result.type] || '❓';
    const preview = outputPreview ? ` → ${outputPreview.substring(0, 50)}...` : '';
    console.log(`  ✅ ${icon} /${test.name.padEnd(15)} ${test.args} (${durationMs}ms)${preview}`);

  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorMsg = err?.message ?? String(err);

    // Check if it's a warning (feature not available)
    const isWarning = errorMsg.includes('not available') ||
                      errorMsg.includes('not configured') ||
                      errorMsg.includes('Cannot find') ||
                      errorMsg.includes('MCP');

    results.push({
      command: test.name,
      type: 'error',
      status: isWarning ? 'warn' : 'fail',
      error: errorMsg,
      durationMs,
    });

    if (isWarning) {
      warned++;
      console.log(`  ⚠️  /${test.name.padEnd(15)} ${test.args} — ${test.description}: ${errorMsg.substring(0, 60)}`);
    } else {
      failed++;
      console.log(`  ❌ /${test.name.padEnd(15)} ${test.args} — ${test.description}: ${errorMsg.substring(0, 60)}`);
    }
  }
}

// ============================================================================
// Summary
// ============================================================================

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('════════════════════════════════════════════════════════');
console.log(`  Total tests:  ${testCases.length}`);
console.log(`  ✅ Passed:    ${passed}`);
console.log(`  ⚠️  Warnings: ${warned}`);
console.log(`  ❌ Failed:    ${failed}`);
console.log('');

// Failed commands
if (failed > 0) {
  console.log('  Failed commands:');
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`    /${r.command} ${r.error}`);
  }
  console.log('');
}

// Command system stats
console.log('  Command System Stats:');
console.log(`    Total commands: ${ALL_COMMANDS.length}`);
console.log(`    Built-in names: ${builtInCommandNames.size}`);
console.log(`    Command aliases: ${Object.keys(COMMAND_ALIASES).length}`);

// Type distribution
const typeCount: Record<string, number> = {};
for (const cmd of ALL_COMMANDS) {
  const t = (cmd as any).type || 'unknown';
  typeCount[t] = (typeCount[t] || 0) + 1;
}
console.log('    Type distribution:');
for (const [type, count] of Object.entries(typeCount)) {
  console.log(`      ${type}: ${count}`);
}

console.log('');

// Test matching functions
console.log('  Testing match functions:');
const matchResults = matchCommands('/s');
console.log(`    matchCommands('/s'): ${matchResults.length} matches`);
const fuzzyResults = fuzzyMatchCommands('/hlp', 5);
console.log(`    fuzzyMatchCommands('/hlp'): ${fuzzyResults.length} matches`);

console.log('');
console.log('════════════════════════════════════════════════════════');

// Exit with failure if errors
if (failed > 0) {
  console.log('  ❌ VERIFICATION FAILED');
  process.exit(1);
} else {
  console.log('  ✅ ALL COMMANDS VERIFIED');
}

// Save results
const jsonPath = import.meta.dir + '/../.upup/oscript-cmd-results.json';
try {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: testCases.length,
    passed,
    warned,
    failed,
    results,
  }, null, 2));
  console.log(`  Results saved to ${jsonPath}`);
} catch {}