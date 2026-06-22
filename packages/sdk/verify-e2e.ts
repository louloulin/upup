import { createClient } from './src/index.js'

async function main() {
  console.log('=== SDK端到端验证 ===\n')
  try {
    console.log('[1] 创建SDK客户端...')
    const client = await createClient({ debug: true })
    console.log('    ✅ 客户端创建成功\n')

    console.log('[2] 发送query请求...')
    const result = await client.query('Say hello in exactly 3 words')
    console.log('    ✅ query成功')
    console.log('    result:', result.result)
    console.log('    usage:', JSON.stringify(result.usage))
    console.log('    duration_ms:', result.duration_ms, '\n')

    console.log('[3] 关闭客户端...')
    await client.close()
    console.log('    ✅ 客户端已关闭\n')
    console.log('=== 验证通过 ===')
    process.exit(0)
  } catch (error: any) {
    console.error('❌ 验证失败:', error?.message || error)
    console.error('Stack:', error?.stack?.slice(0, 500))
    process.exit(1)
  }
}

const timer = setTimeout(() => {
  console.error('❌ 验证超时(30s)')
  process.exit(2)
}, 30000)

main().finally(() => clearTimeout(timer))
