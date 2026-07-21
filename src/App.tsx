import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import LibraryPage from './features/library/LibraryPage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import { useSettings } from './hooks/useSettings'
import { applyAppearanceSettings, applyThemePreference, resolveThemePreference, type ResolvedTheme, type ThemePreference } from './utils/theme'
import { LanguageProvider, useI18n } from './i18n'
import { pickImageFile } from './services/dialog'
import {
  clearLauncherBackgroundArt,
  getLauncherBackgroundArt,
  projectArtBackgroundUrl,
  setLauncherBackgroundArt,
} from './services/projectArt'

type ContentTab = 'library' | 'about'
type NavigationTab = ContentTab | 'settings'

const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))

function LazyPageFallback() {
  const { t } = useI18n()

  return (
    <div className="page-lazy-fallback" role="status" aria-live="polite">
      {t('app.loadingPage')}
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<ContentTab>('library')
  const [visitedTabs, setVisitedTabs] = useState<Set<ContentTab>>(() => new Set(['library']))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const mainContentRef = useRef<HTMLElement>(null)
  const scrollPositions = useRef<Record<NavigationTab, number>>({
    library: 0,
    settings: 0,
    about: 0,
  })
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [themePreference, setThemePreference] = useState<ThemePreference>(settings.theme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveThemePreference(settings.theme))
  const [showPathModal, setShowPathModal] = useState(false)
  const [launcherBackgrounds, setLauncherBackgrounds] = useState<Record<ResolvedTheme, string | null>>({
    light: null,
    dark: null,
  })

  useEffect(() => {
    setThemePreference(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const resolvedTheme = applyThemePreference(themePreference)
      setResolvedTheme(resolvedTheme)
      applyAppearanceSettings(settings.appearance, resolvedTheme)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)

    return () => {
      media.removeEventListener('change', applyTheme)
    }
  }, [themePreference, settings.appearance])

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

  const activeView: NavigationTab = settingsOpen ? 'settings' : activeTab

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (mainContentRef.current) {
        mainContentRef.current.scrollTop = scrollPositions.current[activeView]
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeView])

  useEffect(() => {
    Promise.all([
      getLauncherBackgroundArt('light'),
      getLauncherBackgroundArt('dark'),
    ])
      .then(([light, dark]) => {
        setLauncherBackgrounds({
          light: projectArtBackgroundUrl(light, { fallbackToCover: false }),
          dark: projectArtBackgroundUrl(dark, { fallbackToCover: false }),
        })
      })
      .catch(() => {
        setLauncherBackgrounds({ light: null, dark: null })
      })
  }, [])

  const handlePathSelected = async (path: string) => {
    await setInstallationPath(path)
    setShowPathModal(false)
  }

  const handleChangeLauncherBackground = async (theme: ResolvedTheme) => {
    const imagePath = await pickImageFile()
    if (!imagePath) return

    const art = await setLauncherBackgroundArt(theme, imagePath)
    const url = projectArtBackgroundUrl(art, { fallbackToCover: false })
    setLauncherBackgrounds((current) => ({ ...current, [theme]: url }))
  }

  const handleClearLauncherBackground = async (theme: ResolvedTheme) => {
    await clearLauncherBackgroundArt(theme)
    setLauncherBackgrounds((current) => ({ ...current, [theme]: null }))
  }

  const saveCurrentScroll = () => {
    if (mainContentRef.current) {
      scrollPositions.current[activeView] = mainContentRef.current.scrollTop
    }
  }

  const openSettings = () => {
    saveCurrentScroll()
    setSettingsOpen(true)
  }

  const handleTabChange = (tab: NavigationTab) => {
    if (tab === 'settings') {
      openSettings()
      return
    }

    saveCurrentScroll()
    setSettingsOpen(false)
    setActiveTab(tab)
  }

  const visibleBackground = launcherBackgrounds[resolvedTheme]

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
            onOpenSettings={openSettings}
            suppressDiagnostics={showPathModal}
          />
        </div>
      )}

      {shouldRenderTab('about') && (
        <div {...tabPanelProps('about')}>
          <Suspense fallback={<LazyPageFallback />}>
            <AboutPage />
          </Suspense>
        </div>
      )}
    </>
  )

  return (
    <LanguageProvider initialLanguage={settings.language}>
      <Layout
        activeTab={settingsOpen ? 'settings' : activeTab}
        mainRef={mainContentRef}
        onTabChange={handleTabChange}
        backgroundImage={visibleBackground}
        settingsOpen={settingsOpen}
      >
        {renderContent()}

        {settingsOpen && (
          <Suspense fallback={<LazyPageFallback />}>
            <SettingsPage
              hasLauncherBackground={{
                light: Boolean(launcherBackgrounds.light),
                dark: Boolean(launcherBackgrounds.dark),
              }}
              onChangeLauncherBackground={handleChangeLauncherBackground}
              onClearLauncherBackground={handleClearLauncherBackground}
            />
          </Suspense>
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
