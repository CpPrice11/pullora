import { useState } from 'react'
import './Modal.css'

interface InstallationPathModalProps {
  onPathSelected: (path: string) => Promise<void>
}

function InstallationPathModal({ onPathSelected }: InstallationPathModalProps) {
  const [selectedPath, setSelectedPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    // TODO: Implement directory picker using Tauri file dialog
    // For now, we'll show a placeholder
    setSelectedPath('/home/user/.local/air-launcher/apps')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPath.trim()) {
      setError('Please select an installation directory')
      return
    }

    setLoading(true)
    setError('')

    try {
      await onPathSelected(selectedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set installation path')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Choose Installation Directory</h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">
            Select where you would like to install downloaded applications.
            This directory will be created if it doesn't exist.
          </p>

          <div className="form-group">
            <label htmlFor="installPath">Installation Directory</label>
            <div className="path-input-group">
              <input
                id="installPath"
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder="/home/user/.local/air-launcher/apps"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={loading}
              >
                Browse...
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="submit"
              disabled={loading || !selectedPath.trim()}
            >
              {loading ? 'Setting up...' : 'Continue'}
            </button>
          </div>
        </form>

        <p className="modal-footer-text">
          You can change this directory later in the Settings.
        </p>
      </div>
    </div>
  )
}

export default InstallationPathModal
