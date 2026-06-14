import { useEffect, useMemo, useRef, useState } from 'react'
import { useReleases } from '../../features/library/hooks/useGitHub'
import { useDownload } from '../../hooks/useDownload'
import { useSettings } from '../../hooks/useSettings'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { AppSettings, DownloadProgress, GitHubAsset, GitHubRelease } from '../../types'
import DownloadProgressPanel from './DownloadProgress'
import { openExternalUrl } from '../../services/updates'
import StatePanel from '../State/StatePanel'
import { cleanupIncompleteInstalls, launchApp, openInstalledAppDir } from '../../services/installed'
import { useI18n } from '../../i18n'
import '../../features/library/components/SearchComponents.css'
import '../Modal/Modal.css'

interface ReleaseSelectorProps {
  owner: string
  repo: string
  displayName: string
  description?: string
  currentVersion?: string
  onClose: () => void
  onInstalled?: () => void
}

type AssetKind = 'portable' | 'installer' | 'archive' | 'unsupported'
type WizardStep = 'version' | 'file' | 'confirm' | 'progress' | 'result'
type InstallIntent = 'install' | 'update' | 'reinstall' | 'downgrade'
type AssetStrategy = NonNullable<AppSettings['assetStrategy']>

const wizardSteps: WizardStep[] = ['version', 'file', 'confirm', 'progress', 'result']

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getAssetKind(asset: GitHubAsset): AssetKind {
  const name = asset.name.toLowerCase()
  const isInstaller = name.includes('setup') ||
    name.includes('installer') ||
    name.endsWith('.msi')

  if (isInstaller) return 'installer'
  if (name.includes('portable') || name.endsWith('.appimage')) return 'portable'
  if (name.endsWith('.zip') || name.endsWith('.tar.gz') || name.endsWith('.tar.xz')) return 'archive'
  if (name.endsWith('.exe')) return 'portable'
  return 'unsupported'
}

function assetKindKey(kind: AssetKind) {
  switch (kind) {
    case 'portable': return 'release.assetTypePortable'
    case 'installer': return 'release.assetTypeInstaller'
    case 'archive': return 'release.assetTypeArchive'
    case 'unsupported': return 'release.assetTypeUnsupported'
  }
}

function compareVersionTags(left: string, right: string) {
  const leftParts = left.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = right.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function releaseStatusKey(release: GitHubRelease, latestTag: string | null, currentVersion?: string) {
  if (currentVersion && release.tag_name === currentVersion) return 'release.statusCurrent'
  if (release.prerelease) return 'release.statusPrerelease'
  if (latestTag && release.tag_name === latestTag) return 'release.statusLatest'
  if (currentVersion && compareVersionTags(release.tag_name, currentVersion) < 0) return 'release.statusOlder'
  return 'release.statusVersion'
}

function getInstallIntent(tag: string | undefined, currentVersion?: string): InstallIntent {
  if (!tag || !currentVersion) return 'install'
  const diff = compareVersionTags(tag, currentVersion)
  if (diff > 0) return 'update'
  if (diff < 0) return 'downgrade'
  return 'reinstall'
}

function intentKey(intent: InstallIntent) {
  switch (intent) {
    case 'install': return 'release.actionInstall'
    case 'update': return 'release.actionUpdate'
    case 'reinstall': return 'release.actionReinstall'
    case 'downgrade': return 'release.actionDowngrade'
  }
}

function isAutoInstallable(kind: AssetKind | null) {
  return kind === 'portable' || kind === 'archive' || kind === 'installer'
}

function sortAssets(assets: GitHubAsset[], strategy: AssetStrategy) {
  if (strategy === 'manual') return [...assets]

  const rank = (asset: GitHubAsset) => {
    const kind = getAssetKind(asset)
    if (strategy === 'installerFirst') {
      if (kind === 'installer') return 0
      if (kind === 'portable') return 1
      if (kind === 'archive') return 2
      return 3
    }

    if (kind === 'portable') return 0
    if (kind === 'archive') return 1
    if (kind === 'installer') return 2
    return 3
  }

  return [...assets].sort((left, right) => {
    const rankDiff = rank(left) - rank(right)
    if (rankDiff !== 0) return rankDiff
    return left.name.localeCompare(right.name)
  })
}

function pickRecommendedAsset(assets: GitHubAsset[], strategy: AssetStrategy): GitHubAsset | null {
  if (strategy === 'manual') return null
  const sortedAssets = sortAssets(assets, strategy)
  if (strategy === 'installerFirst') return sortedAssets[0] ?? null
  return sortedAssets.find((asset) => isAutoInstallable(getAssetKind(asset))) ?? null
}

function strategyHelpKey(strategy: AssetStrategy) {
  switch (strategy) {
    case 'portableFirst': return 'release.strategyPortableFirst'
    case 'installerFirst': return 'release.strategyInstallerFirst'
    case 'manual': return 'release.strategyManual'
  }
}

function stepLabel(step: WizardStep, t: (key: string) => string) {
  switch (step) {
    case 'version': return t('release.stepVersion')
    case 'file': return t('release.stepFile')
    case 'confirm': return t('release.stepConfirm')
    case 'progress': return t('release.stepProgress')
    case 'result': return t('release.stepResult')
  }
}

function stepHelpKey(step: WizardStep) {
  switch (step) {
    case 'version': return 'release.stepVersionHelp'
    case 'file': return 'release.stepFileHelp'
    case 'confirm': return 'release.stepConfirmHelp'
    case 'progress': return 'release.stepProgressHelp'
    case 'result': return 'release.stepResultHelp'
    default: return 'release.stepVersionHelp'
  }
}

function ReleaseSelector({
  owner,
  repo,
  displayName,
  description,
  currentVersion,
  onClose,
  onInstalled,
}: ReleaseSelectorProps) {
  const { language, t } = useI18n()
  const { releases, loading, error, fetchReleases } = useReleases(owner, repo)
  const { downloads, download, cancel } = useDownload()
  const { settings } = useSettings()
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<GitHubAsset | null>(null)
  const [step, setStep] = useState<WizardStep>('version')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const reportedCompletedDownloads = useRef<Set<string>>(new Set())
  const assetStrategy = settings.assetStrategy ?? 'portableFirst'

  const visibleReleases = useMemo(
    () => releases.filter((release) =>
      settings.includePrereleases ? !release.draft : !release.draft && !release.prerelease,
    ),
    [releases, settings.includePrereleases],
  )

  const sortedAssets = useMemo(
    () => selectedRelease ? sortAssets(selectedRelease.assets, assetStrategy) : [],
    [assetStrategy, selectedRelease],
  )

  const recommendedAsset = useMemo(
    () => selectedRelease ? pickRecommendedAsset(selectedRelease.assets, assetStrategy) : null,
    [assetStrategy, selectedRelease],
  )

  const selectedAssetKind = selectedAsset ? getAssetKind(selectedAsset) : null
  const selectedAssetAutoInstallable = isAutoInstallable(selectedAssetKind)
  const activeDownload = activeDownloadId
    ? downloads.find((item) => item.id === activeDownloadId)
    : null
  const shownDownloads = activeDownload ? [activeDownload] : downloads

  const latestStableTag = useMemo(() => {
    const latest = visibleReleases.find((release) => !release.draft && !release.prerelease)
    return latest?.tag_name ?? visibleReleases[0]?.tag_name ?? null
  }, [visibleReleases])

  const selectedReleaseDate = selectedRelease?.published_at
    ? new Date(selectedRelease.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
    : t('about.noDate')
  const selectedReleaseStatus = selectedRelease
    ? t(releaseStatusKey(selectedRelease, latestStableTag, currentVersion))
    : null
  const installIntent = getInstallIntent(selectedRelease?.tag_name, currentVersion)

  useEffect(() => {
    fetchReleases(true)
  }, [fetchReleases])

  useModalFocus(modalRef, { onEscape: downloading ? undefined : onClose })

  useEffect(() => {
    if (visibleReleases.length > 0 && !selectedRelease) {
      const first = visibleReleases[0]
      setSelectedRelease(first)
      setSelectedAsset(
        pickRecommendedAsset(first.assets, assetStrategy)
          ?? sortAssets(first.assets, assetStrategy)[0]
          ?? null,
      )
    }
  }, [assetStrategy, selectedRelease, visibleReleases])

  useEffect(() => {
    if (!activeDownload) return

    if (
      activeDownload.status === 'completed' &&
      !reportedCompletedDownloads.current.has(activeDownload.id)
    ) {
      reportedCompletedDownloads.current.add(activeDownload.id)
      setStep('result')
      onInstalled?.()
    }

    if (activeDownload.status === 'failed') {
      setStep('result')
    }
  }, [activeDownload, onInstalled])

  const handleReleaseChange = (release: GitHubRelease) => {
    setSelectedRelease(release)
    setSelectedAsset(
      pickRecommendedAsset(release.assets, assetStrategy)
        ?? sortAssets(release.assets, assetStrategy)[0]
        ?? null,
    )
    setDownloadError(null)
  }

  const handleDownload = async () => {
    if (!selectedAsset || !selectedRelease || !selectedAssetAutoInstallable) return
    setDownloading(true)
    setDownloadError(null)
    setStep('progress')
    try {
      const id = await download(
        selectedAsset.browser_download_url,
        selectedAsset.name,
        owner,
        repo,
        selectedRelease.tag_name,
      )
      setActiveDownloadId(id)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t('release.downloadFailed'))
      setStep('result')
    } finally {
      setDownloading(false)
    }
  }

  const handleRetry = () => {
    void handleDownload()
  }

  const handleLaunch = (item: DownloadProgress) => {
    if (!item.owner || !item.repo) return
    launchApp(item.owner, item.repo).catch(() => {})
  }

  const handleOpenFolder = (item: DownloadProgress) => {
    if (!item.owner || !item.repo) return
    openInstalledAppDir(item.owner, item.repo).catch(() => {})
  }

  const handleCleanup = async () => {
    try {
      const count = await cleanupIncompleteInstalls()
      setCleanupMessage(t('download.cleanupDone', { count }))
    } catch (err) {
      setCleanupMessage(err instanceof Error ? err.message : t('download.cleanupError'))
    }
  }

  const githubReleaseUrl = `https://github.com/${owner}/${repo}/releases/tag/${selectedRelease?.tag_name ?? ''}`
  const handleOpenGithubRelease = () => {
    void openExternalUrl(githubReleaseUrl).catch(() => {})
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content release-modal release-modal--wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-selector-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="release-selector-title">{displayName}</h2>
            <div className="release-modal-meta">
              <span>{t('release.repository', { owner, repo })}</span>
              {currentVersion && (
                <span>{t('release.currentInstalled', { version: currentVersion })}</span>
              )}
            </div>
            {description && <p className="modal-subtitle">{description}</p>}
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label={t('release.close')}
          >
            {'\u00d7'}
          </button>
        </div>

        <div className="release-wizard-steps" role="group" aria-label={t('release.wizardSteps')}>
          {wizardSteps.map((item) => {
            const currentIndex = wizardSteps.indexOf(step)
            const itemIndex = wizardSteps.indexOf(item)
            return (
              <button
                key={item}
                type="button"
                className={`release-step-pill ${item === step ? 'active' : ''} ${itemIndex < currentIndex ? 'done' : ''}`}
                onClick={() => itemIndex <= currentIndex && setStep(item)}
                disabled={itemIndex > currentIndex || downloading}
                aria-current={item === step ? 'step' : undefined}
                aria-label={`${stepLabel(item, t)}. ${t(stepHelpKey(item))}`}
                data-autofocus={item === step ? 'true' : undefined}
              >
                {stepLabel(item, t)}
              </button>
            )
          })}
        </div>

        <div className="release-wizard-context">
          <span>{stepLabel(step, t)}</span>
          <p>{t(stepHelpKey(step))}</p>
        </div>

        <div className="release-body">
          {loading && <StatePanel kind="loading" title={t('release.loading')} skeletonCount={3} />}
          {!loading && error && (
            <StatePanel
              kind="error"
              title={t('state.releaseErrorTitle')}
              message={t('state.releaseErrorText')}
              details={error}
              detailsLabel={t('state.details')}
              actionLabel={t('about.retry')}
              onAction={() => fetchReleases(true)}
            />
          )}

          {!loading && !error && visibleReleases.length === 0 && (
            <StatePanel
              kind="empty"
              title={t('release.noReleases')}
              message={t('state.releaseEmptyText')}
            />
          )}

          {!loading && !error && visibleReleases.length > 0 && (
            <div className="release-wizard-panel">
              {step === 'version' && (
                <>
                  <div className="release-picker">
                    <span className="release-section-label">{t('release.version')}</span>
                    <div className="release-version-list">
                      {visibleReleases.map((release) => {
                        const isSelected = selectedRelease?.id === release.id
                        const releaseDate = release.published_at
                          ? new Date(release.published_at).toLocaleDateString(language === 'en' ? 'en-US' : 'uk-UA')
                          : t('about.noDate')

                        return (
                          <button
                            key={release.id}
                            type="button"
                            className={`release-version-card ${isSelected ? 'active' : ''}`}
                            onClick={() => handleReleaseChange(release)}
                            aria-pressed={isSelected}
                          >
                            <span className="release-version-main">
                              <strong>{release.tag_name}</strong>
                              <span>{releaseDate}</span>
                            </span>
                            <span className={`release-status-pill ${release.prerelease ? 'prerelease' : ''}`}>
                              {t(releaseStatusKey(release, latestStableTag, currentVersion))}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {selectedRelease && (
                    <div className="release-selection-summary">
                      <span className="release-summary-kicker">{t('release.selectedVersion')}</span>
                      <div className="release-summary-main">
                        <strong>{selectedRelease.tag_name}</strong>
                        {selectedReleaseStatus && (
                          <span className={`release-status-pill ${selectedRelease.prerelease ? 'prerelease' : ''}`}>
                            {selectedReleaseStatus}
                          </span>
                        )}
                      </div>
                      <p>{selectedReleaseDate}</p>
                      <span className="release-summary-assets">
                        {t('release.filesCount', { count: selectedRelease.assets.length })}
                      </span>
                    </div>
                  )}

                  <div className="release-nav-actions">
                    <button
                      type="button"
                      className="download-btn release-action-primary"
                      onClick={() => setStep('file')}
                      disabled={!selectedRelease}
                    >
                      {t('release.next')}
                    </button>
                  </div>
                </>
              )}

              {step === 'file' && selectedRelease && (
                <>
                  {sortedAssets.length > 0 ? (
                    <div className="release-picker">
                      <span className="release-section-label">{t('release.file')}</span>
                      <p className="release-strategy-note">{t(strategyHelpKey(assetStrategy))}</p>
                      <p className="release-strategy-note">{t('release.autoInstallOnly')}</p>
                      <div className="release-asset-list">
                        {sortedAssets.map((asset) => {
                          const kind = getAssetKind(asset)
                          const isSelected = selectedAsset?.id === asset.id
                          const disabled = kind === 'unsupported'

                          return (
                            <button
                              key={asset.id}
                              type="button"
                              className={`release-asset-card release-asset-card--${kind} ${isSelected ? 'active' : ''}`}
                              onClick={() => setSelectedAsset(asset)}
                              disabled={disabled}
                              aria-pressed={isSelected}
                            >
                              <span className="release-asset-main">
                                <strong>{asset.name}</strong>
                                <span>{formatBytes(asset.size)}</span>
                              </span>
                              <span className="release-asset-badges">
                                <span className="asset-kind">{t(assetKindKey(kind))}</span>
                                {recommendedAsset?.id === asset.id && (
                                  <span className="asset-recommended">{t('release.recommended')}</span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="no-assets">{t('release.noAssets')}</p>
                  )}

                  {selectedAsset && (
                    <div className={`asset-summary asset-summary--${selectedAssetKind}`}>
                      <div>
                        <span className="asset-kind">
                          {selectedAssetKind ? t(assetKindKey(selectedAssetKind)) : t('release.assetTypeUnsupported')}
                        </span>
                        {recommendedAsset?.id === selectedAsset.id && (
                          <span className="asset-recommended">{t('release.recommended')}</span>
                        )}
                      </div>
                      <span>{selectedAsset.name}</span>
                      {selectedAssetKind === 'installer' && <p>{t('release.installerSupportedText')}</p>}
                      {selectedAssetKind === 'unsupported' && <p>{t('release.unsupportedWarning')}</p>}
                      {selectedAssetAutoInstallable && (
                        <p>{t('release.installSummary', { version: selectedRelease.tag_name, file: selectedAsset.name })}</p>
                      )}
                    </div>
                  )}

                  {selectedAssetKind === 'installer' && (
                    <div className="release-blocked-note release-installer-note">
                      <strong>{t('release.installerSupportedTitle')}</strong>
                      <p>{t('release.installerSupportedHelp')}</p>
                    </div>
                  )}

                  <div className="release-nav-actions">
                    <button type="button" className="release-secondary-btn" onClick={() => setStep('version')}>
                      {t('release.back')}
                    </button>
                    <button
                      type="button"
                      className="download-btn release-action-primary"
                      onClick={() => setStep('confirm')}
                      disabled={!selectedAssetAutoInstallable}
                    >
                      {t('release.next')}
                    </button>
                    <button type="button" className="view-release-link release-github-link" onClick={handleOpenGithubRelease}>
                      GitHub
                    </button>
                  </div>
                </>
              )}

              {step === 'confirm' && selectedRelease && selectedAsset && (
                <>
                  <div className="release-confirm-card">
                    <span className="release-section-label">{t('release.confirmTitle')}</span>
                    <div className="release-confirm-grid">
                      <div>
                        <span>{t('release.version')}</span>
                        <strong>{selectedRelease.tag_name}</strong>
                      </div>
                      <div>
                        <span>{t('release.file')}</span>
                        <strong>{selectedAsset.name}</strong>
                      </div>
                      <div>
                        <span>{t('release.fileType')}</span>
                        <strong>{selectedAssetKind ? t(assetKindKey(selectedAssetKind)) : t('release.assetTypeUnsupported')}</strong>
                      </div>
                      <div>
                        <span>{t('release.size')}</span>
                        <strong>{formatBytes(selectedAsset.size)}</strong>
                      </div>
                      <div>
                        <span>{t('release.currentVersion')}</span>
                        <strong>{currentVersion ?? t('release.notInstalled')}</strong>
                      </div>
                      <div>
                        <span>{t('release.installAction')}</span>
                        <strong>{t(intentKey(installIntent))}</strong>
                      </div>
                    </div>
                    <div className="release-install-path">
                      <span>{t('release.installPath')}</span>
                      <strong>{settings.installationPath}</strong>
                    </div>
                  </div>

                  {downloadError && <div className="error-message">{downloadError}</div>}

                  <div className="release-nav-actions">
                    <button type="button" className="release-secondary-btn" onClick={() => setStep('file')} disabled={downloading}>
                      {t('release.back')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={!selectedAssetAutoInstallable || downloading}
                      className="download-btn release-action-primary"
                    >
                      {downloading
                        ? t('release.starting')
                        : selectedAssetKind === 'installer'
                          ? t('release.runInstaller')
                          : t('release.confirmInstall')}
                    </button>
                  </div>
                </>
              )}

              {(step === 'progress' || step === 'result') && (
                <>
                  {downloadError && (
                    <div className="download-recovery release-result-card">
                      <strong>{t('release.failedTitle')}</strong>
                      <p>{downloadError}</p>
                      <div className="download-actions">
                        <button type="button" className="download-action-btn primary" onClick={handleRetry}>
                          {t('download.retry')}
                        </button>
                        <button type="button" className="download-action-btn" onClick={() => setStep('file')}>
                          {t('download.chooseAnother')}
                        </button>
                      </div>
                    </div>
                  )}
                  {cleanupMessage && <div className="release-cleanup-note">{cleanupMessage}</div>}
                  <DownloadProgressPanel
                    downloads={shownDownloads}
                    onCancel={cancel}
                    onLaunch={handleLaunch}
                    onOpenFolder={handleOpenFolder}
                    onBackToLibrary={onClose}
                    onRetry={handleRetry}
                    onChooseAnother={() => setStep('file')}
                    onCleanup={handleCleanup}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReleaseSelector
