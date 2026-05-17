/**
 * 快速验证测试 - 验证记忆保持
 */
import { createClient } from './src/client/client.js'

async function testMemory() {
  console.log('记忆保持快速测试')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 设置记忆
  console.log('\n[设置记忆] 记住: 我叫李明，是投资经理')
  const r1 = await client.query('记住: 我叫李明，是投资经理')
  console.log('响应:', r1.result.substring(0, 50) || '(空)')

  await new Promise(r => setTimeout(r, 500))

  // 查询记忆
  console.log('\n[查询记忆] 我叫什么名字？')
  const r2 = await client.query('我叫什么名字？')
  console.log('响应:', r2.result.substring(0, 100) || '(空)')

  const nameOk = r2.result.includes('李明')
  console.log('记住名字:', nameOk ? '✅' : '❌')

  await new Promise(r => setTimeout(r, 500))

  // 查询职业
  console.log('\n[查询职业] 我的职业是什么？')
  const r3 = await client.query('我的职业是什么？')
  console.log('响应:', r3.result.substring(0, 100) || '(空)')

  const jobOk = r3.result.includes('投资经理') || r3.result.includes('李明')
  console.log('记住职业:', jobOk ? '✅' : '❌')

  await client.close()

  const success = nameOk && jobOk
  console.log('\n结果:', success ? '✅ 通过' : '❌ 失败')

  return success
}

testMemory()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })