import React from 'react'
import Sidebar from './Sidebar'
import './Layout.css'

type Tab = 'library' | 'settings' | 'about'

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
  return (
    <div
      className={`layout fluent-shell ${backgroundImage ? 'has-custom-background' : ''} ${settingsOpen ? 'settings-open' : ''}`}
    >
      <div
        className={`fluent-background ${backgroundImage ? 'is-visible' : ''}`}
        style={backgroundImage ? { backgroundImage: toCssUrl(backgroundImage) } : undefined}
        aria-hidden="true"
      />
      <div className="fluent-backdrop" aria-hidden="true" />
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
