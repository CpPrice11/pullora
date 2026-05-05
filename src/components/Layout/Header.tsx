interface HeaderProps {
  updatesCount?: number
  checking?: boolean
  onCheckUpdates?: () => void
}

function Header({ updatesCount = 0, checking = false, onCheckUpdates }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-title">✈ Air Launcher</h1>
        <div className="header-actions">
          <button
            className={`icon-button ${checking ? 'spinning' : ''}`}
            title={checking ? 'Checking for updates...' : 'Check for updates'}
            onClick={onCheckUpdates}
            disabled={checking}
          >
            🔄
          </button>
          {updatesCount > 0 && (
            <span className="update-badge" title={`${updatesCount} update(s) available`}>
              {updatesCount}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
