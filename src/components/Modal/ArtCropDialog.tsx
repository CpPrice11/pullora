import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useCurrentMonitorResolution } from '../../hooks/useCurrentMonitorResolution'
import { getProjectArtPreview, type ProjectArtKind } from '../../services/projectArt'
import type { ArtCrop } from '../../types'
import { CloseIcon } from '../ui/Icons'
import './Modal.css'

type Size = { width: number; height: number }
type Rect = Size & { left: number; top: number }
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

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

const containedRect = (stage: Size, image: Size): Rect => {
  if (!stage.width || !stage.height || !image.width || !image.height) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const horizontalPadding = 36
  const topPadding = 44
  const bottomPadding = 18
  const availableWidth = Math.max(stage.width - horizontalPadding, 1)
  const availableHeight = Math.max(stage.height - topPadding - bottomPadding, 1)
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return {
    left: (stage.width - width) / 2,
    top: topPadding + (availableHeight - height) / 2,
    width,
    height,
  }
}

const frameRect = (crop: ArtCrop, image: Size, aspect: number): Rect => {
  if (!image.width || !image.height) return { left: 0, top: 0, width: 0, height: 0 }
  const baseWidth = Math.min(image.width, image.height * aspect)
  const baseHeight = baseWidth / aspect
  const width = baseWidth / crop.zoom
  const height = baseHeight / crop.zoom
  return {
    left: crop.focusX * (image.width - width),
    top: crop.focusY * (image.height - height),
    width,
    height,
  }
}

const cropFromFrame = (frame: Rect, image: Size, aspect: number): ArtCrop => {
  const baseWidth = Math.min(image.width, image.height * aspect)
  const horizontalRange = image.width - frame.width
  const verticalRange = image.height - frame.height
  return normalizeCrop({
    focusX: horizontalRange > 0 ? frame.left / horizontalRange : 0.5,
    focusY: verticalRange > 0 ? frame.top / verticalRange : 0.5,
    zoom: baseWidth / frame.width,
  })
}

