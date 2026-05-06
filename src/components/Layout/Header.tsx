interface HeaderProps {
  updatesCount?: number
  checking?: boolean
  onCheckUpdates?: () => void
}

function Header({ updatesCount = 0, checking = false, onCheckUpdates }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <div>
          <h1 className="header-title">Air Launcher</h1>
        </div>
        <div className="header-actions">
          <button
            className={`icon-button ${checking ? 'spinning' : ''}`}
            title={checking ? 'Перевіряємо оновлення...' : 'Перевірити оновлення'}
            onClick={onCheckUpdates}
            disabled={checking}
            aria-label="Перевірити оновлення"
          >
            <span className="fluent-icon">Sync</span>
          </button>
          {updatesCount > 0 && (
            <span className="update-badge" title={`Доступно оновлень: ${updatesCount}`}>
              {updatesCount}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
