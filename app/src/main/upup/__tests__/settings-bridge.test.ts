/**
 * settings-bridge 单元测试
 * 覆盖 resolveUpupClientConfig: provider/model 默认值, apiKey 校验, baseUrl 透传
 *
 * 参考: resolve-kun-binary.test.ts (纯函数不需要 mock), app-identity.test.ts (vi.mock 模式)
 */
import { describe, expect, it } from 'vitest'
import type { AppSettingsV1 } from '../../shared/app-settings-types'

// 直接 import 源函数 — settings-bridge 无副作用依赖
import { resolveUpupClientConfig, UpupApiKeyMissingError } from '../settings-bridge'

/** 构造一个最小可用的 AppSettingsV1 stub，只填充 upup 相关字段 */
function settings(upup: Partial<AppSettingsV1['agents']['upup']> = {}): AppSettingsV1 {
  return {
    version: 1,
    locale: 'zh',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      providers: [{ id: 'deepseek', name: 'DeepSeek', apiKey: 'sk-fallback-from-kun', baseUrl: 'https://api.deepseek.com', endpointFormat: 'responses' as never, models: [] }]
    },
    agents: {
      kun: {
        apiKey: 'sk-fallback-from-kun',
        baseUrl: '',
        approvalPolicy: 'auto' as never,
        binaryPath: '',
        dataDir: '',
        endpointFormat: 'responses' as never,
        insecure: false,
        mcpSearch: { autoThresholdToolCount: 10, enabled: true, minScore: 0.5, mode: 'auto', topKDefault: 10, topKMax: 50 } as never,
        model: 'deepseek-v4-pro',
        port: 8899,
        providerId: '',
        runtimeToken: '',
        sandboxMode: 'danger-full-access' as never,
        storage: { backend: 'hybrid', sqlitePath: '' } as never,
        contextCompaction: { defaultHardThreshold: 50000, defaultSoftThreshold: 20000, summaryInputMaxBytes: 50000, summaryMaxTokens: 4096, summaryMode: 'heuristic', summaryTimeoutMs: 30000 } as never,
        runtimeTuning: { toolArgumentRepair: { maxStringBytes: 50000 }, toolStorm: { enabled: false, threshold: 5, windowSize: 10 } } as never,
        tokenEconomy: { compressToolDescriptions: false, compressToolResults: false, conciseResponses: false, enabled: false, historyHygiene: { maxArrayItems: 100, maxToolArgumentStringBytes: 50000, maxToolArgumentStringTokens: 50000, maxToolResultBytes: 50000, maxToolResultLines: 500, maxToolResultTokens: 50000 } } as never,
        tokenEconomyMode: false,
        autoStart: false
      } as never,
      upup: upup as AppSettingsV1['agents']['upup']
    },
    workspaceRoot: '',
    log: { enabled: true, retentionDays: 2 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: {} as never,
    write: { activeWorkspaceRoot: '', defaultWorkspaceRoot: '', workspaces: [], inlineCompletion: { apiKey: '', baseUrl: '', debounceMs: 650, enabled: false, inheritModel: false, longCompletionEnabled: false, longDebounceMs: 2800, longMaxTokens: 256, longMinAcceptScore: 0.36, maxTokens: 96, minAcceptScore: 0.52, model: '', retrievalEnabled: false } } as never,
    claw: { channels: [], enabled: true, im: { enabled: true, model: '', mode: 'agent', path: '', port: 8787, provider: 'feishu', responseTimeoutMs: 5000, secret: '', workspaceRoot: '', weixinBridgeUrl: '' } as never, skills: { defaultNames: [], extraDirs: [], promptPrefix: '' }, tasks: [] } as never,
    schedule: { defaultWorkspaceRoot: '', enabled: false, keepAwake: false, internal: { port: 8788, secret: '' }, mode: 'agent', model: '' as never, promptPrefix: '', skills: { defaultNames: [], extraDirs: [] }, tasks: [] } as never,
    guiUpdate: { channel: 'stable' } as never,
    codePromptPrefix: ''
  }
}

