import { useState } from 'react'
import { pickDirectory } from '../../services/dialog'
import './Modal.css'

interface InstallationPathModalProps {
  onPathSelected: (path: string) => Promise<void>
}

function InstallationPathModal({ onPathSelected }: InstallationPathModalProps) {
  const [selectedPath, setSelectedPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBrowse = async () => {
    const dir = await pickDirectory()
    if (dir) setSelectedPath(dir)
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
          <h2>Welcome to Air Launcher</h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">
            Choose where downloaded applications will be installed.
            The folder will be created automatically if it doesn't exist.
          </p>

          <div className="form-group">
            <label htmlFor="installPath">Installation Directory</label>
            <div className="path-input-group">
              <input
                id="installPath"
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder="Click Browse or type a path..."
                disabled={loading}
              />
              <button type="button" onClick={handleBrowse} disabled={loading}>
                Browse...
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="submit" disabled={loading || !selectedPath.trim()}>
              {loading ? 'Setting up...' : 'Continue'}
            </button>
          </div>
        </form>

        <p className="modal-footer-text">
          You can change this directory later in Settings.
        </p>
      </div>
    </div>
  )
}

export default InstallationPathModal
