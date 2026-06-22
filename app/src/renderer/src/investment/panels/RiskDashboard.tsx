/**
 * 风险仪表盘：行业暴露、个股最大回撤、组合贝塔。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupQuery } from '../hooks/useUpup'

type Risk = {
  beta: number
  maxDrawdown: number
  sectors: Array<{ sector: string; weight: number }>
}

const DEFAULT_RISK: Risk = { beta: 0, maxDrawdown: 0, sectors: [] }

function tryParse(text: string): Risk {
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as Risk } catch { /* fall through */ }
  }
  return DEFAULT_RISK
}

function riskLevel(beta: number): { label: string; color: string } {
  if (beta < 0.8) return { label: '低', color: 'text-emerald-500' }
  if (beta < 1.2) return { label: '中', color: 'text-amber-500' }
  return { label: '高', color: 'text-rose-500' }
}

export function RiskDashboard(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { call, loading, error } = useUpupQuery()
  const [risk, setRisk] = React.useState<Risk>(DEFAULT_RISK)

  React.useEffect(() => {
    void call('查询当前组合的风险敞口（贝塔/最大回撤/行业暴露），仅返回 JSON').then((r) => {
      if (r) setRisk(tryParse(r.result))
    })
  }, [call])

  const lvl = riskLevel(risk.beta)

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('risk.title')}
        </h2>
        {loading && <span className="text-xs text-slate-400">…</span>}
      </header>
      {error && <div className="text-xs text-rose-500 mb-2">{error}</div>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('risk.beta')}</div>
          <div className="text-base font-mono text-slate-800 dark:text-slate-100">{risk.beta.toFixed(2)}</div>
          <div className={`text-[10px] ${lvl.color}`}>{lvl.label}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t('risk.maxDrawdown')}</div>
          <div className="text-base font-mono text-slate-800 dark:text-slate-100">
            {(risk.maxDrawdown * 100).toFixed(1)}%
          </div>
        </div>
      </div>
      {risk.sectors.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            {t('risk.sectorExposure')}
          </div>
          <ul className="space-y-1">
            {risk.sectors.slice(0, 4).map((s) => (
              <li
                key={s.sector}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-700 dark:text-slate-200">{s.sector}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  {(s.weight * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
