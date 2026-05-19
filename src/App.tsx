import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import SearchPage from './pages/SearchPage'
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
import { pickImageFile } from './services/dialog'
import {
  clearLauncherBackgroundArt,
  getLauncherBackgroundArt,
  projectArtBackgroundUrl,
  setLauncherBackgroundArt,
} from './services/projectArt'

type ContentTab = 'search' | 'about'
type NavigationTab = ContentTab | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<ContentTab>('search')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [themePreference, setThemePreference] = useState<ThemePreference>(settings.theme)
  const [showPathModal, setShowPathModal] = useState(false)
  const [launcherBackground, setLauncherBackground] = useState<string | null>(null)
  const [hasLauncherBackground, setHasLauncherBackground] = useState(false)

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

  useEffect(() => {
    getLauncherBackgroundArt()
      .then((art) => {
        const url = projectArtBackgroundUrl(art, { fallbackToCover: false })
        setLauncherBackground(url)
        setHasLauncherBackground(Boolean(url))
      })
      .catch(() => {
        setLauncherBackground(null)
        setHasLauncherBackground(false)
      })
  }, [])

  const handlePathSelected = async (path: string) => {
    await setInstallationPath(path)
    setShowPathModal(false)
  }

  const handleInstallUpdate = (update: UpdateAvailable) => {
    dismiss(update.owner, update.repo)
    setUpdateTarget(update)
  }

  const handleChangeLauncherBackground = async () => {
    const imagePath = await pickImageFile()
    if (!imagePath) return

    const art = await setLauncherBackgroundArt(imagePath)
    const url = projectArtBackgroundUrl(art, { fallbackToCover: false })
    setLauncherBackground(url)
    setHasLauncherBackground(Boolean(url))
  }

  const handleClearLauncherBackground = async () => {
    await clearLauncherBackgroundArt()
    setLauncherBackground(null)
    setHasLauncherBackground(false)
  }

  const handleTabChange = (tab: NavigationTab) => {
    if (tab === 'settings') {
      setSettingsOpen(true)
      return
    }

    setSettingsOpen(false)
    setActiveTab(tab)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'search':    return (
        <SearchPage
          hasLauncherBackground={hasLauncherBackground}
          onChangeLauncherBackground={handleChangeLauncherBackground}
          onClearLauncherBackground={handleClearLauncherBackground}
        />
      )
      case 'about':     return <AboutPage />
      default:          return <SearchPage />
    }
  }

  return (
    <LanguageProvider initialLanguage={settings.language}>
      <Layout
        activeTab={settingsOpen ? 'settings' : activeTab}
        contentKey={activeTab}
        onTabChange={handleTabChange}
        backgroundImage={launcherBackground}
        settingsOpen={settingsOpen}
      >
        {updates.length > 0 && (
          <UpdateBanner
            updates={updates}
            onDismiss={dismiss}
            onInstall={handleInstallUpdate}
          />
        )}

        {renderContent()}

        {settingsOpen && (
          <SettingsPage
            hasLauncherBackground={hasLauncherBackground}
            onChangeLauncherBackground={handleChangeLauncherBackground}
            onClearLauncherBackground={handleClearLauncherBackground}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {showPathModal && (
          <InstallationPathModal onPathSelected={handlePathSelected} />
        )}

        {updateTarget && (
          <ReleaseSelector
            owner={updateTarget.owner}
            repo={updateTarget.repo}
            displayName={updateTarget.appName}
            currentVersion={updateTarget.currentVersion}
            onClose={() => setUpdateTarget(null)}
          />
        )}
      </Layout>
    </LanguageProvider>
  )
}

export default App
