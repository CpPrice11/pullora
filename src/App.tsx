import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import SearchPage from './pages/SearchPage'
import InstalledPage from './pages/InstalledPage'
import FavoritesPage from './pages/FavoritesPage'
import SettingsPage from './pages/SettingsPage'
import AboutPage from './pages/AboutPage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import UpdateBanner from './components/UpdateBanner/UpdateBanner'
import ReleaseSelector from './components/Search/ReleaseSelector'
import { useSettings } from './hooks/useSettings'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import { applyThemePreference, THEME_CHANGE_EVENT, type ThemePreference } from './utils/theme'
import { LanguageProvider } from './i18n'
import type { UpdateAvailable } from './types'

type Tab = 'search' | 'installed' | 'favorites' | 'settings' | 'about'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [themePreference, setThemePreference] = useState<ThemePreference>(settings.theme)
  const [showPathModal, setShowPathModal] = useState(false)

  // Start auto-update after settings are loaded
  const { updates, dismiss } = useAutoUpdate(
    settings.checkIntervalHours,
    settings.autoUpdateCheck,
  )

  // Repo open from update banner
  const [updateTarget, setUpdateTarget] = useState<UpdateAvailable | null>(null)

  useEffect(() => {
    setThemePreference(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      applyThemePreference(themePreference)
    }

    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<{ theme: ThemePreference }>).detail?.theme
      if (nextTheme) {
        setThemePreference(nextTheme)
        applyThemePreference(nextTheme, true)
      }
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    return () => {
      media.removeEventListener('change', applyTheme)
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    }
  }, [themePreference])

  useEffect(() => {
    setShowPathModal(isFirstLaunch)
  }, [isFirstLaunch])

  const handlePathSelected = async (path: string) => {
    await setInstallationPath(path)
    setShowPathModal(false)
  }

  const handleInstallUpdate = (update: UpdateAvailable) => {
    dismiss(update.owner, update.repo)
    setUpdateTarget(update)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'search':    return <SearchPage />
      case 'installed': return <InstalledPage />
      case 'favorites': return <FavoritesPage />
      case 'settings':  return <SettingsPage />
      case 'about':     return <AboutPage />
      default:          return <SearchPage />
    }
  }

  return (
    <LanguageProvider initialLanguage={settings.language}>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {updates.length > 0 && (
          <UpdateBanner
            updates={updates}
            onDismiss={dismiss}
            onInstall={handleInstallUpdate}
          />
        )}

        {renderContent()}

        {showPathModal && (
          <InstallationPathModal onPathSelected={handlePathSelected} />
        )}

        {updateTarget && (
          <ReleaseSelector
            owner={updateTarget.owner}
            repo={updateTarget.repo}
            displayName={updateTarget.appName}
            onClose={() => setUpdateTarget(null)}
          />
        )}
      </Layout>
    </LanguageProvider>
  )
}

export default App
