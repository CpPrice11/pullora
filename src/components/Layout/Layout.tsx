import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import './Layout.css'

type Tab = 'search' | 'settings' | 'about'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  backgroundImage?: string | null
}

function toCssUrl(value: string) {
  return `url(${JSON.stringify(value)})`
}

function Layout({
  children,
  activeTab,
  onTabChange,
  backgroundImage,
}: LayoutProps) {
  return (
    <div
      className="layout cinematic-shell"
    >
      <div
        className={`cinematic-background ${backgroundImage ? 'is-visible' : ''}`}
        style={backgroundImage ? { backgroundImage: toCssUrl(backgroundImage) } : undefined}
        aria-hidden="true"
      />
      <div className="cinematic-backdrop" aria-hidden="true" />
      <Header />
      <div className="layout-container">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="layout-content" key={activeTab}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
