import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import { applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import { DEFAULT_SETTINGS, normalizeSettings } from '../utils/settingsDefaults'
import './PageStyles.css'

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти налаштування')
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
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти тему')
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
  }

  const handleInstallationPathKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }

  const handleResetSettings = async () => {
    if (!window.confirm('Скинути всі налаштування до стандартних?')) return

    const resetSettings = normalizeSettings(DEFAULT_SETTINGS)
    const savedSettings = await persistSettings(resetSettings, settings)
    if (savedSettings) {
      applyThemePreference(savedSettings.theme, true)
      notifyThemePreference(savedSettings.theme)
    }
  }

  const handleClearCache = async () => {
    await clearGithubCache().catch(() => {})
    alert('Кеш очищено')
  }

  if (loading || !settings) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Завантажуємо налаштування...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Налаштування</h2>
        {saving && <span className="saved-indicator">Зберігаємо</span>}
        {!saving && saved && <span className="saved-indicator">Збережено</span>}
      </div>

      <div className="settings-form">
        <section className="settings-section">
          <h3>Встановлення</h3>
          <div className="form-group">
            <label htmlFor="installPath">Папка встановлення</label>
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
                placeholder="Обери папку..."
              />
              <button type="button" onClick={handleBrowse}>
                Обрати...
              </button>
              {settings.installationPath && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => openDir(settings.installationPath).catch(() => {})}
                  title="Відкрити у файловому менеджері"
                >
                  Відкрити
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Оновлення</h3>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoUpdateCheck}
                onChange={(event) =>
                  persistSettings({ ...settings, autoUpdateCheck: event.target.checked }, settings)
                }
              />
              Автоматично перевіряти оновлення
            </label>
          </div>

          <div className="form-group compact-control">
            <label htmlFor="checkInterval">Інтервал перевірки</label>
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
              Показувати prerelease
            </label>
          </div>

          <div className="form-group compact-control">
            <label htmlFor="assetStrategy">Файли релізів</label>
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
              <option value="portableFirst">Portable ZIP спочатку</option>
              <option value="installerFirst">EXE/MSI спочатку</option>
              <option value="manual">Вручну</option>
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h3>Вигляд</h3>
          <div className="form-group compact-control">
            <label htmlFor="theme">Тема</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}
            >
              <option value="light">Світла</option>
              <option value="dark">Темна</option>
              <option value="auto">Авто</option>
            </select>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        <section className="danger-zone">
          <h3>Службові дії</h3>
          <button className="secondary-btn" onClick={handleResetSettings} disabled={saving}>
            Скинути налаштування
          </button>
          <button className="danger-btn" onClick={handleClearCache}>
            Очистити API-кеш
          </button>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
