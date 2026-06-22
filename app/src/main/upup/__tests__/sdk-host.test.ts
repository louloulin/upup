/**
 * sdk-host 单元测试
 * 覆盖 UpupSdkHost 单例生命周期: start/stop/restart/isRunning/uptime/getVersion
 *
 * 参考: app-identity.test.ts (vi.mock 模式)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockClose = vi.fn(async () => {})
const mockCreateClient = vi.fn()

vi.mock('@upup/sdk', () => ({
  createClient: mockCreateClient
}))

// vi.mock 需要在 import 之前定义，使用动态 import 在 mock 生效后加载
let upupSdkHost: typeof import('../sdk-host').upupSdkHost
let cancelAll: typeof import('../cancellation').cancelAll

beforeEach(async () => {
  // 重置 mock 的实现和历史记录，但保留默认行为
  mockClose.mockReset()
  mockCreateClient.mockReset()
  mockClose.mockImplementation(async () => {})
  mockCreateClient.mockImplementation(async () => mockClient())

  // 清掉单例状态：re-import 整个模块
  const hostModule = await import('../sdk-host')
  upupSdkHost = hostModule.upupSdkHost
  // 通过 stop 确保干净状态
  await upupSdkHost.stop()

  const cancelModule = await import('../cancellation')
  cancelAll = cancelModule.cancelAll
})

function mockClient() {
  return {
    close: mockClose,
    tools: { getAll: () => [] },
    query: vi.fn(async () => ({ result: 'mock' })),
    stream: vi.fn(async function*() { yield { type: 'result', result: 'mock' } })
  }
}

describe('UpupSdkHost', () => {
  // ===== 初始状态 =====

  it('初始 isRunning() 为 false', () => {
    expect(upupSdkHost.isRunning()).toBe(false)
  })

  it('初始 uptime() 为 0', () => {
    expect(upupSdkHost.uptime()).toBe(0)
  })

  it('初始 getClient() 返回 null', () => {
    expect(upupSdkHost.getClient()).toBeNull()
  })

  it('getVersion() 返回包含数字和点的字符串', () => {
    const v = upupSdkHost.getVersion()
    expect(typeof v).toBe('string')
    expect(v).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // ===== start =====

  it('start(settings) 成功后 isRunning() 为 true', async () => {
    mockCreateClient.mockReset()
    mockCreateClient.mockResolvedValueOnce(mockClient())
    const s = minimalSettings()
    await upupSdkHost.start(s)
    expect(upupSdkHost.isRunning()).toBe(true)
    expect(upupSdkHost.getClient()).not.toBeNull()
  })

  it('start(settings) 后 uptime 经过时间后大于 0', async () => {
    mockCreateClient.mockReset()
    mockCreateClient.mockResolvedValueOnce(mockClient())
    const s = minimalSettings()
    await upupSdkHost.start(s)
    // 等待 5ms 让时间推进
    await new Promise(r => setTimeout(r, 5))
    expect(upupSdkHost.uptime()).toBeGreaterThan(0)
  })

  it('start(settings) 两次调用幂等，不会重复 createClient', async () => {
    mockCreateClient.mockResolvedValueOnce(mockClient())
    const s = minimalSettings()
    await upupSdkHost.start(s)
    await upupSdkHost.start(s)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  it('start(settings) 失败时 host 仍标记为未运行', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('Connection failed'))
    const s = minimalSettings()
    await expect(upupSdkHost.start(s)).rejects.toThrow('Connection failed')
    expect(upupSdkHost.isRunning()).toBe(false)
    expect(upupSdkHost.getClient()).toBeNull()
  })

  // ===== stop =====

  it('stop() 在 client 为 null 时是 no-op', async () => {
    await upupSdkHost.stop() // 不抛错
    expect(upupSdkHost.isRunning()).toBe(false)
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('stop() 关闭client并重置状态', async () => {
    mockCreateClient.mockResolvedValueOnce(mockClient())
    const s = minimalSettings()
    await upupSdkHost.start(s)
    expect(upupSdkHost.isRunning()).toBe(true)

    await upupSdkHost.stop()
    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(upupSdkHost.isRunning()).toBe(false)
    expect(upupSdkHost.uptime()).toBe(0)
    expect(upupSdkHost.getClient()).toBeNull()
  })

  // ===== restart =====

  it('restart(settings) 先 stop 再 start', async () => {
    mockCreateClient
      .mockResolvedValueOnce(mockClient())  // 第一次 start
      .mockResolvedValueOnce(mockClient())  // restart 内部重新 start

    const s = minimalSettings()
    await upupSdkHost.start(s)
    expect(upupSdkHost.isRunning()).toBe(true)

    const s2 = minimalSettings()
    await upupSdkHost.restart(s2)
    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(mockCreateClient).toHaveBeenCalledTimes(2)
    expect(upupSdkHost.isRunning()).toBe(true)
  })
})

/** 构造一个带 apiKey 的最小 settings
 *
 * 不需要完整的 AppSettingsV1 字段：sdk-host 内部只调用 resolveUpupClientConfig，
 * 该函数只读 agents.upup / agents.kun.apiKey，所以我们只需构造这两个字段。
 */
function minimalSettings(): Parameters<typeof upupSdkHost.start>[0] {
  return {
    version: 1,
    locale: 'zh',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      providers: []
    },
    agents: {
      kun: { apiKey: 'sk-fallback-from-kun' } as never,
      upup: { apiKey: 'sk-test-key' } as never
    },
    workspaceRoot: '',
    log: { enabled: true, retentionDays: 2 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: {} as never,
    write: {} as never,
    claw: {} as never,
    schedule: {} as never,
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  } as never
}
