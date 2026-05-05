function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-title">Air Launcher</h1>
        <div className="header-actions">
          <button className="icon-button" title="Notifications">
            🔔
          </button>
          <button className="icon-button" title="Settings">
            ⚙️
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
