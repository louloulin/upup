/**
 * 投资工作台布局：
 *   - 顶部标题 + 引擎徽章 + 刷新
 *   - 主区域：左侧（行情+持仓+风险+自选），右侧（研报+技能+工作流）
 *   - 引擎不可达时显示统一错误
 *
 * 数据源：UpUp SDK（@upup/sdk）通过 `useUpupHealth()` 获取引擎状态
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { MarketTicker } from './panels/MarketTicker'
import { PortfolioSummary } from './panels/PortfolioSummary'
import { WatchlistPanel } from './panels/WatchlistPanel'
import { RiskDashboard } from './panels/RiskDashboard'
import { ResearchPanel } from './panels/ResearchPanel'
import { SkillLauncher } from './panels/SkillLauncher'
import { WorkflowTracker } from './panels/WorkflowTracker'
import { useUpupHealth } from './hooks/useUpup'

export function InvestmentLayout(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { data: health, loading, error } = useUpupHealth()

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {t('workbench.title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('workbench.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-mono">
              {t('workbench.engineBadge')} · v{health.version}
            </span>
          )}
        </div>
      </header>
      {loading && !health ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          {t('workbench.loading')}
        </div>
      ) : !health?.ok ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm p-8">
          <div className="text-rose-500 font-medium mb-2">
            {t('workbench.errorTitle')}
          </div>
          <div className="text-xs text-center max-w-md">
            {health?.error ?? t('workbench.errorBody')}
          </div>
          {error && (
            <pre className="mt-4 text-[10px] text-slate-400 max-w-md overflow-auto">{error}</pre>
          )}
        </div>
      ) : (
        <main className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-3 gap-3 auto-rows-min">
          <div className="lg:col-span-3">
            <MarketTicker />
          </div>
          <div className="lg:col-span-2 space-y-3">
            <PortfolioSummary />
            <ResearchPanel />
          </div>
          <div className="space-y-3">
            <WatchlistPanel />
            <RiskDashboard />
            <WorkflowTracker />
          </div>
          <div className="lg:col-span-3">
            <SkillLauncher />
          </div>
        </main>
      )}
    </div>
  )
}

export default InvestmentLayout
