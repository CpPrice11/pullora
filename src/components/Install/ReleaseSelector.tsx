import { useEffect, useMemo, useRef, useState } from 'react'
import { useReleases } from '../../features/library/hooks/useGitHub'
import { useDownload } from '../../hooks/useDownload'
import { useSettings } from '../../hooks/useSettings'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { AppSettings, DownloadProgress, GitHubAsset, GitHubRelease } from '../../types'
import DownloadProgressPanel from './DownloadProgress'
import { openExternalUrl } from '../../services/updates'
import { pickDirectory } from '../../services/dialog'
import { validateInstallationPath } from '../../services/settings'
import StatePanel from '../State/StatePanel'
import { cleanupIncompleteInstalls, launchApp, openInstalledAppDir } from '../../services/installed'
import { useI18n } from '../../i18n'
import { compareVersionTags, formatBytes, formatDate } from '../../utils/format'
import {
  classifyReleaseAsset,
  classifyReleaseAssetArchitecture,
  classifyReleaseAssetCompatibility,
  releaseAssetKindLabelKey,
  type ReleaseAssetKind,
} from '../../features/library/releaseAssetClassifier'
import '../../features/library/components/SearchComponents.css'
import '../Modal/Modal.css'

interface ReleaseSelectorProps {
  owner: string
  repo: string
  displayName: string
  description?: string
  currentVersion?: string
  initialReleaseTag?: string | null
  onClose: () => void
  onInstalled?: () => void
}

type AssetKind = ReleaseAssetKind
type WizardStep = 'version' | 'file' | 'confirm' | 'progress' | 'result'
type InstallIntent = 'install' | 'update' | 'reinstall' | 'downgrade'
type AssetStrategy = NonNullable<AppSettings['assetStrategy']>
type CleanupResult = { tone: 'success' | 'warning'; message: string }

const wizardSteps: WizardStep[] = ['version', 'file', 'confirm', 'progress', 'result']

function getAssetKind(asset: GitHubAsset): AssetKind {
  return classifyReleaseAsset(asset)
}

function assetKindKey(kind: AssetKind) {
  return releaseAssetKindLabelKey(kind)
}

function releaseStatusKey(release: GitHubRelease, latestTag: string | null, currentVersion?: string) {
  if (currentVersion && release.tag_name === currentVersion) return 'release.statusCurrent'
  if (latestTag && release.tag_name === latestTag) return 'release.statusLatest'
  if (currentVersion && compareVersionTags(release.tag_name, currentVersion) < 0) return 'release.statusOlder'
  return 'release.statusVersion'
}

function releaseStabilityKey(release: GitHubRelease) {
  return release.prerelease ? 'release.statusPrerelease' : 'release.statusStable'
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
  if (strategy === 'installerFirst') {
    return sortedAssets.find((asset) => isAutoInstallable(getAssetKind(asset))) ?? null
  }
  return sortedAssets.find((asset) => isAutoInstallable(getAssetKind(asset))) ?? null
}

function strategyHelpKey(strategy: AssetStrategy) {
  switch (strategy) {
    case 'portableFirst': return 'release.strategyPortableFirst'
    case 'installerFirst': return 'release.strategyInstallerFirst'
    case 'manual': return 'release.strategyManual'
  }
}

function stepLabel(step: WizardStep, t: (key: string) => string, failedResult = false) {
  switch (step) {
    case 'version': return t('release.stepVersion')
    case 'file': return t('release.stepFile')
    case 'confirm': return t('release.stepConfirm')
    case 'progress': return t('release.stepProgress')
    case 'result': return failedResult ? t('release.stepResultFailed') : t('release.stepResult')
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
  initialReleaseTag,
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
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null)
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null)
  const [installPath, setInstallPath] = useState(settings.installationPath ?? '')
  const modalRef = useRef<HTMLDivElement | null>(null)
  const previousStepRef = useRef<WizardStep>(step)
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
  const selectedAssetArchitecture = selectedAsset
    ? classifyReleaseAssetArchitecture(selectedAsset)
    : 'unknown'
  const selectedAssetCompatible = selectedAsset
    ? classifyReleaseAssetCompatibility(selectedAsset).compatible
    : false
  const selectedAssetAutoInstallable = isAutoInstallable(selectedAssetKind)
  const activeDownload = activeDownloadId
    ? downloads.find((item) => item.id === activeDownloadId)
    : null
  const shownDownloads = activeDownload ? [activeDownload] : downloads
  const failedResult = Boolean(downloadError || activeDownload?.status === 'failed')
  const resultState = failedResult
    ? 'error'
    : cleanupResult?.tone === 'warning'
      ? 'warning'
      : activeDownload?.status === 'completed'
        ? 'success'
        : undefined
  const installActive = downloading
    || Boolean(activeDownload && !['completed', 'failed'].includes(activeDownload.status))
    || (step === 'progress' && !activeDownload && !downloadError)

  const requestClose = () => {
    if (!installActive) onClose()
  }

  const latestStableTag = useMemo(() => {
    const latest = visibleReleases.find((release) => !release.draft && !release.prerelease)
    return latest?.tag_name ?? visibleReleases[0]?.tag_name ?? null
  }, [visibleReleases])

  const selectedReleaseDate = selectedRelease?.published_at
    ? formatDate(selectedRelease.published_at, language)
    : t('about.noDate')
  const selectedReleaseStatus = selectedRelease
    ? t(releaseStatusKey(selectedRelease, latestStableTag, currentVersion))
    : null
  const installIntent = getInstallIntent(selectedRelease?.tag_name, currentVersion)

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  useEffect(() => {
    if (!installPath.trim() && settings.installationPath) {
      setInstallPath(settings.installationPath)
    }
  }, [installPath, settings.installationPath])

  useModalFocus(modalRef, { onEscape: installActive ? undefined : requestClose })

  useEffect(() => {
    if (previousStepRef.current === step) return
    previousStepRef.current = step

    const focusTimer = window.setTimeout(() => {
      const currentStep = modalRef.current?.querySelector<HTMLButtonElement>(
        `[data-wizard-step="${step}"]`,
      )
      const stepContext = modalRef.current?.querySelector<HTMLElement>('.release-wizard-context')
      ;(currentStep && !currentStep.disabled ? currentStep : stepContext)?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [step])

  useEffect(() => {
    if (visibleReleases.length > 0 && !selectedRelease) {
      const first = visibleReleases.find((release) => release.tag_name === initialReleaseTag)
        ?? visibleReleases[0]
      setSelectedRelease(first)
      setSelectedAsset(
        pickRecommendedAsset(first.assets, assetStrategy)
          ?? sortAssets(first.assets, assetStrategy)[0]
          ?? null,
      )
    }
  }, [assetStrategy, initialReleaseTag, selectedRelease, visibleReleases])

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
    const targetInstallPath = installPath.trim()
    if (!targetInstallPath) {
      setDownloadError(t('release.installPathRequired'))
      setStep('confirm')
      return
    }

    try {
      const validation = await validateInstallationPath(targetInstallPath)
      if (!validation.ok) {
        setDownloadError(validation.status === 'missing'
          ? t('release.installPathRequired')
          : t('release.installPathUnavailable'))
        setStep('confirm')
        return
      }

      if (validation.status === 'requiresElevation' && selectedAssetKind !== 'installer') {
        setDownloadError(t('release.installPathRequiresWritable'))
        setStep('confirm')
        return
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : t('release.installPathUnavailable'))
      setStep('confirm')
      return
    }

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
        targetInstallPath,
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
      setCleanupResult({ tone: 'success', message: t('download.cleanupDone', { count }) })
    } catch (err) {
      setCleanupResult({
        tone: 'warning',
        message: err instanceof Error ? err.message : t('download.cleanupError'),
      })
    }
  }

  const githubReleaseUrl = `https://github.com/${owner}/${repo}/releases/tag/${selectedRelease?.tag_name ?? ''}`
  const handleOpenGithubRelease = () => {
    void openExternalUrl(githubReleaseUrl).catch(() => {})
  }

  const handleChooseInstallPath = async () => {
    const dir = await pickDirectory()
    if (dir) {
      setInstallPath(dir)
      setDownloadError(null)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        ref={modalRef}
        className="modal-content release-modal release-modal--wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-selector-title"
        aria-busy={installActive}
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
            onClick={requestClose}
            disabled={installActive}
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
                data-wizard-step={item}
                className={`release-step-pill ${item === step ? 'active' : ''} ${itemIndex < currentIndex ? 'done' : ''}`}
                onClick={() => itemIndex <= currentIndex && setStep(item)}
                disabled={itemIndex > currentIndex || installActive}
                aria-current={item === step ? 'step' : undefined}
                aria-label={`${stepLabel(item, t, failedResult)}. ${t(stepHelpKey(item))}`}
                data-autofocus={item === step ? 'true' : undefined}
              >
                {stepLabel(item, t, failedResult)}
              </button>
            )
          })}
        </div>

        <div className="release-wizard-context" tabIndex={-1}>
          <span>{stepLabel(step, t, failedResult)}</span>
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
            <div
              className="release-wizard-panel"
              data-result-state={step === 'result' ? resultState : undefined}
            >
              {step === 'version' && (
                <>
                  <div className="release-picker">
                    <span className="release-section-label">{t('release.version')}</span>
                    <div className="release-version-list">
                      {visibleReleases.map((release) => {
                        const isSelected = selectedRelease?.id === release.id
                        const releaseDate = release.published_at
                          ? formatDate(release.published_at, language)
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
                            <span className="release-version-badges">
                              <span className={`release-status-pill release-stability-pill ${release.prerelease ? 'prerelease' : ''}`}>
                                {t(releaseStabilityKey(release))}
                              </span>
                              <span className="release-status-pill">
                                {t(releaseStatusKey(release, latestStableTag, currentVersion))}
                              </span>
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
                          <span className="release-version-badges release-version-badges--summary">
                            <span className={`release-status-pill release-stability-pill ${selectedRelease.prerelease ? 'prerelease' : ''}`}>
                              {t(releaseStabilityKey(selectedRelease))}
                            </span>
                            <span className="release-status-pill">
                              {selectedReleaseStatus}
                            </span>
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
                          const compatibility = classifyReleaseAssetCompatibility(asset)
                          const kind = compatibility.kind
                          const architecture = compatibility.architecture
                          const isSelected = selectedAsset?.id === asset.id
                          const disabled = !compatibility.compatible

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
                                <span className="release-asset-meta">
                                  <span className="release-asset-size">{formatBytes(asset.size, language)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="release-asset-architecture">{t(`store.architecture.${architecture}`)}</span>
                                </span>
                              </span>
                              <span className="release-asset-badges">
                                <span className="asset-kind">{t(assetKindKey(kind))}</span>
                                <span className={`asset-compatibility ${compatibility.compatible ? 'compatible' : 'incompatible'}`}>
                                  {t(compatibility.compatible
                                    ? 'store.compatibility.compatible'
                                    : 'store.compatibility.incompatible')}
                                </span>
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
                        <span className="asset-architecture">
                          {t(`store.architecture.${selectedAssetArchitecture}`)}
                        </span>
                        <span className={`asset-compatibility ${selectedAssetCompatible ? 'compatible' : 'incompatible'}`}>
                          {t(selectedAssetCompatible
                            ? 'store.compatibility.compatible'
                            : 'store.compatibility.incompatible')}
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
                        <span>{t('release.fileDetails')}</span>
                        <strong>
                          {selectedAssetKind ? t(assetKindKey(selectedAssetKind)) : t('release.assetTypeUnsupported')}
                          {' · '}
                          {t(`store.architecture.${selectedAssetArchitecture}`)}
                        </strong>
                      </div>
                      <div>
                        <span>{t('release.size')}</span>
                        <strong>{formatBytes(selectedAsset.size, language)}</strong>
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
                    <section className="release-notes-card" aria-labelledby="release-notes-title">
                      <h3 id="release-notes-title">{t('release.notesTitle')}</h3>
                      <div className="release-notes-content">
                        {selectedRelease.body?.trim() || t('release.notesEmpty')}
                      </div>
                    </section>
                    <div className="release-install-path">
                      <span>{t('release.installPath')}</span>
                      <strong>{installPath || t('release.installPathNotSelected')}</strong>
                      <button type="button" className="release-secondary-btn" onClick={handleChooseInstallPath} disabled={downloading}>
                        {t('release.chooseInstallPath')}
                      </button>
                    </div>
                    <div className="release-blocked-note release-confirm-warning" role="note">
                      <strong>{t('release.confirmWarningTitle')}</strong>
                      <p>{t('release.confirmWarningText')}</p>
                      {selectedAssetKind === 'installer' && (
                        <p>{t('release.installerSupportedHelp')}</p>
                      )}
                    </div>
                  </div>

                  {downloadError && <div className="error-message" role="alert">{downloadError}</div>}

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
                    <div className="download-recovery release-result-card" role="alert">
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
                  {cleanupResult && (
                    <div
                      className={`release-cleanup-note ${cleanupResult.tone}`}
                      role={cleanupResult.tone === 'warning' ? 'alert' : 'status'}
                      aria-live={cleanupResult.tone === 'warning' ? 'assertive' : 'polite'}
                      aria-atomic="true"
                    >
                      {cleanupResult.message}
                    </div>
                  )}
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
