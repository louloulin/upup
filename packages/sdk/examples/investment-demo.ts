/**
 * @upup/sdk - 投资功能验证
 *
 * 验证 SDK 的投资分析能力
 * 展示工具注册、Agent 运行、结果解析
 *
 * 运行: bun run packages/sdk/examples/investment-demo.ts
 */

import { Agent, defineTool } from '../src/index.js'

interface StockAnalysis {
  ticker: string
  name: string
  price: number
  change: number
  volume: number
  marketCap: string
}

interface TechnicalIndicators {
  ticker: string
  ma5: number
  ma10: number
  ma20: number
  rsi: number
  macd: { dif: number; dea: number; histogram: number }
}

async function getStockData(ticker: string): Promise<StockAnalysis> {
  const data: Record<string, StockAnalysis> = {
    '600519': {
      ticker: '600519',
      name: '贵州茅台',
      price: 1361.33,
      change: -0.85,
      volume: 779000000,
      marketCap: '1.71万亿',
    },
    '000858': {
      ticker: '000858',
      name: '五粮液',
      price: 68.5,
      change: 1.23,
      volume: 1230000000,
      marketCap: '2650亿',
    },
    'AAPL': {
      ticker: 'AAPL',
      name: '苹果公司',
      price: 178.5,
      change: 0.45,
      volume: 45600000,
      marketCap: '2.78万亿',
    },
  }
  return data[ticker] || { ticker, name: '未知', price: 0, change: 0, volume: 0, marketCap: '未知' }
}

async function getTechnicalIndicators(ticker: string): Promise<TechnicalIndicators> {
  return {
    ticker,
    ma5: 1380 + Math.random() * 20,
    ma10: 1375 + Math.random() * 20,
    ma20: 1360 + Math.random() * 30,
    rsi: 30 + Math.random() * 40,
    macd: {
      dif: -5 + Math.random() * 10,
      dea: -3 + Math.random() * 8,
      histogram: -2 + Math.random() * 5,
    },
  }
}

async function calculateValuation(ticker: string, price: number): Promise<Record<string, number>> {
  const peBase = { '600519': 22, '000858': 18, 'AAPL': 28 }
  const pbBase = { '600519': 5.2, '000858': 3.1, 'AAPL': 45 }
  const roeBase = { '600519': 32, '000858': 18, 'AAPL': 52 }

  return {
    pe: peBase[ticker] || 15,
    pb: pbBase[ticker] || 2,
    roe: roeBase[ticker] || 15,
    dividendYield: 2.5,
    peg: 1.2,
  }
}

async function analyzeRisk(ticker: string, price: number): Promise<Record<string, unknown>> {
  const riskFactors = {
    volatility: price > 1000 ? '高' : '中',
    liquidity: '高',
    industryRisk: '中',
    marketRisk: '中',
  }

  const overallRisk = price > 1000 ? 65 : 45

  return {
    ...riskFactors,
    score: overallRisk,
    level: overallRisk > 60 ? '高风险' : overallRisk > 40 ? '中等风险' : '低风险',
  }
}

// ============================================================
// 主验证流程
// ============================================================

async function main() {
  console.log()
  console.log('╔' + '═'.repeat(56) + '╗')
  console.log('║' + ' '.repeat(14) + '投资功能验证演示' + ' '.repeat(20) + '║')
  console.log('╚' + '═'.repeat(56) + '╝')
  console.log()

  // 1. 创建 Agent
  console.log('📋 步骤 1: 创建 Agent')
  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 20,
    systemPrompt: '你是一个专业的投资分析师，专注于A股和美股分析',
  })
  console.log('   ✅ Agent 创建成功')
  console.log(`   - 模型: ${agent['config'].model}`)
  console.log(`   - 最大迭代: ${agent['config'].maxIterations}`)
  console.log()

  // 2. 连接
  console.log('📋 步骤 2: 连接 upup-agent')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('   ✅ 连接成功')
  console.log(`   - 连接状态: ${agent.isConnected}`)
  console.log()

  // 3. 注册投资工具
  console.log('📋 步骤 3: 注册投资工具')
  console.log()

  agent.registerTool(
    defineTool({
      name: 'get_stock_price',
      description: '获取股票实时价格',
      inputSchema: { ticker: { type: 'string', description: '股票代码' } },
      handler: async ({ ticker }) => getStockData(ticker),
    })
  )
  console.log('   ✅ 注册: get_stock_price')

  agent.registerTool(
    defineTool({
      name: 'get_technical',
      description: '获取技术指标',
      inputSchema: { ticker: { type: 'string' } },
      handler: async ({ ticker }) => getTechnicalIndicators(ticker),
    })
  )
  console.log('   ✅ 注册: get_technical')

  agent.registerTool(
    defineTool({
      name: 'calculate_valuation',
      description: '计算估值指标',
      inputSchema: {
        ticker: { type: 'string' },
        price: { type: 'number' },
      },
      handler: async ({ ticker, price }) => calculateValuation(ticker, price as number),
    })
  )
  console.log('   ✅ 注册: calculate_valuation')

  agent.registerTool(
    defineTool({
      name: 'analyze_risk',
      description: '分析投资风险',
      inputSchema: {
        ticker: { type: 'string' },
        price: { type: 'number' },
      },
      handler: async ({ ticker, price }) => analyzeRisk(ticker, price as number),
    })
  )
  console.log('   ✅ 注册: analyze_risk')

  agent.registerTool(
    defineTool({
      name: 'compare_stocks',
      description: '对比多只股票',
      inputSchema: { tickers: { type: 'array', items: { type: 'string' } } },
      handler: async ({ tickers }) => {
        const results = await Promise.all(
          (tickers as string[]).map(async (t) => ({
            ticker: t,
            data: await getStockData(t),
          }))
        )
        return results
      },
    })
  )
  console.log('   ✅ 注册: compare_stocks')

  console.log(`   总计: ${agent.getTools().length} 个工具`)
  console.log()

  // 4. 配置 Hooks
  console.log('📋 步骤 4: 配置事件监听')
  let toolCalls = 0

  agent.useHook('tool_call', async (ctx) => {
    toolCalls++
    console.log(`   📤 [工具 #${toolCalls}] ${ctx.tool}`)
    return ctx
  })

  agent.useHook('tool_result', async (ctx) => {
    const result = JSON.stringify(ctx.result)
    console.log(`   📥 [结果] ${result.substring(0, 80)}${result.length > 80 ? '...' : ''}`)
    return ctx
  })

  console.log('   ✅ Hooks 配置完成')
  console.log()

  // 5. 执行股票分析
  console.log('📋 步骤 5: 执行股票分析')
  console.log('─'.repeat(60))

  const stocks = ['600519', '000858', 'AAPL']

  for (const ticker of stocks) {
    console.log()
    console.log(`   📈 分析 ${ticker}...`)

    const startTime = Date.now()

    try {
      const result = await agent.run({
        messages: [
          {
            role: 'user',
            content: `分析股票 ${ticker} 的投资价值，给出简明的分析报告`,
          },
        ],
      })

      const duration = Date.now() - startTime

      console.log()
      console.log(`   ┌${'─'.repeat(56)}┐`)
      console.log(`   │ ${ticker} 分析结果 (${duration}ms) │`)
      console.log(`   ├${'─'.repeat(56)}┤`)

      // 显示部分结果
      const lines = result.output.split('\n').slice(0, 5)
      for (const line of lines) {
        console.log(`   │ ${line.substring(0, 54).padEnd(54)} │`)
      }
      console.log(`   │ ${'...'}`.padEnd(57) + '│')
      console.log(`   └${'─'.repeat(56)}┘`)

      console.log(`   📊 工具调用: ${result.toolCalls}次`)
    } catch (error) {
      console.log(`   ❌ 分析失败: ${(error as Error).message}`)
    }
  }

  console.log()
  console.log('─'.repeat(60))
  console.log()

  // 6. 对比分析
  console.log('📋 步骤 6: 对比分析多只股票')

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content: `对比分析 600519(茅台)、000858(五粮液)、AAPL(苹果) 三只股票，给出投资建议`,
        },
      ],
    })

    console.log()
    console.log('   ┌' + '─'.repeat(56) + '┐')
    console.log('   │ 对比分析结果'.padEnd(57) + '│')
    console.log('   ├' + '─'.repeat(56) + '┤')

    const lines = result.output.split('\n').slice(0, 8)
    for (const line of lines) {
      console.log(`   │ ${line.substring(0, 54).padEnd(54)} │`)
    }
    console.log(`   │ ${'...'}`.padEnd(57) + '│')
    console.log('   └' + '─'.repeat(56) + '┘')
    console.log(`   📊 工具调用: ${result.toolCalls}次`)
  } catch (error) {
    console.log(`   ❌ 对比分析失败: ${(error as Error).message}`)
  }

  console.log()

  // 7. 清理
  console.log('📋 步骤 7: 清理资源')
  await agent.disconnect()
  console.log('   ✅ 连接已关闭')
  console.log()

  // 总结
  console.log('═'.repeat(60))
  console.log('📊 验证总结')
  console.log('═'.repeat(60))
  console.log(`   ✅ Agent 创建: 成功`)
  console.log(`   ✅ 连接 stdio: 成功`)
  console.log(`   ✅ 工具注册: ${agent.getTools().length} 个`)
  console.log(`   ✅ 工具调用: ${toolCalls} 次`)
  console.log(`   ✅ 股票分析: ${stocks.length} 只`)
  console.log('═'.repeat(60))
  console.log()
  console.log('🎉 投资功能验证完成!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
