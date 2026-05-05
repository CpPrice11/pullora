type Tab = 'search' | 'installed' | 'favorites' | 'settings'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'search', icon: '🔍', label: 'Search' },
    { id: 'installed', icon: '📦', label: 'Installed' },
    { id: 'favorites', icon: '⭐', label: 'Favorites' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ]

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
