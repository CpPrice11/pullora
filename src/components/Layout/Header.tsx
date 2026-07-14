import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'

interface HeaderProps {
  children: ReactNode
}

function Header({ children }: HeaderProps) {
  const { t } = useI18n()

  return (
    <header className="header">
      <div className="header-content">
        <div className="app-brand" aria-label="Pullora">
          <span className="app-brand-mark" aria-hidden="true">P</span>
          <span className="app-brand-copy">
            <strong>Pullora</strong>
            <small>{t('nav.desktopLibrary')}</small>
          </span>
        </div>
        {children}
      </div>
    </header>
  )
}

export default Header
