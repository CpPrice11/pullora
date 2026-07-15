import { useState } from 'react'
import { useI18n } from '../../../i18n'

interface FolderManagerProps {
  targetName: string
  existingNames: string[]
  onCancel: () => void
  onConfirm: (name: string) => void
}

function normalizeFolderName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export default function FolderManager({
  targetName,
  existingNames,
  onCancel,
  onConfirm,
}: FolderManagerProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const normalizedName = normalizeFolderName(name)
  const duplicate = Boolean(normalizedName) && existingNames.some(
    (existingName) => normalizeFolderName(existingName).toLowerCase() === normalizedName.toLowerCase(),
  )
  const error = duplicate ? t('library.folder.duplicateName') : null
  const canConfirm = Boolean(normalizedName) && !duplicate

  const confirm = () => {
    if (canConfirm) onConfirm(normalizedName)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-modal library-folder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-folder-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div>
            <span className="confirm-modal-kicker">{t('library.folder.title')}</span>
            <h3 id="library-folder-modal-title">{t('library.folder.modalTitle')}</h3>
          </div>
          <button
            type="button"
            className="secondary-btn confirm-close-btn"
            aria-label={t('library.folder.cancel')}
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <div className="library-folder-form">
          <label htmlFor="library-folder-name">{t('library.folder.nameLabel')}</label>
          <input
            id="library-folder-name"
            type="text"
            value={name}
            placeholder={t('library.folder.namePlaceholder')}
            autoFocus
            aria-invalid={duplicate || undefined}
            aria-describedby={error ? 'library-folder-error' : undefined}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm()
              if (event.key === 'Escape') onCancel()
            }}
          />
          <p>{t('library.folder.targetApp', { name: targetName })}</p>
          {error && <span id="library-folder-error" className="library-folder-error" role="alert">{error}</span>}
        </div>
        <div className="confirm-actions">
          <button type="button" className="secondary-btn" onClick={onCancel}>
            {t('library.folder.cancel')}
          </button>
          <button type="button" onClick={confirm} disabled={!canConfirm}>
            {t('library.folder.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
