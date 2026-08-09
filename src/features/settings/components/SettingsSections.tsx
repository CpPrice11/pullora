import type { CSSProperties } from 'react'
import NativeSelect from '../../../components/Select/NativeSelect'
import StatePanel from '../../../components/State/StatePanel'
import { StatusIcon } from '../../../components/ui/Icons'
import { useI18n, type AppLanguage } from '../../../i18n'
import type {
  AppSettings,
  GitHubQueueStatus,
  GitHubRateLimitStatus,
  InstallPathValidation,
  LauncherStorageInfo,
} from '../../../types'
import { formatBytes } from '../../../utils/format'
import type { ResolvedTheme, ThemePreference } from '../../../utils/theme'
import { parseEventLogEntry } from '../eventLog'

export type SettingsSectionId = 'general' | 'events' | 'maintenance'

type PathValidation = 'idle' | InstallPathValidation['status']
type SurfaceSetting = 'surfaceTransparency' | 'surfaceBlur'

interface GeneralSettingsSectionProps {
  settings: AppSettings
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: AppLanguage) => void
  onChangeLauncherBackground: (theme: ResolvedTheme) => void
  onClearLauncherBackground: (theme: ResolvedTheme) => void
  onPreviewSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onCommitSurfaceSetting: (key: SurfaceSetting, value: number) => void
  pathValidation: PathValidation
  onBrowse: () => void
  onValidatePath: () => void
  onOpenDirectory: (path: string) => void
}

const rangeProgressStyle = (value: number, min: number, max: number) => ({
  '--range-progress': `${((value - min) / (max - min)) * 100}%`,
}) as CSSProperties

function GeneralSettingsSection({
  settings,
  hasLauncherBackground,
  onThemeChange,
  onLanguageChange,
  onChangeLauncherBackground,
  onClearLauncherBackground,
  onPreviewSurfaceSetting,
  onCommitSurfaceSetting,
  pathValidation,
  onBrowse,
  onValidatePath,
  onOpenDirectory,
}: GeneralSettingsSectionProps) {
  const { t } = useI18n()
  const surfaceTransparency = settings.appearance?.surfaceTransparency ?? 42
  const surfaceBlur = settings.appearance?.surfaceBlur ?? 12

  return (
    <section id="settings-general" className="settings-section">
      <h3>{t('settings.general')}</h3>
      <div className="settings-grid">
        <div className="settings-source-summary settings-grid-wide">
          <div className="settings-source-summary-owner">
            <span className="settings-reset-kicker">{t('settings.sourceSummary')}</span>
            <strong>CpPrice11</strong>
          </div>
          <div className="settings-source-summary-copy">
            <p>{t('settings.sourceSummaryText')}</p>
            <p>{t('settings.githubTokenHelp')}</p>
          </div>
        </div>

        <div className="form-group compact-control">
          <label htmlFor="theme">{t('settings.theme')}</label>
          <NativeSelect
            id="theme"
            value={settings.theme}
            onValueChange={(value) => onThemeChange(value as ThemePreference)}
            options={([
              ['light', t('settings.light')],
              ['dark', t('settings.dark')],
              ['auto', t('settings.auto')],
            ] as const).map(([value, label]) => ({ value, label }))}
          />
        </div>

        <div className="form-group compact-control">
          <label htmlFor="language">{t('settings.language')}</label>
          <NativeSelect
            id="language"
            value={settings.language}
            onValueChange={(value) => onLanguageChange(value as AppLanguage)}
            options={([
              ['uk', t('settings.ukrainian')],
              ['en', t('settings.english')],
            ] as const).map(([value, label]) => ({ value, label }))}
          />
        </div>

        <div className="form-group launcher-background-control">
          <label>{t('settings.launcherBackground')}</label>
          <div className="launcher-background-themes">
            {(['light', 'dark'] as const).map((theme) => (
              <div className="launcher-background-theme" key={theme}>
                <strong>{t(`settings.${theme}`)}</strong>
                <div className="settings-inline-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    aria-label={t('art.changeThemeBackground', { theme: t(`settings.${theme}`) })}
                    onClick={() => onChangeLauncherBackground(theme)}
                  >
                    {t('settings.editAction')}
                  </button>
                  {hasLauncherBackground[theme] && (
                    <button
                      type="button"
                      className="secondary-btn"
                      aria-label={t('art.resetThemeBackground', { theme: t(`settings.${theme}`) })}
                      onClick={() => onClearLauncherBackground(theme)}
                    >
                      {t('settings.resetAction')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <fieldset className="form-group underlay-controls">
          <legend>{t('settings.underlayAppearance')}</legend>
          <div className="underlay-control">
            <label htmlFor="surfaceTransparency">{t('settings.surfaceTransparency')}</label>
            <input
              id="surfaceTransparency"
              type="range"
              min="0"
              max="80"
              step="1"
              value={surfaceTransparency}
              style={rangeProgressStyle(surfaceTransparency, 0, 80)}
              aria-valuetext={`${surfaceTransparency}%`}
              onChange={(event) => onPreviewSurfaceSetting('surfaceTransparency', Number(event.target.value))}
              onKeyUp={(event) => onCommitSurfaceSetting('surfaceTransparency', Number(event.currentTarget.value))}
              onPointerUp={(event) => onCommitSurfaceSetting('surfaceTransparency', Number(event.currentTarget.value))}
            />
            <output className="settings-range-value" htmlFor="surfaceTransparency">
              {surfaceTransparency}%
            </output>
          </div>
          <div className="underlay-control">
            <label htmlFor="surfaceBlur">{t('settings.surfaceBlur')}</label>
            <input
              id="surfaceBlur"
              type="range"
              min="0"
              max="32"
              step="1"
              value={surfaceBlur}
              style={rangeProgressStyle(surfaceBlur, 0, 32)}
              aria-valuetext={`${surfaceBlur} px`}
              onChange={(event) => onPreviewSurfaceSetting('surfaceBlur', Number(event.target.value))}
              onKeyUp={(event) => onCommitSurfaceSetting('surfaceBlur', Number(event.currentTarget.value))}
              onPointerUp={(event) => onCommitSurfaceSetting('surfaceBlur', Number(event.currentTarget.value))}
            />
            <output className="settings-range-value" htmlFor="surfaceBlur">
              {surfaceBlur} px
            </output>
          </div>
        </fieldset>

        <div className="form-group settings-grid-wide">
          <label htmlFor="installPath">{t('settings.installPath')}</label>
          <div className="path-input-row">
            <input
              id="installPath"
              type="text"
              value={settings.installationPath}
              readOnly
              aria-describedby={pathValidation !== 'idle' ? 'installPath-status' : undefined}
              aria-invalid={pathValidation !== 'idle' && pathValidation !== 'ok' ? true : undefined}
              title={settings.installationPath}
              placeholder={t('settings.installPathPlaceholder')}
            />
            <button type="button" className="secondary-btn" onClick={onBrowse}>
              {t('settings.choose')}
            </button>
            <button type="button" className="secondary-btn" onClick={onValidatePath}>
              {t('settings.checkFolder')}
            </button>
            {settings.installationPath && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => onOpenDirectory(settings.installationPath)}
                title={t('settings.open')}
              >
                {t('settings.open')}
              </button>
            )}
          </div>
          {pathValidation !== 'idle' && (
            <span
              id="installPath-status"
              className={`settings-status ${pathValidation === 'ok' ? 'success' : 'error'}`}
              role="status"
              aria-live="polite"
            >
              {pathValidation === 'ok' && t('settings.pathOk')}
              {pathValidation === 'missing' && t('settings.pathMissing')}
              {pathValidation === 'unsafe' && t('settings.pathUnsafe')}
              {pathValidation === 'inaccessible' && t('settings.pathInaccessible')}
              {pathValidation === 'noWritePermission' && t('settings.pathNoWrite')}
              {pathValidation === 'busy' && t('settings.pathBusy')}
            </span>
          )}
        </div>

      </div>
    </section>
  )
}

interface EventLogSettingsSectionProps {
  entries: string[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function EventLogSettingsSection({ entries, loading, error, onRefresh }: EventLogSettingsSectionProps) {
  const { language, t } = useI18n()
  const timeFormatter = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <section
      id="settings-events"
      className="settings-section settings-event-log"
      aria-labelledby="settings-event-log-title"
      aria-busy={loading}
    >
      <div className="settings-event-log-toolbar">
        <div>
          <h3 id="settings-event-log-title">{t('settings.eventLog')}</h3>
          <p className="help-text">{t('settings.eventLogHelp')}</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onRefresh} disabled={loading}>
          {loading ? t('settings.eventLogLoading') : t('settings.eventLogRefresh')}
        </button>
      </div>

      {loading && entries.length === 0 ? (
        <StatePanel kind="loading" title={t('settings.eventLogLoading')} skeletonCount={2} />
      ) : error ? (
        <StatePanel
          kind="error"
          title={t('settings.eventLogErrorTitle')}
          message={error}
          actionLabel={t('settings.eventLogRefresh')}
          onAction={onRefresh}
        />
      ) : entries.length === 0 ? (
        <StatePanel
          kind="empty"
          title={t('settings.eventLogEmptyTitle')}
          message={t('settings.eventLogEmptyText')}
        />
      ) : (
        <>
          <p className="settings-event-log-summary" role="status" aria-live="polite">
            {t('settings.eventLogSummary', { count: entries.length })}
          </p>
          <ol className="settings-event-log-list">
            {entries.map((entry, index) => {
              const parsed = parseEventLogEntry(entry)
              const date = parsed.timestamp ? new Date(parsed.timestamp) : null
              const time = date && !Number.isNaN(date.getTime()) ? timeFormatter.format(date) : '—'
              const sourceKey = `settings.eventSource.${parsed.source}`
              const sourceLabel = t(sourceKey) === sourceKey ? parsed.source : t(sourceKey)

              return (
                <li key={`${entry}-${index}`} data-level={parsed.level}>
                  <time dateTime={parsed.timestamp ?? undefined}>{time}</time>
                  <span className={`settings-event-level ${parsed.level}`}>
                    <StatusIcon kind={parsed.level} />
                    {t(`settings.eventLevel.${parsed.level}`)}
                  </span>
                  <span className="settings-event-source">{sourceLabel}</span>
                  <p className="settings-event-message">{parsed.message}</p>
                  {parsed.technical && (
                    <details className="settings-event-details">
                      <summary>{t('settings.eventDetails')}</summary>
                      <code>{parsed.technical}</code>
                    </details>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

interface MaintenanceSettingsSectionProps {
  settings: AppSettings
  language: AppLanguage
  storageInfo: LauncherStorageInfo | null
  githubRateLimit: GitHubRateLimitStatus
  githubQueue: GitHubQueueStatus
  formatRateLimit: (bucket: GitHubRateLimitStatus['core']) => string
  formatRateLimitReset: (bucket: GitHubRateLimitStatus['core']) => string
  formatQueuePause: () => string
  onRefreshStorageInfo: () => void
  onOpenDirectory: (path: string) => void
  onCleanupLauncherFiles: () => void
  onClearCache: () => void
  onCopyDiagnostics: () => void
}

function assetStrategyLabelKey(strategy: AppSettings['assetStrategy']) {
  switch (strategy) {
    case 'installerFirst': return 'settings.installerFirst'
    case 'manual': return 'settings.manual'
    case 'portableFirst':
    default: return 'settings.portableFirst'
  }
}

function MaintenanceSettingsSection({
  settings,
  language,
  storageInfo,
  githubRateLimit,
  githubQueue,
  formatRateLimit,
  formatRateLimitReset,
  formatQueuePause,
  onRefreshStorageInfo,
  onOpenDirectory,
  onCleanupLauncherFiles,
  onClearCache,
  onCopyDiagnostics,
}: MaintenanceSettingsSectionProps) {
  const { t } = useI18n()

  return (
    <section id="settings-maintenance" className="danger-zone">
      <h3>{t('settings.maintenance')}</h3>
      <p className="help-text">{t('settings.maintenanceHelp')}</p>
      <section className="settings-maintenance-group" aria-labelledby="settings-storage-title">
        <h4 id="settings-storage-title">{t('settings.storage')}</h4>
        <dl>
          <div><dt>{t('settings.launcherFolder')}</dt><dd>{storageInfo?.launcherDir ?? t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.updateCache')}</dt><dd>{storageInfo ? `${storageInfo.updateCacheCount} · ${storageInfo.updateCachePath}` : t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.backups')}</dt><dd>{storageInfo ? `${storageInfo.backupCount} · ${storageInfo.backupPath}` : t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.cleanupSize')}</dt><dd>{storageInfo ? formatBytes(storageInfo.cleanupBytes, language) : t('settings.notChecked')}</dd></div>
        </dl>
        <div className="settings-maintenance-actions">
          <button className="secondary-btn" onClick={onRefreshStorageInfo}>{t('settings.refreshDiagnostics')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.launcherDir)} disabled={!storageInfo}>{t('settings.openLauncherFolder')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.updateCachePath)} disabled={!storageInfo}>{t('settings.openUpdateCache')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.backupPath)} disabled={!storageInfo}>{t('settings.openBackups')}</button>
          <button className="secondary-btn" onClick={onCleanupLauncherFiles} disabled={!storageInfo || storageInfo.cleanupBytes === 0}>{t('settings.cleanupLauncherFiles')}</button>
        </div>
      </section>
      <section className="settings-maintenance-group" aria-labelledby="settings-diagnostics-title">
        <h4 id="settings-diagnostics-title">{t('settings.diagnostics')}</h4>
        <span className="settings-reset-kicker">{t('settings.githubDiagnostics')}</span>
        <dl>
          <div><dt>{t('settings.githubOwner')}</dt><dd>{settings.githubOwner || t('settings.notSet')}</dd></div>
          <div><dt>{t('settings.assets')}</dt><dd>{t(assetStrategyLabelKey(settings.assetStrategy))}</dd></div>
          <div><dt>{t('settings.prerelease')}</dt><dd>{settings.includePrereleases ? t('settings.yes') : t('settings.no')}</dd></div>
          <div><dt>{t('settings.githubCoreLimit')}</dt><dd>{formatRateLimit(githubRateLimit.core)}</dd></div>
          <div><dt>{t('settings.githubSearchLimit')}</dt><dd>{formatRateLimit(githubRateLimit.search)}</dd></div>
          <div><dt>{t('settings.githubCoreReset')}</dt><dd>{formatRateLimitReset(githubRateLimit.core)}</dd></div>
          <div><dt>{t('settings.githubSearchReset')}</dt><dd>{formatRateLimitReset(githubRateLimit.search)}</dd></div>
          <div><dt>{t('settings.githubQueue')}</dt><dd>{t('settings.githubQueueValue', { active: githubQueue.active, queued: githubQueue.queued, concurrency: githubQueue.concurrency })}</dd></div>
          <div><dt>{t('settings.githubQueuePriority')}</dt><dd>{t('settings.githubQueuePriorityValue', { high: githubQueue.highPriority, normal: githubQueue.normalPriority })}</dd></div>
          <div><dt>{t('settings.githubQueueState')}</dt><dd>{formatQueuePause()}</dd></div>
        </dl>
        <div className="settings-maintenance-actions">
          <button className="secondary-btn" onClick={onClearCache}>{t('settings.clearCache')}</button>
          <button className="secondary-btn" onClick={onCopyDiagnostics}>{t('settings.copyDiagnostics')}</button>
        </div>
      </section>
    </section>
  )
}

interface SettingsSectionsProps {
  activeSection: SettingsSectionId
  settings: AppSettings
  language: AppLanguage
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  pathValidation: PathValidation
  storageInfo: LauncherStorageInfo | null
  githubRateLimit: GitHubRateLimitStatus
  githubQueue: GitHubQueueStatus
  eventLog: string[]
  eventLogLoading: boolean
  eventLogError: string | null
  formatRateLimit: MaintenanceSettingsSectionProps['formatRateLimit']
  formatRateLimitReset: MaintenanceSettingsSectionProps['formatRateLimitReset']
  formatQueuePause: () => string
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: AppLanguage) => void
  onChangeLauncherBackground: (theme: ResolvedTheme) => void
  onClearLauncherBackground: (theme: ResolvedTheme) => void
  onPreviewSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onCommitSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onBrowse: () => void
  onValidatePath: () => void
  onOpenDirectory: (path: string) => void
  onRefreshStorageInfo: () => void
  onCleanupLauncherFiles: () => void
  onClearCache: () => void
  onCopyDiagnostics: () => void
  onRefreshEventLog: () => void
}

export function SettingsSections(props: SettingsSectionsProps) {
  switch (props.activeSection) {
    case 'general':
      return <GeneralSettingsSection {...props} />
    case 'events':
      return (
        <EventLogSettingsSection
          entries={props.eventLog}
          loading={props.eventLogLoading}
          error={props.eventLogError}
          onRefresh={props.onRefreshEventLog}
        />
      )
    case 'maintenance':
      return <MaintenanceSettingsSection {...props} />
  }
}
