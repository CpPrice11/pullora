import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { cleanupLauncherUpdateFiles, getLauncherStorageInfo, openDir } from '../services/updates'
import { pickDirectory, pickJsonFile, pickJsonSavePath } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import { exportInstalledRegistry, importInstalledRegistry } from '../services/installed'
import { codexRequest, getCodexAccountStatus, getCodexRuntimeStatus, loginCodexWithApiKey, openCodexDesktop } from '../services/aiWorkspace'
import type { CodexRuntimeStatus, LauncherStorageInfo } from '../types'
import StatePanel from '../components/State/StatePanel'
import { useModalFocus } from '../hooks/useModalFocus'
import { appearanceCssText, applyAppearanceSettings, applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import { APPEARANCE_PRESETS, DEFAULT_SETTINGS, normalizeAppearance, normalizeSettings } from '../utils/settingsDefaults'
import { notifyLanguage, useI18n, type AppLanguage } from '../i18n'
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

type CodexCapabilityStatus = 'available' | 'unavailable' | 'notChecked'

interface CodexCapabilityProbe {
  id: string
  labelKey: string
  method: string
  status: CodexCapabilityStatus
  detail?: string
}

const CODEX_CAPABILITY_PROBES: Array<Omit<CodexCapabilityProbe, 'status' | 'detail'>> = [
  { id: 'models', labelKey: 'ai.capabilityModels', method: 'model/list' },
  { id: 'threads', labelKey: 'ai.capabilityThreads', method: 'thread/list' },
  { id: 'skills', labelKey: 'ai.capabilitySkills', method: 'skill/list' },
  { id: 'plugins', labelKey: 'ai.capabilityPlugins', method: 'plugin/list' },
  { id: 'apps', labelKey: 'ai.capabilityApps', method: 'app/list' },
  { id: 'mcp', labelKey: 'ai.capabilityMcp', method: 'mcp/list' },
]

const RECENT_GITHUB_OWNERS_KEY = 'pullora.recentGithubOwners.v1'
const LEGACY_RECENT_GITHUB_OWNERS_KEY = 'airLauncher.recentGithubOwners.v1'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
  const { t } = useI18n()
  const [activeSection, setActiveSection] = useState('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [intervalDraft, setIntervalDraft] = useState('')
  const [pathValidation, setPathValidation] = useState<'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission' | 'requiresElevation'>('idle')
  const [resetPending, setResetPending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [codexRuntime, setCodexRuntime] = useState<CodexRuntimeStatus | null>(null)
  const [codexAccount, setCodexAccount] = useState<Record<string, unknown> | null>(null)
  const [codexCapabilities, setCodexCapabilities] = useState<CodexCapabilityProbe[]>(
    CODEX_CAPABILITY_PROBES.map((probe) => ({ ...probe, status: 'notChecked' })),
  )
  const [codexApiKey, setCodexApiKey] = useState('')
  const [codexChecking, setCodexChecking] = useState(false)
  const [storageInfo, setStorageInfo] = useState<LauncherStorageInfo | null>(null)
  const [recentGithubOwners, setRecentGithubOwners] = useState<string[]>([])
  const [registryBusy, setRegistryBusy] = useState(false)
  const resetModalRef = useRef<HTMLElement | null>(null)
  const themeImportRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettings(loadedSettings)
        setSettings(normalizedSettings)
        setIntervalDraft(String(normalizedSettings.checkIntervalHours))
        applyThemePreference(normalizedSettings.theme)
        applyAppearanceSettings(normalizedSettings.appearance)
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS)
        setIntervalDraft(String(DEFAULT_SETTINGS.checkIntervalHours))
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
      setIntervalDraft(String(savedSettings.checkIntervalHours))
      setActionMessage(t('settings.resetDone'))
    }
  }

  const handleClearCache = async () => {
    try {
      await clearGithubCache()
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
      `autoUpdateCheck: ${settings.autoUpdateCheck ? 'yes' : 'no'}`,
      `checkIntervalHours: ${settings.checkIntervalHours}`,
      `theme: ${settings.theme}`,
      `language: ${settings.language}`,
      `aiWorkspaceEnabled: ${settings.aiWorkspaceEnabled ? 'yes' : 'no'}`,
      `codexRuntimePreference: ${settings.codexRuntimePreference}`,
      `launcherDir: ${storageInfo?.launcherDir ?? 'not checked'}`,
      `updateCachePath: ${storageInfo?.updateCachePath ?? 'not checked'}`,
      `updateCacheCount: ${storageInfo?.updateCacheCount ?? 'not checked'}`,
      `backupPath: ${storageInfo?.backupPath ?? 'not checked'}`,
      `backupCount: ${storageInfo?.backupCount ?? 'not checked'}`,
      `cleanupBytes: ${storageInfo?.cleanupBytes ?? 'not checked'}`,
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

  const probeCodexCapabilities = async (runtimeInstalled: boolean) => {
    if (!runtimeInstalled) {
      setCodexCapabilities(CODEX_CAPABILITY_PROBES.map((probe) => ({ ...probe, status: 'unavailable' })))
      return
    }

    const results: CodexCapabilityProbe[] = []
    for (const probe of CODEX_CAPABILITY_PROBES) {
      try {
        await codexRequest(probe.method, probe.id === 'threads' ? { limit: 1 } : {})
        results.push({ ...probe, status: 'available' })
      } catch (err) {
        results.push({
          ...probe,
          status: 'unavailable',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }
    setCodexCapabilities(results)
  }

  const clampIntervalHours = (value: string | number) => {
    const numericValue = typeof value === 'number' ? value : Number(value)
    return Math.max(1, Math.min(168, Number.isFinite(numericValue) ? Math.trunc(numericValue) : 24))
  }

  const commitIntervalDraft = async () => {
    if (!settings) return
    const previousIntervalHours = settings.checkIntervalHours
    const checkIntervalHours = clampIntervalHours(intervalDraft)
    setIntervalDraft(String(checkIntervalHours))
    const savedSettings = await persistSettings({ ...settings, checkIntervalHours }, settings)
    if (!savedSettings) {
      setIntervalDraft(String(previousIntervalHours))
    }
  }

  const handleIntervalKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
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

  const handleLanguageChange = async (language: AppLanguage) => {
    if (!settings) return
    const savedSettings = await persistSettings({ ...settings, language }, settings)
    if (savedSettings) {
      notifyLanguage(language)
    }
  }

  const handleCheckCodex = async () => {
    setCodexChecking(true)
    setError(null)
    try {
      const runtime = await getCodexRuntimeStatus()
      setCodexRuntime(runtime)
      if (runtime.installed) {
        try {
          const account = await getCodexAccountStatus()
          setCodexAccount(account)
        } catch {
          setCodexAccount(null)
        }
      }
      await probeCodexCapabilities(runtime.installed)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ai.connectError'))
    } finally {
      setCodexChecking(false)
    }
  }

  const handleAiRootBrowse = async () => {
    const dir = await pickDirectory()
    if (dir && settings) {
      await persistSettings({ ...settings, aiWorkspaceRoot: dir }, settings)
    }
  }

  const handleCodexLogin = async () => {
    if (!codexApiKey.trim()) return
    setCodexChecking(true)
    setError(null)
    try {
      await loginCodexWithApiKey(codexApiKey)
      setCodexApiKey('')
      await handleCheckCodex()
      setActionMessage(t('ai.loginReady'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ai.loginError'))
    } finally {
      setCodexChecking(false)
    }
  }

  const handleCodexLogout = async () => {
    setCodexChecking(true)
    setError(null)
    try {
      await codexRequest('account/logout', {})
      setCodexAccount(null)
      setActionMessage(t('ai.loggedOut'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ai.logoutError'))
    } finally {
      setCodexChecking(false)
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
    { id: 'aiWorkspace', label: t('settings.aiWorkspace') },
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

      case 'aiWorkspace':
        return (
          <section id="settings-aiWorkspace" className="settings-section ai-settings-section">
            <h3>{t('settings.aiWorkspace')}</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(settings.aiWorkspaceEnabled)}
                onChange={(event) =>
                  persistSettings({ ...settings, aiWorkspaceEnabled: event.target.checked }, settings)
                }
              />
              {t('ai.enableBeta')}
            </label>
            <p className="help-text">{t('ai.betaSettingsHelp')}</p>
            <div className="form-group">
              <label htmlFor="aiWorkspaceRoot">{t('ai.defaultRoot')}</label>
              <div className="path-input-row">
                <input
                  id="aiWorkspaceRoot"
                  type="text"
                  value={settings.aiWorkspaceRoot ?? ''}
                  onChange={(event) => setSettings({ ...settings, aiWorkspaceRoot: event.target.value })}
                  onBlur={() => persistSettings(settings, settings)}
                />
                <button type="button" className="secondary-btn" onClick={handleAiRootBrowse}>
                  {t('settings.choose')}
                </button>
                {settings.aiWorkspaceRoot && (
                  <button type="button" className="secondary-btn" onClick={() => openDir(settings.aiWorkspaceRoot ?? '').catch(() => {})}>
                    {t('settings.open')}
                  </button>
                )}
              </div>
            </div>
            <div className="ai-settings-runtime">
              <div>
                <strong>{t('ai.codexRuntime')}</strong>
                <span>
                  {codexRuntime?.installed
                    ? codexRuntime.running ? t('ai.connected') : t('ai.installed')
                    : t('ai.notChecked')}
                </span>
              </div>
              <div className="settings-inline-actions">
                <button type="button" className="secondary-btn" disabled={codexChecking} onClick={handleCheckCodex}>
                  {t('ai.checkRuntime')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => openCodexDesktop().catch(() => {})}>
                  {t('ai.openCodex')}
                </button>
              </div>
            </div>
            <div className="settings-diagnostics-card ai-capabilities-card">
              <span className="settings-reset-kicker">{t('ai.capabilities')}</span>
              <p className="help-text">{t('ai.capabilitiesHelp')}</p>
              <dl>
                {codexCapabilities.map((capability) => (
                  <div key={capability.id}>
                    <dt>{t(capability.labelKey)}</dt>
                    <dd>
                      <span className={`settings-capability-pill ${capability.status}`}>
                        {t(`ai.capabilityStatus.${capability.status}`)}
                      </span>
                      {capability.detail && <small>{capability.detail}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            {codexRuntime?.installed && !codexAccount?.account && (
              <div className="form-group ai-key-login">
                <label htmlFor="codexKey">{t('ai.loginWithKey')}</label>
                <div className="path-input-row">
                  <input
                    id="codexKey"
                    type="password"
                    value={codexApiKey}
                    onChange={(event) => setCodexApiKey(event.target.value)}
                    autoComplete="off"
                    placeholder="sk-..."
                  />
                  <button type="button" className="secondary-btn" disabled={codexChecking || !codexApiKey.trim()} onClick={handleCodexLogin}>
                    {t('ai.login')}
                  </button>
                </div>
                <p className="help-text">{t('ai.secretNotice')}</p>
              </div>
            )}
            {codexRuntime?.installed && Boolean(codexAccount?.account) && (
              <div className="settings-inline-actions">
                <button type="button" className="secondary-btn" disabled={codexChecking} onClick={handleCodexLogout}>
                  {t('ai.logout')}
                </button>
              </div>
            )}
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
                  <dd>{settings.includePrereleases ? t('ai.yes') : t('ai.no')}</dd>
                </div>
                <div>
                  <dt>{t('settings.autoCheck')}</dt>
                  <dd>{settings.autoUpdateCheck ? t('ai.yes') : t('ai.no')}</dd>
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
                  <dd>{storageInfo ? formatBytes(storageInfo.cleanupBytes) : t('settings.notChecked')}</dd>
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
                  checked={settings.autoUpdateCheck}
                  onChange={(event) =>
                    persistSettings({ ...settings, autoUpdateCheck: event.target.checked }, settings)
                  }
                />
                {t('settings.autoCheck')}
              </label>
            </div>

            <div className="form-group compact-control">
              <label htmlFor="checkInterval">{t('settings.interval')}</label>
              <div className="interval-input-control">
                <input
                  id="checkInterval"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={intervalDraft}
                  onBlur={commitIntervalDraft}
                  onChange={(event) => setIntervalDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  onKeyDown={handleIntervalKeyDown}
                  disabled={!settings.autoUpdateCheck}
                />
                <span>{t('settings.intervalUnitHours')}</span>
              </div>
            </div>

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

          <div className="settings-content" key={activeSection}>
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
