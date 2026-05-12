/**
 * @upup/sdk - createClient 快速测试
 */

import { createClient } from '../src/index.js'

async function main() {
  console.log('========================================')
  console.log('createClient API 验证')
  console.log('========================================\n')

  console.log('1. 创建客户端 (不配置任何参数，使用全局配置)...')
  const client = await createClient({
    debug: true,
  })
  console.log('✅ 客户端创建成功')
  console.log('   Binary source:', client.binarySource)
  console.log('   Connected:', client.connected)

  console.log('\n2. 发送 query...')
  const result = await client.query('Say hello in exactly 5 words')
  console.log('\n✅ Query 成功!')
  console.log('   Result:', result.result)
  console.log('   Usage:', result.usage)
  console.log('   Duration:', result.duration_ms, 'ms')

  console.log('\n3. 测试 getToolNames()...')
  console.log('   Tools:', client.getToolNames())

  console.log('\n4. 测试 processPool...')
  console.log('   Pool enabled:', client.isPoolEnabled())

  console.log('\n5. 关闭客户端...')
  await client.close()
  console.log('✅ 客户端已关闭')
}

main().catch(console.error)
