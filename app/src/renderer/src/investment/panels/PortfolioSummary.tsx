/**
 * 持仓摘要：总资产、当日盈亏、累计盈亏、持仓数、Top 5 持仓。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupQuery } from '../hooks/useUpup'

type Holding = {
  symbol: string
  name?: string
  weight: number
  pnl: number
  pnlPct: number
}

type PortfolioData = {
  totalAssets: number
  dailyPnl: number
  totalPnl: number
  holdings: Holding[]
}

const DEFAULT_DATA: PortfolioData = {
  totalAssets: 0,
  dailyPnl: 0,
  totalPnl: 0,
  holdings: []
}

function fmtMoney(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function tryParse(text: string): PortfolioData {
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return JSON.parse(m[0]) as PortfolioData
    } catch { /* fall through */ }
  }
  return DEFAULT_DATA
}

export function PortfolioSummary(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { call, loading, error } = useUpupQuery()
  const [data, setData] = React.useState<PortfolioData>(DEFAULT_DATA)

  React.useEffect(() => {
    void call('查询当前组合的持仓摘要（总资产/当日盈亏/累计盈亏/Top5 持仓），仅返回 JSON').then((r) => {
      if (r) setData(tryParse(r.result))
    })
  }, [call])

  const dailyUp = data.dailyPnl >= 0

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('portfolio.title')}
        </h2>
        {loading && <span className="text-xs text-slate-400">{t('workbench.loading')}</span>}
      </header>
      {error && <div className="text-xs text-rose-500 mb-2">{error}</div>}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {t('portfolio.totalAssets')}
          </div>
          <div className="text-lg font-mono text-slate-800 dark:text-slate-100">
            ¥{fmtMoney(data.totalAssets)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {t('portfolio.dailyPnl')}
          </div>
          <div className={`text-lg font-mono ${dailyUp ? 'text-rose-500' : 'text-emerald-500'}`}>
            {dailyUp ? '+' : ''}¥{fmtMoney(data.dailyPnl)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {t('portfolio.totalPnl')}
          </div>
          <div className={`text-lg font-mono ${data.totalPnl >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {data.totalPnl >= 0 ? '+' : ''}¥{fmtMoney(data.totalPnl)}
          </div>
        </div>
      </div>
      {data.holdings.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            {t('portfolio.top5')}
          </div>
          <ul className="space-y-1">
            {data.holdings.slice(0, 5).map((h) => (
              <li
                key={h.symbol}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-slate-700 dark:text-slate-200">{h.name || h.symbol}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {(h.weight * 100).toFixed(1)}%
                </span>
                <span className={`font-mono ${h.pnl >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
