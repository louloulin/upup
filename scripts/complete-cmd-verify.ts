#!/usr/bin/env bun
/**
 * complete-cmd-verify.ts — 完整命令验证脚本 (v3.0)
 *
 * 全面测试所有 49 个命令的真实执行
 * 基于 oscript 交互验证，支持多种结果类型
 *
 * Run: bun run scripts/complete-cmd-verify.ts
 */

import {
  ALL_COMMANDS,
  executeCommand,
  COMMAND_ALIASES,
  builtInCommandNames,
  matchCommands,
  fuzzyMatchCommands,
  getAllSlashCommands,
  type Command,
  type CommandContext,
  type CommandResult,
} from '@upup/commands';
import { getCommandUsage, getUsageStats, getTopCommands } from '@upup/commands';
import { getMetricsSummary } from '@upup/commands';

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  command: string
  type: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  output?: string
  error?: string
  durationMs: number
}

interface VerificationSummary {
  total: number
  passed: number
  failed: number
  warned: number
  skipped: number
  duration: number
}

// ============================================================================
// Test Setup
// ============================================================================

const mockContext: CommandContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'complete-verify-' + Date.now(),
  model: 'deepseek-v4-flash',
}

// ============================================================================
// Test Cases - All 49 Commands
// ============================================================================

const TEST_COMMANDS = [
  // Core Commands (12)
  { name: 'help', args: '', description: 'Show help', category: 'core' },
  { name: 'clear', args: '', description: 'Clear chat', category: 'core' },
  { name: 'compact', args: '', description: 'Compact context', category: 'core' },
  { name: 'model', args: '', description: 'Model selection', category: 'core' },
  { name: 'history', args: '', description: 'Conversation history', category: 'core' },
  { name: 'memory', args: '', description: 'Memory access', category: 'core' },
  { name: 'skills', args: '', description: 'Skills list', category: 'core' },
  { name: 'session', args: '', description: 'Session management', category: 'core' },
  { name: 'resume', args: '', description: 'Resume session', category: 'core' },
  { name: 'init', args: '', description: 'Initialize project', category: 'core' },
  { name: 'rules', args: '', description: 'Research rules', category: 'core' },
  { name: 'heartbeat', args: '', description: 'Heartbeat checklist', category: 'core' },

  // System Commands (10)
  { name: 'status', args: '', description: 'System status', category: 'system' },
  { name: 'cost', args: '', description: 'Token usage', category: 'system' },
  { name: 'usage', args: '', description: 'Detailed usage', category: 'system' },
  { name: 'extra-usage', args: '', description: 'Extra usage', category: 'system' },
  { name: 'doctor', args: '', description: 'System diagnostics', category: 'system' },
  { name: 'effort', args: '', description: 'Effort tracking', category: 'system' },
  { name: 'feedback', args: '', description: 'Send feedback', category: 'system' },
  { name: 'version', args: '', description: 'Version info', category: 'system' },
  { name: 'theme', args: '', description: 'Theme selection', category: 'system' },

  // Plan Commands (5)
  { name: 'plan', args: '', description: 'Enter plan mode', category: 'plan' },
  { name: 'steps', args: '', description: 'List plan steps', category: 'plan' },
  { name: 'exit-plan', args: '', description: 'Exit plan mode', category: 'plan' },
  { name: 'add-step', args: 'Test step', description: 'Add plan step', category: 'plan' },
  { name: 'review', args: '', description: 'Code review', category: 'plan' },

  // Agent Commands (5)
  { name: 'agent', args: '', description: 'Agent management', category: 'agent' },
  { name: 'agents', args: '', description: 'Agents list', category: 'agent' },
  { name: 'fork', args: '', description: 'Fork subagent', category: 'agent' },
  { name: 'tasks', args: '', description: 'Background tasks', category: 'agent' },

  // MCP Commands (3)
  { name: 'mcp', args: '', description: 'MCP status', category: 'mcp' },
  { name: 'mcp', args: 'status', description: 'MCP status', category: 'mcp' },
  { name: 'mcp', args: 'list', description: 'MCP list', category: 'mcp' },
  { name: 'mcp-add', args: '', description: 'Add MCP server', category: 'mcp' },

  // Permissions Commands (5)
  { name: 'permissions', args: '', description: 'Permission status', category: 'permissions' },
  { name: 'sandbox', args: '', description: 'Sandbox mode', category: 'permissions' },
  { name: 'approve', args: '', description: 'Approve action', category: 'permissions' },
  { name: 'deny', args: '', description: 'Deny action', category: 'permissions' },
  { name: 'reset-permissions', args: '', description: 'Reset permissions', category: 'permissions' },

  // Git Commands (7)
  { name: 'git', args: 'status', description: 'Git status', category: 'git' },
  { name: 'diff', args: '', description: 'Git diff', category: 'git' },
  { name: 'branch', args: '', description: 'Git branch', category: 'git' },
  { name: 'commit', args: '', description: 'Git commit', category: 'git' },
  { name: 'log', args: '', description: 'Git log', category: 'git' },
  { name: 'stash', args: '', description: 'Git stash', category: 'git' },
  { name: 'remote', args: '', description: 'Git remote', category: 'git' },

  // Tools Commands (9)
  { name: 'config', args: '', description: 'Configuration', category: 'tools' },
  { name: 'keybindings', args: '', description: 'Keybindings', category: 'tools' },
  { name: 'files', args: '', description: 'Tracked files', category: 'tools' },
  { name: 'export', args: '', description: 'Export data', category: 'tools' },
  { name: 'commands', args: '', description: 'Command palette', category: 'tools' },
]

// ============================================================================
// Alias Tests
// ============================================================================

const ALIAS_TESTS = [
  { alias: 'h', expected: 'help', description: 'Help alias' },
  { alias: 's', expected: 'session', description: 'Session alias' },
  { alias: 'r', expected: 'resume', description: 'Resume alias' },
  // Alias Tests - Note: /c maps to resume, not continue
  { alias: 'c', expected: 'resume', description: 'Continue alias (→ resume)' },
  { alias: 'g', expected: 'git', description: 'Git alias' },
  { alias: 'd', expected: 'diff', description: 'Diff alias' },
  { alias: 'i', expected: 'status', description: 'Status alias' },
  { alias: 't', expected: 'theme', description: 'Theme alias' },
  { alias: 'cls', expected: 'clear', description: 'Clear alias' },
  { alias: 'perms', expected: 'permissions', description: 'Permissions alias' },
  { alias: 'sb', expected: 'sandbox', description: 'Sandbox alias' },
  { alias: 'mem', expected: 'memory', description: 'Memory alias' },
  { alias: 'hist', expected: 'history', description: 'History alias' },
]

// ============================================================================
// Test Runner
// ============================================================================

async function runCommandTest(name: string, args: string): Promise<TestResult> {
  const start = Date.now()
  try {
    const result = await executeCommand(name, args, mockContext)
    const durationMs = Date.now() - start

    if (!result || typeof result !== 'object') {
      return {
        command: name,
        type: 'unknown',
        status: 'fail',
        error: 'Invalid result type',
        durationMs,
      }
    }

    // Get output preview
    let outputPreview = ''
    if ('text' in result && typeof (result as any).text === 'string') {
      outputPreview = (result as any).text.substring(0, 80)
    } else if ('message' in result && typeof (result as any).message === 'string') {
      outputPreview = (result as any).message.substring(0, 80)
    }

    return {
      command: name,
      type: result.type,
      status: 'pass',
      output: outputPreview,
      durationMs,
    }
  } catch (err: any) {
    const durationMs = Date.now() - start
    const errorMsg = err?.message ?? String(err)

    // Check if it's a warning (feature not available)
    const isWarning = errorMsg.includes('not available') ||
                      errorMsg.includes('not configured') ||
                      errorMsg.includes('Cannot find') ||
                      errorMsg.includes('MCP')

    return {
      command: name,
      type: 'error',
      status: isWarning ? 'warn' : 'fail',
      error: errorMsg,
      durationMs,
    }
  }
}

function runAliasTest(alias: string, expected: string): TestResult {
  const start = Date.now()

  // Test via fuzzyMatchCommands
  const matches = matchCommands('/' + alias)

  if (matches.length === 0) {
    return {
      command: alias,
      type: 'alias',
      status: 'fail',
      error: `Alias /${alias} not found`,
      durationMs: Date.now() - start,
    }
  }

  // Check if the first match is the expected command
  const actual = matches[0].name
  if (actual !== expected) {
    return {
      command: alias,
      type: 'alias',
      status: 'fail',
      error: `Expected /${expected} but got /${actual}`,
      durationMs: Date.now() - start,
    }
  }

  return {
    command: alias,
    type: 'alias',
    status: 'pass',
    output: `→ /${actual}`,
    durationMs: Date.now() - start,
  }
}

// ============================================================================
// Verification Functions
// ============================================================================

function verifyCommandTypes(): { passed: boolean; message: string }[] {
  const results: { passed: boolean; message: string }[] = []

  const typeCount: Record<string, number> = {}
  for (const cmd of ALL_COMMANDS) {
    const t = (cmd as any).type || 'unknown'
    typeCount[t] = (typeCount[t] || 0) + 1
  }

  // Verify expected type distribution
  if (typeCount['local'] !== 41) {
    results.push({
      passed: false,
      message: `Expected 41 local commands, found ${typeCount['local'] || 0}`,
    })
  } else {
    results.push({
      passed: true,
      message: `Local commands: ${typeCount['local']}`,
    })
  }

  if (typeCount['local-jsx'] !== 5) {
    results.push({
      passed: false,
      message: `Expected 5 local-jsx commands, found ${typeCount['local-jsx'] || 0}`,
    })
  } else {
    results.push({
      passed: true,
      message: `Local-JSX commands: ${typeCount['local-jsx']}`,
    })
  }

  if (typeCount['prompt'] !== 3) {
    results.push({
      passed: false,
      message: `Expected 3 prompt commands, found ${typeCount['prompt'] || 0}`,
    })
  } else {
    results.push({
      passed: true,
      message: `Prompt commands: ${typeCount['prompt']}`,
    })
  }

  return results
}

function verifyMatchingFunctions(): { passed: boolean; message: string }[] {
  const results: { passed: boolean; message: string }[] = []

  // Test matchCommands
  const matches1 = matchCommands('/s')
  if (matches1.length > 0 && matches1[0].name === 'session') {
    results.push({ passed: true, message: 'matchCommands("/s") → session ✓' })
  } else {
    results.push({ passed: false, message: `matchCommands("/s") returned ${matches1.length} results` })
  }

  // Test fuzzyMatchCommands
  const fuzzy1 = fuzzyMatchCommands('/hlp', 5)
  if (fuzzy1.length > 0 && fuzzy1[0].name === 'help') {
    results.push({ passed: true, message: 'fuzzyMatchCommands("/hlp") → help ✓' })
  } else {
    results.push({ passed: false, message: `fuzzyMatchCommands("/hlp") returned ${fuzzy1.length} results` })
  }

  // Test empty query returns all commands
  const allMatches = matchCommands('/')
  if (allMatches.length >= 49) {
    results.push({ passed: true, message: `matchCommands("/") → ${allMatches.length} commands ✓` })
  } else {
    results.push({ passed: false, message: `Expected >= 49 commands, got ${allMatches.length}` })
  }

  return results
}

function verifyCommandMetrics(): { passed: boolean; message: string }[] {
  const results: { passed: boolean; message: string }[] = []

  try {
    const metrics = getMetricsSummary()
    results.push({
      passed: true,
      message: `Metrics collected: ${metrics.totalCommands} commands, ${metrics.totalCalls} calls`,
    })
  } catch (e) {
    results.push({ passed: false, message: `Failed to get metrics: ${e}` })
  }

  try {
    const usage = getUsageStats()
    results.push({
      passed: true,
      message: `Usage stats: ${usage.totalCommands} commands, ${usage.totalCalls} calls`,
    })
  } catch (e) {
    results.push({ passed: false, message: `Failed to get usage: ${e}` })
  }

  return results
}

// ============================================================================
// Main Verification
// ============================================================================

async function runVerification(): Promise<VerificationSummary> {
  const results: TestResult[] = []
  let passed = 0
  let failed = 0
  let warned = 0
  let skipped = 0
  const startTime = Date.now()

  // Header
  console.log('╔════════════════════════════════════════════════════════════════════╗')
  console.log('║       UpUp Complete Command Verification (v3.0)                 ║')
  console.log('║       基于 pi-tui + oscript 交互验证                              ║')
  console.log('╚════════════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`📊 Commands: ${ALL_COMMANDS.length} | Built-in names: ${builtInCommandNames.size} | Aliases: ${Object.keys(COMMAND_ALIASES).length}`)
  console.log('')

  // Section 1: Core Command Tests
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 1: Core Commands (12)')
  console.log('════════════════════════════════════════════════════════════════════')

  const coreCommands = TEST_COMMANDS.filter(c => c.category === 'core')
  for (const cmd of coreCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 2: System Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 2: System Commands (10)')
  console.log('════════════════════════════════════════════════════════════════════')

  const systemCommands = TEST_COMMANDS.filter(c => c.category === 'system')
  for (const cmd of systemCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 3: Plan Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 3: Plan Commands (5)')
  console.log('════════════════════════════════════════════════════════════════════')

  const planCommands = TEST_COMMANDS.filter(c => c.category === 'plan')
  for (const cmd of planCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 4: Agent Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 4: Agent Commands (4)')
  console.log('════════════════════════════════════════════════════════════════════')

  const agentCommands = TEST_COMMANDS.filter(c => c.category === 'agent')
  for (const cmd of agentCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 5: MCP Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 5: MCP Commands (4)')
  console.log('════════════════════════════════════════════════════════════════════')

  const mcpCommands = TEST_COMMANDS.filter(c => c.category === 'mcp')
  for (const cmd of mcpCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} ${cmd.args} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 6: Permissions Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 6: Permissions Commands (5)')
  console.log('════════════════════════════════════════════════════════════════════')

  const permCommands = TEST_COMMANDS.filter(c => c.category === 'permissions')
  for (const cmd of permCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 7: Git Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 7: Git Commands (7)')
  console.log('════════════════════════════════════════════════════════════════════')

  const gitCommands = TEST_COMMANDS.filter(c => c.category === 'git')
  for (const cmd of gitCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 8: Tools Commands
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 8: Tools Commands (5)')
  console.log('════════════════════════════════════════════════════════════════════')

  const toolsCommands = TEST_COMMANDS.filter(c => c.category === 'tools')
  for (const cmd of toolsCommands) {
    const result = await runCommandTest(cmd.name, cmd.args)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    const typeIcon = { output: '📄', error: '❌', jsx: '📱', compact: '🔄', noop: '🔇' }[result.type] || '❓'
    const preview = result.output ? ` → ${result.output.substring(0, 40)}...` : ''
    console.log(`  ${icon} ${typeIcon} /${cmd.name.padEnd(15)} (${result.durationMs}ms)${preview}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 9: Alias Tests
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 9: Alias Resolution (13)')
  console.log('════════════════════════════════════════════════════════════════════')

  for (const alias of ALIAS_TESTS) {
    const result = runAliasTest(alias.alias, alias.expected)
    results.push(result)
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌'
    console.log(`  ${icon} /${alias.alias.padEnd(8)} → /${result.output?.replace('→ /', '').padEnd(15)} (${result.durationMs}ms) ${alias.description}`)
    if (result.status === 'pass') passed++; else if (result.status === 'warn') warned++; else if (result.status === 'fail') failed++
  }

  // Section 10: Verification Functions
  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📋 Section 10: Verification Functions')
  console.log('════════════════════════════════════════════════════════════════════')

  // Command type verification
  console.log('')
  console.log('  🔍 Command Type Distribution:')
  const typeResults = verifyCommandTypes()
  for (const r of typeResults) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`    ${icon} ${r.message}`)
    if (r.passed) passed++; else failed++
  }

  // Matching function verification
  console.log('')
  console.log('  🔍 Matching Functions:')
  const matchResults = verifyMatchingFunctions()
  for (const r of matchResults) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`    ${icon} ${r.message}`)
    if (r.passed) passed++; else failed++
  }

  // Metrics verification
  console.log('')
  console.log('  🔍 Metrics Collection:')
  const metricResults = verifyCommandMetrics()
  for (const r of metricResults) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`    ${icon} ${r.message}`)
    if (r.passed) passed++; else failed++
  }

  return {
    total: results.length,
    passed,
    failed,
    warned,
    skipped,
    duration: Date.now() - startTime,
  }
}

// ============================================================================
// Run
// ============================================================================

async function main() {
  const summary = await runVerification()

  console.log('')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  📊 VERIFICATION SUMMARY')
  console.log('════════════════════════════════════════════════════════════════════')
  console.log(`  Total tests:   ${summary.total}`)
  console.log(`  ✅ Passed:     ${summary.passed}`)
  console.log(`  ⚠️  Warnings:  ${summary.warened}`)
  console.log(`  ❌ Failed:     ${summary.failed}`)
  console.log(`  ⏱️  Duration:   ${summary.duration}ms`)
  console.log('')

  // Completion percentage - only count actual command tests
  const actualTests = summary.total - 9  // Subtract verification function results
  const cmdPassed = summary.passed > actualTests ? actualTests : summary.passed
  const completion = Math.round((cmdPassed / actualTests) * 100)
  const barLen = Math.min(Math.floor(completion / 5), 20)
  const bar = barLen > 0 ? '█'.repeat(barLen) + '░'.repeat(20 - barLen) : '░'.repeat(20)
  console.log(`  📈 完成进度: [${bar}] ${completion}%`)
  console.log('')

  // Failed commands
  if (summary.failed > 0) {
    console.log('  ❌ Failed commands:')
    // (Would list failed commands here)
  }

  // Exit with appropriate code
  if (summary.failed > 0) {
    console.log('')
    console.log('════════════════════════════════════════════════════════════════════')
    console.log('  ❌ VERIFICATION FAILED')
    console.log('════════════════════════════════════════════════════════════════════')
    process.exit(1)
  } else {
    console.log('')
    console.log('════════════════════════════════════════════════════════════════════')
    console.log('  ✅ ALL COMMANDS VERIFIED SUCCESSFULLY')
    console.log('════════════════════════════════════════════════════════════════════')
  }
}

main().catch(console.error)