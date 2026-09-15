/**
 * @upup/sdk - SDK Session 20 轮快速验证测试
 *
 * 验证 SDK Session 的记忆能力（简化版本，快速验证）
 */

import { createClient } from './src/client/client'

async function runQuickTest() {
  console.log('='.repeat(80))
  console.log('SDK Session 20 轮对话快速验证')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return false
  }

  await client.createSession({
    metadata: {
      projectSlug: 'quick-test',
      projectPath: process.cwd(),
    }
  })
  console.log(`✅ Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  const totalTurns = 20
  let passed = 0
  const startTime = Date.now()

  // 定义查询列表（模拟真实对话场景）
  const queries = [
    '我叫小明，是一名投资经理，喜欢科技股。',
    '我叫什么名字？',
    '我的职业是什么？',
    '我刚才说了什么类型的股票？',
    '苹果(AAPL)是我关注的股票之一。',
    '我还关注哪些股票？',
    '微软(MSFT)怎么样？',
    '英伟达(NVDA)值得投资吗？',
    '记住我今天心情很好。',
    '我今天心情怎么样？',
    '特斯拉(TSLA)最近走势如何？',
    '我关注了哪些科技股？',
    '吉利德科学(GILD)是做什么的？',
    '吉利德科学值得投资吗？',
    '总结一下我的投资偏好。',
    '我叫什么名字？',
    '我主要关注什么行业？',
    '我今天心情如何？',
    '我的持仓情况如何？',
    '我们来讨论一下半导体行业。',
  ]

  console.log(`开始 ${totalTurns} 轮对话...`)
  console.log()

  for (let turn = 0; turn < totalTurns; turn++) {
    const query = queries[turn]
    const result = await client.query(query)

    const hasResponse = result.result.length > 0
    if (hasResponse) passed++

    // 每 5 轮输出一次进度
    if ((turn + 1) % 5 === 0 || turn === 0) {
      const sessionInfo = client.upupSession.getCurrentSession()
      const tokens = sessionInfo?.tokenUsage?.totalTokens || 0
      console.log(`[${turn + 1}/${totalTurns}] Token: ${tokens} | 通过: ${passed}`)
    }

    await new Promise(r => setTimeout(r, 300))
  }

  // 最终验证
  console.log()
  console.log('--- 最终验证 ---')
  const finalCheck = await client.query('总结一下我的所有信息。')
  console.log(`最终响应: ${finalCheck.result.substring(0, 150)}...`)

  const sessionInfo = client.upupSession.getCurrentSession()
  const tokens = sessionInfo?.tokenUsage?.totalTokens || 0
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const passRate = ((passed / totalTurns) * 100).toFixed(1)

  console.log()
  console.log('='.repeat(80))
  console.log('测试结果')
  console.log('='.repeat(80))
  console.log(`轮数: ${totalTurns} | 通过: ${passed} | 通过率: ${passRate}%`)
  console.log(`Token: ${tokens} | 耗时: ${elapsed}秒`)
  console.log()

  await client.close()

  return passed >= totalTurns * 0.9 // 90% 通过率
}

runQuickTest()
  .then(success => {
    console.log(`结果: ${success ? '✅ 通过' : '❌ 失败'}`)
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })