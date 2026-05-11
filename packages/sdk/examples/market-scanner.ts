/**
 * @upup/sdk - 市场扫描器
 *
 * 演示 SDK 的批量处理能力
 *
 * 运行: bun run packages/sdk/examples/market-scanner.ts
 */

import { Agent, defineTool } from '../src/index.js'

async function main() {
  console.log()
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║           市场扫描器                                 ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()

  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 30,
  })

  console.log('📡 连接...')
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])
  console.log('✅ 已连接\n')

  // 注册扫描工具
  agent.registerTool(
    defineTool({
      name: 'scan_stocks',
      description: '批量扫描股票',
      inputSchema: { tickers: { type: 'array' }, criteria: { type: 'string' } },
      handler: async ({ tickers, criteria }) => {
        const results = (tickers as string[]).map((t) => ({
          ticker: t,
          price: Math.random() * 1000,
          change: (Math.random() - 0.5) * 10,
          volume: Math.round(Math.random() * 100000000),
          meetsCriteria: Math.random() > 0.5,
        }))
        return { results, count: results.length, matched: results.filter((r) => r.meetsCriteria).length }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'filter_stocks',
      description: '根据条件过滤股票',
      inputSchema: { stocks: { type: 'array' }, filters: { type: 'object' } },
      handler: async ({ stocks, filters }) => {
        return {
          original: (stocks as string[]).length,
          filtered: Math.round((stocks as string[]).length * 0.6),
          filters: filters,
        }
      },
    })
  )

  agent.registerTool(
    defineTool({
      name: 'rank_stocks',
      description: '股票排名',
      inputSchema: { stocks: { type: 'array' }, by: { type: 'string' } },
      handler: async ({ stocks, by }) => ({
        ranking: (stocks as string[]).map((t, i) => ({
          rank: i + 1,
          ticker: t,
          score: 100 - i * 10,
        })),
        criteria: by,
      }),
    })
  )

  console.log(`🔧 已注册 ${agent.getTools().length} 个扫描工具\n`)

  // 批量扫描
  const watchlist = ['600519', '000858', '601318', '000001', '600036', '600276']

  console.log(`📋 扫描关注列表: ${watchlist.join(', ')}`)
  console.log('─'.repeat(60))

  const startTime = Date.now()

  try {
    const result = await agent.run({
      messages: [
        {
          role: 'user',
          content: `扫描以下股票并给出推荐:
${watchlist.join(', ')}

执行:
1. 扫描所有股票数据
2. 按涨跌幅过滤
3. 按综合评分排名
4. 给出 Top 3 推荐`,
        },
      ],
    })

    console.log('\n📊 扫描结果:')
    console.log('─'.repeat(60))
    console.log(result.output.substring(0, 1500))
    console.log('─'.repeat(60))
    console.log(`\n⏱️ 耗时: ${Date.now() - startTime}ms`)
  } catch (error) {
    console.error('❌ 扫描失败:', (error as Error).message)
  }

  await agent.disconnect()
  console.log('\n👋 完成')
}

main().catch(console.error)
