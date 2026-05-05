import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import './PageStyles.css'

const FALLBACK_SETTINGS: AppSettings = {
  installationPath: '',
  autoUpdateCheck: true,
  checkIntervalHours: 24,
  githubOwner: '',
  theme: 'auto',
  language: 'en',
}

function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {
        setSettings(FALLBACK_SETTINGS)
      })
      .finally(() => setLoading(false))
  }, [])

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
      await updateSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleClearCache = async () => {
    await clearGithubCache().catch(() => {})
    alert('Cache cleared')
  }

  if (loading || !settings) {
    return (
      <div className="page">
        <p>Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-form">
        <section className="settings-section">
          <h3>Installation</h3>
          <div className="form-group">
            <label htmlFor="installPath">Installation Directory</label>
            <div className="path-input-row">
              <input
                id="installPath"
                type="text"
                value={settings.installationPath}
                onChange={(e) =>
                  setSettings({ ...settings, installationPath: e.target.value })
                }
                placeholder="Choose a folder..."
              />
              <button type="button" onClick={handleBrowse}>
                Browse...
              </button>
              {settings.installationPath && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => openDir(settings.installationPath).catch(() => {})}
                  title="Open in file explorer"
                >
                  Open
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>GitHub</h3>
          <div className="form-group">
            <label htmlFor="githubOwner">Public repository owner</label>
            <input
              id="githubOwner"
              type="text"
              value={settings.githubOwner ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  githubOwner: e.target.value.trim() || undefined,
                })
              }
              placeholder="your-github-username"
              autoComplete="off"
            />
            <p className="help-text">
              Air Launcher will show public repositories from this owner that have GitHub Releases.
            </p>
          </div>
        </section>

        <section className="settings-section">
          <h3>Updates</h3>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoUpdateCheck}
                onChange={(e) =>
                  setSettings({ ...settings, autoUpdateCheck: e.target.checked })
                }
              />
              Check for updates automatically
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="checkInterval">Check interval (hours)</label>
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
          <h3>Appearance</h3>
          <div className="form-group">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  theme: e.target.value as AppSettings['theme'],
                })
              }
              style={{ width: 160 }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (system)</option>
            </select>
          </div>
        </section>

        {error && <div className="error-banner">Warning: {error}</div>}

        <div className="form-actions">
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        <section className="danger-zone">
          <h3>Danger Zone</h3>
          <button className="danger-btn" onClick={handleClearCache}>
            Clear API Cache
          </button>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
