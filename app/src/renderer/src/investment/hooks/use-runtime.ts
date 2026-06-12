/**
 * 通用引擎调用 hook：把 UpUp/Kun 引擎的 HTTP 端点封装为可复用的 React Query 风格 hook。
 * 引擎选择对 UI 透明（settings 决定）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type RuntimeRequestFn = (path: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<unknown>

export function useRuntimeRequest(): RuntimeRequestFn {
  return useCallback(async (path, method = 'GET', body) => {
    const api = (window as any).dsGui
    if (!api?.runtimeRequest) {
      throw new Error('runtimeRequest 不可用：请确认在 Electron 环境中运行')
    }
    const result = await api.runtimeRequest(path, method, body ? JSON.stringify(body) : null)
    const parsed = typeof result === 'string' ? JSON.parse(result) : result
    const inner = (parsed as { body?: string }).body
    if (typeof inner === 'string') {
      try { return JSON.parse(inner) } catch { return inner }
    }
    return parsed
  }, [])
}

export function useInterval(callback: () => void, delayMs: number | null): void {
  const saved = useRef(callback)
  useEffect(() => { saved.current = callback }, [callback])
  useEffect(() => {
    if (delayMs === null) return
    const id = setInterval(() => saved.current(), delayMs)
    return () => clearInterval(id)
  }, [delayMs])
}

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const req = useRuntimeRequest()
  const loaderRef = useRef(loader)
  useEffect(() => { loaderRef.current = loader })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loaderRef.current()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, refresh: () => setNonce((n) => n + 1) }
}
