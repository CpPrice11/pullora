import { useI18n } from '../../i18n'

type Tab = 'library' | 'settings' | 'about'
type NavIconName = 'library' | 'settings' | 'about'

interface SidebarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

interface NavItem {
  id: Tab
  icon: NavIconName
  labelKey: string
}

const navItems: NavItem[] = [
  { id: 'library', icon: 'library', labelKey: 'nav.library' },
  { id: 'settings', icon: 'settings', labelKey: 'nav.settings' },
  { id: 'about', icon: 'about', labelKey: 'nav.about' },
]

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  }

  return (
    <svg className="nav-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'library' && (
        <>
          <path {...common} d="M4.5 10.5 12 4l7.5 6.5" />
          <path {...common} d="M6.5 9.5v9h11v-9" />
          <path {...common} d="M9.5 18.5v-5h5v5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path {...common} d="M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" />
          <path
            {...common}
            d="M18.1 13.2c.05-.39.05-.41.05-.8s0-.41-.05-.8l1.7-1.32-1.62-2.8-2 .8c-.62-.47-.72-.53-1.42-.82L14.45 5h-4.9l-.31 2.46c-.7.29-.8.35-1.42.82l-2-.8-1.62 2.8 1.7 1.32c-.05.39-.05.41-.05.8s0 .41.05.8l-1.7 1.32 1.62 2.8 2-.8c.62.47.72.53 1.42.82l.31 2.46h4.9l.31-2.46c.7-.29.8-.35 1.42-.82l2 .8 1.62-2.8-1.7-1.32Z"
          />
        </>
      )}
      {name === 'about' && (
        <>
          <path {...common} d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          <path {...common} d="M12 11.25v4.5" />
          <path {...common} d="M12 8.25h.01" />
        </>
      )}
    </svg>
  )
}

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside className="sidebar">
      <div className="fluent-brand" aria-label="Pullora">
        <span className="fluent-brand-mark" aria-hidden="true" />
        <span className="fluent-brand-copy">
          <strong>Pullora</strong>
          <small>GitHub launcher</small>
        </span>
      </div>
      <nav className="sidebar-nav" aria-label={t('nav.navigation')}>
        {navItems.map((item) => {
          const label = t(item.labelKey)

          return (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              title={label}
              aria-current={activeTab === item.id ? 'page' : undefined}
              aria-label={label}
            >
              <span className="nav-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span className="nav-text">
                <span className="nav-label">{label}</span>
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

export default Sidebar
