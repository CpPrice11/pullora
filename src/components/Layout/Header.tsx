import type { ReactNode } from 'react'
import appIcon from '../../../src-tauri/icons/icon.png'

interface HeaderProps {
  children: ReactNode
}

function Header({ children }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-brand">
          <div className="brand-mark" aria-hidden="true">
            <img src={appIcon} alt="" />
          </div>
          <h1 className="header-title">Pullora</h1>
        </div>
        {children}
      </div>
    </header>
  )
}

export default Header
