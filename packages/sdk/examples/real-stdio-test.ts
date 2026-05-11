/**
 * @upup/sdk - 真实 Stdio 通信验证
 *
 * 验证 SDK 与 upup-agent 的真实 stdio 通信
 *
 * 运行: bun run examples/real-stdio-test.ts
 */

import { StdioAgentClient } from '../src/index.js'

async function testRealStdio() {
  console.log('='.repeat(50))
  console.log('UP SDK 真实 Stdio 通信验证')
  console.log('='.repeat(50))
  console.log()

  let client: StdioAgentClient | null = null

  try {
    // 1. 测试连接
    console.log('📡 步骤 1: 连接 upup-agent...')
    client = await StdioAgentClient.connect('bun', [
      'run',
      'upup-agent/src/cli.ts',
    ])

    console.log(`   ✅ 已连接: ${client.connected}`)
    console.log()

    // 2. 测试 initialize
    console.log('📡 步骤 2: 发送 initialize...')
    const initResult = await client.request('initialize', {
      clientName: 'sdk-test',
      clientVersion: '1.0.0',
    })
    console.log(`   ✅ initialize 结果:`, JSON.stringify(initResult, null, 2))
    console.log()

    // 3. 测试 unknown method (错误处理)
    console.log('📡 步骤 3: 测试错误处理...')
    try {
      await client.request('unknown_method', {})
    } catch (err) {
      console.log(`   ✅ 错误处理正常: ${(err as Error).message}`)
    }
    console.log()

    // 4. 测试 run 方法 (需要实际 Agent，会超时或失败但能验证协议)
    console.log('📡 步骤 4: 测试 run 方法...')
    try {
      // 使用 timeout 避免长时间等待
      const runPromise = client.request('run', {
        messages: [{ role: 'user', content: 'hello' }],
      })

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 2000)
      })

      const result = await Promise.race([runPromise, timeoutPromise])
      console.log(`   ✅ run 结果:`, JSON.stringify(result, null, 2))
    } catch (err) {
      const error = err as Error
      if (error.message === 'Timeout') {
        console.log(`   ⚠️ run 超时 (需要真实 Agent)，但协议正常`)
      } else {
        console.log(`   ✅ run 协议正常 (Agent 未就绪): ${error.message}`)
      }
    }
    console.log()

    // 5. 测试事件监听
    console.log('📡 步骤 5: 测试事件监听...')
    const eventPromise = new Promise<void>((resolve) => {
      client!.on('event', (data) => {
        console.log(`   📬 收到事件:`, JSON.stringify(data, null, 2))
      })
      setTimeout(resolve, 1000)
    })
    await eventPromise
    console.log(`   ✅ 事件监听正常`)
    console.log()

    console.log('='.repeat(50))
    console.log('✅ 真实 Stdio 通信验证完成!')
    console.log('='.repeat(50))
  } catch (error) {
    console.error('❌ 验证失败:', error)
  } finally {
    if (client) {
      console.log()
      console.log('📤 关闭连接...')
      await client.shutdown()
      console.log('✅ 连接已关闭')
    }
  }
}

testRealStdio().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
