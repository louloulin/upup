/**
 * @upup/sdk - 完整项目演示
 *
 * 这是一个完整的、可运行的 UP SDK 演示项目
 * 展示 SDK 的所有核心功能
 *
 * 运行: bun run packages/sdk/examples/demo-project.ts
 */

import { Agent, defineTool, StdioAgentClient } from '../src/index.js'

// ============================================================
// 完整项目: 投资分析助手
// ============================================================

interface InvestmentAnalysis {
  stock: string
  price: number
  riskScore: number
  recommendation: string
}

async function demoInvestmentAssistant() {
  console.log('\n' + '═'.repeat(60))
  console.log('💰 投资项目: 投资分析助手')
  console.log('═'.repeat(60))

  // 1. 创建 Agent
  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 15,
    systemPrompt: '你是一个专业的投资分析师',
  })

  // 2. 连接
  console.log('\n📡 连接 Agent...')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('✅ 已连接')
  console.log(`   - 连接状态: ${agent.isConnected}`)

  // 3. 注册工具
  console.log('\n🔧 注册工具...')

  agent.registerTool(
    defineTool({
      name: 'get_stock_price',
      description: '获取股票当前价格',
      inputSchema: { ticker: { type: 'string', description: '股票代码' } },
      handler: async ({ ticker }) => {
        const prices: Record<string, number> = {
          '600519': 1688.88,
          '000858': 68.50,
          'AAPL': 178.50,
          'GOOGL': 142.30,
        }
        return { ticker, price: prices[ticker] || 100, currency: 'CNY' }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'get_company_info',
      description: '获取公司基本信息',
      inputSchema: { ticker: { type: 'string' } },
      handler: async ({ ticker }) => {
        const companies: Record<string, { name: string; industry: string; employees: number }> = {
          '600519': { name: '贵州茅台', industry: '白酒', employees: 30000 },
          '000858': { name: '五粮液', industry: '白酒', employees: 25000 },
        }
        return companies[ticker] || { name: '未知', industry: '未知', employees: 0 }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'calculate_risk',
      description: '计算投资风险评分 (0-100)',
      inputSchema: {
        ticker: { type: 'string' },
        price: { type: 'number' },
      },
      handler: async ({ ticker, price }) => {
        const riskScore = price > 1000 ? 65 : 45
        return {
          ticker,
          riskScore,
          level: riskScore > 60 ? '高风险' : '中等风险',
        }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'calculate_return',
      description: '计算预期收益率',
      inputSchema: {
        currentPrice: { type: 'number' },
        targetPrice: { type: 'number' },
      },
      handler: async ({ currentPrice, targetPrice }) => {
        const returnRate = ((targetPrice - currentPrice) / currentPrice) * 100
        return {
          currentPrice,
          targetPrice,
          returnRate: returnRate.toFixed(2) + '%',
        }
      },
    })
  )

  console.log(`✅ 已注册 ${agent.getTools().length} 个工具`)
  for (const tool of agent.getTools()) {
    console.log(`   - ${tool.name}: ${tool.description}`)
  }

  // 4. 添加 Hooks
  console.log('\n🪝 配置 Hooks...')

  let toolCallCount = 0
  let thinkingCount = 0

  agent.useHook('tool_call', async (ctx) => {
    toolCallCount++
    console.log(`   📤 [Tool #${toolCallCount}] ${ctx.tool}`)
    return ctx
  })

  agent.useHook('tool_result', async (ctx) => {
    console.log(`   📥 [Result] ${JSON.stringify(ctx.result).substring(0, 80)}...`)
    return ctx
  })

  agent.useHook('thinking', async (ctx) => {
    thinkingCount++
    if (thinkingCount <= 3) {
      console.log(`   💭 [思考 #${thinkingCount}] ${(ctx.content || '').substring(0, 60)}...`)
    }
    return ctx
  })

  console.log(`✅ 已配置 ${agent.getHooks().size} 种 Hook`)

  // 5. 执行分析
  console.log('\n📊 执行投资分析...\n')

  const startTime = Date.now()

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content:
            '分析贵州茅台(600519)的投资价值，包括：\n' +
            '1. 当前价格\n' +
            '2. 公司信息\n' +
            '3. 风险评估\n' +
            '4. 给出投资建议',
        },
      ],
    })

    const endTime = Date.now()

    // 6. 输出结果
    console.log('\n' + '─'.repeat(60))
    console.log('📋 分析报告')
    console.log('─'.repeat(60))
    console.log(result.output)
    console.log('─'.repeat(60))

    console.log('\n📈 统计信息:')
    console.log(`   - 工具调用次数: ${result.toolCalls}`)
    console.log(`   - 迭代次数: ${result.iterations}`)
    console.log(`   - 总耗时: ${result.totalTime}ms`)
    console.log(`   - Hook 触发: 思考 ${thinkingCount} 次, 工具 ${toolCallCount} 次`)

    // 7. 清理
    await agent.disconnect()
    console.log('\n👋 连接已关闭')

    return {
      success: true,
      toolCalls: result.toolCalls,
      time: endTime - startTime,
    }
  } catch (error) {
    console.error('❌ 分析失败:', error)
    await agent.disconnect()
    return { success: false, toolCalls: 0, time: 0 }
  }
}

// ============================================================
// 演示: CLI 直接通信
// ============================================================

async function demoDirectCLI() {
  console.log('\n\n' + '═'.repeat(60))
  console.log('🖥️ 演示: 直接 CLI 通信')
  console.log('═'.repeat(60))

  console.log('\n📡 连接到 upup-agent...')

  const client = await StdioAgentClient.connect('bun', ['run', 'upup-agent/src/cli.ts'])

  console.log(`✅ 连接状态: ${client.connected}`)

  // 测试各种方法
  console.log('\n📤 发送 initialize...')
  const initResult = await client.request('initialize', {
    clientName: 'demo-project',
    version: '1.0.0',
  })
  console.log(`✅ 版本信息: ${(initResult as any)?.version}`)

  console.log('\n📤 发送 run (不带工具)...')
  const runResult = await client.request('run', {
    messages: [{ role: 'user', content: '你好，请介绍一下自己' }],
  })
  console.log(`✅ Agent 回复: ${((runResult as any)?.output || '').substring(0, 100)}...`)

  console.log('\n📤 关闭连接...')
  await client.shutdown()
  console.log('✅ 已关闭')
}

// ============================================================
// 演示: 工具注册流程
// ============================================================

function demoToolRegistration() {
  console.log('\n\n' + '═'.repeat(60))
  console.log('🔧 演示: 工具注册流程')
  console.log('═'.repeat(60))

  const agent = new Agent()

  console.log('\n📝 创建 Agent...')
  console.log(`   初始工具数量: ${agent.getTools().length}`)

  // 定义工具
  const tools = [
    defineTool({
      name: 'calculator',
      description: '简单的计算器',
      inputSchema: { a: { type: 'number' }, b: { type: 'number' }, op: { type: 'string' } },
      handler: async ({ a, b, op }) => {
        const ops: Record<string, number> = { '+': a + b, '-': a - b, '*': a * b, '/': b !== 0 ? a / b : 0 }
        return { result: ops[op] || 0 }
      },
    }),
    defineTool({
      name: 'date_now',
      description: '获取当前日期时间',
      inputSchema: {},
      handler: async () => ({ date: new Date().toISOString() }),
    }),
    defineTool({
      name: 'weather',
      description: '获取天气信息',
      inputSchema: { city: { type: 'string' } },
      handler: async ({ city }) => ({ city, temp: Math.round(Math.random() * 30), condition: '晴' }),
    }),
  ]

  // 批量注册
  console.log('\n🔧 批量注册工具...')
  agent.registerTools(tools)
  console.log(`   注册后工具数量: ${agent.getTools().length}`)

  // 列出工具
  console.log('\n📋 已注册工具列表:')
  for (const tool of agent.getTools()) {
    console.log(`   - ${tool.name}: ${tool.description}`)
  }

  // 测试移除
  console.log('\n🗑️ 移除 calculator...')
  agent.removeTool('calculator')
  console.log(`   移除后工具数量: ${agent.getTools().length}`)

  return agent.getTools().length === 2
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log()
  console.log('╔' + '═'.repeat(58) + '╗')
  console.log('║' + ' '.repeat(15) + 'UP SDK 完整项目演示' + ' '.repeat(18) + '║')
  console.log('╚' + '═'.repeat(58) + '╝')
  console.log()
  console.log('这个演示展示 UP SDK 的所有核心功能:')
  console.log('  1. Agent 创建和连接')
  console.log('  2. 工具注册和管理')
  console.log('  3. Hooks 系统')
  console.log('  4. Stdio 通信')
  console.log('  5. 完整投资分析流程')
  console.log()

  const results: Record<string, boolean> = {}

  // 演示 1: 工具注册
  try {
    results['工具注册'] = demoToolRegistration()
  } catch (e) {
    results['工具注册'] = false
  }

  // 演示 2: 直接 CLI 通信
  try {
    await demoDirectCLI()
    results['CLI通信'] = true
  } catch (e) {
    console.error('CLI 通信失败:', e)
    results['CLI通信'] = false
  }

  // 演示 3: 投资分析助手
  try {
    const result = await demoInvestmentAssistant()
    results['投资分析'] = result.success
  } catch (e) {
    console.error('投资分析失败:', e)
    results['投资分析'] = false
  }

  // 总结
  console.log('\n\n' + '═'.repeat(60))
  console.log('📊 演示结果总结')
  console.log('═'.repeat(60))

  for (const [name, success] of Object.entries(results)) {
    console.log(`   ${success ? '✅' : '❌'} ${name}: ${success ? '成功' : '失败'}`)
  }

  const allPassed = Object.values(results).every(Boolean)
  console.log()
  console.log(allPassed ? '🎉 所有演示成功完成!' : '⚠️ 部分演示失败')
  console.log('═'.repeat(60))

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
