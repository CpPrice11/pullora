import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import { artCropStyle, getProjectArtPreview, type ProjectArtKind } from '../../services/projectArt'
import type { ArtCrop } from '../../types'
import { CloseIcon } from '../ui/Icons'
import './Modal.css'

const displayDimension = (value: number) => {
  const roundedToTen = Math.round(value / 10) * 10
  return Math.abs(value - roundedToTen) <= 1 ? roundedToTen : Math.round(value)
}

const currentScreenResolution = () => {
  if (typeof window === 'undefined') return { width: 1920, height: 1080 }
  const scale = window.devicePixelRatio || 1
  return {
    width: displayDimension(window.screen.width * scale),
    height: displayDimension(window.screen.height * scale),
  }
}

const currentMonitorResolution = async () => {
  try {
    const { currentMonitor } = await import('@tauri-apps/api/window')
    const monitor = await currentMonitor()
    if (monitor) {
      return {
        width: displayDimension(monitor.size.width),
        height: displayDimension(monitor.size.height),
      }
    }
  } catch {
    // Browser previews and older runtimes fall back to the active web screen.
  }
  return currentScreenResolution()
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

const dragFocus = (focus: number, delta: number, before: number, after: number) => {
  if (delta < 0) return focus - delta * (1 - focus) / Math.max(before, 1)
  return focus - delta * focus / Math.max(after, 1)
}

const pointerDistance = (first: { x: number; y: number }, second: { x: number; y: number }) =>
  Math.hypot(second.x - first.x, second.y - first.y)

const pointerCenter = (first: { x: number; y: number }, second: { x: number; y: number }) => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
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
    left: number
    top: number
    width: number
    height: number
    crop: ArtCrop
  } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{
    distance: number
    centerX: number
    centerY: number
    left: number
    top: number
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
  const [zoomValue, setZoomValue] = useState(cropRef.current.zoom)
  const [announcedCrop, setAnnouncedCrop] = useState<ArtCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [screenResolution, setScreenResolution] = useState(currentScreenResolution)

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
    setZoomValue(nextCrop.zoom)
    setAnnouncedCrop(null)
    setError(null)
    dragRef.current = null
    pointersRef.current.clear()
    pinchRef.current = null
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
      pointersRef.current.clear()
      pinchRef.current = null
      if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
      cropFrameRef.current = null
    }
  }, [initialCrop, sourcePath, t])

  useEffect(() => {
    if (previewShape !== 'workspace') return
    let active = true
    let unlisten: (() => void) | undefined
    let monitorTimer: number | undefined

    const syncMonitor = async () => {
      const resolution = await currentMonitorResolution()
      if (active) setScreenResolution(resolution)
    }
    const scheduleMonitorSync = () => {
      window.clearTimeout(monitorTimer)
      monitorTimer = window.setTimeout(() => void syncMonitor(), 120)
    }

    void syncMonitor()
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onMoved(scheduleMonitorSync))
      .then((stopListening) => {
        if (active) unlisten = stopListening
        else stopListening()
      })
      .catch(() => undefined)
    window.addEventListener('resize', scheduleMonitorSync)

    return () => {
      active = false
      window.clearTimeout(monitorTimer)
      unlisten?.()
      window.removeEventListener('resize', scheduleMonitorSync)
    }
  }, [previewShape])

  const renderCrop = () => {
    if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
    cropFrameRef.current = null
    setCrop(cropRef.current)
    setZoomValue(cropRef.current.zoom)
  }

  const updateCrop = (next: Partial<ArtCrop>, deferRender = false) => {
    cropRef.current = normalizeCrop({ ...cropRef.current, ...next })
    if (!deferRender) return renderCrop()
    if (cropFrameRef.current === null) cropFrameRef.current = requestAnimationFrame(renderCrop)
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
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)

    if (pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values())
      const center = pointerCenter(first, second)
      pinchRef.current = {
        distance: Math.max(pointerDistance(first, second), 1),
        centerX: center.x,
        centerY: center.y,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        crop: cropRef.current,
      }
      dragRef.current = null
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      crop: cropRef.current,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values())
      const center = pointerCenter(first, second)
      updateCrop({
        focusX: dragFocus(
          pinch.crop.focusX,
          center.x - pinch.centerX,
          pinch.centerX - pinch.left,
          pinch.left + pinch.width - pinch.centerX,
        ),
        focusY: dragFocus(
          pinch.crop.focusY,
          center.y - pinch.centerY,
          pinch.centerY - pinch.top,
          pinch.top + pinch.height - pinch.centerY,
        ),
        zoom: pinch.crop.zoom * pointerDistance(first, second) / pinch.distance,
      }, true)
      return
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateCrop({
      focusX: dragFocus(
        drag.crop.focusX,
        event.clientX - drag.x,
        drag.x - drag.left,
        drag.left + drag.width - drag.x,
      ),
      focusY: dragFocus(
        drag.crop.focusY,
        event.clientY - drag.y,
        drag.y - drag.top,
        drag.top + drag.height - drag.y,
      ),
    }, true)
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pinchRef.current = null
    dragRef.current = null

    const remainingPointer = pointersRef.current.entries().next().value as [number, { x: number; y: number }] | undefined
    if (remainingPointer) {
      const [pointerId, point] = remainingPointer
      const bounds = event.currentTarget.getBoundingClientRect()
      dragRef.current = {
        pointerId,
        x: point.x,
        y: point.y,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        crop: cropRef.current,
      }
    }
    renderCrop()
    setAnnouncedCrop(cropRef.current)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!previewReady || saving) return
    event.preventDefault()
    commitCrop({ ...cropRef.current, zoom: cropRef.current.zoom - event.deltaY * 0.002 })
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
  const position = cropPosition(crop, language)
  const announcedPosition = announcedCrop ? cropPosition(announcedCrop, language) : null
  const previewAspectRatio = previewShape === 'workspace'
    ? screenResolution.width / screenResolution.height
    : previewShape === 'hero'
      ? previewAspectRatios?.[initialPreviewMode] ?? 4
      : 1
  const previewFrameStyle = {
    ...previewStyle,
    aspectRatio: Number.isFinite(previewAspectRatio) ? String(previewAspectRatio) : '1',
    '--art-crop-aspect': Number.isFinite(previewAspectRatio) ? String(previewAspectRatio) : '1',
  } as CSSProperties
  const cropTarget = previewShape === 'workspace'
    ? t('art.cropCurrentScreen', screenResolution)
    : t(previewShape === 'cover' ? 'art.cropTargetCover' : 'art.cropTargetHero')

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
          <div className={`art-crop-stage art-crop-stage--${previewShape}`}>
            <div
              className="art-crop-stage-image"
              style={previewUrl
                ? { backgroundImage: `url(${JSON.stringify(previewUrl)})` }
                : undefined}
              aria-hidden="true"
            />
            <span className="art-crop-target">{cropTarget}</span>
            <div
              className={`art-crop-preview art-crop-preview--${previewShape}`}
              data-preview-mode={initialPreviewMode}
              style={previewFrameStyle}
              role="img"
              aria-label={t('art.cropPreviewPosition', position)}
              tabIndex={previewReady ? 0 : -1}
              onKeyDown={handlePreviewKeyDown}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onWheel={handleWheel}
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
              {previewShape === 'cover' && <span className="art-crop-cover-guide" aria-hidden="true" />}
              <span className="art-crop-grid" aria-hidden="true" />
            </div>
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
              value={zoomValue}
              style={{ '--art-zoom-progress': `${((zoomValue - 1) / 3) * 100}%` } as CSSProperties}
              aria-valuetext={t('art.cropZoomValue', { value: position.zoom })}
              disabled={!previewReady || saving}
              onChange={(event) => {
                const zoom = Number(event.currentTarget.value)
                setZoomValue(zoom)
                updateCrop({ zoom }, true)
              }}
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