const cropPosition = (crop: ArtCrop) => ({
  x: Math.round(crop.focusX * 100),
  y: Math.round(crop.focusY * 100),
  zoom: Math.round(100 / crop.zoom),
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
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const interactionRef = useRef<{
    type: 'move' | 'resize'
    pointerId: number
    x: number
    y: number
    frame: Rect
    corner?: Corner
  } | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const cropRef = useRef(normalizeCrop(initialCrop))
  const cropFrameRef = useRef<number | null>(null)
  const loadErrorReportedRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  const onErrorRef = useRef(onError)
  onCancelRef.current = onCancel
  onErrorRef.current = onError
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 })
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 })
  const [crop, setCrop] = useState(cropRef.current)
  const [announcedCrop, setAnnouncedCrop] = useState<ArtCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const screenResolution = useCurrentMonitorResolution(previewShape === 'workspace')

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
    setImageSize({ width: 0, height: 0 })
    setCrop(nextCrop)
    setAnnouncedCrop(null)
    setError(null)
    interactionRef.current = null
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
      interactionRef.current = null
      if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
      cropFrameRef.current = null
    }
  }, [initialCrop, sourcePath, t])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const targetAspect = previewShape === 'workspace'
    ? screenResolution.width / screenResolution.height
    : previewShape === 'hero'
      ? previewAspectRatios?.[initialPreviewMode] ?? 4
      : 1
  const canvas = containedRect(stageSize, imageSize)
  const frame = frameRect(crop, canvas, targetAspect)

  const renderCrop = () => {
    if (cropFrameRef.current !== null) cancelAnimationFrame(cropFrameRef.current)
    cropFrameRef.current = null
    setCrop(cropRef.current)
  }

  const updateCrop = (next: ArtCrop, deferRender = false) => {
    cropRef.current = normalizeCrop(next)
    if (!deferRender) return renderCrop()
    if (cropFrameRef.current === null) cropFrameRef.current = requestAnimationFrame(renderCrop)
  }

  const commitCrop = (next: ArtCrop) => {
    const normalized = normalizeCrop(next)
    cropRef.current = normalized
    renderCrop()
    setAnnouncedCrop(normalized)
  }

  const beginInteraction = (
    event: PointerEvent<HTMLElement>,
    type: 'move' | 'resize',
    corner?: Corner,
  ) => {
    if (!previewReady || saving || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    stageRef.current?.setPointerCapture(event.pointerId)
    interactionRef.current = {
      type,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      frame,
      corner,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    const dx = event.clientX - interaction.x
    const dy = event.clientY - interaction.y

    if (interaction.type === 'move') {
      const moved = {
        ...interaction.frame,
        left: clamp(interaction.frame.left + dx, 0, canvas.width - interaction.frame.width),
        top: clamp(interaction.frame.top + dy, 0, canvas.height - interaction.frame.height),
      }
      updateCrop(cropFromFrame(moved, canvas, targetAspect), true)
      return
    }

    const corner = interaction.corner ?? 'bottom-right'
    const growsRight = corner.endsWith('right')
    const growsDown = corner.startsWith('bottom')
    const oppositeX = growsRight ? interaction.frame.left : interaction.frame.left + interaction.frame.width
    const oppositeY = growsDown ? interaction.frame.top : interaction.frame.top + interaction.frame.height
    const directionX = growsRight ? 1 : -1
    const directionY = growsDown ? 1 : -1
    const projectedWidth = interaction.frame.width + (
      directionX * dx + directionY * dy / targetAspect
    ) / (1 + 1 / targetAspect ** 2)
    const baseWidth = Math.min(canvas.width, canvas.height * targetAspect)
    const maxWidthX = growsRight ? canvas.width - oppositeX : oppositeX
    const maxWidthY = (growsDown ? canvas.height - oppositeY : oppositeY) * targetAspect
    const width = clamp(projectedWidth, baseWidth / 4, Math.min(baseWidth, maxWidthX, maxWidthY))
    const height = width / targetAspect
    const resized = {
      left: growsRight ? oppositeX : oppositeX - width,
      top: growsDown ? oppositeY : oppositeY - height,
      width,
      height,
    }
    updateCrop(cropFromFrame(resized, canvas, targetAspect), true)
  }

  const finishInteraction = (event: PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return
    interactionRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    renderCrop()
    setAnnouncedCrop(cropRef.current)
  }

  const handleFrameKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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
  const position = cropPosition(crop)
  const announcedPosition = announcedCrop ? cropPosition(announcedCrop) : null
  const cropTarget = previewShape === 'workspace'
    ? t('art.cropCurrentScreen', screenResolution)
    : t(previewShape === 'cover' ? 'art.cropTargetCover' : 'art.cropTargetHero')
  const frameStyle = {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    '--art-focus-x': `${crop.focusX * 100}%`,
    '--art-focus-y': `${crop.focusY * 100}%`,
    '--art-zoom': String(crop.zoom),
  } as CSSProperties
  const canvasStyle = {
    left: canvas.left,
    top: canvas.top,
    width: canvas.width,
    height: canvas.height,
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
          <div
            ref={stageRef}
            className={`art-crop-stage art-crop-stage--${previewShape}`}
            style={previewStyle as CSSProperties}
            onPointerMove={handlePointerMove}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
          >
            <span className="art-crop-target">{cropTarget}</span>
            <div className="art-crop-canvas" style={canvasStyle}>
              {previewUrl && (
                <img
                  className={previewReady ? '' : 'is-loading'}
                  src={previewUrl}
                  alt=""
                  draggable="false"
                  onLoad={(event) => {
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                    setPreviewReady(true)
                  }}
                  onError={reportLoadError}
                />
              )}
              {!previewReady && !error && (
                <span role="status" aria-live="polite">{t('art.cropLoading')}</span>
              )}
              {previewReady && (
                <div
                  className={`art-crop-preview art-crop-preview--${previewShape}`}
                  data-preview-mode={initialPreviewMode}
                  style={frameStyle}
                  role="group"
                  aria-label={t('art.cropPreviewPosition', position)}
                  tabIndex={0}
                  onKeyDown={handleFrameKeyDown}
                  onPointerDown={(event) => beginInteraction(event, 'move')}
                >
                  <span className="art-crop-grid" aria-hidden="true" />
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Corner[]).map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      className={`art-crop-handle art-crop-handle--${corner}`}
                      aria-label={t('art.cropResizeHandle')}
                      onKeyDown={handleFrameKeyDown}
                      onPointerDown={(event) => beginInteraction(event, 'resize', corner)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="art-crop-hint">{t('art.cropHint')}</p>
          <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {announcedPosition ? t('art.cropPreviewPosition', announcedPosition) : ''}
          </span>

          <div className="art-crop-controls">
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
            aria-busy={saving}
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
