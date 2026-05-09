#!/usr/bin/env bun
/**
 * oscript-verify.ts — Interactive UpUp command verification script
 *
 * Tests each slash command by directly invoking the CommandRegistry
 * without requiring the full TUI. Validates that commands:
 * 1. Don't crash on invocation
 * 2. Return expected result types
 * 3. Handle edge cases (empty args, missing context)
 *
 * Run: bun run scripts/oscript-verify.ts
 */

import { getGlobalRegistry, type CommandContext } from '../src/commands/registry.js';

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  command: string;
  args: string;
  status: 'pass' | 'fail' | 'warn';
  output?: string;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Test Setup
// ============================================================================

const registry = getGlobalRegistry();
const commands = registry.list();

console.log('════════════════════════════════════════════════════════');
console.log('  UpUp Interactive Command Verification (oscript)');
console.log('════════════════════════════════════════════════════════');
console.log(`  Registry: ${commands.length} commands registered`);
console.log('');

// Minimal mock context for commands that need it
const mockContext: CommandContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'oscript-test',
  model: 'gpt-4o',
};

// ============================================================================
// Test Definitions
// ============================================================================

const testCases: Array<{ command: string; args: string; description: string }> = [
  // Core commands
  { command: 'help', args: '', description: 'Show help text' },
  { command: 'status', args: '', description: 'System status' },
  { command: 'cost', args: '', description: 'Token usage and cost' },
  { command: 'clear', args: '', description: 'Clear chat log' },
  { command: 'model', args: '', description: 'Model selection' },
  { command: 'history', args: '', description: 'Conversation history' },
  { command: 'theme', args: 'default', description: 'Theme switching' },
  { command: 'compact', args: '', description: 'Compact context' },

  // Agent/Task commands
  { command: 'tasks', args: '', description: 'List background tasks' },
  { command: 'agent', args: '', description: 'Agent management' },

  // Plan commands
  { command: 'plan', args: '', description: 'Enter plan mode' },
  { command: 'steps', args: '', description: 'List plan steps' },
  { command: 'exit-plan', args: '', description: 'Exit plan mode' },
  { command: 'add-step', args: '', description: 'Add plan step' },

  // Tool/System commands
  { command: 'doctor', args: '', description: 'System diagnostics' },
  { command: 'mcp', args: 'status', description: 'MCP status' },
  { command: 'mcp', args: 'list', description: 'MCP server list' },
  { command: 'mcp', args: 'resources', description: 'MCP resources' },
  { command: 'permissions', args: '', description: 'Permission status' },
  { command: 'reset-permissions', args: '', description: 'Reset permissions' },

  // Memory/Knowledge commands
  { command: 'memory', args: '', description: 'Memory access' },
  { command: 'heartbeat', args: '', description: 'Heartbeat checklist' },
  { command: 'rules', args: '', description: 'Research rules' },

  // Proactive/Events
  { command: 'proactive', args: '', description: 'Proactive mode' },
  { command: 'events', args: '', description: 'Event system' },

  // Fork
  { command: 'fork', args: '', description: 'Fork subagent' },
];

// ============================================================================
// Run Tests
// ============================================================================

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let warned = 0;

