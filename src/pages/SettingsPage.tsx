import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import { applyThemePreference, notifyThemePreference, type ThemePreference } from '../utils/theme'
import './PageStyles.css'

const FALLBACK_SETTINGS: AppSettings = {
  installationPath: '',
  autoUpdateCheck: true,
  checkIntervalHours: 24,
  githubOwner: 'CpPrice11',
  theme: 'auto',
  language: 'uk',
}

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings)
        applyThemePreference(loadedSettings.theme)
      })
      .catch(() => {
        setSettings(FALLBACK_SETTINGS)
        applyThemePreference(FALLBACK_SETTINGS.theme)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleThemeChange = (theme: ThemePreference) => {
    if (!settings) return
    setSettings({ ...settings, theme })
    applyThemePreference(theme, true)
    notifyThemePreference(theme)
  }

  const handleBrowse = async () => {
    const dir = await pickDirectory()
    if (dir && settings) {
      setSettings({ ...settings, installationPath: dir })
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const normalizedSettings = {
        ...settings,
        githubOwner: 'CpPrice11',
        language: settings.language || 'uk',
      }
      await updateSettings(normalizedSettings)
      setSettings(normalizedSettings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти налаштування')
    } finally {
      setSaving(false)
    }
  }

  const handleClearCache = async () => {
    await clearGithubCache().catch(() => {})
    alert('Кеш очищено')
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
      <h2>Налаштування</h2>

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
                onChange={(e) =>
                  setSettings({ ...settings, autoUpdateCheck: e.target.checked })
                }
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
              onChange={(e) =>
                setSettings({
                  ...settings,
                  checkIntervalHours: Number(e.target.value),
                })
              }
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
              <option value="auto">Авто (системна)</option>
            </select>
          </div>
        </section>

        {error && <div className="error-banner">Увага: {error}</div>}

        <div className="form-actions">
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Зберігаємо...' : saved ? 'Збережено' : 'Зберегти налаштування'}
          </button>
        </div>

        <section className="danger-zone">
          <h3>Небезпечна зона</h3>
          <button className="danger-btn" onClick={handleClearCache}>
            Очистити API-кеш
          </button>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
