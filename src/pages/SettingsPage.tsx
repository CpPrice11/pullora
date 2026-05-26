import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import StatePanel from '../components/State/StatePanel'
import { useModalFocus } from '../hooks/useModalFocus'
import { applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import { DEFAULT_SETTINGS, normalizeSettings } from '../utils/settingsDefaults'
import { notifyLanguage, useI18n, type AppLanguage } from '../i18n'
import './PageStyles.css'

interface SettingsPageProps {
  hasLauncherBackground: boolean
  onChangeLauncherBackground: () => Promise<void> | void
  onClearLauncherBackground: () => Promise<void> | void
  onClose: () => void
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
  const modalRef = useRef<HTMLElement | null>(null)
  const resetModalRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettings(loadedSettings)
        setSettings(normalizedSettings)
        setIntervalDraft(String(normalizedSettings.checkIntervalHours))
        applyThemePreference(normalizedSettings.theme)
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS)
        setIntervalDraft(String(DEFAULT_SETTINGS.checkIntervalHours))
        applyThemePreference(DEFAULT_SETTINGS.theme)
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
    { id: 'installation', label: t('settings.installation') },
    { id: 'updates', label: t('settings.updates') },
    { id: 'maintenance', label: t('settings.maintenance') },
  ]

  const settingsPanelId = (sectionId: string) =>
    sectionId === 'installation' ? 'settings-folders' : `settings-${sectionId}`

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
      case 'folders':
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

      case 'maintenance':
        return (
          <section id="settings-maintenance" className="danger-zone">
            <h3>{t('settings.maintenance')}</h3>
            <div className="settings-maintenance-actions">
              <button className="secondary-btn" onClick={() => setResetPending(true)} disabled={saving}>
                {t('settings.reset')}
              </button>
              <button className="secondary-btn" onClick={handleClearCache}>
                {t('settings.clearCache')}
              </button>
            </div>
          </section>
        )

      case 'github':
        return (
          <section id="settings-github" className="settings-section">
            <h3>{t('settings.github')}</h3>
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
              />
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
          <section id="settings-appearance" className="settings-section">
            <h3>{t('settings.appearance')}</h3>
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
          </section>
        )

      case 'language':
        return (
          <section id="settings-language" className="settings-section">
            <h3>{t('settings.languageSection')}</h3>
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
          </section>
        )

      case 'reset':
      default:
        return (
          <section id="settings-reset" className="danger-zone">
            <h3>{t('settings.resetSection')}</h3>
            <button className="secondary-btn" onClick={() => setResetPending(true)} disabled={saving}>
              {t('settings.reset')}
            </button>
            <button className="danger-btn" onClick={handleClearCache}>
              {t('settings.clearCache')}
            </button>
          </section>
        )
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
