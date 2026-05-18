import appIcon from '../../assets/air-launcher-cloud-icon.png'

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <div className="brand-mark" aria-hidden="true">
          <img src={appIcon} alt="" />
        </div>
        <div>
          <h1 className="header-title">Air Launcher</h1>
        </div>
      </div>
    </header>
  )
}

export default Header
