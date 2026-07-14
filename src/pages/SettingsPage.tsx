import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { cleanupLauncherUpdateFiles, getLauncherStorageInfo, openDir } from '../services/updates'
import { pickDirectory, pickJsonFile, pickJsonSavePath } from '../services/dialog'
import {
  clearGithubCache,
  getGithubQueueStatus,
  getGithubRateLimitStatus,
} from '../services/github'
import { exportInstalledRegistry, importInstalledRegistry } from '../services/installed'
import type { GitHubQueueStatus, GitHubRateLimitBucket, GitHubRateLimitStatus, LauncherStorageInfo } from '../types'
import StatePanel from '../components/State/StatePanel'
import { useModalFocus } from '../hooks/useModalFocus'
import { appearanceCssText, applyAppearanceSettings, applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import { APPEARANCE_PRESETS, DEFAULT_SETTINGS, normalizeAppearance, normalizeSettings } from '../utils/settingsDefaults'
import { notifyLanguage, useI18n, type AppLanguage } from '../i18n'
import { formatBytes } from '../utils/format'
import './PageStyles.css'

interface SettingsPageProps {
  hasLauncherBackground: boolean
  onChangeLauncherBackground: () => Promise<void> | void
  onClearLauncherBackground: () => Promise<void> | void
  onClose: () => void
}

function assetStrategyLabelKey(strategy: AppSettings['assetStrategy']) {
  switch (strategy) {
    case 'installerFirst': return 'settings.installerFirst'
    case 'manual': return 'settings.manual'
    case 'portableFirst':
    default: return 'settings.portableFirst'
  }
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
  onClose,
}: SettingsPageProps) {
  const { language, t } = useI18n()
  const [activeSection, setActiveSection] = useState('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathValidation, setPathValidation] = useState<'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission' | 'requiresElevation'>('idle')
  const [resetPending, setResetPending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [githubRateLimit, setGithubRateLimit] = useState<GitHubRateLimitStatus>(emptyRateLimitStatus)
  const [githubQueue, setGithubQueue] = useState<GitHubQueueStatus>(() => getGithubQueueStatus())
  const [recentGithubOwners, setRecentGithubOwners] = useState<string[]>([])
  const [registryBusy, setRegistryBusy] = useState(false)
  const resetModalRef = useRef<HTMLElement | null>(null)
  const themeImportRef = useRef<HTMLInputElement | null>(null)

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

  const showSavedState = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

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
      showSavedState()
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
      showSavedState()
    } catch (err) {
      setSettings(previousSettings)
      applyThemePreference(previousSettings.theme, true)
      notifyThemePreference(previousSettings.theme)
      setError(err instanceof Error ? err.message : t('settings.themeError'))
    } finally {
      setSaving(false)
    }
  }

  const handleAppearanceChange = async (patch: Partial<NonNullable<AppSettings['appearance']>>) => {
    if (!settings) return
    const appearance = normalizeAppearance({ ...settings.appearance, ...patch })
    const savedSettings = await persistSettings({ ...settings, appearance }, settings)
    if (savedSettings) {
      applyAppearanceSettings(savedSettings.appearance)
    }
  }

  const handleAppearancePresetChange = async (preset: NonNullable<AppSettings['appearance']>['preset']) => {
    const base = APPEARANCE_PRESETS[preset]
    await handleAppearanceChange({ ...base, preset })
  }

  const handleExportTheme = () => {
    if (!settings) return
    const payload = JSON.stringify({ theme: settings.theme, appearance }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'pullora-theme.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportTheme = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!settings) return
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const payload = JSON.parse(await file.text()) as Partial<AppSettings>
      const theme = payload.theme === 'light' || payload.theme === 'dark' || payload.theme === 'auto'
        ? payload.theme
        : settings.theme
      const importedAppearance = normalizeAppearance(payload.appearance)
      const savedSettings = await persistSettings({ ...settings, theme, appearance: importedAppearance }, settings)
      if (savedSettings) {
        applyThemePreference(savedSettings.theme, true)
        notifyThemePreference(savedSettings.theme)
        applyAppearanceSettings(savedSettings.appearance)
        setActionMessage(t('settings.themeImported'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.themeImportError'))
    }
  }

  const handleResetTheme = async () => {
    if (!settings) return
    const savedSettings = await persistSettings({
      ...settings,
      theme: DEFAULT_SETTINGS.theme,
      appearance: DEFAULT_SETTINGS.appearance,
    }, settings)
    if (savedSettings) {
      applyThemePreference(savedSettings.theme, true)
      notifyThemePreference(savedSettings.theme)
      applyAppearanceSettings(savedSettings.appearance)
      setActionMessage(t('settings.themeResetDone'))
    }
  }

  const handleCopyCssVariables = async () => {
    try {
      await navigator.clipboard.writeText(appearanceCssText(appearance))
      setActionMessage(t('settings.cssVariablesCopied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.cssVariablesCopyError'))
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
      await navigator.clipboard.writeText(lines.join('\n'))
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

  if (loading || !settings) {
    return (
      <section className="page settings-page settings-page-loading" aria-label={t('settings.title')}>
        <StatePanel kind="loading" title={t('settings.loading')} skeletonCount={2} />
      </section>
    )
  }

  const sections = [
    { id: 'general', label: t('settings.general') },
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'installation', label: t('settings.installation') },
    { id: 'updates', label: t('settings.updates') },
    { id: 'maintenance', label: t('settings.maintenance') },
  ]

  const settingsPanelId = (sectionId: string) =>
    sectionId === 'installation' ? 'settings-folders' : `settings-${sectionId}`

  const appearance = normalizeAppearance(settings.appearance)
  const colorFields: Array<[keyof NonNullable<AppSettings['appearance']>, string]> = [
    ['accent', t('settings.accent')],
    ['accentHover', t('settings.accentHover')],
    ['background', t('settings.background')],
    ['surface', t('settings.surface')],
    ['surface2', t('settings.surface2')],
    ['sidebar', t('settings.sidebarColor')],
    ['text', t('settings.textColor')],
    ['muted', t('settings.mutedColor')],
    ['border', t('settings.borderColor')],
  ]

  const handleSectionSelect = (sectionId: string) => {
    setActiveSection(sectionId)
  }

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <section id="settings-general" className="settings-section">
            <h3>{t('settings.general')}</h3>
            <div className="settings-grid">
              <div className="form-group compact-control">
                <label htmlFor="githubOwner">{t('settings.githubOwner')}</label>
                <input
                  id="githubOwner"
                  type="text"
                  value={settings.githubOwner ?? ''}
                  onBlur={handleGithubOwnerBlur}
                  onChange={(event) =>
                    setSettings({ ...settings, githubOwner: event.target.value })
                  }
                  onKeyDown={handleGithubOwnerKeyDown}
                  placeholder={t('settings.githubOwnerPlaceholder')}
                  data-autofocus="true"
                />
                <p className="help-text">{t('settings.githubSourceHelp')}</p>
                {recentGithubOwners.length > 0 && (
                  <div className="settings-owner-chips" aria-label={t('settings.recentOwners')}>
                    {recentGithubOwners.map((owner) => (
                      <button
                        key={owner}
                        type="button"
                        className={owner.toLowerCase() === (settings.githubOwner ?? '').toLowerCase() ? 'active' : ''}
                        onClick={() => void selectRecentGithubOwner(owner)}
                      >
                        {owner}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="settings-source-summary">
                <span className="settings-reset-kicker">{t('settings.sourceSummary')}</span>
                <strong>{settings.githubOwner || t('settings.notSet')}</strong>
                <p>{t('settings.sourceSummaryText')}</p>
                <small>{t('settings.githubTokenHelp')}</small>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="theme">{t('settings.theme')}</label>
                <select
                  id="theme"
                  value={settings.theme}
                  onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}
                >
                  <option value="light">{t('settings.light')}</option>
                  <option value="dark">{t('settings.dark')}</option>
                  <option value="auto">{t('settings.auto')}</option>
                </select>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="language">{t('settings.language')}</label>
                <select
                  id="language"
                  value={settings.language}
                  onChange={(event) => handleLanguageChange(event.target.value as AppLanguage)}
                >
                  <option value="uk">{t('settings.ukrainian')}</option>
                  <option value="en">{t('settings.english')}</option>
                </select>
              </div>

              <div className="form-group launcher-background-control">
                <label>{t('settings.launcherBackground')}</label>
                <div className="settings-inline-actions">
                  <button type="button" className="secondary-btn" onClick={onChangeLauncherBackground}>
                    {t('art.changeLauncherBackground')}
                  </button>
                  {hasLauncherBackground && (
                    <button type="button" className="secondary-btn" onClick={onClearLauncherBackground}>
                      {t('art.resetLauncherBackground')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )

      case 'installation':
        return (
          <section id="settings-folders" className="settings-section">
            <h3>{t('settings.installation')}</h3>
            <div className="form-group">
              <label htmlFor="installPath">{t('settings.installPath')}</label>
              <div className="path-input-row">
                <input
                  id="installPath"
                  type="text"
                  value={settings.installationPath}
                  onBlur={handleInstallationPathBlur}
                  onChange={(event) =>
                    setSettings({ ...settings, installationPath: event.target.value })
                  }
                  onKeyDown={handleInstallationPathKeyDown}
                  placeholder={t('settings.installPathPlaceholder')}
                />
                <button type="button" className="secondary-btn" onClick={handleBrowse}>
                  {t('settings.choose')}
                </button>
                <button type="button" className="secondary-btn" onClick={handleValidatePath}>
                  {t('settings.checkFolder')}
                </button>
                {settings.installationPath && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => openDir(settings.installationPath).catch(() => {})}
                    title={t('settings.open')}
                  >
                    {t('settings.open')}
                  </button>
                )}
              </div>
              {pathValidation !== 'idle' && (
                <span className={`settings-status ${pathValidation === 'ok' || pathValidation === 'requiresElevation' ? 'success' : 'error'}`}>
                  {pathValidation === 'ok' && t('settings.pathOk')}
                  {pathValidation === 'requiresElevation' && t('settings.pathRequiresElevation')}
                  {pathValidation === 'missing' && t('settings.pathMissing')}
                  {pathValidation === 'inaccessible' && t('settings.pathInaccessible')}
                  {pathValidation === 'noWritePermission' && t('settings.pathNoWrite')}
                </span>
              )}
            </div>
          </section>
        )

      case 'maintenance':
        return (
          <section id="settings-maintenance" className="danger-zone">
            <h3>{t('settings.maintenance')}</h3>
            <p className="help-text">{t('settings.maintenanceHelp')}</p>
            <div className="settings-diagnostics-card">
              <span className="settings-reset-kicker">{t('settings.githubDiagnostics')}</span>
              <dl>
                <div>
                  <dt>{t('settings.githubOwner')}</dt>
                  <dd>{settings.githubOwner || t('settings.notSet')}</dd>
                </div>
                <div>
                  <dt>{t('settings.assets')}</dt>
                  <dd>{t(assetStrategyLabelKey(settings.assetStrategy))}</dd>
                </div>
                <div>
                  <dt>{t('settings.prerelease')}</dt>
                  <dd>{settings.includePrereleases ? t('settings.yes') : t('settings.no')}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubCoreLimit')}</dt>
                  <dd>{formatRateLimit(githubRateLimit.core)}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubSearchLimit')}</dt>
                  <dd>{formatRateLimit(githubRateLimit.search)}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubCoreReset')}</dt>
                  <dd>{formatRateLimitReset(githubRateLimit.core)}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubSearchReset')}</dt>
                  <dd>{formatRateLimitReset(githubRateLimit.search)}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubQueue')}</dt>
                  <dd>{t('settings.githubQueueValue', {
                    active: githubQueue.active,
                    queued: githubQueue.queued,
                    concurrency: githubQueue.concurrency,
                  })}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubQueuePriority')}</dt>
                  <dd>{t('settings.githubQueuePriorityValue', {
                    high: githubQueue.highPriority,
                    normal: githubQueue.normalPriority,
                  })}</dd>
                </div>
                <div>
                  <dt>{t('settings.githubQueueState')}</dt>
                  <dd>{formatQueuePause()}</dd>
                </div>
              </dl>
            </div>
            <div className="settings-diagnostics-card">
              <span className="settings-reset-kicker">{t('settings.storageDiagnostics')}</span>
              <dl>
                <div>
                  <dt>{t('settings.launcherFolder')}</dt>
                  <dd>{storageInfo?.launcherDir ?? t('settings.notChecked')}</dd>
                </div>
                <div>
                  <dt>{t('settings.updateCache')}</dt>
                  <dd>{storageInfo ? `${storageInfo.updateCacheCount} · ${storageInfo.updateCachePath}` : t('settings.notChecked')}</dd>
                </div>
                <div>
                  <dt>{t('settings.backups')}</dt>
                  <dd>{storageInfo ? `${storageInfo.backupCount} · ${storageInfo.backupPath}` : t('settings.notChecked')}</dd>
                </div>
                <div>
                  <dt>{t('settings.cleanupSize')}</dt>
                  <dd>{storageInfo ? formatBytes(storageInfo.cleanupBytes, language) : t('settings.notChecked')}</dd>
                </div>
              </dl>
              <div className="settings-maintenance-actions settings-storage-actions">
                <button className="secondary-btn" onClick={handleRefreshStorageInfo}>
                  {t('settings.refreshDiagnostics')}
                </button>
                <button className="secondary-btn" onClick={() => storageInfo && openDir(storageInfo.launcherDir).catch(() => {})} disabled={!storageInfo}>
                  {t('settings.openLauncherFolder')}
                </button>
                <button className="secondary-btn" onClick={() => storageInfo && openDir(storageInfo.updateCachePath).catch(() => {})} disabled={!storageInfo}>
                  {t('settings.openUpdateCache')}
                </button>
                <button className="secondary-btn" onClick={() => storageInfo && openDir(storageInfo.backupPath).catch(() => {})} disabled={!storageInfo}>
                  {t('settings.openBackups')}
                </button>
                <button className="secondary-btn" onClick={handleCleanupLauncherFiles} disabled={!storageInfo || storageInfo.cleanupBytes === 0}>
                  {t('settings.cleanupLauncherFiles')}
                </button>
              </div>
            </div>
            <div className="settings-maintenance-actions">
              <button className="secondary-btn" onClick={() => setResetPending(true)} disabled={saving}>
                {t('settings.reset')}
              </button>
              <button className="secondary-btn" onClick={handleClearCache}>
                {t('settings.clearCache')}
              </button>
              <button className="secondary-btn" onClick={handleExportInstalledRegistry} disabled={registryBusy}>
                {t('settings.exportInstalledRegistry')}
              </button>
              <button className="secondary-btn" onClick={handleImportInstalledRegistry} disabled={registryBusy}>
                {t('settings.importInstalledRegistry')}
              </button>
              <button className="secondary-btn" onClick={handleCopyMaintenanceDiagnostics}>
                {t('settings.copyDiagnostics')}
              </button>
            </div>
          </section>
        )

      case 'updates':
        return (
          <section id="settings-updates" className="settings-section">
            <h3>{t('settings.updates')}</h3>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(settings.includePrereleases)}
                  onChange={(event) =>
                    persistSettings({ ...settings, includePrereleases: event.target.checked }, settings)
                  }
                />
                {t('settings.prerelease')}
              </label>
            </div>

            <div className="form-group compact-control">
              <label htmlFor="assetStrategy">{t('settings.assets')}</label>
              <select
                id="assetStrategy"
                value={settings.assetStrategy}
                onChange={(event) =>
                  persistSettings({
                    ...settings,
                    assetStrategy: event.target.value as AppSettings['assetStrategy'],
                  }, settings)
                }
              >
                <option value="portableFirst">{t('settings.portableFirst')}</option>
                <option value="installerFirst">{t('settings.installerFirst')}</option>
                <option value="manual">{t('settings.manual')}</option>
              </select>
              <p className="help-text">{t('settings.assetStrategyHelp')}</p>
            </div>
          </section>
        )

      case 'appearance':
        return (
          <section id="settings-appearance" className="settings-section appearance-settings-section">
            <div className="settings-section-heading-row">
              <div>
                <h3>{t('settings.appearance')}</h3>
                <p className="help-text">{t('settings.themeEditorHelp')}</p>
              </div>
              <div className="settings-inline-actions settings-theme-actions">
                <button type="button" className="secondary-btn" onClick={handleExportTheme}>
                  {t('settings.exportTheme')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => themeImportRef.current?.click()}>
                  {t('settings.importTheme')}
                </button>
                <button type="button" className="secondary-btn" onClick={handleCopyCssVariables}>
                  {t('settings.copyCssVariables')}
                </button>
                <button type="button" className="secondary-btn" onClick={handleResetTheme}>
                  {t('settings.resetTheme')}
                </button>
                <input
                  ref={themeImportRef}
                  type="file"
                  accept="application/json,.json"
                  className="settings-hidden-file-input"
                  onChange={handleImportTheme}
                />
              </div>
            </div>
            <div className="settings-grid">
              <div className="form-group compact-control">
                <label htmlFor="themeAppearance">{t('settings.theme')}</label>
                <select
                  id="themeAppearance"
                  value={settings.theme}
                  onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}
                >
                  <option value="light">{t('settings.light')}</option>
                  <option value="dark">{t('settings.dark')}</option>
                  <option value="auto">{t('settings.auto')}</option>
                </select>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="appearancePreset">{t('settings.appearancePreset')}</label>
                <select
                  id="appearancePreset"
                  value={appearance.preset}
                  onChange={(event) => handleAppearancePresetChange(event.target.value as NonNullable<AppSettings['appearance']>['preset'])}
                >
                  <option value="github">{t('settings.presetGithub')}</option>
                  <option value="githubLight">{t('settings.presetGithubLight')}</option>
                  <option value="midnight">{t('settings.presetMidnight')}</option>
                  <option value="custom">{t('settings.presetCustom')}</option>
                </select>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="appearanceDensity">{t('settings.density')}</label>
                <select
                  id="appearanceDensity"
                  value={appearance.density}
                  onChange={(event) => handleAppearanceChange({ density: event.target.value as NonNullable<AppSettings['appearance']>['density'], preset: 'custom' })}
                >
                  <option value="compact">{t('settings.densityCompact')}</option>
                  <option value="comfortable">{t('settings.densityComfortable')}</option>
                  <option value="spacious">{t('settings.densitySpacious')}</option>
                </select>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="appearanceFontSize">{t('settings.fontSize')}</label>
                <input
                  id="appearanceFontSize"
                  type="range"
                  min="11"
                  max="18"
                  value={appearance.fontSize}
                  style={{ '--range-progress': `${((appearance.fontSize - 11) / 7) * 100}%` } as CSSProperties}
                  onChange={(event) => handleAppearanceChange({ fontSize: Number(event.target.value), preset: 'custom' })}
                />
                <span className="settings-range-value">{appearance.fontSize}px</span>
              </div>

              <div className="form-group compact-control">
                <label htmlFor="appearanceRadius">{t('settings.radius')}</label>
                <input
                  id="appearanceRadius"
                  type="range"
                  min="0"
                  max="20"
                  value={appearance.radius}
                  style={{ '--range-progress': `${(appearance.radius / 20) * 100}%` } as CSSProperties}
                  onChange={(event) => handleAppearanceChange({ radius: Number(event.target.value), preset: 'custom' })}
                />
                <span className="settings-range-value">{appearance.radius}px</span>
              </div>

              <div className="form-group compact-control settings-grid-wide">
                <label htmlFor="appearanceFont">{t('settings.fontFamily')}</label>
                <input
                  id="appearanceFont"
                  type="text"
                  value={appearance.fontFamily}
                  onChange={(event) => setSettings({ ...settings, appearance: { ...appearance, fontFamily: event.target.value, preset: 'custom' } })}
                  onBlur={() => handleAppearanceChange({ fontFamily: settings.appearance?.fontFamily, preset: 'custom' })}
                />
              </div>
            </div>

            <div className="appearance-color-grid">
              {colorFields.map(([key, label]) => (
                <label className="appearance-color-field" key={key}>
                  <span>{label}</span>
                  <input
                    type="color"
                    value={String(appearance[key])}
                    onChange={(event) => handleAppearanceChange({ [key]: event.target.value, preset: 'custom' } as Partial<NonNullable<AppSettings['appearance']>>)}
                  />
                  <code>{String(appearance[key])}</code>
                </label>
              ))}
            </div>

            <div className="form-group settings-grid-wide">
              <label htmlFor="customCss">{t('settings.customCss')}</label>
              <textarea
                id="customCss"
                className="settings-css-editor"
                value={appearance.customCss}
                onChange={(event) => setSettings({ ...settings, appearance: { ...appearance, customCss: event.target.value, preset: 'custom' } })}
                onBlur={() => handleAppearanceChange({ customCss: settings.appearance?.customCss, preset: 'custom' })}
                placeholder=":root { --color-primary: #66c0f4; }"
              />
              <p className="help-text">{t('settings.customCssHelp')}</p>
            </div>
          </section>
        )

      default:
        return null
    }
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
          <div className="settings-page-header-actions">
            <div className="settings-autosave-status" aria-live="polite">
              {saving && <span className="saved-indicator">{t('settings.saving')}</span>}
              {!saving && saved && <span className="saved-indicator">{t('settings.saved')}</span>}
              {!saving && error && <span className="settings-status error">{t('settings.saveError')}</span>}
            </div>
            <button
              type="button"
              className="secondary-btn settings-done-btn"
              onClick={onClose}
              aria-label={t('settings.close')}
            >
              {t('settings.done')}
            </button>
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
            {renderActiveSection()}
          </div>
        </div>
        <footer className="settings-page-footer">
          <div className="settings-autosave-status" aria-live="polite">
            {saving && <span className="saved-indicator">{t('settings.saving')}</span>}
            {!saving && saved && <span className="saved-indicator">{t('settings.saved')}</span>}
            {!saving && error && <span className="settings-status error">{t('settings.saveError')}</span>}
          </div>
          <button type="button" className="secondary-btn settings-done-btn" onClick={onClose}>
            {t('settings.done')}
          </button>
        </footer>
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
      <div className="library-toast library-toast--success" role="status">
        {actionMessage}
      </div>
    )}
    </>
  )
}

export default SettingsPage
