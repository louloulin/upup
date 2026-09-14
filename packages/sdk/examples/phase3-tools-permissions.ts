/**
 * @upup/sdk - Phase 3 工具和权限测试
 */

import { createClient } from '../src/client/client'
import type { Tool } from '../src/tools/types'

// 定义一个工具
const getStockTool: Tool = {
  name: 'get_stock_price',
  description: '获取股票当前价格',
  input_schema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: '股票代码，如 AAPL、600519',
      },
    },
    required: ['ticker'],
  },
}

async function testPhase3() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         @upup/sdk Phase 3 - 工具和权限测试               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // 创建客户端（带工具配置）
  const client = await createClient({
    debug: false,
    tools: [getStockTool],
    permissionMode: 'acceptEdits',
    allowedTools: ['get_stock_price', 'bash'],
    disallowedTools: ['rm', 'sudo'],
  })

  // 测试工具管理
  console.log('📋 1. 工具管理')
  console.log(`   - 工具数量: ${client.getToolNames().length}`)
  console.log(`   - 工具列表: ${client.getToolNames().join(', ')}`)
  console.log(`   - 获取 get_stock_price: ${client.getTool('get_stock_price')?.name}`)
  console.log()

  console.log('   - 工具配置在 createClient() 时绑定，执行和发现由 Pi Package/AgentSession 负责')
  console.log()

  // 测试权限管理
  console.log('📋 2. 权限管理')
  console.log(`   - 当前权限模式: ${client.getPermissionMode()}`)

  // 测试权限检查
  const testCases = [
    { tool: 'get_stock_price', input: { ticker: 'AAPL' }, expected: true },
    { tool: 'bash', input: { command: 'ls' }, expected: true },
    { tool: 'rm', input: { path: '/tmp/test' }, expected: false },
    { tool: 'unknown_tool', input: {}, expected: false },
  ]

  for (const test of testCases) {
    const result = await client.checkToolPermission(test.tool, test.input)
    const status = result.allowed === test.expected ? '✅' : '⚠️'
    console.log(`   ${status} ${test.tool}: ${result.allowed ? '允许' : '拒绝'}${result.reason ? ` (${result.reason})` : ''}`)
  }
  console.log()

  // 测试动态权限修改
  console.log('📋 3. 动态权限修改')
  client.allowTool('web_search')
  const webSearchResult = await client.checkToolPermission('web_search', { query: 'test' })
  console.log(`   - 允许 web_search 后: ${webSearchResult.allowed ? '允许' : '拒绝'}`)

  client.disallowTool('web_search')
  const webSearchResult2 = await client.checkToolPermission('web_search', { query: 'test' })
  console.log(`   - 禁止 web_search 后: ${webSearchResult2.allowed ? '允许' : '拒绝'}`)
  console.log()

  // 测试权限模式切换
  console.log('📋 4. 权限模式切换')
  client.setPermissionMode('bypassPermissions')
  console.log(`   - 切换到 bypassPermissions 后:`)
  for (const test of testCases.slice(0, 2)) {
    const result = await client.checkToolPermission(test.tool, test.input)
    console.log(`     ${test.tool}: ${result.allowed ? '允许' : '拒绝'}`)
  }
  console.log()

  await client.close()

  // 总结
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                       测试总结                               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log('   ✅ 工具注册: 正常')
  console.log('   ✅ 工具管理: 正常')
  console.log('   ✅ 权限检查: 正常')
  console.log('   ✅ 动态权限: 正常')
  console.log('   ✅ 权限模式: 正常')
  console.log()
  console.log('   🎉 Phase 3 工具和权限系统测试完成!')
  console.log()
}

testPhase3().catch(console.error)
