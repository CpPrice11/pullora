type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'search', icon: '⌂', label: 'Бібліотека' },
    { id: 'installed', icon: '▦', label: 'Встановлені' },
    { id: 'favorites', icon: '☆', label: 'Обране' },
    { id: 'settings', icon: '⚙', label: 'Налаштування' },
    { id: 'about', icon: 'i', label: 'Про застосунок' },
  ]

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav" aria-label="Основна навігація">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
            title={item.label}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-text">
              <span className="nav-label">{item.label}</span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
