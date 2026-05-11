/**
 * @upup/sdk - 投资组合优化器
 *
 * 演示 SDK 的组合管理和优化能力
 *
 * 运行: bun run packages/sdk/examples/portfolio-optimizer.ts
 */

import { Agent, defineTool } from '../src/index.js'

interface Portfolio {
  stocks: Array<{ ticker: string; weight: number; shares: number }>
  totalValue: number
  risk: number
}

async function main() {
  console.log()
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║           投资组合优化器                              ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()

  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 25,
    systemPrompt: '你是一个专业的量化分析师，擅长投资组合优化和风险管理',
  })

  console.log('📡 连接...')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('✅ 已连接\n')

  // 组合管理工具
  agent.registerTool(
    defineTool({
      name: 'get_portfolio_value',
      description: '计算组合总价值',
      inputSchema: { stocks: { type: 'array' } },
      handler: async ({ stocks }) => {
        const portfolio = stocks as Portfolio['stocks']
        const totalValue = portfolio.reduce(
          (sum, s) => sum + s.weight * s.shares * (Math.random() * 100 + 50),
          0
        )
        return {
          totalValue: Math.round(totalValue),
          currency: 'CNY',
          stockCount: portfolio.length,
        }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'calculate_risk',
      description: '计算组合风险指标',
      inputSchema: { stocks: { type: 'array' } },
      handler: async ({ stocks }) => {
        const portfolio = stocks as Portfolio['stocks']
        return {
          volatility: (Math.random() * 20 + 10).toFixed(2) + '%',
          beta: (Math.random() * 0.5 + 0.8).toFixed(2),
          sharpeRatio: (Math.random() * 2 + 0.5).toFixed(2),
          maxDrawdown: (-Math.random() * 15 - 5).toFixed(2) + '%',
        }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'optimize_weights',
      description: '优化持仓权重',
      inputSchema: { stocks: { type: 'array' }, targetRisk: { type: 'number' } },
      handler: async ({ stocks, targetRisk }) => ({
        optimized: (stocks as string[]).map((t) => ({
          ticker: t,
          originalWeight: (Math.random() * 30 + 10).toFixed(2) + '%',
          optimizedWeight: (Math.random() * 25 + 5).toFixed(2) + '%',
          change: ((Math.random() - 0.5) * 10).toFixed(2) + '%',
        })),
        expectedReturn: (Math.random() * 15 + 5).toFixed(2) + '%',
        targetRisk,
      }),
    })
  )

  agent.registerTool(
    defineTool({
      name: 'rebalance',
      description: '计算再平衡建议',
      inputSchema: { portfolio: { type: 'object' }, targetWeights: { type: 'array' } },
      handler: async ({ portfolio, targetWeights }) => {
        const actions = (targetWeights as Array<{ ticker: string; weight: number }>).map((t) => ({
          ticker: t.ticker,
          action: Math.random() > 0.5 ? '买入' : '卖出',
          shares: Math.round(Math.random() * 1000),
          estimatedCost: Math.round(Math.random() * 50000),
        }))
        return {
          actions,
          totalTrades: actions.length,
          estimatedFees: actions.reduce((sum, a) => sum + (a.estimatedCost as number), 0) * 0.0003,
        }
      },
    })
  )

  console.log(`🔧 已注册 ${agent.getTools().length} 个组合管理工具\n`)

  // 优化任务
  const currentPortfolio = [
    { ticker: '600519', weight: 0.3, shares: 100 },
    { ticker: '000858', weight: 0.25, shares: 5000 },
    { ticker: '601318', weight: 0.2, shares: 2000 },
    { ticker: '600036', weight: 0.15, shares: 3000 },
    { ticker: '000001', weight: 0.1, shares: 10000 },
  ]

  console.log('📋 当前组合:')
  console.log(`   总价值: ¥${Math.round(Math.random() * 1000000 + 500000)}`)
  console.log(`   股票数: ${currentPortfolio.length}`)
  console.log('─'.repeat(60))

  const startTime = Date.now()

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content: `优化以下投资组合:

当前持仓:
${currentPortfolio.map((s) => `${s.ticker}: ${(s.weight * 100).toFixed(0)}%`).join('\n')}

请执行:
1. 计算当前组合价值
2. 评估风险指标
3. 给出优化建议
4. 计算再平衡操作`,
        },
      ],
    })

    console.log('\n📊 优化结果:')
    console.log('─'.repeat(60))
    console.log(result.output.substring(0, 2000))
    console.log('─'.repeat(60))
    console.log(`\n⏱️ 耗时: ${Date.now() - startTime}ms`)
  } catch (error) {
    console.error('❌ 优化失败:', (error as Error).message)
  }

  await agent.disconnect()
  console.log('\n👋 完成')
}

main().catch(console.error)
