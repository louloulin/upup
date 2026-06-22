/**
 * useUpup — 渲染层访问 UpUp SDK 的类型化 hook。
 *
 * 取代旧 `useRuntimeRequest` + `useAsync` + `useInterval` 组合。
 * 7 个投资面板统一改用此 hook。
 *
 * 设计：
 * - `useUpup()` 返回 `UpupApi`（来自 @upup/sdk preload bridge）
 * - 6 个具名 hook：useUpupHealth / useUpupListTools / useUpupListSkills / useUpupListSessions / useUpupQuery / useUpupStream
 * - 所有错误自动包装为中文
 * - 使用 @shared 别名（避免相对路径穿透）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  UpupApi,
  UpupHealth,
  UpupTool,
  UpupSkill,
  UpupSession,
  UpupStreamEvent,
  UpupQueryResult
} from '@shared/upup-api'

function toChinese(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.startsWith('投资工作台')) return err.message
    return `投资工作台调用失败：${err.message}`
  }
  return `投资工作台调用失败：${String(err)}`
}

/**
 * 上下文访问器。`window.dsGui.upup` 不存在时抛中文错误。
 */
export function useUpup(): UpupApi {
  const api = (typeof window !== 'undefined' ? window.dsGui?.upup : undefined)
  if (!api) {
    throw new Error('投资工作台：dsGui.upup 未注入（请确认在 Electron 环境中运行）')
  }
  return api
}

// ============ Async state wrapper ============

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => void
}

function useAsyncState<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loaderRef
      .current()
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(toChinese(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, refresh: () => setNonce((n) => n + 1) }
}

// ============ 具名 hooks ============

export function useUpupHealth(): AsyncState<UpupHealth> {
  const api = useUpup()
  return useAsyncState<UpupHealth>(() => api.health(), [])
}

export function useUpupListTools(): AsyncState<UpupTool[]> {
  const api = useUpup()
  return useAsyncState<UpupTool[]>(() => api.listTools(), [])
}

export type { UpupSkill, UpupSession, UpupTool, UpupHealth, UpupStreamEvent, UpupQueryResult }

export function useUpupListSkills(): AsyncState<UpupSkill[]> {
  const api = useUpup()
  return useAsyncState<UpupSkill[]>(() => api.listSkills(), [])
}

export function useUpupListSessions(): AsyncState<UpupSession[]> {
  const api = useUpup()
  return useAsyncState<UpupSession[]>(() => api.listSessions(), [])
}

/**
 * 非流式 query：返回包装函数。
 */
export function useUpupQuery(): {
  call: (prompt: string, opts?: { systemPrompt?: string }) => Promise<UpupQueryResult | null>
  loading: boolean
  error: string | null
  data: UpupQueryResult | null
} {
  const api = useUpup()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<UpupQueryResult | null>(null)

  const call = useCallback(
    async (prompt: string, opts?: { systemPrompt?: string }) => {
      setLoading(true)
      setError(null)
      try {
        const r = await api.query(prompt, opts)
        setData(r)
        return r
      } catch (e) {
        const msg = toChinese(e)
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [api]
  )

  return { call, loading, error, data }
}

/**
 * 流式调用：暴露 turnId + events + start / cancel。
 */
export function useUpupStream(): {
  turnId: string | null
  events: UpupStreamEvent[]
  loading: boolean
  error: string | null
  result: UpupQueryResult | null
  start: (prompt: string, opts?: { systemPrompt?: string }) => Promise<void>
  cancel: () => Promise<void>
  clear: () => void
} {
  const api = useUpup()
  const [turnId, setTurnId] = useState<string | null>(null)
  const [events, setEvents] = useState<UpupStreamEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UpupQueryResult | null>(null)
  const currentTurnIdRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = api.onStream((msg) => {
      if (msg.turnId !== currentTurnIdRef.current) return
      setEvents((prev) => [...prev, msg])
      if (msg.event === 'error') {
        setError(toChinese(new Error(msg.data.message)))
        setLoading(false)
      } else if (msg.event === 'result') {
        setResult({ result: msg.data.result, ...(msg.data.usage ? { usage: msg.data.usage } : {}) })
      } else if (msg.event === 'done') {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [api])

  const start = useCallback(
    async (prompt: string, opts?: { systemPrompt?: string }) => {
      setEvents([])
      setError(null)
      setResult(null)
      setLoading(true)
      try {
        const { turnId: newId } = await api.stream(prompt, opts)
        currentTurnIdRef.current = newId
        setTurnId(newId)
      } catch (e) {
        setError(toChinese(e))
        setLoading(false)
      }
    },
    [api]
  )

  const cancel = useCallback(async () => {
    if (!currentTurnIdRef.current) return
    try {
      await api.cancel(currentTurnIdRef.current)
    } catch (e) {
      setError(toChinese(e))
    }
    setLoading(false)
  }, [api])

  const clear = useCallback(() => {
    setEvents([])
    setError(null)
    setResult(null)
    setTurnId(null)
    currentTurnIdRef.current = null
  }, [])

  return { turnId, events, loading, error, result, start, cancel, clear }
}
