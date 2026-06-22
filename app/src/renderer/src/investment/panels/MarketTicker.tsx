/**
 * 行情条：主要指数 + 自选股，红涨绿跌（中文惯例）。
 *
 * 数据源：UpUp SDK —— 通过 `useUpupQuery` 调 agent 取得 JSON 报价。
 * 轮询：每 15s 触发一次 refetch。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupQuery } from '../hooks/useUpup'

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

const POLL_INTERVAL_MS = 15_000

function fmtPrice(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function parseQuotes(text: string): Quote[] {
  // 从 agent 文本结果中提取结构化 JSON
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const obj = JSON.parse(match[0])
      if (Array.isArray(obj.quotes)) return obj.quotes as Quote[]
    } catch { /* fall through */ }
  }
  return []
}

export function MarketTicker(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { call, loading, error } = useUpupQuery()
  const [quotes, setQuotes] = React.useState<Quote[]>([])
  const [tick, setTick] = React.useState(0)

  // 拉取数据
  React.useEffect(() => {
    const symbols = DEFAULT_INDICES.map((i) => i.symbol).join(',')
    let cancelled = false
    void call(`查询下列指数的实时报价，仅返回 JSON：${symbols}`).then((r) => {
      if (!cancelled && r) setQuotes(parseQuotes(r.result))
    })
    return () => {
      cancelled = true
    }
  }, [tick, call])

  // 轮询
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('market.indices')}
        </h2>
        <button
          onClick={() => setTick((n) => n + 1)}
          className="text-xs text-slate-500 hover:text-blue-500"
          aria-label={t('workbench.refresh')}
        >
          ↻ {t('workbench.refresh')}
        </button>
      </header>
      {loading && quotes.length === 0 ? (
        <div className="text-xs text-slate-400">{t('market.connecting')}</div>
      ) : error ? (
        <div className="text-xs text-rose-500">{error}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {DEFAULT_INDICES.map((idx, i) => {
            const q = quotes[i]
            const up = (q?.change ?? 0) >= 0
            return (
              <div
                key={idx.symbol}
                className="rounded border border-slate-200 dark:border-slate-700 p-2"
              >
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{idx.name}</div>
                <div className={`text-sm font-mono ${up ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {q ? fmtPrice(q.price) : '—'}
                </div>
                {q && (
                  <div className={`text-[10px] font-mono ${up ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {fmtPct(q.changePct)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
