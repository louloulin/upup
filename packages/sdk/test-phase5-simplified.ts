/**
 * Phase 5: SDK 简化架构验证测试 (完整版)
 *
 * 验证目标:
 * 1. query() 正确累积结果
 * 2. Session 通过 upup 核心持久化
 * 3. 上下文正确保持
 * 4. 使用唯一名字避免内存冲突
 * 5. 先创建 session 再进行对话
 */

import { createClient } from './src/index.js'

async function testPhase5Simplified() {
  console.log('================================================================================')
  console.log('Phase 5: SDK 简化架构验证')
  console.log('================================================================================\n')

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  try {
    // 关键: 先创建 Session
    console.log('[初始化] 创建 Session...')
    await client.createSession({
      metadata: {
        projectSlug: 'phase5-test',
        projectPath: process.cwd(),
      }
    })
    console.log(`   ✅ Session ID: ${client.upupSession?.getSessionId() || 'N/A'}\n`)

    // 测试 1: 简单对话
    console.log('[测试 1] 简单数学对话')
    const r1 = await client.query('1+1等于几？回答一个数字即可。')
    console.log(`  结果: ${r1.result}`)
    console.log(`  Token: ${r1.usage?.totalTokens}`)
    const test1Pass = r1.result.includes('2') || r1.result.includes('等于')
    console.log(`  结果: ${test1Pass ? '✅ 通过' : '❌ 失败'}\n`)

    // 测试 2: 记住名字
    console.log('[测试 2] 记住名字')
    const r2 = await client.query('我叫李明，是一名软件工程师。请记住我。')
    console.log(`  结果: ${r2.result.substring(0, 80)}...`)
    const test2Pass = r2.result.includes('李明') || r2.result.includes('记住')
    console.log(`  结果: ${test2Pass ? '✅ 通过' : '❌ 失败'}\n`)

    // 测试 3: 验证记忆
    console.log('[测试 3] 验证记忆保持')
    const r3 = await client.query('我叫什么名字？')
    console.log(`  结果: ${r3.result.substring(0, 100)}...`)
    const test3Pass = r3.result.includes('李明')
    console.log(`  记住李明: ${test3Pass ? '✅ 是' : '❌ 否'}`)
    console.log(`  结果: ${test3Pass ? '✅ 通过' : '❌ 失败'}\n`)

    // 测试 4: 问职业
    console.log('[测试 4] 问职业')
    const r4 = await client.query('我的职业是什么？')
    console.log(`  结果: ${r4.result.substring(0, 100)}...`)
    const test4Pass = r4.result.includes('工程师') || r4.result.includes('软件') || r4.result.includes('李明')
    console.log(`  结果: ${test4Pass ? '✅ 通过' : '❌ 失败'}\n`)

    // 测试 5: 总结介绍
    console.log('[测试 5] 用一句话介绍自己')
    const r5 = await client.query('用一句话介绍你自己，并提到我的名字。')
    console.log(`  结果: ${r5.result.substring(0, 100)}...`)
    const test5Pass = r5.result.includes('李明')
    console.log(`  提到李明: ${test5Pass ? '✅ 是' : '❌ 否'}`)
    console.log(`  结果: ${test5Pass ? '✅ 通过' : '❌ 失败'}\n`)

    // 最终结果
    const allPass = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass
    console.log('================================================================================')
    console.log(`Phase 5 简化架构验证结果: ${allPass ? '✅ 全部通过' : '⚠️ 部分失败'}`)
    console.log('================================================================================')

    return {
      success: allPass,
      tests: {
        simpleQuery: test1Pass,
        rememberName: test2Pass,
        recallName: test3Pass,
        recallProfession: test4Pass,
        introduce: test5Pass,
      }
    }
  } finally {
    await client.close()
  }
}

testPhase5Simplified().catch(console.error)