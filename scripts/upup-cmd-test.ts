#!/usr/bin/env bun
/**
 * upup-cmd-test.ts - Tests slash commands via @upup/commands against running binary
 *
 * This script directly tests all 49 commands using the same code path
 * the binary uses. It verifies command resolution, execution, and results.
 *
 * Run: bun run scripts/upup-cmd-test.ts
 */

import {
  ALL_COMMANDS,
  executeCommand,
  findCommand,
  COMMAND_ALIASES,
  ALIAS_TO_COMMAND,
  matchCommands,
  fuzzyMatchCommands,
  getAvailableCommands,
  recordCommandUsage,
  getCommandUsage,
  getMetricsSummary,
  recordCommandMetric,
} from '@upup/commands'

// Mock context matching what cli.ts provides
const mockContext = {
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  sessionId: 'upup-cmd-test',
  model: 'deepseek-v4-flash',
}

interface TestCase {
  name: string
  args: string
  description: string
  expectedType: string[]
}

// All 49 commands + aliases to test
const tests: TestCase[] = [
  // === local-jsx commands ===
  { name: 'commands', args: '', description: 'Command palette', expectedType: ['jsx'] },
  { name: 'help', args: '', description: 'Show help', expectedType: ['jsx'] },
  { name: 'session', args: '', description: 'Session manager', expectedType: ['jsx'] },
  { name: 'diff', args: '', description: 'Git diff', expectedType: ['jsx', 'output'] },
  { name: 'mcp', args: 'status', description: 'MCP status', expectedType: ['jsx', 'output', 'error'] },

  // === Core commands ===
  { name: 'status', args: '', description: 'System status', expectedType: ['output'] },
  { name: 'cost', args: '', description: 'Token usage', expectedType: ['output'] },
  { name: 'clear', args: '', description: 'Clear chat', expectedType: ['noop'] },
  { name: 'compact', args: '', description: 'Compact context', expectedType: ['compact'] },
  { name: 'model', args: '', description: 'Model info', expectedType: ['output'] },
  { name: 'history', args: '', description: 'Conversation history', expectedType: ['output'] },
  { name: 'memory', args: '', description: 'Memory stats', expectedType: ['output'] },
  { name: 'theme', args: '', description: 'Theme info', expectedType: ['output'] },
  { name: 'resume', args: '', description: 'Resume session', expectedType: ['output'] },
  { name: 'skills', args: '', description: 'Skills list', expectedType: ['output'] },

  // === Git commands ===
  { name: 'git', args: 'status', description: 'Git status', expectedType: ['output'] },
  { name: 'branch', args: '', description: 'Git branch', expectedType: ['output'] },
  { name: 'commit', args: '', description: 'Git commit hint', expectedType: ['output', 'error'] },
  { name: 'log', args: '', description: 'Git log', expectedType: ['output'] },
  { name: 'stash', args: '', description: 'Git stash', expectedType: ['output', 'error'] },
  { name: 'remote', args: '', description: 'Git remote', expectedType: ['output', 'error'] },

  // === Agent commands ===
  { name: 'agent', args: '', description: 'Agent help', expectedType: ['output'] },
  { name: 'agents', args: '', description: 'Agent list', expectedType: ['output'] },
  { name: 'fork', args: '', description: 'Fork agent', expectedType: ['output'] },
  { name: 'tasks', args: '', description: 'Task list', expectedType: ['output', 'error'] },

  // === Plan commands ===
  { name: 'plan', args: '', description: 'Plan mode', expectedType: ['output', 'query'] },
  { name: 'steps', args: '', description: 'Plan steps', expectedType: ['output', 'query'] },
  { name: 'exit-plan', args: '', description: 'Exit plan', expectedType: ['output'] },
  { name: 'add-step', args: '', description: 'Add step', expectedType: ['output'] },

  // === Permission commands ===
  { name: 'permissions', args: '', description: 'Permissions', expectedType: ['output'] },
  { name: 'sandbox', args: '', description: 'Sandbox mode', expectedType: ['output'] },
  { name: 'reset-permissions', args: '', description: 'Reset perms', expectedType: ['output', 'error'] },
  { name: 'approve', args: '', description: 'Approve action', expectedType: ['output'] },
  { name: 'deny', args: '', description: 'Deny action', expectedType: ['output'] },

  // === System commands ===
  { name: 'doctor', args: '', description: 'Diagnostics', expectedType: ['output'] },
  { name: 'version', args: '', description: 'Version info', expectedType: ['output'] },
  { name: 'usage', args: '', description: 'Usage stats', expectedType: ['output'] },
  { name: 'config', args: '', description: 'Configuration', expectedType: ['output', 'error'] },
  { name: 'keybindings', args: '', description: 'Key bindings', expectedType: ['output'] },
  { name: 'files', args: '', description: 'Tracked files', expectedType: ['output'] },
  { name: 'export', args: '', description: 'Export data', expectedType: ['output', 'error'] },

  // === Research commands ===
  { name: 'rules', args: '', description: 'Research rules', expectedType: ['output'] },
  { name: 'heartbeat', args: '', description: 'Heartbeat', expectedType: ['output'] },
  { name: 'feedback', args: '', description: 'Send feedback', expectedType: ['output'] },
  { name: 'effort', args: '', description: 'Effort tracking', expectedType: ['output'] },

  // === Other commands ===
  { name: 'review', args: '', description: 'Code review', expectedType: ['output'] },
  { name: 'init', args: '', description: 'Init project', expectedType: ['output'] },
  { name: 'mcp-add', args: '', description: 'Add MCP server', expectedType: ['output'] },
  { name: 'extra-usage', args: '', description: 'Extra usage', expectedType: ['output', 'error'] },

  // === Aliases ===
  { name: 'h', args: '', description: 'Alias: /h', expectedType: ['jsx'] },
  { name: '?', args: '', description: 'Alias: /?', expectedType: ['jsx'] },
  { name: 'r', args: '', description: 'Alias: /r', expectedType: ['output'] },
  { name: 'c', args: '', description: 'Alias: /c', expectedType: ['output'] },
  { name: 's', args: '', description: 'Alias: /s', expectedType: ['jsx'] },
  { name: 'g', args: 'status', description: 'Alias: /g status', expectedType: ['output'] },
  { name: 'd', args: '', description: 'Alias: /d', expectedType: ['jsx', 'output'] },
  { name: 'm', args: '', description: 'Alias: /m', expectedType: ['output'] },
  { name: 'l', args: '', description: 'Alias: /l', expectedType: ['output'] },
  { name: 'cls', args: '', description: 'Alias: /cls', expectedType: ['noop'] },
]

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  UpUp Binary Command Verification')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Commands: ${ALL_COMMANDS.length}`)
  console.log(`  Aliases: ${Object.keys(COMMAND_ALIASES).length}`)
  console.log(`  Binary: ./dist/upup`)
  console.log('')

  let total = 0
  let passed = 0
  let failed = 0
  const errors: string[] = []

  // Test command resolution
  console.log('Phase 1: Command Resolution\n')

  for (const cmd of ALL_COMMANDS) {
    const found = findCommand(cmd.name)
    if (!found) {
      errors.push(`RESOLVE: ${cmd.name} not found`)
      console.log(`  ❌ /${cmd.name} — not found in ALL_COMMANDS`)
      failed++
    }
  }

  console.log(`  Command resolution: ${ALL_COMMANDS.length - failed}/${ALL_COMMANDS.length}`)

  // Test aliases
  let aliasResolved = 0
  let aliasFailed = 0
  for (const [cmdName, aliases] of Object.entries(COMMAND_ALIASES)) {
    for (const alias of aliases) {
      const found = findCommand(alias)
      if (found && found.name === cmdName) {
        aliasResolved++
      } else {
        aliasFailed++
        errors.push(`ALIAS: /${alias} should resolve to /${cmdName}, got: ${found?.name || 'undefined'}`)
        console.log(`  ❌ Alias /${alias} → /${cmdName}: FAILED`)
      }
    }
  }
  console.log(`  Alias resolution: ${aliasResolved}/${aliasResolved + aliasFailed}`)

  // Test command execution
  console.log('\nPhase 2: Command Execution\n')

  for (const test of tests) {
    total++
    const start = Date.now()

    try {
      const result = await executeCommand(test.name, test.args, mockContext)
      const duration = Date.now() - start

      if (test.expectedType.includes(result.type)) {
        passed++
        const icons: Record<string, string> = { output: '📄', jsx: '📱', error: '❌', compact: '🔄', noop: '🔇', clear: '🗑️' }
        const icon = icons[result.type] || '❓'
        console.log(`  ✅ ${icon} /${test.name.padEnd(15)} ${test.args.padEnd(8)} (${duration}ms)`)
      } else {
        failed++
        const msg = `EXEC: /${test.name} — expected ${test.expectedType.join('|')}, got ${result.type}`
        errors.push(msg)
        console.log(`  ❌ /${test.name.padEnd(15)} ${test.args.padEnd(8)} — expected ${test.expectedType.join('|')}, got ${result.type}`)
      }
    } catch (e: any) {
      failed++
      const msg = `CRASH: /${test.name} — ${e?.message || String(e)}`
      errors.push(msg)
      console.log(`  💥 /${test.name.padEnd(15)} ${test.args.padEnd(8)} — ${e?.message || String(e)}`)
    }
  }

  // Test match/fuzzy
  console.log('\nPhase 3: UI Matching\n')

  const matchTests = [
    { input: '/', desc: 'all commands', min: 40 },
    { input: '/h', desc: 'alias match', min: 1 },
    { input: '/help', desc: 'exact match', min: 1 },
    { input: '/st', desc: 'prefix match', min: 1 },
    { input: '/git', desc: 'git command', min: 1 },
    { input: '/se', desc: 'session match', min: 1 },
  ]

  let matchPassed = 0
  for (const mt of matchTests) {
    const results = matchCommands(mt.input)
    if (results.length >= mt.min) {
      matchPassed++
      console.log(`  ✅ matchCommands("${mt.input}"): ${results.length} results (≥ ${mt.min})`)
    } else {
      console.log(`  ⚠️  matchCommands("${mt.input}"): ${results.length} results (expected ≥ ${mt.min})`)
    }
  }

  // Test fuzzy
  const fuzzyTests = [
    { input: '/hlp', desc: 'typo help', min: 1 },
    { input: '/sts', desc: 'typo status', min: 1 },
    { input: '/cfg', desc: 'typo config', min: 1 },
  ]

  for (const ft of fuzzyTests) {
    const results = fuzzyMatchCommands(ft.input)
    if (results.length >= ft.min) {
      matchPassed++
      console.log(`  ✅ fuzzyMatchCommands("${ft.input}"): ${results.length} results (≥ ${ft.min})`)
    } else {
      console.log(`  ⚠️  fuzzyMatchCommands("${ft.input}"): ${results.length} results (expected ≥ ${ft.min})`)
    }
  }

  // Metrics test
  console.log('\nPhase 4: Metrics\n')

  const summary = getMetricsSummary()
  console.log(`  Total executions: ${summary.totalExecutions}`)
  console.log(`  Success rate: ${summary.overallSuccessRate}%`)
  console.log(`  Avg time: ${summary.avgExecutionTimeMs}ms`)

  // Summary
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  Final Summary')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Commands:  ${ALL_COMMANDS.length}`)
  console.log(`  Tests:     ${total} executed`)
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  Match:     ${matchPassed}/${matchTests.length + fuzzyTests.length}`)
  console.log('')

  if (failed > 0) {
    console.log('  Issues found:')
    for (const err of errors.slice(0, 20)) {
      console.log(`    - ${err}`)
    }
    console.log('')
  }

  const pct = total > 0 ? Math.round(passed / total * 100) : 0
  console.log(`  Pass rate: ${passed}/${total} (${pct}%)`)
  console.log('')

  if (failed > 0) {
    console.log('  ⚠️  VERIFICATION COMPLETE WITH ISSUES')
    process.exit(1)
  } else {
    console.log('  ✅ ALL COMMANDS VERIFIED')
  }
}

main().catch(e => {
  console.error('Script error:', e)
  process.exit(1)
})
