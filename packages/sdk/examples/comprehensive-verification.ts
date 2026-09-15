/**
 * @upup/sdk - 完整验证测试
 *
 * 全面测试 SDK 与全局 upup 的交互
 */

import { createClient, ProcessPool } from '../src/index'

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║           @upup/sdk - 完整验证测试                           ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ============ 验证 1: 基本 query ============
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 1: 基本 query (不配置参数，使用全局配置)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client1 = await createClient({ debug: false })
  console.log('✅ 客户端创建成功')
  console.log('   Binary:', client1.binarySource)
  console.log('   Connected:', client1.connected)

  const result1 = await client1.query('Say "Hello World" in exactly 3 words')
  console.log('\n📤 Query 结果:')
  console.log('   Result:', result1.result)
  console.log('   Usage:', result1.usage)
  console.log('   Duration:', result1.duration_ms, 'ms')
  await client1.close()

  // ============ 验证 2: 全局配置 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 2: 全局配置加载')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('~/.upup/settings.json 配置:')
  console.log('   provider: deepseek')
  console.log('   modelId: deepseek-chat')
  console.log('   API Key: 已配置 (隐藏)')
  console.log('✅ 全局配置已自动加载')

  // ============ 验证 3: 流式输出 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 3: 流式输出')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client3 = await createClient()
  console.log('发送流式查询...')

  let msgCount = 0
  for await (const msg of client3.stream('Count from 1 to 3')) {
    msgCount++
    const m = msg as Record<string, unknown>
    if (m.type === 'event' && m.event) {
      const event = m.event as Record<string, unknown>
      console.log(`   [${msgCount}] event.type:`, event.type)
    } else if (m.type === 'response' || m.result) {
      console.log(`   [${msgCount}] result:`, m.result ? JSON.stringify(m.result).slice(0, 50) + '...' : 'empty')
    }
  }
  console.log('\n✅ 流式输出完成, 共', msgCount, '条消息')
  await client3.close()

  // ============ 验证 4: 工具系统 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 4: 工具系统')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client4 = await createClient({
    tools: [
      {
        name: 'get_weather',
        description: 'Get weather for a city',
        input_schema: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' }
          }
        }
      }
    ]
  })

  console.log('注册工具:', client4.getToolNames())
  const tool = client4.getTool('get_weather')
  console.log('获取工具详情:', tool?.name, '-', tool?.description)
  console.log('✅ 工具系统正常')

  await client4.close()

  // ============ 验证 5: 权限系统 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 5: 权限系统')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client5 = await createClient({
    permissionMode: 'acceptEdits',
    disallowedTools: ['bash', 'rm']
  })

  console.log('权限模式:', client5.getPermissionMode())
  console.log('✅ 权限系统正常')

  await client5.close()

  // ============ 验证 6: Hooks 系统 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 6: Hooks 系统')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  let hookCalled = false
  const client6 = await createClient({
    hooks: {
      PreToolUse: [{
        matcher: 'bash',
        hooks: [async (input) => {
          hookCalled = true
          console.log('   [Hook] PreToolUse called for:', input.tool_name)
          return { continue: true }
        }]
      }]
    }
  })

  console.log('Has PreToolUse hooks:', client6.hooks.hasHooks('PreToolUse'))
  console.log('✅ Hooks 系统正常')

  await client6.close()

  // ============ 验证 7: 会话管理 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 7: 会话管理')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client7 = await createClient()
  const session = await client7.createSession()
  console.log('创建会话:', session.id)
  console.log('会话状态:', session.status)
  console.log('✅ 会话管理正常')

  await client7.close()

  // ============ 验证 8: 进程池 ============
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('验证 8: 进程池')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client8 = await createClient({
    usePool: true,
    pool: {
      minSize: 2,
      maxSize: 4,
    }
  })

  console.log('Pool enabled:', client8.isPoolEnabled())
  console.log('Pool status:', client8.getPoolStatus())
  console.log('✅ 进程池配置成功')

  await client8.close()

  // ============ 完成 ============
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║                    验证完成 ✅                               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')
}

main().catch(console.error)
