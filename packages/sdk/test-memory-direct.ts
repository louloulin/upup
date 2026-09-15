/**
 * @upup/sdk - Memory 工具调用测试
 *
 * 验证 memory_save 和 memory_search 工具是否被正确调用
 */

import { createClient } from './src/client/client'

async function testMemoryTools() {
  console.log('='.repeat(80))
  console.log('Memory 工具调用测试')
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
      projectSlug: 'memory-test',
      projectPath: process.cwd(),
    }
  })
  console.log(`   ✅ Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // 测试 1: 直接说"记住"
  console.log('【测试 1: 直接说"记住"】')
  console.log('-'.repeat(80))

  const prompts = [
    '记住我的名字叫张三。',
    '记住我是一名软件工程师。',
    '记住我住在上海。',
    '记住我喜欢投资科技股。',
    '记住我有100万资金用于投资。',
  ]

  for (const prompt of prompts) {
    console.log(`\nUser: ${prompt}`)
    const result = await client.query(prompt)
    const response = result.result || '(空响应)'
    console.log(`Assistant: ${response.substring(0, 100)}...`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 验证所有记忆
  console.log('\n')
  console.log('【验证所有记忆】')
  console.log('-'.repeat(80))

  const verificationPrompts = [
    { q: '我叫什名字？', expected: '张三' },
    { q: '我的职业是什么？', expected: '软件工程师' },
    { q: '我住在哪里？', expected: '上海' },
    { q: '我喜欢投资什么类型的股票？', expected: '科技股' },
    { q: '我有多少资金用于投资？', expected: '100万' },
  ]

  let verified = 0
  for (const { q, expected } of verificationPrompts) {
    console.log(`\n问题: ${q}`)
    const result = await client.query(q)
    const response = result.result || ''
    const found = response.includes(expected)
    console.log(`回答: ${response.substring(0, 80)}...`)
    console.log(`包含"${expected}": ${found ? '✅' : '⚠️'}`)
    if (found) verified++
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 总结
  console.log('\n')
  console.log('='.repeat(80))
  console.log('测试结果')
  console.log('='.repeat(80))
  console.log(`\n记忆验证: ${verified}/${verificationPrompts.length}`)
  console.log(`通过率: ${(verified / verificationPrompts.length * 100).toFixed(1)}%`)

  // 检查 memory 文件
  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`\nSession Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)

  await client.close()

  return verified === verificationPrompts.length
}

// 运行测试
testMemoryTools()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })