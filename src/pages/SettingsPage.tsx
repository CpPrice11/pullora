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
    setTimeout(() => setSaved(false), 1600)
  }

  const persistSettings = async (
    nextSettings: AppSettings,
    previousSettings: AppSettings | null = settings,
  ) => {
    const normalizedSettings = normalizeSettings(nextSettings)

    setSettings(normalizedSettings)
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
    }
  }

  const handleThemeChange = async (theme: ThemePreference) => {
    if (!settings) return

    const previousSettings = settings
    const nextSettings = normalizeSettings({ ...settings, theme })

    setSettings(nextSettings)
    applyThemePreference(theme, true)
    notifyThemePreference(theme)
    setError(null)

    try {
      await updateSettings(nextSettings)
      showSavedState()
    } catch (err) {
      setSettings(previousSettings)
      applyThemePreference(previousSettings.theme, true)
      notifyThemePreference(previousSettings.theme)
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти тему')
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

  const handleAutoUpdateCheckChange = async (autoUpdateCheck: boolean) => {
    if (!settings) return
    await persistSettings({ ...settings, autoUpdateCheck }, settings)
  }

  const handleCheckIntervalChange = async (value: number) => {
    if (!settings) return
    const checkIntervalHours = Math.max(1, Math.min(168, Number.isFinite(value) ? value : 24))
    await persistSettings({ ...settings, checkIntervalHours }, settings)
  }

  const handleClearCache = async () => {
    await clearGithubCache().catch(() => {})
    alert('Кеш очищено')
  }

  const handleResetSettings = async () => {
    if (!window.confirm('Скинути всі налаштування до стандартних?')) return

    setSaving(true)
    setError(null)

    try {
      const resetSettings = normalizeSettings(DEFAULT_SETTINGS)
      await updateSettings(resetSettings)
      setSettings(resetSettings)
      applyThemePreference(resetSettings.theme, true)
      notifyThemePreference(resetSettings.theme)
      showSavedState()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося скинути налаштування')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="page">
        <p>Завантажуємо налаштування...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Налаштування</h2>
        {saved && <span className="saved-indicator">Збережено</span>}
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
                onChange={(e) =>
                  setSettings({ ...settings, installationPath: e.target.value })
                }
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
                onChange={(e) => handleAutoUpdateCheckChange(e.target.checked)}
              />
              Автоматично перевіряти оновлення
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="checkInterval">Інтервал перевірки (години)</label>
            <input
              id="checkInterval"
              type="number"
              min={1}
              max={168}
              value={settings.checkIntervalHours}
              onChange={(e) => handleCheckIntervalChange(Number(e.target.value))}
              style={{ width: 100 }}
              disabled={!settings.autoUpdateCheck}
            />
          </div>
        </section>

        <section className="settings-section">
          <h3>Вигляд</h3>
          <div className="form-group">
            <label htmlFor="theme">Тема</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) => handleThemeChange(e.target.value as ThemePreference)}
              style={{ width: 160 }}
            >
              <option value="light">Світла</option>
              <option value="dark">Темна</option>
              <option value="auto">Авто</option>
            </select>
          </div>
        </section>

        {error && <div className="error-banner">Увага: {error}</div>}

        <section className="danger-zone">
          <h3>Небезпечна зона</h3>
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
