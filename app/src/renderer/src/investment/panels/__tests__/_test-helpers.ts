import { vi } from 'vitest'

/**
 * 测试工具：为各面板组件构建可控的 useUpup hook mocks。
 *
 * 每个 helper 返回标准形状，调用者按需覆写 data / loading / error。
 */

export function makeQueryMock(overrides?: {
  call?: ReturnType<typeof vi.fn>
  loading?: boolean
  error?: string | null
  data?: unknown
}) {
  return {
    useUpupQuery: vi.fn(() => ({
      call: overrides?.call ?? vi.fn(async () => ({ result: '{"quotes":[]}' })),
      loading: overrides?.loading ?? false,
      error: overrides?.error ?? null,
      data: overrides?.data ?? null
    }))
  }
}

export function makeListSkillsMock(overrides?: {
  data?: unknown[] | null
  loading?: boolean
  error?: string | null
}) {
  return {
    useUpupListSkills: vi.fn(() => ({
      data: overrides?.data ?? null,
      loading: overrides?.loading ?? false,
      error: overrides?.error ?? null,
      refresh: vi.fn()
    }))
  }
}

export function makeListSessionsMock(overrides?: {
  data?: unknown[] | null
  loading?: boolean
  error?: string | null
}) {
  return {
    useUpupListSessions: vi.fn(() => ({
      data: overrides?.data ?? null,
      loading: overrides?.loading ?? false,
      error: overrides?.error ?? null,
      refresh: vi.fn()
    }))
  }
}

export function makeStreamMock(overrides?: {
  start?: ReturnType<typeof vi.fn>
  cancel?: ReturnType<typeof vi.fn>
  clear?: ReturnType<typeof vi.fn>
  events?: unknown[]
  loading?: boolean
  error?: string | null
  result?: unknown
  turnId?: string | null
}) {
  return {
    useUpupStream: vi.fn(() => ({
      start: overrides?.start ?? vi.fn(),
      cancel: overrides?.cancel ?? vi.fn(),
      clear: overrides?.clear ?? vi.fn(),
      events: overrides?.events ?? [],
      loading: overrides?.loading ?? false,
      error: overrides?.error ?? null,
      result: overrides?.result ?? null,
      turnId: overrides?.turnId ?? null
    }))
  }
}