import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import './Layout.css'

type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  backgroundImage?: string | null
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
      style={backgroundImage ? { '--project-background': `url("${backgroundImage}")` } as React.CSSProperties : undefined}
    >
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
