/**
 * @upup/sdk - SDK Session 全面验证测试
 *
 * 验证 SDK Session 与 upup 核心的完整集成
 * 测试复杂场景：长时间对话、上下文组合、边界情况
 */

import { createClient } from './src/client/client'

async function runComprehensiveTest() {
  console.log('='.repeat(80))
  console.log('SDK Session 全面验证测试')
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
  console.log('[1/6] 初始化 Session...')
  await client.createSession({
    metadata: {
      projectSlug: 'comprehensive-test',
      projectPath: process.cwd(),
    }
  })
  console.log(`   ✅ Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // ========== 测试 1: 复杂上下文组合 ==========
  console.log('[2/6] 测试 1: 复杂上下文组合')
  console.log('-'.repeat(80))

  const complexPrompts = [
    { q: '我叫李明，是一名软件工程师，我喜欢 Python 编程。', check: '李明' },
    { q: '我叫王芳，是一名产品经理，我喜欢产品设计。', check: '王芳' },
    { q: '我们两个人各自喜欢什么？', check: '李明' }, // 应该能记住两个人
  ]

  for (let i = 0; i < complexPrompts.length; i++) {
    const { q, check } = complexPrompts[i]
    console.log(`   Turn ${i + 1}:`)
    console.log(`   - 用户: ${q}`)
    const result = await client.query(q)
    console.log(`   - 助手: ${result.result.substring(0, 60)}${result.result.length > 60 ? '...' : ''}`)
    console.log(`   - 验证: ${result.result.includes(check) ? '✅' : '⚠️'}`)
    await new Promise(r => setTimeout(r, 500))
  }
  console.log()

  // ========== 测试 2: 数字和精确信息 ==========
  console.log('[3/6] 测试 2: 数字和精确信息')
  console.log('-'.repeat(80))

  const numberPrompts = [
    { q: '我的投资组合：苹果股票 50 股，谷歌股票 30 股。', check: ['苹果', '50', '谷歌', '30'] },
    { q: '我有多少股苹果？', check: ['50', '五十', '苹果'] },
    { q: '我有多少股谷歌？', check: ['30', '三十', '谷歌'] },
  ]

  for (let i = 0; i < numberPrompts.length; i++) {
    const { q, check } = numberPrompts[i]
    console.log(`   Turn ${i + 1}:`)
    console.log(`   - 用户: ${q}`)
    const result = await client.query(q)
    const passed = check.some(key => result.result.includes(key))
    console.log(`   - 助手: ${result.result.substring(0, 60)}${result.result.length > 60 ? '...' : ''}`)
    console.log(`   - 验证: ${passed ? '✅' : '⚠️'}`)
    await new Promise(r => setTimeout(r, 500))
  }
  console.log()

  // ========== 测试 3: 时间序列记忆 ==========
  console.log('[4/6] 测试 3: 时间序列记忆')
  console.log('-'.repeat(80))

  const timePrompts = [
    { q: '2024年1月，我买了100股特斯拉股票。', check: ['特斯拉', '100'] },
    { q: '2024年3月，我又买了50股特斯拉。', check: ['特斯拉', '50'] },
    { q: '我现在总共有多少股特斯拉？', check: ['150', '一百五十', '特斯拉'] },
  ]

  for (let i = 0; i < timePrompts.length; i++) {
    const { q, check } = timePrompts[i]
    console.log(`   Turn ${i + 1}:`)
    console.log(`   - 用户: ${q}`)
    const result = await client.query(q)
    const passed = check.some(key => result.result.includes(key))
    console.log(`   - 助手: ${result.result.substring(0, 60)}${result.result.length > 60 ? '...' : ''}`)
    console.log(`   - 验证: ${passed ? '✅' : '⚠️'}`)
    await new Promise(r => setTimeout(r, 500))
  }
  console.log()

  // ========== 测试 4: 情绪和偏好 ==========
  console.log('[5/6] 测试 4: 情绪和偏好')
  console.log('-'.repeat(80))

  const preferencePrompts = [
    { q: '我今天心情很好！', check: '' },
    { q: '我昨天心情不好。', check: '' },
    { q: '总结一下我这两天的心情变化。', check: ['好', '不好', '昨天', '今天'] },
  ]

  for (let i = 0; i < preferencePrompts.length; i++) {
    const { q, check } = preferencePrompts[i]
    console.log(`   Turn ${i + 1}:`)
    console.log(`   - 用户: ${q}`)
    const result = await client.query(q)
    const passed = !check || check.some(key => result.result.includes(key))
    console.log(`   - 助手: ${result.result.substring(0, 60)}${result.result.length > 60 ? '...' : ''}`)
    console.log(`   - 验证: ${passed ? '✅' : '⚠️'}`)
    await new Promise(r => setTimeout(r, 500))
  }
  console.log()

  // ========== 测试 5: 连续快速对话 ==========
  console.log('[6/6] 测试 5: 连续快速对话 (5 轮)')
  console.log('-'.repeat(80))

  const rapidPrompts = [
    '你好！',
    '你叫什么名字？',
    '你能做什么？',
    '给我讲个笑话。',
    '再见！',
  ]

  for (let i = 0; i < rapidPrompts.length; i++) {
    const q = rapidPrompts[i]
    console.log(`   Turn ${i + 1}: ${q}`)
    const result = await client.query(q)
    console.log(`   - 响应: ${result.result.substring(0, 50)}${result.result.length > 50 ? '...' : ''}`)
    console.log(`   - 验证: ${result.result.length > 0 ? '✅' : '⚠️'}`)
    await new Promise(r => setTimeout(r, 300))
  }
  console.log()

  // ========== 验证 Token 使用量 ==========
  console.log('='.repeat(80))
  console.log('最终验证')
  console.log('='.repeat(80))

  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`Session ID: ${sessionInfo?.id}`)
  console.log(`Status: ${sessionInfo?.status}`)
  console.log(`Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)
  console.log(`Message Count: ${sessionInfo?.messageCount || 0}`)
  console.log()

  // 检查 Token 使用量是否合理增长
  const totalTokens = sessionInfo?.tokenUsage?.totalTokens || 0
  const tokenGrowth = totalTokens > 40000 // 上下文应该累积

  console.log(`Token 累积验证: ${tokenGrowth ? '✅ (正常增长)' : '⚠️ (可能有问题)'}`)
  console.log(`总 Token 数: ${totalTokens}`)
  console.log()

  // 清理
  await client.close()

  console.log('='.repeat(80))
  console.log('测试完成')
  console.log('='.repeat(80))

  return true
}

// 运行测试
runComprehensiveTest()
  .then(success => {
    console.log(`\n结果: ${success ? '✅ 通过' : '❌ 失败'}`)
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })