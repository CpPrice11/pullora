import { useEffect, useRef, useState } from 'react'
import type { AppSettings, InstallPathValidation } from '../types'
import {
  getSettings,
  setInstallationPath as saveInstallationPath,
  updateSettings,
  validateInstallationPath,
} from '../services/settings'
import { cleanupLauncherUpdateFiles, getEventLog, getLauncherStorageInfo, openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import {
  clearGithubCache,
  getGithubQueueStatus,
  getGithubRateLimitStatus,
} from '../services/github'
import type { GitHubQueueStatus, GitHubRateLimitBucket, GitHubRateLimitStatus, LauncherStorageInfo } from '../types'
import StatePanel from '../components/State/StatePanel'
import {
  SettingsSections,
  type SettingsSectionId,
} from '../features/settings/components/SettingsSections'
import { useModalFocus } from '../hooks/useModalFocus'
import { applyAppearanceSettings, applyThemePreference, type ResolvedTheme, type ThemePreference } from '../utils/theme'
import { DEFAULT_SETTINGS, normalizeAppearance, normalizeSettings } from '../utils/settingsDefaults'
import { useI18n, type AppLanguage } from '../i18n'
import { redactSensitiveText } from '../utils/redactSensitiveText'
import { formatBytes } from '../utils/format'
import './PageStyles.css'

interface SettingsPageProps {
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  onEditLauncherBackground: (theme: ResolvedTheme) => Promise<void> | void
  onChangeLauncherBackground: (theme: ResolvedTheme) => Promise<void> | void
  onClearLauncherBackground: (theme: ResolvedTheme) => Promise<void> | void
}

function emptyRateLimitStatus(): GitHubRateLimitStatus {
  const emptyBucket = { remaining: null, limit: null, resetAt: null }
  return {
    core: { ...emptyBucket },
    search: { ...emptyBucket },
  }
}

function SettingsPage({
  hasLauncherBackground,
  onEditLauncherBackground,
  onChangeLauncherBackground,
  onClearLauncherBackground,
}: SettingsPageProps) {
  const { language, t } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathValidation, setPathValidation] = useState<'idle' | InstallPathValidation['status']>('idle')
  const [confirmation, setConfirmation] = useState<'reset' | 'cleanup' | null>(null)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<GitHubRateLimitStatus>(emptyRateLimitStatus)
  const [githubQueue, setGithubQueue] = useState<GitHubQueueStatus>(() => getGithubQueueStatus())
  const [eventLog, setEventLog] = useState<string[]>([])
  const [eventLogLoading, setEventLogLoading] = useState(false)
  const [eventLogError, setEventLogError] = useState<string | null>(null)
  const resetModalRef = useRef<HTMLElement | null>(null)

  const refreshEventLog = async () => {
    setEventLogLoading(true)
    setEventLogError(null)
    try {
      setEventLog(await getEventLog())
    } catch (err) {
      setEventLogError(err instanceof Error ? err.message : t('settings.eventLogErrorTitle'))
    } finally {
      setEventLogLoading(false)
    }
  }

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettings(loadedSettings)
        setSettings(normalizedSettings)
        applyThemePreference(normalizedSettings.theme)
        applyAppearanceSettings(normalizedSettings.appearance)
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS)
        applyThemePreference(DEFAULT_SETTINGS.theme)
        applyAppearanceSettings(DEFAULT_SETTINGS.appearance)
      })
      .finally(() => setLoading(false))
  }, [])

  useModalFocus(resetModalRef, {
    active: confirmation !== null,
    onEscape: saving || cleanupBusy ? undefined : () => setConfirmation(null),
  })

  useEffect(() => {
    if (!actionMessage) return
    const timer = window.setTimeout(() => setActionMessage(null), 3600)
    return () => window.clearTimeout(timer)
  }, [actionMessage])

  useEffect(() => {
    if (activeSection !== 'maintenance') return
    getLauncherStorageInfo()
      .then(setStorageInfo)
      .catch(() => {})
  }, [activeSection])

  useEffect(() => {
    if (activeSection === 'events') void refreshEventLog()
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'maintenance') return

    const refreshGithubDiagnostics = () => {
      setGithubQueue(getGithubQueueStatus())
      getGithubRateLimitStatus()
        .then(setGithubRateLimit)
        .catch(() => {})
    }

    refreshGithubDiagnostics()
    const timer = window.setInterval(refreshGithubDiagnostics, 1500)
    return () => window.clearInterval(timer)
  }, [activeSection])

  const persistSettings = async (
    nextSettings: AppSettings,
    previousSettings: AppSettings | null = settings,
  ) => {
    const normalizedSettings = normalizeSettings(nextSettings)

    setSettings(normalizedSettings)
    setSaving(true)
    setError(null)

    try {
      await updateSettings(normalizedSettings)
      return normalizedSettings
    } catch (err) {
      if (previousSettings) {
        setSettings(previousSettings)
      }
      setError(err instanceof Error ? err.message : t('settings.saveError'))
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleThemeChange = async (theme: ThemePreference) => {
    if (!settings) return

    const previousSettings = settings
    const nextSettings = normalizeSettings({ ...settings, theme })

    setSettings(nextSettings)
    applyThemePreference(theme, true)
    setSaving(true)
    setError(null)

    try {
      await updateSettings(nextSettings)
    } catch (err) {
      setSettings(previousSettings)
      applyThemePreference(previousSettings.theme, true)
      setError(err instanceof Error ? err.message : t('settings.themeError'))
    } finally {
      setSaving(false)
    }
  }

  const handleBrowse = async () => {
    const dir = await pickDirectory()
    if (dir && settings) {
      setSaving(true)
      setError(null)
      try {
        const installationPath = await saveInstallationPath(dir)
        setSettings((current) => current ? { ...current, installationPath } : current)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('settings.saveError'))
      } finally {
        setSaving(false)
      }
    }
  }

  const handleResetSettings = async () => {
    if (!settings) return
    const resetAppearance = normalizeAppearance(DEFAULT_SETTINGS.appearance)
    const resetSettings = normalizeSettings({
      ...settings,
      theme: DEFAULT_SETTINGS.theme,
      language: DEFAULT_SETTINGS.language,
      appearance: resetAppearance,
    })
    const savedSettings = await persistSettings(resetSettings, settings)
    if (savedSettings) {
      const backgroundResults = await Promise.allSettled([
        saveInstallationPath(''),
        onClearLauncherBackground('light'),
        onClearLauncherBackground('dark'),
      ])
      const pathResult = backgroundResults[0]
      const resetSucceeded = backgroundResults.every((result) => result.status === 'fulfilled')
      if (pathResult.status === 'fulfilled') {
        setSettings({ ...savedSettings, installationPath: pathResult.value })
      }
      if (pathResult.status === 'rejected') {
        setError(t('settings.saveError'))
      } else if (backgroundResults.slice(1).some((result) => result.status === 'rejected')) {
        setError(t('art.clearError'))
      }
      setConfirmation(null)
      applyThemePreference(savedSettings.theme, true)
      applyAppearanceSettings(savedSettings.appearance)
      if (resetSucceeded) setActionMessage(t('settings.resetDone'))
    }
  }

  const handleClearCache = async () => {
    try {
      await clearGithubCache()
      setGithubRateLimit(emptyRateLimitStatus())
      setGithubQueue(getGithubQueueStatus())
      setActionMessage(t('settings.cacheCleared'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.cacheError'))
    }
  }

  const handleCopyMaintenanceDiagnostics = async () => {
    if (!settings) return

    const lines = [
      'Pullora maintenance diagnostics',
      `githubOwner: ${settings.githubOwner || 'not set'}`,
      `installationPath: ${settings.installationPath || 'not set'}`,
      `assetStrategy: ${settings.assetStrategy}`,
      `includePrereleases: ${settings.includePrereleases ? 'yes' : 'no'}`,
      `theme: ${settings.theme}`,
      `language: ${settings.language}`,
      `launcherDir: ${storageInfo?.launcherDir ?? 'not checked'}`,
      `updateCachePath: ${storageInfo?.updateCachePath ?? 'not checked'}`,
      `updateCacheCount: ${storageInfo?.updateCacheCount ?? 'not checked'}`,
      `backupPath: ${storageInfo?.backupPath ?? 'not checked'}`,
      `backupCount: ${storageInfo?.backupCount ?? 'not checked'}`,
      `cleanupBytes: ${storageInfo?.cleanupBytes ?? 'not checked'}`,
      `githubCoreRemaining: ${githubRateLimit.core.remaining ?? 'unknown'}`,
      `githubCoreLimit: ${githubRateLimit.core.limit ?? 'unknown'}`,
      `githubCoreResetAt: ${githubRateLimit.core.resetAt ?? 'unknown'}`,
      `githubSearchRemaining: ${githubRateLimit.search.remaining ?? 'unknown'}`,
      `githubSearchLimit: ${githubRateLimit.search.limit ?? 'unknown'}`,
      `githubSearchResetAt: ${githubRateLimit.search.resetAt ?? 'unknown'}`,
      `githubQueueActive: ${githubQueue.active}`,
      `githubQueueWaiting: ${githubQueue.queued}`,
      `githubQueueConcurrency: ${githubQueue.concurrency}`,
      `githubQueueHighPriority: ${githubQueue.highPriority}`,
      `githubQueueNormalPriority: ${githubQueue.normalPriority}`,
      `githubQueuePausedUntil: ${githubQueue.pausedUntil ?? 'not paused'}`,
    ]

    try {
      await navigator.clipboard.writeText(redactSensitiveText(lines.join('\n')))
      setActionMessage(t('settings.diagnosticsCopied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.diagnosticsCopyError'))
    }
  }

  const handleRefreshStorageInfo = async () => {
    try {
      setStorageInfo(await getLauncherStorageInfo())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.storageInfoError'))
    }
  }

  const handleCleanupLauncherFiles = async () => {
    setCleanupBusy(true)
    try {
      const info = await cleanupLauncherUpdateFiles()
      setStorageInfo(info)
      setActionMessage(t('settings.cleanupDone'))
      setConfirmation(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.cleanupError'))
    } finally {
      setCleanupBusy(false)
    }
  }

  const handleValidatePath = async () => {
    if (!settings) return
    setError(null)
    try {
      const result = await validateInstallationPath(settings.installationPath)
      setPathValidation(result.status)
    } catch (err) {
      setPathValidation('inaccessible')
      setError(err instanceof Error ? err.message : t('settings.pathCheckError'))
    }
  }

  const formatRateLimit = (bucket: GitHubRateLimitBucket) => {
    if (bucket.remaining === null || bucket.limit === null) {
      return t('settings.githubLimitUnknown')
    }
    return t('settings.githubLimitValue', {
      remaining: bucket.remaining,
      limit: bucket.limit,
    })
  }

  const formatRateLimitReset = (bucket: GitHubRateLimitBucket) => {
    if (!bucket.resetAt) return t('settings.notChecked')
    return new Date(bucket.resetAt * 1000).toLocaleTimeString(
      language === 'en' ? 'en-US' : 'uk-UA',
      { hour: '2-digit', minute: '2-digit' },
    )
  }

  const formatQueuePause = () => {
    if (!githubQueue.pausedUntil || githubQueue.pausedUntil <= Date.now()) {
      return t('settings.githubQueueRunning')
    }
    return t('settings.githubQueuePausedUntil', {
      time: new Date(githubQueue.pausedUntil).toLocaleTimeString(
        language === 'en' ? 'en-US' : 'uk-UA',
        { hour: '2-digit', minute: '2-digit' },
      ),
    })
  }

  const handleLanguageChange = async (language: AppLanguage) => {
    if (!settings) return
    const savedSettings = await persistSettings({ ...settings, language }, settings)
    if (!savedSettings) return
  }

  const previewSurfaceSetting = (
    key: 'surfaceTransparency' | 'surfaceBlur',
    value: number,
  ) => {
    if (!settings) return
    const appearance = normalizeAppearance({ ...settings.appearance, [key]: value })
    setSettings({ ...settings, appearance })
    applyAppearanceSettings(appearance)
  }

  const commitSurfaceSetting = (
    key: 'surfaceTransparency' | 'surfaceBlur',
    value: number,
  ) => {
    if (!settings) return
    const previousSettings = settings
    const appearance = normalizeAppearance({ ...settings.appearance, [key]: value })
    const nextSettings = normalizeSettings({ ...settings, appearance })
    applyAppearanceSettings(appearance)
    void persistSettings(nextSettings, previousSettings)
  }

  if (loading || !settings) {
    return (
      <section className="page settings-page settings-page-loading" aria-label={t('settings.title')}>
        <StatePanel kind="loading" title={t('settings.loading')} skeletonCount={2} />
      </section>
    )
  }

  const sections: Array<{ id: SettingsSectionId; label: string }> = [
    { id: 'general', label: t('settings.general') },
    { id: 'events', label: t('settings.eventLog') },
    { id: 'maintenance', label: t('settings.maintenance') },
  ]

  const settingsPanelId = (sectionId: SettingsSectionId) => `settings-${sectionId}`
  const confirmationBusy = confirmation === 'cleanup' ? cleanupBusy : saving
  const confirmationTitle = confirmation === 'cleanup'
    ? t('settings.cleanupConfirmTitle')
    : t('settings.resetConfirmTitle')
  const confirmationText = confirmation === 'cleanup'
    ? t('settings.cleanupConfirm', {
        size: storageInfo ? formatBytes(storageInfo.cleanupBytes, language) : t('settings.notChecked'),
      })
    : t('settings.resetConfirmText')

  const handleSectionSelect = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId)
  }

  return (
    <>
      <section className="page settings-page" aria-labelledby="settings-title">
        <h2 id="settings-title" className="visually-hidden">{t('settings.title')}</h2>

        <div className="settings-form settings-workspace">
          <nav className="settings-nav" aria-label={t('settings.title')}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? 'active' : ''}
                aria-current={activeSection === section.id ? 'page' : undefined}
                aria-controls={activeSection === section.id ? settingsPanelId(section.id) : undefined}
                onClick={() => handleSectionSelect(section.id)}
                data-autofocus={activeSection === section.id ? 'true' : undefined}
              >
                {section.label}
              </button>
            ))}
            <button
              type="button"
              className="settings-nav-reset"
              disabled={saving}
              onClick={() => setConfirmation('reset')}
            >
              {t('settings.resetAction')}
            </button>
          </nav>

          <div
            className={`settings-content settings-content--${activeSection}`}
            key={activeSection}
          >
            {error && (
              <StatePanel
                kind="error"
                title={t('state.settingsErrorTitle')}
                message={error}
              />
            )}
            <SettingsSections
              activeSection={activeSection}
              settings={settings}
              language={language}
              hasLauncherBackground={hasLauncherBackground}
              pathValidation={pathValidation}
              storageInfo={storageInfo}
              githubRateLimit={githubRateLimit}
              githubQueue={githubQueue}
              eventLog={eventLog}
              eventLogLoading={eventLogLoading}
              eventLogError={eventLogError}
              formatRateLimit={formatRateLimit}
              formatRateLimitReset={formatRateLimitReset}
              formatQueuePause={formatQueuePause}
              onThemeChange={(theme) => void handleThemeChange(theme)}
              onLanguageChange={(nextLanguage) => void handleLanguageChange(nextLanguage)}
              onEditLauncherBackground={onEditLauncherBackground}
              onChangeLauncherBackground={onChangeLauncherBackground}
              onClearLauncherBackground={onClearLauncherBackground}
              onPreviewSurfaceSetting={previewSurfaceSetting}
              onCommitSurfaceSetting={commitSurfaceSetting}
              onBrowse={() => void handleBrowse()}
              onValidatePath={() => void handleValidatePath()}
              onOpenDirectory={(path) => void openDir(path).catch(() => {})}
              onRefreshStorageInfo={() => void handleRefreshStorageInfo()}
              onCleanupLauncherFiles={() => setConfirmation('cleanup')}
              onClearCache={() => void handleClearCache()}
              onCopyDiagnostics={() => void handleCopyMaintenanceDiagnostics()}
              onRefreshEventLog={() => void refreshEventLog()}
            />
          </div>
        </div>
      </section>
    {confirmation && (
      <div
        className="settings-reset-overlay"
        role="presentation"
        onClick={() => !confirmationBusy && setConfirmation(null)}
      >
        <section
          ref={resetModalRef}
          className="settings-reset-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="settings-reset-title"
          aria-describedby="settings-reset-description"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="settings-reset-header">
            <div>
              <span className="settings-reset-kicker">{t('settings.title')}</span>
              <h3 id="settings-reset-title">{confirmationTitle}</h3>
            </div>
            <button
              type="button"
              className="close-btn"
              disabled={confirmationBusy}
              aria-label={t('settings.close')}
              onClick={() => setConfirmation(null)}
            >
              {'\u00d7'}
            </button>
          </header>
          <p id="settings-reset-description">{confirmationText}</p>
          <div className="settings-reset-actions">
            <button
              type="button"
              className="secondary-btn"
              disabled={confirmationBusy}
              data-autofocus="true"
              onClick={() => setConfirmation(null)}
            >
              {t('installed.uninstallCancel')}
            </button>
            <button
              type="button"
              className="settings-reset-btn"
              disabled={confirmationBusy}
              onClick={confirmation === 'cleanup' ? handleCleanupLauncherFiles : handleResetSettings}
            >
              {confirmationBusy
                ? t('settings.saving')
                : confirmation === 'cleanup'
                  ? t('settings.cleanupAction')
                  : t('settings.resetAction')}
            </button>
          </div>
        </section>
      </div>
    )}
    {actionMessage && (
      <div className="library-toast library-toast--success" role="status" aria-live="polite" aria-atomic="true">
        {actionMessage}
      </div>
    )}
    </>
  )
}

export default SettingsPage
