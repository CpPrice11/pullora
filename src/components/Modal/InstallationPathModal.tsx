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
      setError('Обери папку для встановлення')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onPathSelected(selectedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося задати папку встановлення')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Вітаємо в Air Launcher</h2>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">
            Обери, куди встановлювати завантажені застосунки.
            Папка буде створена автоматично, якщо її ще немає.
          </p>

          <div className="form-group">
            <label htmlFor="installPath">Папка встановлення</label>
            <div className="path-input-group">
              <input
                id="installPath"
                type="text"
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                placeholder="Натисни Обрати або введи шлях..."
                disabled={loading}
              />
              <button type="button" onClick={handleBrowse} disabled={loading}>
                Обрати...
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="submit" disabled={loading || !selectedPath.trim()}>
              {loading ? 'Налаштовуємо...' : 'Продовжити'}
            </button>
          </div>
        </form>

        <p className="modal-footer-text">
          Цю папку можна змінити пізніше в налаштуваннях.
        </p>
      </div>
    </div>
  )
}

export default InstallationPathModal
