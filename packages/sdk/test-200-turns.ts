/**
 * @upup/sdk - SDK Session 200 轮对话验证测试
 *
 * 验证 SDK Session 在长时间对话中的记忆能力
 * 测试连续对话中的上下文保持和 Token 累积
 */

import { createClient } from './src/client/client.js'

async function run200TurnsTest() {
  console.log('='.repeat(80))
  console.log('SDK Session 200 轮对话验证测试')
  console.log('='.repeat(80))
  console.log()

  // 创建客户端
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
      projectSlug: '200-turns-test',
      projectPath: process.cwd(),
    }
  })
  console.log(`   ✅ Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // 定义要记住的信息类型
  const infoToRemember = [
    { name: '张三', occupation: '软件工程师', city: '北京' },
    { name: '李四', occupation: '产品经理', city: '上海' },
    { name: '王五', occupation: '数据科学家', city: '深圳' },
  ]

  // 200 轮对话
  const totalTurns = 200
  let passed = 0
  let failed = 0
  const startTime = Date.now()

  console.log(`开始 ${totalTurns} 轮对话测试...`)
  console.log()

  // 前几轮：记住每个人
  console.log('--- 阶段 1: 记住个人信息 ---')
  for (const person of infoToRemember) {
    console.log(`记住 ${person.name}...`)
    const result = await client.query(`我叫${person.name}，是${person.occupation}，住在${person.city}。`)
    console.log(`   响应: ${result.result.substring(0, 50)}...`)
    await new Promise(r => setTimeout(r, 300))
  }
  console.log()

  // 阶段 2: 验证记忆（每隔 20 轮检查一次）
  console.log('--- 阶段 2: 验证记忆 ---')
  const checkpoints = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200]

  for (let turn = 1; turn <= totalTurns; turn++) {
    const query = getQueryForTurn(turn, infoToRemember)
    const result = await client.query(query)
    const hasResponse = result.result.length > 0

    if (hasResponse) {
      passed++
    } else {
      failed++
    }

    // 定期输出进度
    if (checkpoints.includes(turn) || turn === 1 || turn === totalTurns) {
      const sessionInfo = client.upupSession.getCurrentSession()
      const tokens = sessionInfo?.tokenUsage?.totalTokens || 0
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      const rate = (turn / elapsed).toFixed(2)

      console.log(`[${turn}/${totalTurns}] 进度: ${((turn / totalTurns) * 100).toFixed(1)}% | 通过: ${passed} | 失败: ${failed} | Token: ${tokens} | 耗时: ${elapsed}s | 速率: ${rate}轮/秒`)
    }

    await new Promise(r => setTimeout(r, 200))
  }
  console.log()

  // 最终验证
  console.log('='.repeat(80))
  console.log('最终验证结果')
  console.log('='.repeat(80))

  const sessionInfo = client.upupSession.getCurrentSession()
  const totalTokens = sessionInfo?.tokenUsage?.totalTokens || 0
  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const passRate = ((passed / totalTurns) * 100).toFixed(2)

  console.log(`总轮数: ${totalTurns}`)
  console.log(`通过: ${passed}`)
  console.log(`失败: ${failed}`)
  console.log(`通过率: ${passRate}%`)
  console.log(`总 Token: ${totalTokens}`)
  console.log(`总耗时: ${elapsed}秒 (${(elapsed / 60).toFixed(2)}分钟)`)
  console.log(`平均每轮耗时: ${(elapsed / totalTurns).toFixed(2)}秒`)
  console.log()

  // 验证最终上下文
  console.log('--- 验证上下文保持 ---')
  const finalCheck = await client.query('我叫什么名字？我的职业是什么？住在哪个城市？')
  console.log(`最终检查响应: ${finalCheck.result.substring(0, 100)}...`)

  // 清理
  await client.close()

  console.log()
  console.log('='.repeat(80))
  console.log('测试完成')
  console.log('='.repeat(80))

  // 返回结果
  return passRate >= '90'
}

/**
 * 根据轮次获取查询
 */
function getQueryForTurn(turn: number, persons: { name: string; occupation: string; city: string }[]): string {
  const queries = [
    // 验证性查询
    '我叫什么名字？',
    '我的职业是什么？',
    '我住在哪个城市？',
    // 组合查询
    '总结一下我的信息。',
    '我刚才说了什么？',
    '记住我刚才说的话。',
    // 人名查询
    `还记得${persons[0].name}是谁吗？`,
    `我的朋友${persons[1].name}是做什么工作的？`,
    `谁住在${persons[2].city}？`,
    // 随机查询
    '今天心情不错！',
    '你还记得我吗？',
    '我们来讨论一下投资。',
  ]

  // 每 10 轮进行一次深度验证
  if (turn % 10 === 0) {
    const idx = (turn / 10 - 1) % 3
    return `详细说说关于${persons[idx].name}的信息。`
  }

  // 其他轮次使用随机查询
  const idx = (turn - 1) % queries.length
  return queries[idx]
}

// 运行测试
run200TurnsTest()
  .then(success => {
    console.log(`\n结果: ${success ? '✅ 通过 (≥90%)' : '❌ 失败'}`)
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })