import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import { artCropStyle, getProjectArtPreview, type ProjectArtKind } from '../../services/projectArt'
import type { ArtCrop } from '../../types'
import { CloseIcon } from '../ui/Icons'
import './Modal.css'

type ArtCropPreviewMode = '1000x700' | '1280x720' | '1920x1080' | 'normal' | 'compact'

const initialWorkspacePreview = (): ArtCropPreviewMode => {
  if (typeof window === 'undefined') return '1280x720'
  if (Math.abs(window.innerWidth / window.innerHeight - 10 / 7) < 0.08) return '1000x700'
  return window.innerWidth >= 1600 ? '1920x1080' : '1280x720'
}

interface ArtCropDialogProps {
  kind: Exclude<ProjectArtKind, 'all'>
  previewShape?: 'cover' | 'hero' | 'workspace'
  initialPreviewMode?: 'normal' | 'compact'
  previewAspectRatios?: Partial<Record<'normal' | 'compact', number>>
  previewStyle?: Record<string, string>
  sourcePath: string
  initialCrop?: ArtCrop
  onCancel: () => void
  onError: (message: string) => void
  onSave: (crop: ArtCrop) => Promise<void>
}

const centeredCrop: ArtCrop = { focusX: 0.5, focusY: 0.5, zoom: 1 }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalizeCrop = (crop: ArtCrop = centeredCrop): ArtCrop => ({
  focusX: clamp(Number.isFinite(crop.focusX) ? crop.focusX : 0.5, 0, 1),
  focusY: clamp(Number.isFinite(crop.focusY) ? crop.focusY : 0.5, 0, 1),
  zoom: clamp(Number.isFinite(crop.zoom) ? crop.zoom : 1, 1, 4),
})

