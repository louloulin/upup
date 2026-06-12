/**
 * 持仓摘要：总资产、当日盈亏、累计盈亏、持仓数、Top 5 持仓。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

type Holding = {
  symbol: string
  name?: string
  weight: number
  dayPnl: number
  dayPnlPct: number
  price: number
  sparkline?: number[]
}

type Portfolio = {
  totalAssets: number
  todayPnl: number
  todayPnlPct: number
  totalPnl: number
  cashRatio: number
  holdingsCount: number
  top5: Holding[]
}

function fmtCNY(n: number): string {
  return n.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 })
}

function Sparkline({ points }: { points?: number[] }): React.ReactElement {
  if (!points || points.length < 2) return <div className="h-6" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 80, h = 24
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - ((p - min) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const up = points[points.length - 1] >= points[0]
  return (
    <svg width={w} height={h} className={up ? 'text-rose-500' : 'text-emerald-500'}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function PortfolioSummary(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const { data, loading, error, refresh } = useAsync<Portfolio | null>(
    async () => {
      try {
        return (await req('/v1/portfolio', 'GET')) as Portfolio
      } catch {
        // 引擎未挂载 portfolio 端点时返回 null
        return null
      }
    },
    []
  )

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('portfolio.title')}
        </h2>
        <button
          onClick={refresh}
          className="text-xs text-slate-500 hover:text-blue-500"
          aria-label={t('workbench.refresh')}
        >
          ↻
        </button>
      </header>
      {loading && !data ? (
        <div className="text-xs text-slate-400">{t('common.loading')}</div>
      ) : !data ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {error || t('portfolio.empty')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('portfolio.totalAssets')}
              </div>
              <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {fmtCNY(data.totalAssets)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('portfolio.todayPnl')}
              </div>
              <div
                className={`text-lg font-semibold ${
                  data.todayPnl >= 0 ? 'text-rose-500' : 'text-emerald-500'
                }`}
              >
                {data.todayPnl >= 0 ? '+' : ''}
                {fmtCNY(data.todayPnl)} ({data.todayPnlPct.toFixed(2)}%)
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('portfolio.holdingsCount', { count: data.holdingsCount })}
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200">
                {data.holdingsCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {t('portfolio.cashRatio')}
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200">
                {(data.cashRatio * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {t('portfolio.top5')}
            </div>
            <div className="space-y-1">
              {data.top5.map((h) => (
                <div
                  key={h.symbol}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <div className="flex-1 truncate">
                    <span className="font-mono">{h.symbol}</span>
                    {h.name && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                        {h.name}
                      </span>
                    )}
                  </div>
                  <div className="w-20 text-right text-xs text-slate-500">
                    {(h.weight * 100).toFixed(1)}%
                  </div>
                  <div className="w-20 text-right">
                    <Sparkline points={h.sparkline} />
                  </div>
                  <div
                    className={`w-20 text-right font-mono ${
                      h.dayPnl >= 0 ? 'text-rose-500' : 'text-emerald-500'
                    }`}
                  >
                    {h.dayPnl >= 0 ? '+' : ''}
                    {h.dayPnlPct.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default PortfolioSummary
