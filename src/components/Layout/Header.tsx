import type { ReactNode } from 'react'

interface HeaderProps {
  children: ReactNode
}

function Header({ children }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        {children}
      </div>
    </header>
  )
}

export default Header
