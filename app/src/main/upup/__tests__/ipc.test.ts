/**
 * ipc 单元测试
 * 覆盖 registerUpupIpcHandlers 7 个 handler: health/list-tools/list-skills/list-sessions/query/stream/cancel
 *
 * 参考: app-identity.test.ts (vi.mock 模式)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ==================== Mock 层 ====================

const mockIpcHandle = vi.fn()
const mockWebContentsSend = vi.fn()
let mockClientIsNull = false
let mockClientTools: Array<{ name: string; description: string }> = [
  { name: 'stock_price', description: '获取股票实时价格' },
  { name: 'financial_report', description: '获取公司财报数据' }
]
const mockQueryResult = { result: '分析完成', usage: { input_tokens: 100, output_tokens: 50 }, duration_ms: 1234 }

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      mockIpcHandle(channel, handler)
    }
  }
}))

vi.mock('../sdk-host', () => ({
  upupSdkHost: {
    getClient: () => mockClientIsNull ? null : {
      tools: { getAll: () => mockClientTools },
      query: vi.fn(async () => mockQueryResult),
      stream: vi.fn(async function*() {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: '好的，我' }] } }
        yield { type: 'assistant', message: { content: [{ type: 'text', text: '来分析一下' }] } }
        yield { type: 'result', result: '分析完成' }
      })
    },
    getVersion: () => '0.2.1',
    uptime: () => 12345
  }
}))

vi.mock('@upup/skills', () => ({
  discoverSkills: () => [
    { name: 'dcf', description: 'DCF 估值', category: 'valuation', source: 'builtin', path: '/fake' }
  ]
}))
let registerUpupIpcHandlers: typeof import('../ipc').registerUpupIpcHandlers
let setMainWindow: typeof import('../ipc').setMainWindow

beforeEach(async () => {
  vi.resetAllMocks()
  mockClientIsNull = false
  mockClientTools = [
    { name: 'stock_price', description: '获取股票实时价格' },
    { name: 'financial_report', description: '获取公司财报数据' }
  ]

  const ipcModule = await import('../ipc')
  registerUpupIpcHandlers = ipcModule.registerUpupIpcHandlers
  setMainWindow = ipcModule.setMainWindow

  // 注册所有 handler
  registerUpupIpcHandlers()

  // 设置主窗口为 mock
  setMainWindow({
    isDestroyed: () => false,
    webContents: { send: mockWebContentsSend }
  } as any)
})

/** 获取注册过的 handler */
function handler(channel: string): (...args: any[]) => Promise<any> {
  const calls = mockIpcHandle.mock.calls.filter((c: any[]) => c[0] === channel)
  if (calls.length === 0) {
    throw new Error(`No handler registered for channel: ${channel}`)
  }
  return calls[calls.length - 1][1]
}

// ==================== 测试 ====================

describe('registerUpupIpcHandlers', () => {
  // ===== health =====

  it('upup:health 在 client 为 null 时返回 { ok: false }', async () => {
    mockClientIsNull = true
    const result = await handler('upup:health')()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('UpUp 引擎未启动')
    expect(result.version).toBe('0.2.1')
    expect(result.uptime).toBe(0)
    expect(result.engine).toBe('upup')
  })

  it('upup:health 在 client 存在时返回 { ok: true }', async () => {
    mockClientIsNull = false
    const result = await handler('upup:health')()
    expect(result.ok).toBe(true)
    expect(result.version).toBe('0.2.1')
    expect(result.uptime).toBe(12345)
    expect(result.engine).toBe('upup')
  })

  // ===== list-tools =====

  it('upup:list-tools 返回工具列表映射', async () => {
    const tools = await handler('upup:list-tools')()
    expect(tools).toHaveLength(2)
    expect(tools[0]).toEqual({ name: 'stock_price', description: '获取股票实时价格' })
    expect(tools[1]).toEqual({ name: 'financial_report', description: '获取公司财报数据' })
  })

  it('upup:list-tools client 为 null 时返回空数组', async () => {
    mockClientIsNull = true
    const tools = await handler('upup:list-tools')()
    expect(tools).toEqual([])
  })

  // ===== list-skills =====

  it('upup:list-skills 返回 discoverSkills() 结果', async () => {
    const skills = await handler('upup:list-skills')()
    expect(skills.length).toBeGreaterThanOrEqual(1)
    expect(skills[0]).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      category: 'builtin'
    })
  })

  // ===== list-sessions =====

  it('upup:list-sessions 返回空数组', async () => {
    const sessions = await handler('upup:list-sessions')()
    expect(sessions).toEqual([])
  })

  // ===== query =====

  it('upup:query 调用 client.query 并返回 result', async () => {
    const result = await handler('upup:query')(null, { prompt: '分析茅台' })
    expect(result).toEqual(mockQueryResult)
  })

  it('upup:query client 为 null 时抛错', async () => {
    mockClientIsNull = true
    await expect(
      handler('upup:query')(null, { prompt: '分析茅台' })
    ).rejects.toThrow('投资工作台调用失败：UpUp 引擎未就绪')
  })

  // ===== stream =====

  it('upup:stream 返回 turnId', async () => {
    const { turnId } = await handler('upup:stream')(null, { prompt: '分析' })
    expect(turnId).toMatch(/^turn-/)
  })

  it('upup:stream 异步推送事件到渲染进程', async () => {
    const { turnId } = await handler('upup:stream')(null, { prompt: '分析' })

    // 等待异步流处理完成
    await new Promise(r => setTimeout(r, 200))

    const calls = mockWebContentsSend.mock.calls.filter((c: any[]) =>
      c[0] === 'upup:stream' && c[1]?.turnId === turnId
    )
    // 至少应有 assistant / result 事件
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const events = calls.map((c: any[]) => c[1].event)
    // 应有至少一个 assistant 或 result
    expect(events).toEqual(expect.arrayContaining(['assistant']))
  })

  it('upup:stream client 为 null 时抛错', async () => {
    mockClientIsNull = true
    await expect(
      handler('upup:stream')(null, { prompt: '分析' })
    ).rejects.toThrow('投资工作台调用失败：UpUp 引擎未就绪')
  })

  // ===== cancel =====

  it('upup:cancel 返回 { ok: boolean }', async () => {
    // 先启动一个 stream 获取 turnId
    const { turnId } = await handler('upup:stream')(null, { prompt: 'test' })

    // 取消这个 turn
    const { ok } = await handler('upup:cancel')(null, { turnId })
    expect(ok).toBe(true)

    // 再次取消同一个 turn 返回 false
    const { ok: ok2 } = await handler('upup:cancel')(null, { turnId })
    expect(ok2).toBe(false)
  })

  it('upup:cancel 未注册的 turnId 返回 false', async () => {
    const { ok } = await handler('upup:cancel')(null, { turnId: 'nonexistent' })
    expect(ok).toBe(false)
  })
})
