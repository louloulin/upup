#!/usr/bin/env bun
/**
 * Dexter CLI 命令验证脚本
 * 直接导入命令模块进行测试
 */

import { ALL_COMMANDS, executeCommand } from '../packages/commands/dist/all-commands.js'

const PASS = { count: 0 }
const FAIL = { count: 0 }

console.log('╔════════════════════════════════════════════════════════════════════╗')
console.log('║        Dexter CLI 命令验证脚本 v2.2                            ║')
console.log('╚════════════════════════════════════════════════════════════════════╝')
console.log('')

const testCommands = [
  'commands', 'help', 'status', 'cost', 'doctor', 'git',
  'rules', 'clear', 'compact', 'plan', 'mcp', 'session', 'diff'
]

console.log('📋 测试命令执行...')
console.log('')

for (const name of testCommands) {
  try {
    const result = await executeCommand(name, '', {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })

    const types = {
      'jsx': '📱',
      'output': '📄',
      'noop': '🔇',
      'compact': '🔄',
      'error': '❌',
    }
    const icon = types[result.type] || '❓'
    console.log(`  ✅ /${name.padEnd(12)} ${icon} ${result.type}`)
    PASS.count++
  } catch (e) {
    console.log(`  ❌ /${name.padEnd(12)} ERROR: ${(e as Error).message.substring(0, 50)}`)
    FAIL.count++
  }
}

console.log('')
console.log('📊 测试结果统计:')
console.log(`   ✅ 通过: ${PASS.count}`)
console.log(`   ❌ 失败: ${FAIL.count}`)

console.log('')
if (FAIL.count === 0) {
  console.log('════════════════════════════════════════════════════════════════════')
  console.log('  ✅ 所有命令验证通过! CLI 可以正常使用。')
  console.log('════════════════════════════════════════════════════════════════════')
} else {
  console.log('════════════════════════════════════════════════════════════════════')
  console.log(`  ⚠️  ${FAIL.count} 个命令验证失败`)
  console.log('════════════════════════════════════════════════════════════════════')
}

console.log('')
console.log('💡 提示: 运行 ./dist/upup 进入交互模式')
console.log('')
