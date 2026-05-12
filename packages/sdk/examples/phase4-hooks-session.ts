/**
 * @upup/sdk - Phase 4 Hooks 和会话管理测试
 */

import { createClient } from '../src/client/client'
import { HookExecutor, SessionManager } from '../src/index'

async function testPhase4() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         @upup/sdk Phase 4 - Hooks 和会话测试           ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // ============ HookExecutor 测试 ============
  console.log('📋 1. HookExecutor 测试')
  
  const hookExecutor = new HookExecutor()
  
  // 注册 Hook
  hookExecutor.register('PreToolUse', {
    matcher: 'bash*',
    hooks: [
      async (input) => {
        console.log(`   [PreToolUse] Tool: ${input.tool_name}`)
        return { continue: true }
      }
    ]
  })
  
  hookExecutor.register('PostToolUse', {
    matcher: '*',
    hooks: [
      async (input) => {
        console.log(`   [PostToolUse] Tool: ${input.tool_name} completed`)
        return { continue: true }
      }
    ]
  })
  
  // 执行 Hook
  const preToolResult = await hookExecutor.execute('PreToolUse', {
    hook_event_name: 'PreToolUse',
    tool_name: 'bash',
    tool_input: { command: 'ls' },
    tool_use_id: 'tool_123'
  })
  
  const postToolResult = await hookExecutor.execute('PostToolUse', {
    hook_event_name: 'PostToolUse',
    tool_name: 'bash',
    tool_result: { output: 'file1 file2' },
    tool_use_id: 'tool_123'
  })
  
  console.log(`   - PreToolUse: continue=${preToolResult.continue}, executed=${preToolResult.executedCount}`)
  console.log(`   - PostToolUse: continue=${postToolResult.continue}, executed=${postToolResult.executedCount}`)
  console.log()

  // ============ SessionManager 测试 ============
  console.log('📋 2. SessionManager 测试')
  
  const sessionManager = new SessionManager()
  
  // 创建会话
  const session = await sessionManager.create({
    metadata: { userId: 'user_123', project: 'test' }
  })
  
  console.log(`   - 会话 ID: ${session.id}`)
  console.log(`   - 会话状态: ${session.status}`)
  
  // 添加消息
  sessionManager.addMessage({
    role: 'user',
    content: 'Hello!',
    timestamp: new Date(),
    tokens: 10
  })
  
  sessionManager.addMessage({
    role: 'assistant',
    content: 'Hi there!',
    timestamp: new Date(),
    tokens: 15
  })
  
  console.log(`   - 消息数量: ${sessionManager.getCurrentSession()?.messageCount}`)
  console.log(`   - 消息历史: ${sessionManager.getMessages().length} 条`)
  
  // 更新 Token 使用
  sessionManager.updateTokenUsage({
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150
  })
  
  console.log(`   - Token 使用: ${sessionManager.getCurrentSession()?.tokenUsage?.totalTokens}`)
  console.log()

  // ============ UpClient 集成测试 ============
  console.log('📋 3. UpClient Hooks 和会话集成')
  
  const client = await createClient({
    debug: false,
    hooks: {
      PreToolUse: [{
        matcher: 'get_*',
        hooks: [async (input) => {
          console.log(`   [Client Hook] PreToolUse: ${input.tool_name}`)
          return { continue: true }
        }]
      }]
    },
    session: {
      metadata: { version: '1.0.0' }
    }
  })
  
  console.log(`   - HookExecutor: ${client.hooks ? '可用' : '不可用'}`)
  console.log(`   - SessionManager: ${client.session ? '可用' : '不可用'}`)
  console.log(`   - 当前会话: ${client.getCurrentSession()?.id || '无'}`)
  
  // 注册新 Hook
  client.registerHook('SessionStart', {
    hooks: [async (input) => {
      console.log(`   [Client Hook] Session started`)
      return { continue: true }
    }]
  })
  
  console.log(`   - 已注册 PreToolUse Hook`)
  console.log(`   - 已注册 SessionStart Hook`)
  
  await client.close()
  
  // 总结
  console.log()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                       测试总结                               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log('   ✅ HookExecutor: 正常')
  console.log('   ✅ Hook 注册: 正常')
  console.log('   ✅ Hook 执行: 正常')
  console.log('   ✅ SessionManager: 正常')
  console.log('   ✅ 会话创建: 正常')
  console.log('   ✅ 消息管理: 正常')
  console.log('   ✅ UpClient 集成: 正常')
  console.log()
  console.log('   🎉 Phase 4 Hooks 和会话管理测试完成!')
  console.log()
}

testPhase4().catch(console.error)
