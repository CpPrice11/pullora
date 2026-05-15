import { useI18n } from '../../i18n'

type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'
type NavIconName = 'library' | 'installed' | 'favorites' | 'settings' | 'about'

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
  { id: 'search', icon: 'library', labelKey: 'nav.library' },
  { id: 'installed', icon: 'installed', labelKey: 'nav.installed' },
  { id: 'favorites', icon: 'favorites', labelKey: 'nav.favorites' },
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
      {name === 'installed' && (
        <>
          <path {...common} d="M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4z" />
          <path {...common} d="M5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4z" />
          <path {...common} d="M5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z" />
        </>
      )}
      {name === 'favorites' && (
        <path
          {...common}
          d="m12 4.75 2.08 4.22 4.66.68-3.37 3.29.8 4.64L12 15.39l-4.17 2.19.8-4.64-3.37-3.29 4.66-.68L12 4.75Z"
        />
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
      <nav className="sidebar-nav" aria-label="Navigation">
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