const cropPosition = (crop: ArtCrop, language: string) => ({
  x: Math.round(crop.focusX * 100),
  y: Math.round(crop.focusY * 100),
  zoom: new Intl.NumberFormat(language === 'uk' ? 'uk-UA' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(crop.zoom),
})

export default function ArtCropDialog({
  kind,
  previewShape = kind === 'cover' ? 'cover' : 'hero',
  initialPreviewMode = 'normal',
  previewAspectRatios,
  previewStyle,
  sourcePath,
  initialCrop = centeredCrop,
  onCancel,
  onError,
  onSave,
}: ArtCropDialogProps) {
  const { language, t } = useI18n()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    width: number
    height: number
    crop: ArtCrop
  } | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const zoomId = useId()
  const cropRef = useRef(normalizeCrop(initialCrop))
  const cropFrameRef = useRef<number | null>(null)
  const loadErrorReportedRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  const onErrorRef = useRef(onError)
  onCancelRef.current = onCancel
  onErrorRef.current = onError
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [crop, setCrop] = useState(cropRef.current)
  const [announcedCrop, setAnnouncedCrop] = useState<ArtCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState<ArtCropPreviewMode>(
    previewShape === 'workspace' ? initialWorkspacePreview() : initialPreviewMode,
  )

  useModalFocus(dialogRef, { onEscape: saving ? undefined : onCancel })

  const reportLoadError = () => {
    if (loadErrorReportedRef.current) return
    loadErrorReportedRef.current = true
    onErrorRef.current(t('art.cropLoadError'))
    onCancelRef.current()
  }

  useEffect(() => {
    let active = true
    const nextCrop = normalizeCrop(initialCrop)
    cropRef.current = nextCrop
    setPreviewUrl(null)
    setPreviewReady(false)
    setCrop(nextCrop)
    setAnnouncedCrop(null)
    setError(null)
    dragRef.current = null
    if (cropFrameRef.current !== null) {
      cancelAnimationFrame(cropFrameRef.current)
      cropFrameRef.current = null
    }
    loadErrorReportedRef.current = false

    getProjectArtPreview(sourcePath)
      .then((url) => {
        if (active) setPreviewUrl(url)
      })
      .catch(() => {
        if (active) reportLoadError()
      })

    return () => {
      active = false
      dragRef.current = null
      if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
      cropFrameRef.current = null
    }
  }, [initialCrop, sourcePath, t])

  const renderCrop = () => {
    if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
    cropFrameRef.current = null
    setCrop(cropRef.current)
  }

  const updateCrop = (next: Partial<ArtCrop>, deferRender = false) => {
    cropRef.current = normalizeCrop({ ...cropRef.current, ...next })
    if (!deferRender) return renderCrop()
    if (cropFrameRef.current === null) {
      cropFrameRef.current = requestAnimationFrame(renderCrop)
    }
  }

  const commitCrop = (next: ArtCrop) => {
    const normalized = normalizeCrop(next)
    cropRef.current = normalized
    renderCrop()
    setAnnouncedCrop(normalized)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!previewReady || event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: bounds.width,
      height: bounds.height,
      crop,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateCrop({
      focusX: drag.crop.focusX - (event.clientX - drag.x) / drag.width,
      focusY: drag.crop.focusY - (event.clientY - drag.y) / drag.height,
    }, true)
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    renderCrop()
    setAnnouncedCrop(cropRef.current)
  }

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const positionStep = event.shiftKey ? 0.05 : 0.01
    const next = { ...cropRef.current }
    if (event.key === 'ArrowLeft') next.focusX -= positionStep
    else if (event.key === 'ArrowRight') next.focusX += positionStep
    else if (event.key === 'ArrowUp') next.focusY -= positionStep
    else if (event.key === 'ArrowDown') next.focusY += positionStep
    else if (event.key === 'PageUp') next.zoom += 0.1
    else if (event.key === 'PageDown') next.zoom -= 0.1
    else if (event.key === 'Home') Object.assign(next, centeredCrop)
    else return
    event.preventDefault()
    commitCrop(next)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(cropRef.current)
    } catch {
      setError(t('art.saveError'))
      setSaving(false)
    }
  }

  const targetLabel = t(kind === 'cover' ? 'art.cover' : 'art.background')
  const previewOptions: Array<{ value: ArtCropPreviewMode; label: string }> = previewShape === 'workspace'
    ? [
        { value: '1000x700', label: '1000 × 700' },
        { value: '1280x720', label: '1280 × 720' },
        { value: '1920x1080', label: '1920 × 1080' },
      ]
    : previewShape === 'hero'
      ? [
          { value: 'normal', label: t('library.viewNormal') },
          { value: 'compact', label: t('library.viewCompact') },
        ]
      : []
  const position = cropPosition(crop, language)
  const announcedPosition = announcedCrop ? cropPosition(announcedCrop, language) : null
  const previewAspectRatio = previewMode === 'normal' || previewMode === 'compact'
    ? previewAspectRatios?.[previewMode]
    : undefined
  const previewFrameStyle = {
    ...previewStyle,
    ...(previewShape === 'hero'
      && previewAspectRatio
      && Number.isFinite(previewAspectRatio)
      ? { aspectRatio: String(previewAspectRatio) }
      : {}),
  } as CSSProperties

  const dialog = (
    <div className="modal-overlay art-crop-overlay">
      <div
        ref={dialogRef}
        className="modal-content art-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={saving}
        tabIndex={-1}
      >
        <header className="art-crop-header">
          <div>
            <h2 id={titleId}>{t(kind === 'cover' ? 'art.cropCoverTitle' : 'art.cropTitle')}</h2>
            <p id={descriptionId}>{t('art.cropDescription', { target: targetLabel.toLowerCase() })}</p>
          </div>
          <button
            type="button"
            className="close-btn"
            aria-label={t('release.close')}
            disabled={saving}
            onClick={onCancel}
          >
            <CloseIcon className="dialog-close-icon" />
          </button>
        </header>

        <div className="art-crop-body">
          {previewOptions.length > 0 && (
            <div
              className="segmented-control art-crop-preview-switch"
              role="group"
              aria-label={t('art.cropPreviewFormat')}
            >
              {previewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={previewMode === option.value ? 'active' : ''}
                  aria-pressed={previewMode === option.value}
                  disabled={saving}
                  onClick={() => setPreviewMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <div
            className={`art-crop-preview art-crop-preview--${previewShape}`}
            data-preview-mode={previewMode}
            style={previewFrameStyle}
            role="img"
            aria-label={t('art.cropPreviewPosition', position)}
            tabIndex={previewReady ? 0 : -1}
            onKeyDown={handlePreviewKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            {previewUrl && (
              <img
                className={previewReady ? '' : 'is-loading'}
                src={previewUrl}
                alt=""
                style={artCropStyle(crop)}
                draggable="false"
                onLoad={() => setPreviewReady(true)}
                onError={reportLoadError}
              />
            )}
            {!previewReady && !error && (
              <span role="status" aria-live="polite">{t('art.cropLoading')}</span>
            )}
            {previewShape === 'workspace' && (
              <div className="art-crop-workspace-overlay" aria-hidden="true">
                <span className="art-crop-workspace-sidebar" />
                <span className="art-crop-workspace-main">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            {previewShape === 'hero' && (
              <div className="art-crop-hero-overlay" aria-hidden="true">
                <span className="art-crop-hero-cover" />
                <span className="art-crop-hero-copy">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>

          <p className="art-crop-hint">{t('art.cropHint')}</p>
          <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {announcedPosition ? t('art.cropPreviewPosition', announcedPosition) : ''}
          </span>

          <div className="art-crop-controls">
            <label htmlFor={zoomId}>{t('art.cropZoom')}</label>
            <input
              id={zoomId}
              type="range"
              min="1"
              max="4"
              step="0.05"
              value={crop.zoom}
              aria-valuetext={t('art.cropZoomValue', { value: position.zoom })}
              disabled={!previewReady || saving}
              onChange={(event) => updateCrop({ zoom: Number(event.currentTarget.value) }, true)}
              onPointerUp={() => {
                renderCrop()
                setAnnouncedCrop(cropRef.current)
              }}
              onKeyUp={() => {
                renderCrop()
                setAnnouncedCrop(cropRef.current)
              }}
            />
            <output htmlFor={zoomId}>{t('art.cropZoomValue', { value: position.zoom })}</output>
            <button
              type="button"
              className="secondary-btn art-crop-reset"
              disabled={!previewReady || saving}
              onClick={() => commitCrop(centeredCrop)}
            >
              {t('art.cropReset')}
            </button>
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}
        </div>

        <footer className="art-crop-actions">
          <button
            type="button"
            className="secondary-btn"
            data-autofocus="true"
            disabled={saving}
            onClick={onCancel}
          >
            {t('art.cropCancel')}
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!previewReady || Boolean(error) || saving}
            onClick={() => void handleSave()}
          >
            {saving ? t('art.cropSaving') : t('art.cropSave')}
          </button>
        </footer>
      </div>
    </div>
  )

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.querySelector('.layout') ?? document.body)
}