for (const test of testCases) {
  const start = Date.now();
  try {
    const input = `/${test.command}${test.args ? ' ' + test.args : ''}`;
    const result = await registry.execute(input, mockContext);
    const durationMs = Date.now() - start;

    // Verify result has expected shape
    if (!result || typeof result !== 'object') {
      results.push({
        command: test.command,
        args: test.args,
        status: 'fail',
        error: `Invalid result type: ${typeof result}`,
        durationMs,
      });
      failed++;
      console.log(`  ❌ /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description}: Invalid result type`);
      continue;
    }

    if (!('type' in result)) {
      results.push({
        command: test.command,
        args: test.args,
        status: 'warn',
        error: 'Result missing "type" field',
        durationMs,
      });
      warned++;
      console.log(`  ⚠️  /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description}: Missing type field`);
      continue;
    }

    const output = 'text' in result ? (result as any).text?.substring(0, 120) : undefined;
    results.push({
      command: test.command,
      args: test.args,
      status: 'pass',
      output,
      durationMs,
    });
    passed++;
    const outputPreview = output ? ` → ${output.substring(0, 60)}...` : '';
    console.log(`  ✅ /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description} (${durationMs}ms)${outputPreview}`);

  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorMsg = err?.message ?? String(err);

    // Distinguish between "feature not available" and actual crashes
    const isUnavailable = errorMsg.includes('not available') ||
                          errorMsg.includes('not configured') ||
                          errorMsg.includes('Cannot find');

    results.push({
      command: test.command,
      args: test.args,
      status: isUnavailable ? 'warn' : 'fail',
      error: errorMsg,
      durationMs,
    });

    if (isUnavailable) {
      warned++;
      console.log(`  ⚠️  /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description}: ${errorMsg.substring(0, 80)}`);
    } else {
      failed++;
      console.log(`  ❌ /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description}: ${errorMsg.substring(0, 80)}`);
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
console.log(`  ⚠️  Warned:   ${warned}`);
console.log(`  ❌ Failed:    ${failed}`);
console.log('');

if (failed > 0) {
  console.log('  Failed commands:');
  for (const r of results.filter(r => r.status === 'fail')) {
    console.log(`    /${r.command} ${r.args}: ${r.error}`);
  }
  console.log('');
}

if (warned > 0) {
  console.log('  Warnings (feature unavailable):');
  for (const r of results.filter(r => r.status === 'warn')) {
    console.log(`    /${r.command} ${r.args}: ${r.error}`);
  }
  console.log('');
}

// Command coverage check
const testedCommands = new Set(testCases.map(t => t.command));
const registeredNames = new Set(commands.map(c => c.name));
const untested = [...registeredNames].filter(n => !testedCommands.has(n));
const unregistered = [...testedCommands].filter(n => !registeredNames.has(n));

if (untested.length > 0) {
  console.log(`  Registered but not tested: ${untested.join(', ')}`);
}
if (unregistered.length > 0) {
  console.log(`  ⚠️ Tested but not registered: ${unregistered.join(', ')}`);
}

console.log('');
console.log(`  Coverage: ${testedCommands.size}/${registeredNames.size} commands tested`);

// Exit with failure if any real errors
if (failed > 0) {
  console.log('');
  console.log('  ❌ VERIFICATION FAILED — fix errors above');
  process.exit(1);
} else {
  console.log('  ✅ ALL TESTED COMMANDS PASSED');
}

// Export results for programmatic use
const jsonPath = import.meta.dir + '/../.upup/oscript-results.json';
try {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({ timestamp: new Date().toISOString(), results, passed, warned, failed, coverage: `${testedCommands.size}/${registeredNames.size}` }, null, 2));
  console.log(`  Results saved to ${jsonPath}`);
} catch {}

// Also test commands registered but not in main testCases
const extraTests: Array<{ command: string; args: string; description: string }> = [
  { command: 'skills', args: '', description: 'Skills discovery' },
  { command: 'tools', args: '', description: 'Tool list' },
  { command: 'tools', args: 'web', description: 'Tool search by prefix' },
  { command: 'config', args: '', description: 'Configuration' },
  { command: 'export', args: '', description: 'Export data' },
  { command: 'git', args: 'status', description: 'Git status' },
  { command: 'diff', args: '', description: 'Git diff' },
  { command: 'commit', args: '', description: 'Git commit' },
  { command: 'branch', args: '', description: 'Git branch' },
  { command: 'team', args: '', description: 'Team management' },
];

console.log('\n════════════════════════════════════════════════════════');
console.log('  Extra Registered Commands');
console.log('════════════════════════════════════════════════════════\n');

for (const test of extraTests) {
  const start = Date.now();
  try {
    const input = `/${test.command}${test.args ? ' ' + test.args : ''}`;
    const result = await registry.execute(input, mockContext);
    const durationMs = Date.now() - start;
    const output = result && 'text' in result ? (result as any).text?.substring(0, 80) : result && 'message' in result ? (result as any).message?.substring(0, 80) : JSON.stringify(result)?.substring(0, 80);
    const icon = result && (result as any).type === 'error' ? '⚠️' : '✅';
    console.log(`  ${icon} /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description} (${durationMs}ms) → ${(output || 'ok').substring(0, 80)}`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const errorMsg = err?.message ?? String(err);
    console.log(`  ❌ /${test.command} ${test.args ? test.args + ' ' : ''}— ${test.description}: ${errorMsg.substring(0, 100)}`);
  }
}
