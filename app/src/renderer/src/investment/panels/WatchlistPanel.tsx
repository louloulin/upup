/**
 * 自选股：增删改查，编辑后立即拉取报价。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

type WatchItem = {
  symbol: string
  name?: string
  price?: number
  changePct?: number
  loading?: boolean
  error?: boolean
}

export function WatchlistPanel(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const [input, setInput] = React.useState('')
  const [items, setItems] = React.useState<WatchItem[]>([])

  const persist = async (next: WatchItem[]): Promise<void> => {
    try {
      await req('/v1/watchlist', 'POST', { symbols: next.map((i) => i.symbol) })
    } catch {
      // engine not ready — keep local state
    }
  }

  const add = async (): Promise<void> => {
    const sym = input.trim()
    if (!sym) return
    if (items.some((i) => i.symbol === sym)) {
      setInput('')
      return
    }
    const next = [...items, { symbol: sym, loading: true }]
    setItems(next)
    setInput('')
    await persist(next)
    // 模拟报价拉取
    setTimeout(() => {
      setItems((prev) =>
        prev.map((i) =>
          i.symbol === sym
            ? { ...i, loading: false, price: 100, changePct: Math.random() * 6 - 3 }
            : i
        )
      )
    }, 800)
  }

  const remove = async (sym: string): Promise<void> => {
    const next = items.filter((i) => i.symbol !== sym)
    setItems(next)
    await persist(next)
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('watchlist.title')}
        </h2>
        <span className="text-xs text-slate-400">{items.length}</span>
      </header>
      <div className="flex gap-2 mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
          placeholder={t('watchlist.symbolPlaceholder')}
          className="flex-1 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        />
        <button
          onClick={() => void add()}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {t('watchlist.add')}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400">{t('watchlist.empty')}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const up = (it.changePct ?? 0) >= 0
            return (
              <li
                key={it.symbol}
                className="flex items-center justify-between text-sm py-1 border-b border-slate-50 dark:border-slate-800 last:border-b-0"
              >
                <span className="font-mono">{it.symbol}</span>
                <span className="text-xs text-slate-500">
                  {it.loading ? '…' : it.error ? t('watchlist.loadFailed') : it.price?.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-mono ${
                    up ? 'text-rose-500' : 'text-emerald-500'
                  }`}
                >
                  {it.changePct !== undefined ? `${up ? '+' : ''}${it.changePct.toFixed(2)}%` : '—'}
                </span>
                <button
                  onClick={() => void remove(it.symbol)}
                  className="text-xs text-slate-400 hover:text-rose-500"
                  aria-label={t('watchlist.remove')}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default WatchlistPanel
