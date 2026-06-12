/**
 * 行情条：主要指数 + 自选股，红涨绿跌（中文惯例）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useInterval, useRuntimeRequest } from '../hooks/use-runtime'

type Quote = {
  symbol: string
  name?: string
  price: number
  change: number
  changePct: number
  limit?: 'up' | 'down' | null
}

const DEFAULT_INDICES = [
  { symbol: '000001.SH', name: '上证综指' },
  { symbol: '399001.SZ', name: '深证成指' },
  { symbol: '399006.SZ', name: '创业板指' },
  { symbol: 'HSI', name: '恒生指数' },
  { symbol: 'IXIC', name: '纳斯达克' }
]

function fmtPrice(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function MarketTicker(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const [tick, setTick] = React.useState(0)

  // 每 15s 触发一次轮询
  useInterval(() => setTick((n) => n + 1), 15_000)

  // 通过工具调用获取指数报价
  const { data, loading, error, refresh } = useAsync<{ quotes: Quote[]; watchlist: Quote[] }>(
    async () => {
      try {
        // 调用 @upup/tools 的 finance 工具 — 委托给引擎
        const r = await req('/v1/runtime/tools/quote', 'POST', { symbols: DEFAULT_INDICES.map(i => i.symbol) })
        const quotes = (r as { quotes?: Quote[] })?.quotes || []
        return { quotes, watchlist: [] }
      } catch {
        // 引擎未就绪时返回占位
        return { quotes: [], watchlist: [] }
      }
    },
    [tick]
  )

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('market.indices')}
        </h2>
        <button
          onClick={refresh}
          className="text-xs text-slate-500 hover:text-blue-500"
          aria-label={t('workbench.refresh')}
        >
          ↻ {t('workbench.refresh')}
        </button>
      </header>
      {loading && !data ? (
        <div className="text-xs text-slate-400">{t('market.connecting')}</div>
      ) : error ? (
        <div className="text-xs text-rose-500">{error}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {DEFAULT_INDICES.map((idx, i) => {
            const q = data?.quotes?.[i]
            const up = (q?.change ?? 0) >= 0
            return (
              <div
                key={idx.symbol}
                className="border border-slate-200 dark:border-slate-700 rounded-md p-2"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{idx.name}</div>
                <div className="text-sm font-mono text-slate-800 dark:text-slate-100">
                  {q ? fmtPrice(q.price) : '—'}
                </div>
                <div className={`text-xs font-mono ${up ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {q ? fmtPct(q.changePct) : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MarketTicker
