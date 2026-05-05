import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import './Layout.css'

type Tab = 'search' | 'installed' | 'favorites' | 'settings'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  updatesCount?: number
  checking?: boolean
  onCheckUpdates?: () => void
}

function Layout({
  children,
  activeTab,
  onTabChange,
  updatesCount = 0,
  checking = false,
  onCheckUpdates,
}: LayoutProps) {
  return (
    <div className="layout">
      <Header
        updatesCount={updatesCount}
        checking={checking}
        onCheckUpdates={onCheckUpdates}
      />
      <div className="layout-container">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
