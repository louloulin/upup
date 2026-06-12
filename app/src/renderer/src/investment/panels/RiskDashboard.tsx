/**
 * 风险仪表盘：行业暴露、个股最大回撤、组合贝塔。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

type Risk = {
  beta: number
  sectors: Array<{ sector: string; weight: number }>
  drawdowns: Array<{ symbol: string; drawdown: number }>
}

function riskLabel(beta: number, t: (k: string) => string): { text: string; cls: string } {
  if (beta >= 1.5) return { text: t('risk.high'), cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200' }
  if (beta >= 1.0) return { text: t('risk.mid'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200' }
  return { text: t('risk.low'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' }
}

export function RiskDashboard(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const { data, loading, error } = useAsync<Risk | null>(
    async () => {
      try {
        return (await req('/v1/risk', 'GET')) as Risk
      } catch {
        return null
      }
    },
    []
  )

  const label = data ? riskLabel(data.beta, t) : null

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('risk.title')}
        </h2>
        {label && (
          <span className={`text-xs px-2 py-0.5 rounded ${label.cls}`}>
            β = {data!.beta.toFixed(2)} · {label.text}
          </span>
        )}
      </header>
      {loading && !data ? (
        <div className="text-xs text-slate-400">{t('common.loading')}</div>
      ) : !data ? (
        <div className="text-xs text-slate-500">{error || t('risk.noData')}</div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t('risk.sectorExposure')}
            </div>
            {data.sectors.slice(0, 5).map((s) => (
              <div key={s.sector} className="flex items-center text-sm py-0.5">
                <span className="w-24 truncate">{s.sector}</span>
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded mx-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${Math.min(100, s.weight * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-mono">
                  {(s.weight * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t('risk.maxDrawdown')}
            </div>
            {data.drawdowns.slice(0, 3).map((d) => (
              <div key={d.symbol} className="flex items-center text-sm py-0.5">
                <span className="font-mono w-20">{d.symbol}</span>
                <span className="text-rose-500 font-mono text-xs">
                  {(d.drawdown * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default RiskDashboard
