import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import { codexRequest, getCodexAccountStatus, getCodexRuntimeStatus, loginCodexWithApiKey, openCodexDesktop } from '../services/aiWorkspace'
import type { CodexRuntimeStatus } from '../types'
import StatePanel from '../components/State/StatePanel'
import { useModalFocus } from '../hooks/useModalFocus'
import { applyAppearanceSettings, applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
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
  const [pathValidation, setPathValidation] = useState<'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission'>('idle')
  const [resetPending, setResetPending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [codexRuntime, setCodexRuntime] = useState<CodexRuntimeStatus | null>(null)
  const [codexAccount, setCodexAccount] = useState<Record<string, unknown> | null>(null)
  const [codexApiKey, setCodexApiKey] = useState('')
  const [codexChecking, setCodexChecking] = useState(false)
  const modalRef = useRef<HTMLElement | null>(null)
  const resetModalRef = useRef<HTMLElement | null>(null)

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

  useModalFocus(modalRef, { active: !resetPending, onEscape: onClose })
  useModalFocus(resetModalRef, {
    active: resetPending,
    onEscape: saving ? undefined : () => setResetPending(false),
  })

  useEffect(() => {
    if (!actionMessage) return
    const timer = window.setTimeout(() => setActionMessage(null), 3600)
    return () => window.clearTimeout(timer)
  }, [actionMessage])

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

  const handleCopyMaintenanceDiagnostics = async () => {
    if (!settings) return

    const lines = [
      'Air Launcher maintenance diagnostics',
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
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setActionMessage(t('settings.diagnosticsCopied'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.diagnosticsCopyError'))
    }
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
    await clearGithubCache().catch(() => {})
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
        const account = await getCodexAccountStatus()
        setCodexAccount(account)
      }
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
      <div className="settings-modal-overlay" role="presentation" onClick={onClose}>
        <section
          ref={modalRef}
          className="settings-modal settings-modal-loading"
          role="dialog"
          aria-modal="true"
          aria-label={t('settings.title')}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="close-btn settings-modal-close"
            onClick={onClose}
            aria-label={t('settings.close')}
          >
            {'\u00d7'}
          </button>
          <StatePanel kind="loading" title={t('settings.loading')} skeletonCount={2} />
        </section>
      </div>
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
                <span className={`settings-status ${pathValidation === 'ok' ? 'success' : 'error'}`}>
                  {pathValidation === 'ok' && t('settings.pathOk')}
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
            <div className="settings-maintenance-actions">
              <button className="secondary-btn" onClick={() => setResetPending(true)} disabled={saving}>
                {t('settings.reset')}
              </button>
              <button className="secondary-btn" onClick={handleClearCache}>
                {t('settings.clearCache')}
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
            <h3>{t('settings.appearance')}</h3>
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
                  <option value="steam">{t('settings.presetSteam')}</option>
                  <option value="steamLight">{t('settings.presetSteamLight')}</option>
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
    <div className="settings-modal-overlay" role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div>
            <span className="settings-modal-kicker">Air Launcher</span>
            <h2 id="settings-title">{t('settings.title')}</h2>
          </div>
          <div className="settings-modal-header-actions">
            <button
              type="button"
              className="close-btn settings-modal-close"
              onClick={onClose}
              aria-label={t('settings.close')}
            >
              {'\u00d7'}
            </button>
          </div>
        </div>

        <div className="settings-form">
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
        <footer className="settings-modal-footer">
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
    </div>
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
