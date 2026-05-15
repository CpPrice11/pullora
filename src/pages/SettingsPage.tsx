import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings, validateInstallationPath } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import StatePanel from '../components/State/StatePanel'
import { applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import { DEFAULT_SETTINGS, normalizeSettings } from '../utils/settingsDefaults'
import { notifyLanguage, useI18n, type AppLanguage } from '../i18n'
import './PageStyles.css'

function SettingsPage() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathValidation, setPathValidation] = useState<'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission'>('idle')

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        const normalizedSettings = normalizeSettings(loadedSettings)
        setSettings(normalizedSettings)
        applyThemePreference(normalizedSettings.theme)
      })
      .catch(() => {
        setSettings(DEFAULT_SETTINGS)
        applyThemePreference(DEFAULT_SETTINGS.theme)
      })
      .finally(() => setLoading(false))
  }, [])

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
    if (!window.confirm(t('settings.resetConfirm'))) return

    const resetSettings = normalizeSettings(DEFAULT_SETTINGS)
    const savedSettings = await persistSettings(resetSettings, settings)
    if (savedSettings) {
      applyThemePreference(savedSettings.theme, true)
      notifyThemePreference(savedSettings.theme)
    }
  }

  const handleClearCache = async () => {
    await clearGithubCache().catch(() => {})
    alert(t('settings.cacheCleared'))
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
      <div className="page">
        <StatePanel kind="loading" title={t('settings.loading')} skeletonCount={2} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t('settings.title')}</h2>
        {saving && <span className="saved-indicator">{t('settings.saving')}</span>}
        {!saving && saved && <span className="saved-indicator">{t('settings.saved')}</span>}
      </div>

      <div className="settings-form">
        <section className="settings-section">
          <h3>{t('settings.folders')}</h3>
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
              <button type="button" onClick={handleBrowse}>
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

        <section className="settings-section">
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

        <section className="settings-section">
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
            <input
              id="checkInterval"
              type="number"
              min={1}
              max={168}
              value={settings.checkIntervalHours}
              onChange={(event) => {
                const value = Number(event.target.value)
                const checkIntervalHours = Math.max(1, Math.min(168, Number.isFinite(value) ? value : 24))
                persistSettings({ ...settings, checkIntervalHours }, settings)
              }}
              disabled={!settings.autoUpdateCheck}
            />
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

        <section className="settings-section">
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

        <section className="settings-section">
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

        {error && (
          <StatePanel
            kind="error"
            title={t('state.settingsErrorTitle')}
            message={error}
          />
        )}

        <section className="danger-zone">
          <h3>{t('settings.resetSection')}</h3>
          <button className="secondary-btn" onClick={handleResetSettings} disabled={saving}>
            {t('settings.reset')}
          </button>
          <button className="danger-btn" onClick={handleClearCache}>
            {t('settings.clearCache')}
          </button>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
