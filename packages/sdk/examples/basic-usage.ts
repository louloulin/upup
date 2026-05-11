/**
 * @upup/sdk - 基础使用示例
 *
 * 验证 SDK 基本功能
 *
 * 运行: bun run examples/basic-usage.ts
 */

import { Agent, defineTool, StdioAgentClient } from '../src/index.js'

async function testAgentCreation() {
  console.log('=== 测试 1: Agent 创建 ===')
  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 5,
  })

  console.log(`✅ Agent 创建成功`)
  console.log(`   - 模型: ${agent['config'].model}`)
  console.log(`   - 已连接: ${agent.isConnected}`)
  console.log(`   - 工具数量: ${agent.getTools().length}`)
  console.log()
}

async function testToolRegistration() {
  console.log('=== 测试 2: 工具注册 ===')

  const agent = new Agent()

  // 注册工具
  agent.registerTool(
    defineTool({
      name: 'hello',
      description: '打招呼',
      inputSchema: { name: { type: 'string' } },
      handler: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
    })
  )

  agent.registerTool(
    defineTool({
      name: 'add',
      description: '加法计算',
      inputSchema: { a: { type: 'number' }, b: { type: 'number' } },
      handler: async ({ a, b }) => ({ result: a + b }),
    })
  )

  const tools = agent.getTools()
  console.log(`✅ 注册了 ${tools.length} 个工具:`)
  for (const tool of tools) {
    console.log(`   - ${tool.name}: ${tool.description}`)
  }
  console.log()
}

async function testHooks() {
  console.log('=== 测试 3: Hooks ===')

  const agent = new Agent()
  let hookCalled = false

  agent.useHook('thinking', async (ctx) => {
    hookCalled = true
    console.log(`   🪝 Hook 被调用 (thinking)`)
    return ctx
  })

  console.log(`✅ Hook 注册成功`)
  console.log(`   - Hooks 数量: ${agent.getHooks().size}`)
  console.log()
}

async function testFluentApi() {
  console.log('=== 测试 4: Fluent API ===')

  const agent = new Agent()
    .setModel('claude-sonnet-4')
    .setMaxIterations(10)
    .setSystemPrompt('你是一个投资助手')

  console.log(`✅ Fluent API 链式调用成功`)
  console.log(`   - 模型: ${agent['config'].model}`)
  console.log(`   - 最大迭代: ${agent['config'].maxIterations}`)
  console.log(`   - 系统提示: ${agent['config'].systemPrompt}`)
  console.log()
}

async function testStdioClient() {
  console.log('=== 测试 5: StdioAgentClient (不实际连接) ===')

  // 验证客户端类存在
  const client = new StdioAgentClient()
  console.log(`✅ StdioAgentClient 创建成功`)
  console.log(`   - 已连接: ${client.connected}`)
  console.log()
}

async function main() {
  console.log('='.repeat(50))
  console.log('UP SDK 基础功能验证')
  console.log('='.repeat(50))
  console.log()

  await testAgentCreation()
  await testToolRegistration()
  await testHooks()
  await testFluentApi()
  await testStdioClient()

  console.log('='.repeat(50))
  console.log('✅ 所有基础测试通过!')
  console.log('='.repeat(50))
  console.log()
  console.log('下一步: 运行 bun run examples/stock-analysis.ts 进行完整测试')
}

main().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
