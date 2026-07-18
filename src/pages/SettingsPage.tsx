import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { cleanupLauncherUpdateFiles, getEventLog, getLauncherStorageInfo, openDir } from '../services/updates'
import { pickDirectory, pickJsonFile, pickJsonSavePath } from '../services/dialog'
import {
  clearGithubCache,
  getGithubQueueStatus,
  getGithubRateLimitStatus,
} from '../services/github'
import { exportInstalledRegistry, importInstalledRegistry } from '../services/installed'
import type { GitHubQueueStatus, GitHubRateLimitBucket, GitHubRateLimitStatus, LauncherStorageInfo } from '../types'
import StatePanel from '../components/State/StatePanel'
import {
  SettingsSections,
  type SettingsSectionId,
} from '../features/settings/components/SettingsSections'
import { useModalFocus } from '../hooks/useModalFocus'
import { applyAppearanceSettings, applyThemePreference, notifyThemePreference, type ResolvedTheme, type ThemePreference } from '../utils/theme'
import { DEFAULT_SETTINGS, normalizeAppearance, normalizeSettings } from '../utils/settingsDefaults'
import { notifyLanguage, useI18n, type AppLanguage } from '../i18n'
import { redactSensitiveText } from '../utils/redactSensitiveText'
import './PageStyles.css'

interface SettingsPageProps {
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  onChangeLauncherBackground: (theme: ResolvedTheme) => Promise<void> | void
  onClearLauncherBackground: (theme: ResolvedTheme) => Promise<void> | void
}

const RECENT_GITHUB_OWNERS_KEY = 'pullora.recentGithubOwners.v1'
const LEGACY_RECENT_GITHUB_OWNERS_KEY = 'airLauncher.recentGithubOwners.v1'

function emptyRateLimitStatus(): GitHubRateLimitStatus {
  const emptyBucket = { remaining: null, limit: null, resetAt: null }
  return {
    core: { ...emptyBucket },
    search: { ...emptyBucket },
  }
}

function readRecentGithubOwners() {
  try {
    const storedValue = window.localStorage.getItem(RECENT_GITHUB_OWNERS_KEY) ??
      window.localStorage.getItem(LEGACY_RECENT_GITHUB_OWNERS_KEY) ??
      '[]'
    const value = JSON.parse(storedValue)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeRecentGithubOwner(owner: string) {
  const normalized = owner.trim()
  if (!normalized) return readRecentGithubOwners()

  const nextOwners = [
    normalized,
    ...readRecentGithubOwners().filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, 5)
  try {
    window.localStorage.setItem(RECENT_GITHUB_OWNERS_KEY, JSON.stringify(nextOwners))
  } catch {
    // Recent owners are a convenience list only.
  }
  return nextOwners
}

function SettingsPage({
  hasLauncherBackground,
  onChangeLauncherBackground,
  onClearLauncherBackground,
}: SettingsPageProps) {
  const { language, t } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathValidation, setPathValidation] = useState<'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission' | 'requiresElevation'>('idle')
  const [resetPending, setResetPending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<GitHubRateLimitStatus>(emptyRateLimitStatus)
  const [githubQueue, setGithubQueue] = useState<GitHubQueueStatus>(() => getGithubQueueStatus())
  const [recentGithubOwners, setRecentGithubOwners] = useState<string[]>([])
  const [registryBusy, setRegistryBusy] = useState(false)
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

  useEffect(() => {
    setRecentGithubOwners(readRecentGithubOwners())
  }, [])

  useModalFocus(resetModalRef, {
    active: resetPending,
    onEscape: saving ? undefined : () => setResetPending(false),
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
    notifyThemePreference(theme)
    setSaving(true)
    setError(null)

    try {
      await updateSettings(nextSettings)
    } catch (err) {
      setSettings(previousSettings)
      applyThemePreference(previousSettings.theme, true)
      notifyThemePreference(previousSettings.theme)
      setError(err instanceof Error ? err.message : t('settings.themeError'))
    } finally {
      setSaving(false)
    }
  }

  const handleBrowse = async () => {
    const dir = await pickDirectory()
    if (dir && settings) {
      await persistSettings({ ...settings, installationPath: dir }, settings)
    }
  }

  const handleInstallationPathBlur = async () => {
    if (!settings) return
    await persistSettings(settings, settings)
    setPathValidation('idle')
  }

  const handleInstallationPathKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }

  const handleResetSettings = async () => {
    const resetSettings = normalizeSettings(DEFAULT_SETTINGS)
    const savedSettings = await persistSettings(resetSettings, settings)
    if (savedSettings) {
      setResetPending(false)
      applyThemePreference(savedSettings.theme, true)
      applyAppearanceSettings(savedSettings.appearance)
      notifyThemePreference(savedSettings.theme)
      setActionMessage(t('settings.resetDone'))
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

  const handleExportInstalledRegistry = async () => {
    const path = await pickJsonSavePath('pullora-installed-registry.json')
    if (!path) return

    setRegistryBusy(true)
    try {
      const result = await exportInstalledRegistry(path)
      setActionMessage(t('settings.registryExported', {
        apps: result.appCount,
        versions: result.versionCount,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.registryExportError'))
    } finally {
      setRegistryBusy(false)
    }
  }

  const handleImportInstalledRegistry = async () => {
    const path = await pickJsonFile()
    if (!path) return
    if (!window.confirm(t('settings.registryImportConfirm'))) return

    setRegistryBusy(true)
    try {
      const result = await importInstalledRegistry(path)
      setActionMessage(t('settings.registryImported', {
        apps: result.appCount,
        versions: result.versionCount,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.registryImportError'))
    } finally {
      setRegistryBusy(false)
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
    if (!window.confirm(t('settings.cleanupConfirm'))) return
    try {
      const info = await cleanupLauncherUpdateFiles()
      setStorageInfo(info)
      setActionMessage(t('settings.cleanupDone'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.cleanupError'))
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

  const handleGithubOwnerBlur = async () => {
    if (!settings) return
    await persistSettings(settings, settings)
    setRecentGithubOwners(writeRecentGithubOwner(settings.githubOwner ?? ''))
    await clearGithubCache().catch(() => {})
  }

  const selectRecentGithubOwner = async (owner: string) => {
    if (!settings) return
    const savedSettings = await persistSettings({ ...settings, githubOwner: owner }, settings)
    if (savedSettings) {
      setRecentGithubOwners(writeRecentGithubOwner(owner))
      await clearGithubCache().catch(() => {})
    }
  }

  const handleGithubOwnerKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
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
    if (savedSettings) {
      notifyLanguage(language)
    }
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

  const saveSurfaceSettings = () => {
    if (settings) void persistSettings(settings)
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
    { id: 'installation', label: t('settings.installation') },
    { id: 'updates', label: t('settings.updates') },
    { id: 'events', label: t('settings.eventLog') },
    { id: 'maintenance', label: t('settings.maintenance') },
  ]

  const settingsPanelId = (sectionId: SettingsSectionId) =>
    sectionId === 'installation' ? 'settings-folders' : `settings-${sectionId}`

  const handleSectionSelect = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId)
  }

  return (
    <>
      <section className="page settings-page" aria-labelledby="settings-title">
        <div className="settings-page-header">
          <div>
            <span className="settings-page-kicker">{t('settings.workspaceKicker')}</span>
            <h2 id="settings-title">{t('settings.title')}</h2>
            <p>{t('settings.workspaceSubtitle')}</p>
          </div>
        </div>

        <div className="settings-form settings-workspace">
          <nav className="settings-nav" aria-label={t('settings.title')}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? 'active' : ''}
                aria-current={activeSection === section.id ? 'page' : undefined}
                aria-controls={settingsPanelId(section.id)}
                onClick={() => handleSectionSelect(section.id)}
                data-autofocus={activeSection === section.id ? 'true' : undefined}
              >
                {section.label}
              </button>
            ))}
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
              recentGithubOwners={recentGithubOwners}
              hasLauncherBackground={hasLauncherBackground}
              pathValidation={pathValidation}
              storageInfo={storageInfo}
              githubRateLimit={githubRateLimit}
              githubQueue={githubQueue}
              saving={saving}
              registryBusy={registryBusy}
              eventLog={eventLog}
              eventLogLoading={eventLogLoading}
              eventLogError={eventLogError}
              formatRateLimit={formatRateLimit}
              formatRateLimitReset={formatRateLimitReset}
              formatQueuePause={formatQueuePause}
              onGithubOwnerChange={(githubOwner) => setSettings({ ...settings, githubOwner })}
              onGithubOwnerBlur={() => void handleGithubOwnerBlur()}
              onGithubOwnerKeyDown={handleGithubOwnerKeyDown}
              onSelectRecentGithubOwner={(owner) => void selectRecentGithubOwner(owner)}
              onThemeChange={(theme) => void handleThemeChange(theme)}
              onLanguageChange={(nextLanguage) => void handleLanguageChange(nextLanguage)}
              onChangeLauncherBackground={onChangeLauncherBackground}
              onClearLauncherBackground={onClearLauncherBackground}
              onPreviewSurfaceSetting={previewSurfaceSetting}
              onSaveSurfaceSettings={saveSurfaceSettings}
              onInstallationPathChange={(installationPath) => setSettings({ ...settings, installationPath })}
              onInstallationPathBlur={() => void handleInstallationPathBlur()}
              onInstallationPathKeyDown={handleInstallationPathKeyDown}
              onBrowse={() => void handleBrowse()}
              onValidatePath={() => void handleValidatePath()}
              onOpenDirectory={(path) => void openDir(path).catch(() => {})}
              onIncludePrereleasesChange={(includePrereleases) => {
                void persistSettings({ ...settings, includePrereleases }, settings)
              }}
              onAssetStrategyChange={(assetStrategy) => {
                void persistSettings({ ...settings, assetStrategy }, settings)
              }}
              onRefreshStorageInfo={() => void handleRefreshStorageInfo()}
              onCleanupLauncherFiles={() => void handleCleanupLauncherFiles()}
              onRequestReset={() => setResetPending(true)}
              onClearCache={() => void handleClearCache()}
              onExportInstalledRegistry={() => void handleExportInstalledRegistry()}
              onImportInstalledRegistry={() => void handleImportInstalledRegistry()}
              onCopyDiagnostics={() => void handleCopyMaintenanceDiagnostics()}
              onRefreshEventLog={() => void refreshEventLog()}
            />
          </div>
        </div>
      </section>
    {resetPending && (
      <div
        className="settings-reset-overlay"
        role="presentation"
        onClick={() => !saving && setResetPending(false)}
      >
        <section
          ref={resetModalRef}
          className="settings-reset-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="settings-reset-title"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="settings-reset-header">
            <div>
              <span className="settings-reset-kicker">{t('settings.maintenance')}</span>
              <h3 id="settings-reset-title">{t('settings.resetConfirmTitle')}</h3>
            </div>
            <button
              type="button"
              className="close-btn"
              disabled={saving}
              aria-label={t('settings.close')}
              onClick={() => setResetPending(false)}
            >
              {'\u00d7'}
            </button>
          </header>
          <p>{t('settings.resetConfirmText')}</p>
          <div className="settings-reset-actions">
            <button type="button" className="secondary-btn" disabled={saving} onClick={() => setResetPending(false)}>
              {t('installed.uninstallCancel')}
            </button>
            <button
              type="button"
              className="settings-reset-btn"
              disabled={saving}
              data-autofocus="true"
              onClick={handleResetSettings}
            >
              {saving ? t('settings.saving') : t('settings.reset')}
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
