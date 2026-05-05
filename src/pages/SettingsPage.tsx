import { useState, useEffect } from 'react'
import { AppSettings } from '../types'
import './PageStyles.css'

function SettingsPage() {
  const [settings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Load settings from storage
    setLoading(false)
  }, [])

  const handleSave = () => {
    // TODO: Save settings to storage
  }

  if (loading) {
    return <div className="page">Loading settings...</div>
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="installPath">Installation Directory</label>
          <input
            id="installPath"
            type="text"
            value={settings?.installationPath || ''}
            readOnly
          />
          <button type="button">Browse</button>
        </div>

        <div className="form-group">
          <label htmlFor="autoUpdate">
            <input
              id="autoUpdate"
              type="checkbox"
              checked={settings?.autoUpdateCheck || false}
              readOnly
            />
            Enable automatic update checking
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="checkInterval">Check interval (hours)</label>
          <input
            id="checkInterval"
            type="number"
            min="1"
            max="168"
            value={settings?.checkIntervalHours || 24}
            readOnly
          />
        </div>

        <div className="form-group">
          <label htmlFor="githubToken">GitHub Token (optional)</label>
          <input
            id="githubToken"
            type="password"
            placeholder="Enter GitHub personal access token"
            defaultValue=""
          />
          <p className="help-text">
            Increases API rate limit from 60 to 5000 requests per hour
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="theme">Theme</label>
          <select id="theme" defaultValue={settings?.theme || 'auto'}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (system)</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="button" onClick={handleSave}>
            Save Settings
          </button>
          <button type="button" className="secondary-btn">
            Reset to Defaults
          </button>
        </div>

        <div className="danger-zone">
          <h3>Danger Zone</h3>
          <button className="danger-btn">Clear Cache</button>
          <button className="danger-btn">Reset Application</button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
