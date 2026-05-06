type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems: { id: Tab; icon: string; label: string; hint: string }[] = [
    { id: 'search', icon: '⌂', label: 'Бібліотека', hint: 'Проєкти з релізами' },
    { id: 'installed', icon: '▦', label: 'Встановлені', hint: 'Локальні застосунки' },
    { id: 'favorites', icon: '☆', label: 'Обране', hint: 'Закріплені проєкти' },
    { id: 'settings', icon: '⚙', label: 'Налаштування', hint: 'Папки, тема, оновлення' },
    { id: 'about', icon: 'i', label: 'Про застосунок', hint: 'Версії лаунчера' },
  ]

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav" aria-label="Основна навігація">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
            title={item.hint}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-text">
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
