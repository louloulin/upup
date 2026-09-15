/**
 * 对话上下文测试 - 不使用 memory 工具
 */
import { createClient } from './src/client/client'

async function testContext() {
  console.log('对话上下文测试（不使用 memory 工具）')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 直接对话
  console.log('\n[对话1] 你好，我叫王五')
  const r1 = await client.query('你好，我叫王五')
  console.log('响应:', r1.result.substring(0, 80) || '(空)')

  await new Promise(r => setTimeout(r, 500))

  console.log('\n[对话2] 我叫什么名字？')
  const r2 = await client.query('我叫什么名字？')
  console.log('响应:', r2.result.substring(0, 80) || '(空)')

  const nameOk = r2.result.includes('王五')
  console.log('记住名字:', nameOk ? '✅' : '❌')

  await new Promise(r => setTimeout(r, 500))

  console.log('\n[对话3] 我是做什么的？')
  const r3 = await client.query('我是做什么的？')
  console.log('响应:', r3.result.substring(0, 80) || '(空)')

  await client.close()

  const success = nameOk
  console.log('\n结果:', success ? '✅ 通过' : '❌ 失败')

  return success
}

testContext()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })