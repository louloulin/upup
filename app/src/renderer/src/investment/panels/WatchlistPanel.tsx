/**
 * 自选股：增删改查，编辑后立即拉取报价。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupQuery } from '../hooks/useUpup'

type WatchItem = {
  symbol: string
  name?: string
  price?: number
  changePct?: number
}

const STORAGE_KEY = 'upup.investment.watchlist'

function loadFromStorage(): WatchItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as WatchItem[]
  } catch { /* ignore */ }
  return []
}

function saveToStorage(items: WatchItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch { /* ignore */ }
}

export function WatchlistPanel(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { call } = useUpupQuery()
  const [items, setItems] = React.useState<WatchItem[]>(loadFromStorage)
  const [newSymbol, setNewSymbol] = React.useState('')

  React.useEffect(() => {
    saveToStorage(items)
  }, [items])

  const addItem = async (): Promise<void> => {
    const s = newSymbol.trim()
    if (!s) return
    if (items.some((i) => i.symbol === s)) {
      setNewSymbol('')
      return
    }
    setItems((prev) => [...prev, { symbol: s }])
    setNewSymbol('')
    const r = await call(`查询 ${s} 的名称，仅返回 JSON：{symbol,name}`)
    if (r) {
      const m = r.result.match(/\{[\s\S]*\}/)
      if (m) {
        try {
          const obj = JSON.parse(m[0])
          setItems((prev) =>
            prev.map((i) => (i.symbol === s ? { ...i, name: obj.name || i.name } : i))
          )
        } catch { /* ignore */ }
      }
    }
  }

  const removeItem = (sym: string): void => {
    setItems((prev) => prev.filter((i) => i.symbol !== sym))
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('watchlist.title')}
        </h2>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {items.length}
        </span>
      </header>
      <div className="flex gap-2 mb-2">
        <input
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addItem()
          }}
          placeholder={t('watchlist.addPlaceholder')}
          className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent"
        />
        <button
          onClick={() => void addItem()}
          className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
        >
          {t('watchlist.add')}
        </button>
      </div>
      <ul className="space-y-1 max-h-40 overflow-auto">
        {items.length === 0 ? (
          <li className="text-xs text-slate-400">{t('watchlist.empty')}</li>
        ) : (
          items.map((it) => (
            <li
              key={it.symbol}
              className="flex items-center justify-between text-xs group"
            >
              <span className="font-mono text-slate-700 dark:text-slate-200">
                {it.name || it.symbol}
              </span>
              <button
                onClick={() => removeItem(it.symbol)}
                className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                aria-label="remove"
              >
                ✕
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
