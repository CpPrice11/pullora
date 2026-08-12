import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import Layout from './components/Layout/Layout'
import LibraryPage from './features/library/LibraryPage'
import { useSettings } from './hooks/useSettings'
import { appearanceCssVariables, applyAppearanceSettings, applyThemePreference, resolveThemePreference, type ResolvedTheme, type ThemePreference } from './utils/theme'
import { LanguageProvider, useI18n } from './i18n'
import { pickImageFile } from './services/dialog'
import {
  clearLauncherBackgroundArt,
  getLauncherBackgroundArt,
  projectArtBackgroundUrl,
  projectArtCropStyle,
  setLauncherBackgroundArt,
  setProjectArtCrop,
} from './services/projectArt'
import type { ArtCrop, ProjectArt } from './types'

type ContentTab = 'library' | 'about'
type NavigationTab = ContentTab | 'settings'

const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const InstallationPathModal = lazy(() => import('./components/Modal/InstallationPathModal'))
const ArtCropDialog = lazy(() => import('./components/Modal/ArtCropDialog'))

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
  const [launcherArtError, setLauncherArtError] = useState<string | null>(null)
  const [launcherBackgrounds, setLauncherBackgrounds] = useState<Record<ResolvedTheme, ProjectArt | null>>({
    light: null,
    dark: null,
  })
  const [pendingLauncherBackground, setPendingLauncherBackground] = useState<{
    theme: ResolvedTheme
    sourcePath: string
    mode: 'replace' | 'edit'
    art?: ProjectArt
    initialCrop?: ArtCrop
  } | null>(null)

  useEffect(() => {
    setThemePreference(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    if (!launcherArtError) return
    const timer = window.setTimeout(() => setLauncherArtError(null), 4200)
    return () => window.clearTimeout(timer)
  }, [launcherArtError])

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
          light,
          dark,
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
    setLauncherArtError(null)
    const imagePath = await pickImageFile()
    if (!imagePath) return

    setPendingLauncherBackground({ theme, sourcePath: imagePath, mode: 'replace' })
  }

  const handleEditLauncherBackground = (theme: ResolvedTheme) => {
    const art = launcherBackgrounds[theme]
    if (!art?.backgroundPath) return

    setLauncherArtError(null)
    setPendingLauncherBackground({
      theme,
      sourcePath: art.backgroundPath,
      mode: 'edit',
      art,
      initialCrop: art.backgroundCrop,
    })
  }

  const handleSaveLauncherBackground = async (crop: ArtCrop) => {
    if (!pendingLauncherBackground) return
    const { theme, sourcePath, mode, art: currentArt } = pendingLauncherBackground
    const art = mode === 'edit' && currentArt
      ? await setProjectArtCrop(currentArt.owner, currentArt.repo, 'background', crop)
      : await setLauncherBackgroundArt(theme, sourcePath, crop)
    setLauncherBackgrounds((current) => ({ ...current, [theme]: art }))
    setPendingLauncherBackground(null)
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

  const visibleBackgroundArt = launcherBackgrounds[resolvedTheme]
  const visibleBackground = projectArtBackgroundUrl(visibleBackgroundArt, { fallbackToCover: false })

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
        backgroundCropStyle={projectArtCropStyle(visibleBackgroundArt)}
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
              onEditLauncherBackground={handleEditLauncherBackground}
              onChangeLauncherBackground={handleChangeLauncherBackground}
              onClearLauncherBackground={handleClearLauncherBackground}
            />
          </Suspense>
        )}

        {showPathModal && (
          <Suspense fallback={null}>
            <InstallationPathModal
              onPathSelected={handlePathSelected}
              onSkip={() => setShowPathModal(false)}
            />
          </Suspense>
        )}

        {pendingLauncherBackground && (
          <Suspense fallback={null}>
            <ArtCropDialog
              kind="background"
              previewShape="workspace"
              previewStyle={appearanceCssVariables(settings.appearance, pendingLauncherBackground.theme)}
              sourcePath={pendingLauncherBackground.sourcePath}
              initialCrop={pendingLauncherBackground.initialCrop}
              onCancel={() => setPendingLauncherBackground(null)}
              onError={setLauncherArtError}
              onSave={handleSaveLauncherBackground}
            />
          </Suspense>
        )}

        {launcherArtError && typeof document !== 'undefined' && createPortal(
          <div
            className="library-toast library-toast--error"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <span>{launcherArtError}</span>
          </div>,
          document.body,
        )}

      </Layout>
    </LanguageProvider>
  )
}

export default App
