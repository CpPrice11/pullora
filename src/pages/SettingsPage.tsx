import { useState, useEffect } from 'react'
import type { AppSettings } from '../types'
import { getSettings, updateSettings } from '../services/settings'
import { openDir } from '../services/updates'
import { pickDirectory } from '../services/dialog'
import { clearGithubCache } from '../services/github'
import './PageStyles.css'

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
        // Browser preview fallback
        setSettings({
          installationPath: '',
          autoUpdateCheck: true,
          checkIntervalHours: 24,
          theme: 'auto',
          language: 'en',
        })
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
    return <div className="page"><p>Loading settings...</p></div>
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-form">

        {/* Installation path */}
        <section className="settings-section">
          <h3>Installation</h3>
          <div className="form-group">
            <label htmlFor="installPath">Installation Directory</label>
            <div className="path-input-row">
              <input
                id="installPath"
                type="text"
                value={settings.installationPath}
                onChange={(e) => setSettings({ ...settings, installationPath: e.target.value })}
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
                  Open ↗
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Auto-update */}
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
                setSettings({ ...settings, checkIntervalHours: Number(e.target.value) })
              }
              style={{ width: 100 }}
              disabled={!settings.autoUpdateCheck}
            />
          </div>
        </section>

        {/* GitHub token */}
        <section className="settings-section">
          <h3>GitHub</h3>
          <div className="form-group">
            <label htmlFor="githubToken">Personal Access Token (optional)</label>
            <input
              id="githubToken"
              type="password"
              value={settings.githubToken ?? ''}
              onChange={(e) =>
                setSettings({ ...settings, githubToken: e.target.value || undefined })
              }
              placeholder="ghp_..."
              autoComplete="off"
            />
            <p className="help-text">
              Increases API rate limit from 60 to 5 000 requests/hour. Generate at{' '}
              <em>github.com → Settings → Developer settings → Personal access tokens</em>.
            </p>
          </div>
        </section>

        {/* Appearance */}
        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="form-group">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={settings.theme}
              onChange={(e) =>
                setSettings({ ...settings, theme: e.target.value as AppSettings['theme'] })
              }
              style={{ width: 160 }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto (system)</option>
            </select>
          </div>
        </section>

        {/* Save */}
        {error && <div className="error-banner">⚠ {error}</div>}

        <div className="form-actions">
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>

        {/* Danger zone */}
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
