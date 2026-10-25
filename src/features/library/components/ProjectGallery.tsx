import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n'
import { useModalFocus } from '../../../hooks/useModalFocus'
import { CloseIcon } from '../../../components/ui/Icons'
import '../../../components/Modal/Modal.css'

export default function ProjectGallery({ name, screenshots }: { name: string; screenshots: string[] }) {
  const { t } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const available = screenshots.filter((url) => !failed.has(url))
  useModalFocus(dialogRef, { active: selected !== null, onEscape: () => setSelected(null) })

  if (!available.length) return null

  return (
    <section className="project-gallery" aria-labelledby={titleId}>
      <h3 id={titleId}>{t('media.gallery')}</h3>
      <ul className="project-gallery-list">
        {available.map((url, index) => (
          <li key={url}>
            <button type="button" onClick={() => setSelected(url)} aria-label={t('media.enlarge', { name, index: index + 1 })}>
              <img src={url} alt={t('media.screenshot', { name, index: index + 1 })} loading="lazy" onError={() => setFailed((current) => new Set(current).add(url))} />
            </button>
          </li>
        ))}
      </ul>
      {selected && createPortal(
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
          <div className="modal-content project-gallery-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('media.galleryFor', { name })} tabIndex={-1} onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setSelected(null)
            }
          }}>
            <button className="secondary-btn project-gallery-close" type="button" onClick={() => setSelected(null)} aria-label={t('release.close')}><CloseIcon /></button>
            <img src={selected} alt={t('media.screenshot', { name, index: available.indexOf(selected) + 1 })} />
          </div>
        </div>, document.body,
      )}
    </section>
  )
}
