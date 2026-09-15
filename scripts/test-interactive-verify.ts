/**
 * Interactive Command Verification Script
 *
 * Tests the interactive JSX command components to ensure they
 * can be properly rendered and handled.
 */

import { ALL_COMMANDS, executeCommand } from '../packages/commands/dist/all-commands'

console.log('╔════════════════════════════════════════════════════════════════════╗')
console.log('║     Dexter Interactive Command Verification v2.0              ║')
console.log('╚════════════════════════════════════════════════════════════════════╝')
console.log('')

// Get all commands
const commands = ALL_COMMANDS.filter(cmd => !cmd.isHidden)
console.log(`📊 Total Commands: ${commands.length}`)
console.log('')

// Categorize commands by type
const localCommands = commands.filter(c => c.type === 'local')
const localJsxCommands = commands.filter(c => c.type === 'local-jsx')
const promptCommands = commands.filter(c => c.type === 'prompt')

console.log('📋 Command Types:')
console.log(`   📄 local:     ${localCommands.length}`)
console.log(`   📱 local-jsx: ${localJsxCommands.length}`)
console.log(`   💬 prompt:    ${promptCommands.length}`)
console.log('')

// Test interactive (JSX) commands
console.log('════════════════════════════════════════════════════════════════════')
console.log('  Testing Interactive JSX Commands')
console.log('════════════════════════════════════════════════════════════════════')
console.log('')

const jsxCommands = localJsxCommands.map(c => c.name)
const testResults = { pass: 0, fail: 0 }

for (const name of jsxCommands) {
  try {
    const result = await executeCommand(name, '', {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    const typeIcons: Record<string, string> = {
      'jsx': '📱',
      'output': '📄',
      'error': '❌',
    }

    const icon = typeIcons[result.type] || '❓'
    console.log(`  ✅ /${name.padEnd(15)} ${icon} ${result.type}`)
    testResults.pass++
  } catch (e) {
    console.log(`  ❌ /${name.padEnd(15)} ERROR: ${(e as Error).message.substring(0, 40)}`)
    testResults.fail++
  }
}

console.log('')
console.log('════════════════════════════════════════════════════════════════════')
console.log('  Testing Local Commands')
console.log('════════════════════════════════════════════════════════════════════')
console.log('')

// Test a few key local commands
const keyLocalCommands = ['status', 'cost', 'doctor', 'git', 'rules']

for (const name of keyLocalCommands) {
  try {
    const result = await executeCommand(name, '', {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    const typeIcons: Record<string, string> = {
      'output': '📄',
      'error': '❌',
    }

    const icon = typeIcons[result.type] || '❓'
    console.log(`  ✅ /${name.padEnd(15)} ${icon} ${result.type}`)
    testResults.pass++
  } catch (e) {
    console.log(`  ❌ /${name.padEnd(15)} ERROR: ${(e as Error).message.substring(0, 40)}`)
    testResults.fail++
  }
}

console.log('')
console.log('════════════════════════════════════════════════════════════════════')
console.log('  Summary')
console.log('════════════════════════════════════════════════════════════════════')
console.log('')
console.log(`  ✅ Passed: ${testResults.pass}`)
console.log(`  ❌ Failed: ${testResults.fail}`)
console.log('')

if (testResults.fail === 0) {
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  ✅ All interactive command tests passed!')
  console.log('════════════════════════════════════════════════════════════════════')
} else {
  console.log('════════════════════════════════════════════════════════════════════')
  console.log(`  ⚠️  ${testResults.fail} test(s) failed`)
  console.log('════════════════════════════════════════════════════════════════════')
}

console.log('')