describe('resolveUpupClientConfig', () => {
  // ===== 默认 provider / model =====

  it('默认 provider 为 deepseek', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-test' }))
    expect(cfg.provider).toBe('deepseek')
  })

  it('默认 model 为 deepseek-v4-pro（deepseek provider）', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-test' }))
    expect(cfg.model).toBe('deepseek-v4-pro')
  })

  it('anthropic provider 默认 model 为 claude-sonnet-4-6', () => {
    const cfg = resolveUpupClientConfig(settings({ provider: 'anthropic', apiKey: 'sk-ant' }))
    expect(cfg.provider).toBe('anthropic')
    expect(cfg.model).toBe('claude-sonnet-4-6')
  })

  it('openai provider 默认 model 为 gpt-4o', () => {
    const cfg = resolveUpupClientConfig(settings({ provider: 'openai', apiKey: 'sk-openai' }))
    expect(cfg.model).toBe('gpt-4o')
  })

  it('google provider 默认 model 为 gemini-2.0-flash', () => {
    const cfg = resolveUpupClientConfig(settings({ provider: 'google', apiKey: 'sk-gemini' }))
    expect(cfg.model).toBe('gemini-2.0-flash')
  })

  // ===== 非标准 provider 归一化 =====

  it('xai / openrouter / ollama 全部映射到 openai', () => {
    for (const p of ['xai', 'openrouter', 'ollama'] as const) {
      const cfg = resolveUpupClientConfig(settings({ provider: p, apiKey: 'sk-test' }))
      expect(cfg.provider).toBe('openai')
      expect(cfg.model).toBe('gpt-4o')
    }
  })

  // ===== apiKey 缺失 =====

  it('upup.apiKey 为空字符串时仍使用 kun fallback（不为空就 fallback）', () => {
    // upup.apiKey 空字符串会被 trim 后判空，回退到 kun.apiKey
    const cfg = resolveUpupClientConfig(settings({ apiKey: '' }))
    expect(cfg.apiKey).toBe('sk-fallback-from-kun')
  })

  it('upup.apiKey 和 fallback 都为空时抛中文错误', () => {
    // settings() 内部 kun.apiKey 默认是 'sk-fallback-from-kun'
    // 构造一个 kun.apiKey 也为空的 settings
    const s = settings({ apiKey: '' })
    ;(s.agents.kun as Record<string, unknown>).apiKey = ''
    expect(() => resolveUpupClientConfig(s)).toThrow(UpupApiKeyMissingError)
    expect(() => resolveUpupClientConfig(s)).toThrow('投资工作台')
  })

  it('upup.apiKey 为空白字符串时抛错', () => {
    const s = settings({ apiKey: '   ' })
    ;(s.agents.kun as Record<string, unknown>).apiKey = ''
    expect(() => resolveUpupClientConfig(s)).toThrow(UpupApiKeyMissingError)
  })

  it('upup.apiKey 为空但 kun.apiKey 不为空时使用 kun fallback', () => {
    // settings() 内部 kun.apiKey 默认是 'sk-fallback-from-kun'
    const cfg = resolveUpupClientConfig(settings({}))
    expect(cfg.apiKey).toBe('sk-fallback-from-kun')
  })

  // ===== apiKey 优先级 =====

  it('upup.apiKey 优先于 fallback', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-upup-key' }))
    expect(cfg.apiKey).toBe('sk-upup-key')
  })

  // ===== model 优先级 =====

  it('传入 upup.model 时不走默认', () => {
    const cfg = resolveUpupClientConfig(settings({ provider: 'deepseek', model: 'custom-model', apiKey: 'sk-test' }))
    expect(cfg.model).toBe('custom-model')
  })

  // ===== baseUrl =====

  it('传入 baseUrl 时透传', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-test', baseUrl: 'https://api.custom.com/v1' }))
    expect(cfg.baseUrl).toBe('https://api.custom.com/v1')
  })

  it('未传 baseUrl 时字段不存在', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-test' }))
    expect(cfg).not.toHaveProperty('baseUrl')
  })

  // ===== useUpupSession =====

  it('useUpupSession 始终为 true', () => {
    const cfg = resolveUpupClientConfig(settings({ apiKey: 'sk-test' }))
    expect(cfg.useUpupSession).toBe(true)
  })

  // ===== settings.agents.upup 为 undefined =====

  it('settings.agents.upup 为 undefined 时使用默认值', () => {
    const s = settings()
    delete (s.agents as Record<string, unknown>).upup
    const cfg = resolveUpupClientConfig(s)
    expect(cfg.provider).toBe('deepseek')
    expect(cfg.model).toBe('deepseek-v4-pro')
    expect(cfg.apiKey).toBe('sk-fallback-from-kun')
    expect(cfg.useUpupSession).toBe(true)
  })

  // ===== 空白字符串去空格 =====

  it('apiKey / model / baseUrl 去除前后空格', () => {
    const cfg = resolveUpupClientConfig(settings({
      apiKey: '  sk-test  ',
      model: '  my-model  ',
      baseUrl: '  https://trim.example.com  '
    }))
    expect(cfg.apiKey).toBe('sk-test')
    expect(cfg.model).toBe('my-model')
    expect(cfg.baseUrl).toBe('https://trim.example.com')
  })
})
