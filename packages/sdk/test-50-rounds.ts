/**
 * @upup/sdk - 50轮快速记忆测试 (简化版)
 *
 * 验证 SDK Session 在中等长度多轮对话中的上下文保持能力
 * 减少轮次以避免超时，同时保持核心验证逻辑
 */

import { createClient } from './src/client/client'

interface MemoryAnchor {
  turn: number
  key: string
  value: string
  verified: boolean
}

async function run50RoundTest() {
  console.log('='.repeat(80))
  console.log('SDK Session 50轮对话记忆保持测试 (简化版)')
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

  // 创建 Session
  console.log('[初始化] 创建 Session...')
  await client.createSession({
    metadata: {
      projectSlug: '50-round-test',
      projectPath: process.cwd(),
    }
  })
  const sessionId = client.upupSession.getSessionId()
  console.log(`   ✅ Session ID: ${sessionId}`)
  console.log()

  const memoryAnchors: MemoryAnchor[] = []
  const anchorTemplates = [
    { turn: 10, key: '姓名', value: '李明', prompt: '记住我的名字是李明。' },
    { turn: 20, key: '职业', value: '投资经理', prompt: '记住我的职业是投资经理。' },
    { turn: 30, key: '偏好', value: '科技股', prompt: '记住我主要投资科技股。' },
    { turn: 40, key: '持仓', value: 'AAPL', prompt: '记住我持有苹果(AAPL)股票100股。' },
    { turn: 50, key: '目标', value: '财富自由', prompt: '记住我的投资目标是实现财富自由。' },
  ]

  console.log('【对话阶段: 第 1-50 轮】')
  console.log('-'.repeat(80))

  let totalTokens = 0

  for (let turn = 1; turn <= 50; turn++) {
    const anchorTemplate = anchorTemplates.find(a => a.turn === turn)
    let prompt: string

    if (anchorTemplate) {
      prompt = anchorTemplate.prompt
      memoryAnchors.push({
        turn,
        key: anchorTemplate.key,
        value: anchorTemplate.value,
        verified: false,
      })
      console.log(`\n[记忆锚点 #${memoryAnchors.length}] Turn ${turn}: ${anchorTemplate.key} = "${anchorTemplate.value}"`)
    } else {
      const genericPrompts = [
        '继续聊聊投资话题。',
        '有什么新消息吗？',
        '帮我分析一下。',
        '回顾一下我的情况。',
        '调整一下建议。',
      ]
      prompt = genericPrompts[turn % genericPrompts.length]
    }

    console.log(`Turn ${turn}: ${prompt}`)

    const result = await client.query(prompt)
    const response = result.result || ''
    const tokens = result.usage?.totalTokens || 0
    totalTokens += tokens

    if (turn % 10 === 0) {
      console.log(`  → Token: ${tokens}, 累计: ${totalTokens}`)
    }

    if (turn % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // 验证所有记忆锚点
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【验证阶段】')
  console.log('-'.repeat(80))

  const verifyPrompts = [
    { anchor: memoryAnchors[0], q: '我叫什么名字？' },
    { anchor: memoryAnchors[1], q: '我的职业是什么？' },
    { anchor: memoryAnchors[2], q: '我主要投资什么类型的股票？' },
    { anchor: memoryAnchors[3], q: '我持有哪只股票，多少股？' },
    { anchor: memoryAnchors[4], q: '我的投资目标是什么？' },
  ]

  let verifiedCount = 0
  for (const item of verifyPrompts) {
    const anchor = item.anchor
    console.log(`\n验证 ${anchor.key}: "${anchor.value}"`)
    console.log(`  问题: ${item.q}`)

    const result = await client.query(item.q)
    const response = result.result || ''

    const verified = response.includes(anchor.value)
    anchor.verified = verified
    if (verified) verifiedCount++

    console.log(`  回答: ${response.substring(0, 80)}...`)
    console.log(`  结果: ${verified ? '✅ 记住' : '⚠️ 未记住'}`)

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 总结
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【测试结果总结】')
  console.log('='.repeat(80))

  console.log(`\n对话统计:`)
  console.log(`  总轮次: 50`)
  console.log(`  总 Token: ${totalTokens}`)
  console.log(`  平均 Token/轮: ${(totalTokens / 50).toFixed(0)}`)

  console.log(`\n记忆锚点验证 (5个):`)
  console.log(`  通过: ${verifiedCount}/5`)
  console.log(`  通过率: ${(verifiedCount / 5 * 100).toFixed(1)}%`)

  console.log(`\n详细验证结果:`)
  for (const anchor of memoryAnchors) {
    const status = anchor.verified ? '✅' : '❌'
    console.log(`  ${status} [Turn ${anchor.turn}] ${anchor.key} = "${anchor.value}"`)
  }

  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`\nSession 状态:`)
  console.log(`  ID: ${sessionInfo?.id}`)
  console.log(`  Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)

  await client.close()

  const success = verifiedCount >= 4 // 80% 通过率
  console.log(`\n整体结果: ${success ? '✅ 通过' : '❌ 失败'}`)
  console.log(`  (需要至少 4/5 个记忆锚点被正确记住)`)

  return success
}

run50RoundTest()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })