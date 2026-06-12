import { useEffect, useState } from 'react'
import './App.css'
import Layout from './components/Layout/Layout'
import SearchPage from './pages/SearchPage'
import SettingsPage from './pages/SettingsPage'
import AboutPage from './pages/AboutPage'
import AiWorkspacePage from './pages/AiWorkspacePage'
import InstallationPathModal from './components/Modal/InstallationPathModal'
import UpdateBanner from './components/UpdateBanner/UpdateBanner'
import ReleaseSelector from './components/Search/ReleaseSelector'
import { useSettings } from './hooks/useSettings'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import { applyAppearanceSettings, applyThemePreference, THEME_CHANGE_EVENT, type ThemePreference } from './utils/theme'
import { LanguageProvider, useI18n } from './i18n'
import type { GitHubSearchResult, UpdateAvailable } from './types'
import { pickImageFile } from './services/dialog'
import { listenCodexEvents } from './services/aiWorkspace'
import {
  clearLauncherBackgroundArt,
  getLauncherBackgroundArt,
  projectArtBackgroundUrl,
  setLauncherBackgroundArt,
} from './services/projectArt'

type ContentTab = 'store' | 'library' | 'aiWorkspace' | 'about'
type NavigationTab = ContentTab | 'settings'

function AiWorkspaceNotifications() {
  const { t } = useI18n()
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)

  useEffect(() => {
    let unlisten: Array<() => void> = []
    let timer: number | undefined

    const showNotice = (text: string, kind: 'success' | 'error') => {
      setNotice({ text, kind })
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setNotice(null), 4400)
    }

    listenCodexEvents(
      (payload) => {
        if (payload.method === 'turn/completed') {
          showNotice(t('ai.backgroundCompleted'), 'success')
        }
      },
      () => showNotice(t('ai.backgroundFailed'), 'error'),
    ).then((listeners) => { unlisten = listeners }).catch(() => {})

    return () => {
      if (timer) window.clearTimeout(timer)
      unlisten.forEach((stop) => stop())
    }
  }, [t])

  if (!notice) return null

  return (
    <div className={`library-toast library-toast--${notice.kind}`} role="status" aria-live="polite">
      {notice.text}
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<ContentTab>('store')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { settings, isFirstLaunch, setInstallationPath } = useSettings()
  const [themePreference, setThemePreference] = useState<ThemePreference>(settings.theme)
  const [showPathModal, setShowPathModal] = useState(false)
  const [launcherBackground, setLauncherBackground] = useState<string | null>(null)
  const [searchPreviewBackground, setSearchPreviewBackground] = useState<string | null>(null)
  const [hasLauncherBackground, setHasLauncherBackground] = useState(false)
  const [aiWorkspaceRepo, setAiWorkspaceRepo] = useState<GitHubSearchResult | null>(null)

  // Start auto-update after settings are loaded
  const { updates, dismiss } = useAutoUpdate(
    settings.checkIntervalHours,
    settings.autoUpdateCheck,
  )

  // Repo open from update banner
  const [updateTarget, setUpdateTarget] = useState<UpdateAvailable | null>(null)

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

  const visibleBackground = (activeTab === 'store' || activeTab === 'library') && searchPreviewBackground
    ? searchPreviewBackground
    : launcherBackground

  const renderContent = () => {
    switch (activeTab) {
      case 'store':    return (
        <SearchPage
          mode="store"
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAiWorkspace={(repo) => {
            setAiWorkspaceRepo(repo)
            setActiveTab('aiWorkspace')
          }}
          onPreviewBackground={setSearchPreviewBackground}
        />
      )
      case 'library':    return (
        <SearchPage
          mode="library"
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenStore={() => setActiveTab('store')}
          onOpenAiWorkspace={(repo) => {
            setAiWorkspaceRepo(repo)
            setActiveTab('aiWorkspace')
          }}
          onPreviewBackground={setSearchPreviewBackground}
        />
      )
      case 'aiWorkspace': return (
        <AiWorkspacePage
          requestedRepo={aiWorkspaceRepo}
          onRequestedRepoConsumed={() => setAiWorkspaceRepo(null)}
        />
      )
      case 'about':     return <AboutPage />
      default:          return <SearchPage mode="store" />
    }
  }

  return (
    <LanguageProvider initialLanguage={settings.language}>
      <Layout
        activeTab={settingsOpen ? 'settings' : activeTab}
        contentKey={settingsOpen ? 'settings' : activeTab}
        onTabChange={handleTabChange}
        backgroundImage={visibleBackground}
        settingsOpen={settingsOpen}
      >
        <AiWorkspaceNotifications />
        {updates.length > 0 && (
          <UpdateBanner
            updates={updates}
            onDismiss={dismiss}
            onInstall={handleInstallUpdate}
          />
        )}

        {settingsOpen ? (
          <SettingsPage
            hasLauncherBackground={hasLauncherBackground}
            onChangeLauncherBackground={handleChangeLauncherBackground}
            onClearLauncherBackground={handleClearLauncherBackground}
            onClose={() => setSettingsOpen(false)}
          />
        ) : renderContent()}

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
