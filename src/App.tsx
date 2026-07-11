import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import { LibraryPage } from './features/library'
import SettingsPage from './pages/SettingsPage'
import AboutPage from './pages/AboutPage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import { useSettings } from './hooks/useSettings'
import { applyAppearanceSettings, applyThemePreference, THEME_CHANGE_EVENT, type ThemePreference } from './utils/theme'
import { LanguageProvider } from './i18n'
import { pickImageFile } from './services/dialog'
import {
  clearLauncherBackgroundArt,
  getLauncherBackgroundArt,
  projectArtBackgroundUrl,
  setLauncherBackgroundArt,
} from './services/projectArt'

type ContentTab = 'library' | 'about'
type NavigationTab = ContentTab | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<ContentTab>('library')
  const [visitedTabs, setVisitedTabs] = useState<Set<ContentTab>>(() => new Set(['library']))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [themePreference, setThemePreference] = useState<ThemePreference>(settings.theme)
  const [showPathModal, setShowPathModal] = useState(false)
  const [launcherBackground, setLauncherBackground] = useState<string | null>(null)
  const [searchPreviewBackground, setSearchPreviewBackground] = useState<string | null>(null)
  const [hasLauncherBackground, setHasLauncherBackground] = useState(false)

  useEffect(() => {
    setThemePreference(settings.theme)
    applyAppearanceSettings(settings.appearance)
  }, [settings.theme, settings.appearance])

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
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current
      const next = new Set(current)
      next.add(activeTab)
      return next
    })
  }, [activeTab])

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

  const visibleBackground = activeTab === 'library' && searchPreviewBackground
    ? searchPreviewBackground
    : launcherBackground

  const shouldRenderTab = (tab: ContentTab) => visitedTabs.has(tab) || activeTab === tab
  const tabPanelProps = (tab: ContentTab) => ({
    hidden: settingsOpen || activeTab !== tab,
    'aria-hidden': settingsOpen || activeTab !== tab,
  })

  const renderContent = () => (
    <>
      {shouldRenderTab('library') && (
        <div {...tabPanelProps('library')}>
          <LibraryPage
            onOpenSettings={() => setSettingsOpen(true)}
            onPreviewBackground={setSearchPreviewBackground}
            suppressDiagnostics={showPathModal}
          />
        </div>
      )}

      {shouldRenderTab('about') && (
        <div {...tabPanelProps('about')}>
          <AboutPage />
        </div>
      )}
    </>
  )

  return (
    <LanguageProvider initialLanguage={settings.language}>
      <Layout
        activeTab={settingsOpen ? 'settings' : activeTab}
        contentKey={settingsOpen ? 'settings' : activeTab}
        onTabChange={handleTabChange}
        backgroundImage={visibleBackground}
        settingsOpen={settingsOpen}
      >
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
          <InstallationPathModal
            onPathSelected={handlePathSelected}
            onSkip={() => setShowPathModal(false)}
          />
        )}

      </Layout>
    </LanguageProvider>
  )
}

export default App
