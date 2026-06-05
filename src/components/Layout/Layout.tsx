import React from 'react'
import Sidebar from './Sidebar'
import { useI18n } from '../../i18n'
import './Layout.css'

type Tab = 'search' | 'aiWorkspace' | 'settings' | 'about'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  contentKey?: string
  onTabChange: (tab: Tab) => void
  backgroundImage?: string | null
  settingsOpen?: boolean
}

function toCssUrl(value: string) {
  return `url(${JSON.stringify(value)})`
}

function Layout({
  children,
  activeTab,
  contentKey,
  onTabChange,
  backgroundImage,
  settingsOpen = false,
}: LayoutProps) {
  const { t } = useI18n()
  const activeLabel = activeTab === 'settings' ? t('nav.settings') : t(`nav.${activeTab === 'search' ? 'library' : activeTab}`)

  return (
    <div
      className={`layout sam-shell ${backgroundImage ? 'has-custom-background' : ''} ${settingsOpen ? 'settings-open' : ''}`}
    >
      <div
        className={`sam-background ${backgroundImage ? 'is-visible' : ''}`}
        style={backgroundImage ? { backgroundImage: toCssUrl(backgroundImage) } : undefined}
        aria-hidden="true"
      />
      <div className="sam-backdrop" aria-hidden="true" />
      <header className="sam-titlebar">
        <div className="sam-window-brand">
          <span className="sam-window-mark" aria-hidden="true">A</span>
          <span>AIR LAUNCHER</span>
        </div>
        <div className="sam-window-title">{activeLabel}</div>
        <div className="sam-window-status">GitHub Release Manager</div>
      </header>
      <div className="layout-container">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="layout-content" key={contentKey ?? activeTab}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
