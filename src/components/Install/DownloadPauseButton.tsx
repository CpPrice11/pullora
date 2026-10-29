import './DownloadPauseButton.css'
import { useState } from 'react'
import type { DownloadProgress } from '../../types'
import { useI18n } from '../../i18n'
import { PauseIcon, PlayIcon } from '../ui/Icons'
import { canCancel } from '../../utils/downloadProgress'
import { getLocalizedErrorMessage } from '../../services/tauri'

export default function DownloadPauseButton({ download, onChange, onError }: {
  download: DownloadProgress
  onChange: (id: string, paused: boolean) => Promise<void>
  onError: (error: unknown) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  if (!canCancel(download)) return null
  const label = t(download.paused ? 'download.resume' : 'download.pause')
  return <button type="button" className="repo-pause-download" disabled={busy} aria-busy={busy} aria-label={`${label}: ${download.fileName}`} title={label} onClick={(event) => {
    event.stopPropagation(); setBusy(true)
    void onChange(download.id, !download.paused).catch(error => onError(getLocalizedErrorMessage(error))).finally(() => setBusy(false))
  }}>{download.paused ? <PlayIcon /> : <PauseIcon />}</button>
}
