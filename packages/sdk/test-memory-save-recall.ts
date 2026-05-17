/**
 * @upup/sdk - Memory Save + 立即 Recall 测试
 *
 * 测试流程:
 * 1. 告诉 Agent 记住某些信息
 * 2. 立即询问 Agent 是否记得
 * 3. 检查 Agent 是否通过 memory_search 获取记忆
 */

import { createClient } from './src/client/client.js'

async function testMemorySaveRecall() {
  console.log('='.repeat(80))
  console.log('Memory Save + Recall 测试')
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
      projectSlug: 'memory-save-recall-test',
      projectPath: process.cwd(),
    }
  })
  console.log(`   ✅ Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // 记忆信息 - 更明确地要求保存到 memory
  const testCases = [
    { key: '名字', value: '王小明', prompt: '记住我的名字叫王小明，并保存到 memory 文件。' },
    { key: '职业', value: '数据科学家', prompt: '记住我的职业是数据科学家，并保存到 memory 文件。' },
    { key: '城市', value: '深圳', prompt: '记住我住在深圳，并保存到 memory 文件。' },
    { key: '爱好', value: '跑步', prompt: '记住我的爱好是跑步，并保存到 memory 文件。' },
    { key: '金额', value: '50万', prompt: '记住我有50万资金用于投资，并保存到 memory 文件。' },
  ]

  console.log('【保存记忆 + 立即回忆】')
  console.log('-'.repeat(80))

  let successCount = 0

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i]

    console.log(`\n[测试 ${i + 1}] ${test.key} = "${test.value}"`)
    console.log(`  保存: ${test.prompt}`)

    // 1. 保存记忆
    const saveResult = await client.query(test.prompt)
    console.log(`  响应: ${saveResult.result.substring(0, 80) || '(空响应)'}...`)

    // 短暂延迟
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 2. 立即询问 - 直接问内容
    const recallPrompt = `我刚才最后告诉你什么？不要从 memory 文件查，直接回答。`
    console.log(`  询问: ${recallPrompt}`)

    const recallResult = await client.query(recallPrompt)
    console.log(`  回答: ${recallResult.result.substring(0, 100) || '(空响应)'}...`)

    // 检查是否记得
    const found = recallResult.result.includes(test.value)
    console.log(`  包含"${test.value}": ${found ? '✅' : '⚠️'}`)

    if (found) successCount++

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 总结
  console.log('\n')
  console.log('='.repeat(80))
  console.log('测试结果')
  console.log('='.repeat(80))

  console.log(`\n记忆保存 + 立即回忆: ${successCount}/${testCases.length}`)
  console.log(`通过率: ${(successCount / testCases.length * 100).toFixed(1)}%`)

  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`\nSession Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)

  // 检查 memory 文件
  console.log(`\nMemory 文件检查:`)
  const fs = await import('fs')
  const memoryFile = `${process.env.HOME}/.upup/memory/2026-05-16.md`
  if (fs.existsSync(memoryFile)) {
    const content = fs.readFileSync(memoryFile, 'utf-8')
    console.log(`  文件存在: ${memoryFile}`)
    console.log(`  内容长度: ${content.length} 字符`)
    // 检查是否包含我们的测试数据
    const hasMemory = testCases.some(t => content.includes(t.value))
    console.log(`  包含测试数据: ${hasMemory ? '✅ 是' : '⚠️ 否'}`)
  } else {
    console.log(`  文件不存在: ${memoryFile}`)
  }

  await client.close()

  return successCount === testCases.length
}

// 运行测试
testMemorySaveRecall()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })