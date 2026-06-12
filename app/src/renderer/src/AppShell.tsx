import type { AppRoute } from './store/chat-store-types'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from './store/chat-store'
import { supportsDesktopTitleBar, WindowsTitleBar } from './components/WindowsTitleBar'

const InvestmentLayout = lazy(() => import('./investment/InvestmentLayout').then((m) => ({ default: m.InvestmentLayout })))
const Workbench = lazy(() =>
  import('./components/Workbench').then((module) => ({ default: module.Workbench }))
)
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const InitialSetupDialog = lazy(() =>
  import('./components/InitialSetupDialog').then((module) => ({
    default: module.InitialSetupDialog
  }))
)

function RouteFallback(): React.ReactElement {
  return <div className="h-full bg-ds-main" />
}

export default function AppShell(): React.ReactElement {
  const route = useChatStore((s) => s.route)
  const boot = useChatStore((s) => s.boot)
  const initialSetupOpen = useChatStore((s) => s.initialSetupOpen)
  const platform = typeof window !== 'undefined' ? window.dsGui?.platform ?? 'unknown' : 'unknown'
  const hasDesktopTitleBar = supportsDesktopTitleBar(platform)

  useEffect(() => {
    let frame = 0
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        void boot()
      })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [boot])

  return (
    <div className={hasDesktopTitleBar ? 'ds-windows-app-frame flex h-full min-h-0 flex-col bg-ds-main' : 'flex h-full min-h-0 flex-col bg-transparent'}>
      {hasDesktopTitleBar ? <WindowsTitleBar platform={platform} /> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <TopNav />
      <Suspense fallback={<RouteFallback />}>
          {route === 'settings' ? <SettingsView /> : route === 'investment' ? <InvestmentLayout /> : <Workbench />}
        </Suspense>
      </div>
      {initialSetupOpen ? (
        <Suspense fallback={null}>
          <InitialSetupDialog />
        </Suspense>
      ) : null}
    </div>
  )
}


function TopNav(): React.ReactElement {
  const route = useChatStore((s) => s.route)
  const setRoute = useChatStore((s) => s.setRoute)
  const { t } = useTranslation()
  const tabs: Array<{ id: AppRoute; label: string }> = [
    { id: 'chat', label: t('common:navChat', '会话') },
    { id: 'investment', label: t('investment:workbench.tab', '投资工作台') },
    { id: 'settings', label: t('common:navSettings', '设置') }
  ]
  return (
    <div className="ds-no-drag flex items-center gap-1 px-3 py-1 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setRoute(tab.id)}
          className={`px-3 py-1 rounded ${route === tab.id ? 'bg-blue-500 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
