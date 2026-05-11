/**
 * @upup/sdk - 研究助手 Agent
 *
 * 演示如何使用 SDK 构建研究分析 Agent
 *
 * 运行: bun run packages/sdk/examples/research-agent.ts
 */

import { Agent, defineTool } from '../src/index.js'

async function main() {
  console.log()
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║           研究助手 Agent                            ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()

  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 25,
    systemPrompt: '你是一个专业的研究分析师，擅长深度研究和数据分析',
  })

  // 连接
  console.log('📡 连接 Agent...')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('✅ 已连接\n')

  // 注册研究工具
  console.log('🔧 注册研究工具...')

  agent.registerTool(
    defineTool({
      name: 'search_news',
      description: '搜索新闻和公告',
      inputSchema: { keyword: { type: 'string' }, days: { type: 'number' } },
      handler: async ({ keyword, days = 7 }) => ({
        news: [
          { title: `${keyword} 最新动态`, date: '2026-05-11', source: '财经网' },
          { title: `${keyword} 行业分析报告`, date: '2026-05-10', source: '研究机构' },
        ],
        count: 2,
      }),
    })
  )

  agent.registerTool(
    defineTool({
      name: 'get_financial_data',
      description: '获取财务数据',
      inputSchema: { ticker: { type: 'string' }, period: { type: 'string' } },
      handler: async ({ ticker, period = 'Q1' }) => ({
        ticker,
        period,
        revenue: Math.round(Math.random() * 10000000),
        profit: Math.round(Math.random() * 1000000),
        margin: (Math.random() * 30 + 10).toFixed(2) + '%',
      }),
    })
  )

  agent.registerTool(
    defineTool({
      name: 'compare_industry',
      description: '对比行业数据',
      inputSchema: { industry: { type: 'string' } },
      handler: async ({ industry }) => ({
        industry,
        marketSize: '1.2万亿',
        growthRate: '15.3%',
        topPlayers: ['茅台', '五粮液', '洋河'],
        avgPE: 28.5,
      }),
    })
  )

  agent.registerTool(
    defineTool({
      name: 'analyze_sentiment',
      description: '分析市场情绪',
      inputSchema: { ticker: { type: 'string' } },
      handler: async ({ ticker }) => ({
        ticker,
        bullish: 45 + Math.round(Math.random() * 20),
        bearish: 10 + Math.round(Math.random() * 15),
        neutral: 20 + Math.round(Math.random() * 10),
        recommendation: '买入',
      }),
    })
  )

  console.log(`✅ 已注册 ${agent.getTools().length} 个工具\n`)

  // 执行研究任务
  console.log('📋 执行研究任务: 深度分析新能源行业')
  console.log('─'.repeat(60))

  const startTime = Date.now()

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content: `对新能源行业进行深度研究，包括：
1. 搜索最新行业动态
2. 获取主要公司财务数据
3. 行业对比分析
4. 市场情绪评估
5. 给出投资建议`,
        },
      ],
    })

    const duration = Date.now() - startTime

    console.log('\n📊 研究报告:')
    console.log('─'.repeat(60))
    console.log(result.output.substring(0, 2000))
    console.log('─'.repeat(60))
    console.log(`\n📈 统计: 工具调用 ${result.toolCalls} 次, 耗时 ${duration}ms`)
  } catch (error) {
    console.error('❌ 研究失败:', (error as Error).message)
  }

  await agent.disconnect()
  console.log('\n👋 已断开连接')
}

main().catch(console.error)
