/**
 * @upup/sdk - 全局 upup 验证测试
 *
 * 验证 SDK 在不配置任何参数时，是否正确使用全局安装的 upup
 */

import { createClient } from '../src/index'

async function main() {
  console.log('========================================')
  console.log('SDK 全局 upup 交互验证')
  console.log('========================================\n')

  // 测试 1: 完全不配置 - 应该使用全局 upup
  console.log('测试 1: 完全不配置参数')
  console.log('-----------------------------------')
  try {
    const client1 = await createClient({
      debug: true,
    })

    console.log('✅ createClient() 成功')
    console.log('  Binary source:', client1.binarySource)
    console.log('  Connected:', client1.connected)

    // 发送简单查询
    console.log('\n发送测试查询: "Say hello in 3 words"\n')
    const result1 = await client1.query('Say hello in exactly 3 words')

    console.log('\n✅ 查询成功!')
    console.log('  Result:', result1.result)
    console.log('  Usage:', result1.usage)
    console.log('  Duration:', result1.duration_ms, 'ms')

    await client1.close()
    console.log('✅ 连接已关闭\n')
  } catch (error) {
    console.error('❌ 测试 1 失败:', (error as Error).message)
  }

  // 测试 2: 流式输出验证
  console.log('\n========================================')
  console.log('测试 2: 流式输出验证')
  console.log('========================================\n')

  try {
    const client2 = await createClient({
      debug: true,
    })

    console.log('发送流式查询: "Count from 1 to 3"\n')

    let messageCount = 0
    for await (const msg of client2.stream('Count from 1 to 3')) {
      messageCount++
      console.log(`[${messageCount}]`, JSON.stringify(msg, null, 2))
    }

    console.log('\n✅ 流式输出完成! 共', messageCount, '条消息')
    await client2.close()
  } catch (error) {
    console.error('❌ 测试 2 失败:', (error as Error).message)
  }

  // 测试 3: 中断功能验证
  console.log('\n========================================')
  console.log('测试 3: 中断功能验证')
  console.log('========================================\n')

  try {
    const client3 = await createClient({
      debug: true,
    })

    console.log('发送长时间查询并中断...\n')

    // 启动查询但不等待完成
    const queryPromise = client3.query('Write a very long story about a dragon')

    // 等待一小段时间后中断
    setTimeout(async () => {
      console.log('发送中断信号...')
      await client3.interrupt()
      console.log('✅ 中断成功')
      await client3.close()
    }, 500)

    try {
      await queryPromise
      console.log('查询完成')
    } catch (error) {
      console.log('查询被中断:', (error as Error).message)
    }
  } catch (error) {
    console.error('❌ 测试 3 失败:', (error as Error).message)
  }

  // 测试 4: 工具系统验证
  console.log('\n========================================')
  console.log('测试 4: 工具系统验证')
  console.log('========================================\n')

  try {
    const client4 = await createClient({
      debug: true,
    })

    console.log('已注册工具:', client4.getToolNames())
    console.log('✅ 工具系统正常工作')

    await client4.close()
  } catch (error) {
    console.error('❌ 测试 4 失败:', (error as Error).message)
  }

  // 测试 5: Hooks 系统验证
  console.log('\n========================================')
  console.log('测试 5: Hooks 系统验证')
  console.log('========================================\n')

  try {
    const client5 = await createClient({
      debug: true,
      hooks: {
        PreToolUse: [{
          matcher: '*',
          hooks: [async (input) => {
            console.log('[Hook] PreToolUse:', input)
            return { continue: true }
          }]
        }]
      }
    })

    console.log('Has PreToolUse hooks:', client5.hooks.hasHooks('PreToolUse'))
    console.log('✅ Hooks 系统正常工作')

    await client5.close()
  } catch (error) {
    console.error('❌ 测试 5 失败:', (error as Error).message)
  }

  // 测试 6: 进程池验证
  console.log('\n========================================')
  console.log('测试 6: 进程池验证')
  console.log('========================================\n')

  try {
    const client6 = await createClient({
      debug: true,
      usePool: true,
      pool: {
        minSize: 2,
        maxSize: 4,
        prewarm: false,
      }
    })

    console.log('Pool enabled:', client6.isPoolEnabled())
    console.log('Pool status:', client6.getPoolStatus())
    console.log('✅ 进程池配置成功')

    await client6.close()
  } catch (error) {
    console.error('❌ 测试 6 失败:', (error as Error).message)
  }

  console.log('\n========================================')
  console.log('验证完成')
  console.log('========================================')
}

main().catch(console.error)
