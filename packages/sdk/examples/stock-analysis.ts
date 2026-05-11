/**
 * @upup/sdk - 股票分析示例
 *
 * 演示如何使用 UP SDK 构建投资分析 Agent
 *
 * 运行: bun run examples/stock-analysis.ts
 */

import { Agent, defineTool } from '../src/index.js'

async function main() {
  console.log('🚀 启动股票分析 Agent...\n')

  // 1. 创建 Agent 并连接
  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 10,
  })

  // 连接 upup-agent
  console.log('📡 连接 Agent 进程...')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('✅ 已连接\n')

  // 2. 注册自定义工具
  agent.registerTool(
    defineTool({
      name: 'get_stock_price',
      description: '获取股票当前价格',
      inputSchema: { ticker: { type: 'string', description: '股票代码，如 600519' } },
      handler: async ({ ticker }) => {
        // 模拟获取价格
        const prices: Record<string, number> = {
          '600519': 1688.88, // 茅台
          '000858': 68.50,   // 五粮液
          'AAPL': 178.50,
        }
        return { ticker, price: prices[ticker] || Math.random() * 1000 }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'get_company_info',
      description: '获取公司基本信息',
      inputSchema: { ticker: { type: 'string', description: '股票代码' } },
      handler: async ({ ticker }) => {
        const companies: Record<string, { name: string; industry: string }> = {
          '600519': { name: '贵州茅台', industry: '白酒' },
          '000858': { name: '五粮液', industry: '白酒' },
        }
        return companies[ticker] || { name: '未知公司', industry: '未知' }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'calculate_risk',
      description: '计算投资风险评分 (0-100)',
      inputSchema: {
        ticker: { type: 'string', description: '股票代码' },
        price: { type: 'number', description: '当前价格' },
      },
      handler: async ({ ticker, price }) => {
        // 简化的风险计算
        const baseRisk = price > 1000 ? 70 : 40
        return { ticker, riskScore: baseRisk + Math.random() * 20 }
      },
    })
  )

  console.log('🔧 已注册工具: get_stock_price, get_company_info, calculate_risk\n')

  // 3. 使用 Hook 监听事件
  agent.useHook('tool_call', async (ctx) => {
    console.log(`   📤 调用工具: ${ctx.tool}`)
    return ctx
  })

  agent.useHook('tool_result', async (ctx) => {
    console.log(`   📥 工具结果:`, ctx.result)
    return ctx
  })

  agent.useHook('thinking', async (ctx) => {
    const content = ctx.content || ''
    if (content.length > 0) {
      console.log(`   💭 思考: ${content.substring(0, 100)}...`)
    }
    return ctx
  })

  // 4. 运行分析
  console.log('📊 开始分析贵州茅台...\n')

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content: '分析贵州茅台(600519)的投资价值，包括当前价格、公司信息和风险评估',
        },
      ],
    })

    console.log('\n' + '='.repeat(50))
    console.log('📋 分析结果:')
    console.log('='.repeat(50))
    console.log(result.output)
    console.log('\n统计信息:')
    console.log(`  - 工具调用: ${result.toolCalls}`)
    console.log(`  - 耗时: ${result.totalTime}ms`)
    console.log('='.repeat(50))
  } catch (error) {
    console.error('❌ 运行失败:', error)
  }

  // 5. 清理
  await agent.disconnect()
  console.log('\n👋 Agent 已断开连接')
}

// 错误处理
main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
