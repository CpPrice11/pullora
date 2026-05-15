import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import './Layout.css'

type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'

interface LayoutProps {
  children: React.ReactNode
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

function Layout({
  children,
  activeTab,
  onTabChange,
}: LayoutProps) {
  return (
    <div className="layout">
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
