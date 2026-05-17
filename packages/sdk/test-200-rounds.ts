/**
 * @upup/sdk - 200轮对话记忆保持测试
 *
 * 验证 SDK Session 在长时间多轮对话中的上下文保持能力
 *
 * 测试策略:
 * - 每 20 轮设置一个"记忆锚点"（关键信息）
 * - 在第 100 轮和第 200 轮验证所有记忆锚点
 * - 记录 Token 使用量变化
 * - 检测上下文是否丢失
 */

import { createClient } from './src/client/client.js'

interface MemoryAnchor {
  turn: number
  key: string
  value: string
  verified: boolean
  verifiedAt?: number
}

interface TurnResult {
  turn: number
  prompt: string
  response: string
  tokens: number
  isEmpty: boolean
}

async function run200RoundTest() {
  console.log('='.repeat(80))
  console.log('SDK Session 200轮对话记忆保持测试')
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
      projectSlug: '200-round-test',
      projectPath: process.cwd(),
    }
  })
  const sessionId = client.upupSession.getSessionId()
  console.log(`   ✅ Session ID: ${sessionId}`)
  console.log()

  // 记忆锚点 - 每 20 轮设置一个
  const memoryAnchors: MemoryAnchor[] = []
  const turnResults: TurnResult[] = []

  // 定义记忆锚点模式
  const anchorTemplates = [
    { turn: 20, key: '姓名', value: '李明', prompt: '记住我的名字是李明。' },
    { turn: 40, key: '职业', value: '投资经理', prompt: '记住我的职业是投资经理。' },
    { turn: 60, key: '偏好', value: '科技股', prompt: '记住我主要投资科技股。' },
    { turn: 80, key: '持仓', value: 'AAPL', prompt: '记住我持有苹果(AAPL)股票100股。' },
    { turn: 100, key: '目标', value: '财富自由', prompt: '记住我的投资目标是实现财富自由。' },
    { turn: 120, key: '风险', value: '稳健', prompt: '记住我的投资风格偏好是稳健型。' },
    { turn: 140, key: '期限', value: '长期', prompt: '记住我的投资期限是长期持有。' },
    { turn: 160, key: '金额', value: '100万', prompt: '记住我的投资金额目标是100万。' },
    { turn: 180, key: '城市', value: '北京', prompt: '记住我常驻城市是北京。' },
    { turn: 200, key: '最终', value: '测试完成', prompt: '记住这是第200轮对话测试。' },
  ]

  // 第一阶段: 执行 1-100 轮
  console.log('【第一阶段: 第 1-100 轮对话】')
  console.log('-'.repeat(80))

  let totalTokens = 0

  for (let turn = 1; turn <= 100; turn++) {
    // 检查是否需要设置记忆锚点
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
      // 通用对话
      const genericPrompts = [
        '今天市场行情怎么样？',
        '帮我分析一下科技股走势。',
        '有什么投资建议吗？',
        '最近有什么好股票推荐吗？',
        '继续聊聊投资话题。',
      ]
      prompt = genericPrompts[turn % genericPrompts.length]
    }

    console.log(`Turn ${turn}: ${prompt.substring(0, 40)}...`)

    const result = await client.query(prompt)
    const response = result.result || ''
    const tokens = result.usage?.totalTokens || 0
    totalTokens += tokens

    const isEmpty = response.length === 0

    turnResults.push({
      turn,
      prompt,
      response,
      tokens,
      isEmpty,
    })

    if (turn % 10 === 0) {
      console.log(`  → Token: ${tokens}, 累计: ${totalTokens}, ${isEmpty ? '[工具]' : '[响应]'}`)
    }

    // 每 10 轮暂停一下
    if (turn % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // 第一阶段验证: 第 100 轮验证前 5 个记忆锚点
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【第一阶段验证: 第 100 轮】')
  console.log('-'.repeat(80))
  console.log('验证前 5 个记忆锚点...')

  const verifyPrompts100 = [
    '我叫什么名字？',
    '我的职业是什么？',
    '我主要投资什么类型的股票？',
    '我持有哪只股票，多少股？',
    '我的投资目标是什么？',
  ]

  for (let i = 0; i < verifyPrompts100.length; i++) {
    const anchor = memoryAnchors[i]
    console.log(`\n验证 ${anchor.key}: "${anchor.value}"`)
    console.log(`  问题: ${verifyPrompts100[i]}`)

    const result = await client.query(verifyPrompts100[i])
    const response = result.result || ''

    // 检查是否包含锚点值
    const verified = response.includes(anchor.value)
    anchor.verified = verified
    anchor.verifiedAt = 100

    console.log(`  回答: ${response.substring(0, 80)}...`)
    console.log(`  结果: ${verified ? '✅ 记住' : '⚠️ 未记住'}`)

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 第二阶段: 执行 101-200 轮
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【第二阶段: 第 101-200 轮对话】')
  console.log('-'.repeat(80))

  for (let turn = 101; turn <= 200; turn++) {
    // 检查是否需要设置记忆锚点
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
      // 通用对话
      const genericPrompts = [
        '继续分析市场。',
        '有什么新消息吗？',
        '帮我看看投资组合。',
        '调整一下建议。',
        '回顾一下我的情况。',
      ]
      prompt = genericPrompts[turn % genericPrompts.length]
    }

    console.log(`Turn ${turn}: ${prompt.substring(0, 40)}...`)

    const result = await client.query(prompt)
    const response = result.result || ''
    const tokens = result.usage?.totalTokens || 0
    totalTokens += tokens

    const isEmpty = response.length === 0

    turnResults.push({
      turn,
      prompt,
      response,
      tokens,
      isEmpty,
    })

    if (turn % 10 === 0) {
      console.log(`  → Token: ${tokens}, 累计: ${totalTokens}, ${isEmpty ? '[工具]' : '[响应]'}`)
    }

    // 每 10 轮暂停一下
    if (turn % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // 第二阶段验证: 第 200 轮验证所有记忆锚点
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【第二阶段验证: 第 200 轮】')
  console.log('-'.repeat(80))
  console.log('验证所有 10 个记忆锚点...')

  const verifyPrompts200 = [
    { anchor: memoryAnchors[0], q: '我叫什么名字？' },
    { anchor: memoryAnchors[1], q: '我的职业是什么？' },
    { anchor: memoryAnchors[2], q: '我主要投资什么类型的股票？' },
    { anchor: memoryAnchors[3], q: '我持有哪只股票，多少股？' },
    { anchor: memoryAnchors[4], q: '我的投资目标是什么？' },
    { anchor: memoryAnchors[5], q: '我的投资风格是什么？' },
    { anchor: memoryAnchors[6], q: '我的投资期限是什么？' },
    { anchor: memoryAnchors[7], q: '我的投资金额目标是多少？' },
    { anchor: memoryAnchors[8], q: '我常驻哪个城市？' },
    { anchor: memoryAnchors[9], q: '这是第几轮对话测试？' },
  ]

  let verifiedCount = 0
  for (const item of verifyPrompts200) {
    const anchor = item.anchor
    console.log(`\n验证 ${anchor.key}: "${anchor.value}"`)
    console.log(`  问题: ${item.q}`)

    const result = await client.query(item.q)
    const response = result.result || ''

    // 检查是否包含锚点值
    const verified = response.includes(anchor.value)
    anchor.verified = verified
    anchor.verifiedAt = 200

    if (verified) verifiedCount++

    console.log(`  回答: ${response.substring(0, 80)}...`)
    console.log(`  结果: ${verified ? '✅ 记住' : '⚠️ 未记住'}`)

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 统计结果
  console.log('\n')
  console.log('='.repeat(80))
  console.log('【测试结果总结】')
  console.log('='.repeat(80))

  const emptyCount = turnResults.filter(r => r.isEmpty).length
  const responseCount = turnResults.length - emptyCount

  console.log(`\n对话统计:`)
  console.log(`  总轮次: ${turnResults.length}`)
  console.log(`  有响应: ${responseCount}`)
  console.log(`  空响应 (工具): ${emptyCount}`)
  console.log(`  总 Token: ${totalTokens}`)
  console.log(`  平均 Token/轮: ${(totalTokens / turnResults.length).toFixed(0)}`)

  console.log(`\n记忆锚点验证 (10个):`)
  console.log(`  第 100 轮验证: ${memoryAnchors.filter(a => a.verifiedAt === 100 && a.verified).length}/5`)
  console.log(`  第 200 轮验证: ${verifiedCount}/10`)
  console.log(`  总体通过率: ${(verifiedCount / 10 * 100).toFixed(1)}%`)

  console.log(`\n详细验证结果:`)
  for (const anchor of memoryAnchors) {
    const status = anchor.verified ? '✅' : '❌'
    console.log(`  ${status} [Turn ${anchor.turn}] ${anchor.key} = "${anchor.value}"`)
  }

  // Session 状态
  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`\nSession 状态:`)
  console.log(`  ID: ${sessionInfo?.id}`)
  console.log(`  Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)

  // 清理
  await client.close()

  // 判断结果
  const success = verifiedCount >= 7 // 70% 通过率
  console.log(`\n整体结果: ${success ? '✅ 通过' : '❌ 失败'}`)
  console.log(`  (需要至少 7/10 个记忆锚点被正确记住)`)

  return success
}

// 运行测试
run200RoundTest()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })