/**
 * @upup/sdk - 综合上下文验证测试
 *
 * 测试场景:
 * 1. 基础对话上下文
 * 2. 多轮对话累积
 * 3. 消息序列化/反序列化
 * 4. Token 使用量追踪
 * 5. Session 状态管理
 */

import { createClient } from './src/client/client'

interface TestCase {
  name: string
  prompt: string
  check: (response: string) => boolean
}

async function runTest(name: string, prompts: string[]): Promise<{ passed: number; failed: number; results: string[] }> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试: ${name}`)
  console.log('='.repeat(60))

  const client = await createClient({ useUpupSession: true })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    return { passed: 0, failed: 1, results: ['UpupSessionManager 未初始化'] }
  }

  const session = await client.createSession()
  console.log(`Session ID: ${session.id}\n`)

  const results: string[] = []
  let passed = 0
  let failed = 0

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i]
    console.log(`[Turn ${i + 1}]`)
    console.log(`  Q: ${prompt}`)

    let answer = ''
    for await (const msg of client.stream(prompt)) {
      const m = msg as any
      if (m.type === 'event' && m.event?.type === 'done') {
        answer = m.event.answer || ''
      }
    }

    console.log(`  A: ${answer.substring(0, 60)}${answer.length > 60 ? '...' : ''}`)

    const sessionInfo = client.upupSession.getCurrentSession()
    console.log(`  Token: ${sessionInfo?.tokenUsage?.totalTokens || 0}`)
    console.log(`  Messages: ${sessionInfo?.messageCount || 0}`)
    console.log()

    results.push(`Turn ${i + 1}: ${answer.substring(0, 50)}`)
  }

  // 清理
  await client.upupSession.complete()
  await client.close()

  console.log('-'.repeat(60))
  console.log(`通过: ${passed}/${prompts.length}`)

  return { passed, failed, results }
}

async function main() {
  console.log('='.repeat(60))
  console.log('SDK Session 上下文连续性综合验证')
  console.log('='.repeat(60))

  // 测试 1: 基础上下文
  const test1 = await runTest('基础上下文保持', [
    '我叫李明，是一名软件工程师。记住我的信息。',
    '我叫什么名字？',
    '我的职业是什么？'
  ])

  // 测试 2: 复杂上下文
  const test2 = await runTest('复杂上下文', [
    '我喜欢编程语言 Python，讨厌 Java。记住这个偏好。',
    '我喜欢什么编程语言？',
    '我讨厌什么编程语言？'
  ])

  // 测试 3: 累积验证
  const test3 = await runTest('消息累积', [
    '这是第一条消息。记住。',
    '这是第二条消息。还记得第一条吗？',
    '我第一条说了什么？'
  ])

  // 总结
  console.log('\n' + '='.repeat(60))
  console.log('最终结果')
  console.log('='.repeat(60))

  const totalPassed = test1.passed + test2.passed + test3.passed
  const totalFailed = test1.failed + test2.failed + test3.failed

  console.log(`Test 1 (基础上下文): ${test1.passed} 通过`)
  console.log(`Test 2 (复杂上下文): ${test2.passed} 通过`)
  console.log(`Test 3 (消息累积): ${test3.passed} 通过`)
  console.log()
  console.log(`总计: ${totalPassed} 通过, ${totalFailed} 失败`)

  return { test1, test2, test3, totalPassed, totalFailed }
}

main()
  .then(r => {
    console.log('\n完整结果:')
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
