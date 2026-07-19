import type { CSSProperties, KeyboardEvent } from 'react'
import NativeSelect from '../../../components/Select/NativeSelect'
import StatePanel from '../../../components/State/StatePanel'
import { useI18n, type AppLanguage } from '../../../i18n'
import type {
  AppSettings,
  GitHubQueueStatus,
  GitHubRateLimitStatus,
  LauncherStorageInfo,
} from '../../../types'
import { formatBytes } from '../../../utils/format'
import type { ResolvedTheme, ThemePreference } from '../../../utils/theme'

export type SettingsSectionId = 'general' | 'installation' | 'updates' | 'events' | 'maintenance'

type PathValidation = 'idle' | 'ok' | 'missing' | 'inaccessible' | 'noWritePermission' | 'requiresElevation'
type SurfaceSetting = 'surfaceTransparency' | 'surfaceBlur'

interface GeneralSettingsSectionProps {
  settings: AppSettings
  recentGithubOwners: string[]
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  onGithubOwnerChange: (value: string) => void
  onGithubOwnerBlur: () => void
  onGithubOwnerKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onSelectRecentGithubOwner: (owner: string) => void
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: AppLanguage) => void
  onChangeLauncherBackground: (theme: ResolvedTheme) => void
  onClearLauncherBackground: (theme: ResolvedTheme) => void
  onPreviewSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onCommitSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onRequestReset: () => void
  saving: boolean
}

const rangeProgressStyle = (value: number, min: number, max: number) => ({
  '--range-progress': `${((value - min) / (max - min)) * 100}%`,
}) as CSSProperties

function GeneralSettingsSection({
  settings,
  recentGithubOwners,
  hasLauncherBackground,
  onGithubOwnerChange,
  onGithubOwnerBlur,
  onGithubOwnerKeyDown,
  onSelectRecentGithubOwner,
  onThemeChange,
  onLanguageChange,
  onChangeLauncherBackground,
  onClearLauncherBackground,
  onPreviewSurfaceSetting,
  onCommitSurfaceSetting,
  onRequestReset,
  saving,
}: GeneralSettingsSectionProps) {
  const { t } = useI18n()
  const surfaceTransparency = settings.appearance?.surfaceTransparency ?? 42
  const surfaceBlur = settings.appearance?.surfaceBlur ?? 12

  return (
    <section id="settings-general" className="settings-section">
      <h3>{t('settings.general')}</h3>
      <div className="settings-grid">
        <div className="form-group compact-control">
          <label htmlFor="githubOwner">{t('settings.githubOwner')}</label>
          <input
            id="githubOwner"
            type="text"
            value={settings.githubOwner ?? ''}
            onBlur={onGithubOwnerBlur}
            onChange={(event) => onGithubOwnerChange(event.target.value)}
            onKeyDown={onGithubOwnerKeyDown}
            placeholder={t('settings.githubOwnerPlaceholder')}
            data-autofocus="true"
          />
          <p className="help-text">{t('settings.githubSourceHelp')}</p>
          {recentGithubOwners.length > 0 && (
            <div className="settings-owner-chips" aria-label={t('settings.recentOwners')}>
              {recentGithubOwners.map((owner) => (
                <button
                  key={owner}
                  type="button"
                  className={owner.toLowerCase() === (settings.githubOwner ?? '').toLowerCase() ? 'active' : ''}
                  onClick={() => onSelectRecentGithubOwner(owner)}
                >
                  {owner}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="settings-source-summary">
          <span className="settings-reset-kicker">{t('settings.sourceSummary')}</span>
          <strong>{settings.githubOwner || t('settings.notSet')}</strong>
          <p>{t('settings.sourceSummaryText')}</p>
          <small>{t('settings.githubTokenHelp')}</small>
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
                  <button type="button" className="secondary-btn" onClick={() => onChangeLauncherBackground(theme)}>
                    {t('art.changeThemeBackground', { theme: t(`settings.${theme}`) })}
                  </button>
                  {hasLauncherBackground[theme] && (
                    <button type="button" className="secondary-btn" onClick={() => onClearLauncherBackground(theme)}>
                      {t('art.resetThemeBackground', { theme: t(`settings.${theme}`) })}
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
              aria-describedby="underlayAppearanceHelp"
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
              aria-describedby="underlayAppearanceHelp"
              onChange={(event) => onPreviewSurfaceSetting('surfaceBlur', Number(event.target.value))}
              onKeyUp={(event) => onCommitSurfaceSetting('surfaceBlur', Number(event.currentTarget.value))}
              onPointerUp={(event) => onCommitSurfaceSetting('surfaceBlur', Number(event.currentTarget.value))}
            />
            <output className="settings-range-value" htmlFor="surfaceBlur">
              {surfaceBlur} px
            </output>
          </div>
          <p id="underlayAppearanceHelp" className="help-text">{t('settings.underlayAppearanceHelp')}</p>
        </fieldset>
        <div className="settings-reset-control">
          <div>
            <strong>{t('settings.resetGeneralTitle')}</strong>
            <p>{t('settings.resetHelp')}</p>
          </div>
          <button
            type="button"
            className="settings-reset-btn settings-reset-trigger"
            disabled={saving}
            onClick={onRequestReset}
          >
            {t('settings.resetAction')}
          </button>
        </div>
      </div>
    </section>
  )
}

interface InstallationSettingsSectionProps {
  installationPath: string
  pathValidation: PathValidation
  onInstallationPathChange: (value: string) => void
  onInstallationPathBlur: () => void
  onInstallationPathKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onBrowse: () => void
  onValidatePath: () => void
  onOpenDirectory: (path: string) => void
}

function InstallationSettingsSection({
  installationPath,
  pathValidation,
  onInstallationPathChange,
  onInstallationPathBlur,
  onInstallationPathKeyDown,
  onBrowse,
  onValidatePath,
  onOpenDirectory,
}: InstallationSettingsSectionProps) {
  const { t } = useI18n()

  return (
    <section id="settings-folders" className="settings-section">
      <h3>{t('settings.installation')}</h3>
      <div className="form-group">
        <label htmlFor="installPath">{t('settings.installPath')}</label>
        <div className="path-input-row">
          <input
            id="installPath"
            type="text"
            value={installationPath}
            onBlur={onInstallationPathBlur}
            onChange={(event) => onInstallationPathChange(event.target.value)}
            onKeyDown={onInstallationPathKeyDown}
            placeholder={t('settings.installPathPlaceholder')}
          />
          <button type="button" className="secondary-btn" onClick={onBrowse}>
            {t('settings.choose')}
          </button>
          <button type="button" className="secondary-btn" onClick={onValidatePath}>
            {t('settings.checkFolder')}
          </button>
          {installationPath && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onOpenDirectory(installationPath)}
              title={t('settings.open')}
            >
              {t('settings.open')}
            </button>
          )}
        </div>
        {pathValidation !== 'idle' && (
          <span className={`settings-status ${pathValidation === 'ok' || pathValidation === 'requiresElevation' ? 'success' : 'error'}`}>
            {pathValidation === 'ok' && t('settings.pathOk')}
            {pathValidation === 'requiresElevation' && t('settings.pathRequiresElevation')}
            {pathValidation === 'missing' && t('settings.pathMissing')}
            {pathValidation === 'inaccessible' && t('settings.pathInaccessible')}
            {pathValidation === 'noWritePermission' && t('settings.pathNoWrite')}
          </span>
        )}
      </div>
    </section>
  )
}

interface UpdatesSettingsSectionProps {
  settings: AppSettings
  onIncludePrereleasesChange: (value: boolean) => void
  onAssetStrategyChange: (value: AppSettings['assetStrategy']) => void
}

function UpdatesSettingsSection({
  settings,
  onIncludePrereleasesChange,
  onAssetStrategyChange,
}: UpdatesSettingsSectionProps) {
  const { t } = useI18n()

  return (
    <section id="settings-updates" className="settings-section">
      <h3>{t('settings.updates')}</h3>
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(settings.includePrereleases)}
            onChange={(event) => onIncludePrereleasesChange(event.target.checked)}
          />
          {t('settings.prerelease')}
        </label>
      </div>

      <div className="form-group compact-control">
        <label htmlFor="assetStrategy">{t('settings.assets')}</label>
        <NativeSelect
          id="assetStrategy"
          value={settings.assetStrategy ?? 'portableFirst'}
          onValueChange={(value) => onAssetStrategyChange(value as AppSettings['assetStrategy'])}
          options={([
            ['portableFirst', t('settings.portableFirst')],
            ['installerFirst', t('settings.installerFirst')],
            ['manual', t('settings.manual')],
          ] as const).map(([value, label]) => ({ value, label }))}
        />
        <p className="help-text">{t('settings.assetStrategyHelp')}</p>
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
  const { t } = useI18n()

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
            {entries.map((entry, index) => (
              <li key={`${entry}-${index}`}>
                <code>{entry}</code>
              </li>
            ))}
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
  registryBusy: boolean
  formatRateLimit: (bucket: GitHubRateLimitStatus['core']) => string
  formatRateLimitReset: (bucket: GitHubRateLimitStatus['core']) => string
  formatQueuePause: () => string
  onRefreshStorageInfo: () => void
  onOpenDirectory: (path: string) => void
  onCleanupLauncherFiles: () => void
  onClearCache: () => void
  onExportInstalledRegistry: () => void
  onImportInstalledRegistry: () => void
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
  registryBusy,
  formatRateLimit,
  formatRateLimitReset,
  formatQueuePause,
  onRefreshStorageInfo,
  onOpenDirectory,
  onCleanupLauncherFiles,
  onClearCache,
  onExportInstalledRegistry,
  onImportInstalledRegistry,
  onCopyDiagnostics,
}: MaintenanceSettingsSectionProps) {
  const { t } = useI18n()

  return (
    <section id="settings-maintenance" className="danger-zone">
      <h3>{t('settings.maintenance')}</h3>
      <p className="help-text">{t('settings.maintenanceHelp')}</p>
      <div className="settings-diagnostics-card">
        <span className="settings-reset-kicker">{t('settings.githubDiagnostics')}</span>
        <dl>
          <div><dt>{t('settings.githubOwner')}</dt><dd>{settings.githubOwner || t('settings.notSet')}</dd></div>
          <div><dt>{t('settings.assets')}</dt><dd>{t(assetStrategyLabelKey(settings.assetStrategy))}</dd></div>
          <div><dt>{t('settings.prerelease')}</dt><dd>{settings.includePrereleases ? t('settings.yes') : t('settings.no')}</dd></div>
          <div><dt>{t('settings.githubCoreLimit')}</dt><dd>{formatRateLimit(githubRateLimit.core)}</dd></div>
          <div><dt>{t('settings.githubSearchLimit')}</dt><dd>{formatRateLimit(githubRateLimit.search)}</dd></div>
          <div><dt>{t('settings.githubCoreReset')}</dt><dd>{formatRateLimitReset(githubRateLimit.core)}</dd></div>
          <div><dt>{t('settings.githubSearchReset')}</dt><dd>{formatRateLimitReset(githubRateLimit.search)}</dd></div>
          <div>
            <dt>{t('settings.githubQueue')}</dt>
            <dd>{t('settings.githubQueueValue', {
              active: githubQueue.active,
              queued: githubQueue.queued,
              concurrency: githubQueue.concurrency,
            })}</dd>
          </div>
          <div>
            <dt>{t('settings.githubQueuePriority')}</dt>
            <dd>{t('settings.githubQueuePriorityValue', {
              high: githubQueue.highPriority,
              normal: githubQueue.normalPriority,
            })}</dd>
          </div>
          <div><dt>{t('settings.githubQueueState')}</dt><dd>{formatQueuePause()}</dd></div>
        </dl>
      </div>
      <div className="settings-diagnostics-card">
        <span className="settings-reset-kicker">{t('settings.storageDiagnostics')}</span>
        <dl>
          <div><dt>{t('settings.launcherFolder')}</dt><dd>{storageInfo?.launcherDir ?? t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.updateCache')}</dt><dd>{storageInfo ? `${storageInfo.updateCacheCount} · ${storageInfo.updateCachePath}` : t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.backups')}</dt><dd>{storageInfo ? `${storageInfo.backupCount} · ${storageInfo.backupPath}` : t('settings.notChecked')}</dd></div>
          <div><dt>{t('settings.cleanupSize')}</dt><dd>{storageInfo ? formatBytes(storageInfo.cleanupBytes, language) : t('settings.notChecked')}</dd></div>
        </dl>
        <div className="settings-maintenance-actions settings-storage-actions">
          <button className="secondary-btn" onClick={onRefreshStorageInfo}>{t('settings.refreshDiagnostics')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.launcherDir)} disabled={!storageInfo}>{t('settings.openLauncherFolder')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.updateCachePath)} disabled={!storageInfo}>{t('settings.openUpdateCache')}</button>
          <button className="secondary-btn" onClick={() => storageInfo && onOpenDirectory(storageInfo.backupPath)} disabled={!storageInfo}>{t('settings.openBackups')}</button>
          <button className="secondary-btn" onClick={onCleanupLauncherFiles} disabled={!storageInfo || storageInfo.cleanupBytes === 0}>{t('settings.cleanupLauncherFiles')}</button>
        </div>
      </div>
      <div className="settings-maintenance-actions">
        <button className="secondary-btn" onClick={onClearCache}>{t('settings.clearCache')}</button>
        <button className="secondary-btn" onClick={onExportInstalledRegistry} disabled={registryBusy}>{t('settings.exportInstalledRegistry')}</button>
        <button className="secondary-btn" onClick={onImportInstalledRegistry} disabled={registryBusy}>{t('settings.importInstalledRegistry')}</button>
        <button className="secondary-btn" onClick={onCopyDiagnostics}>{t('settings.copyDiagnostics')}</button>
      </div>
    </section>
  )
}

interface SettingsSectionsProps {
  activeSection: SettingsSectionId
  settings: AppSettings
  language: AppLanguage
  recentGithubOwners: string[]
  hasLauncherBackground: Record<ResolvedTheme, boolean>
  pathValidation: PathValidation
  storageInfo: LauncherStorageInfo | null
  githubRateLimit: GitHubRateLimitStatus
  githubQueue: GitHubQueueStatus
  saving: boolean
  registryBusy: boolean
  eventLog: string[]
  eventLogLoading: boolean
  eventLogError: string | null
  formatRateLimit: MaintenanceSettingsSectionProps['formatRateLimit']
  formatRateLimitReset: MaintenanceSettingsSectionProps['formatRateLimitReset']
  formatQueuePause: () => string
  onGithubOwnerChange: (value: string) => void
  onGithubOwnerBlur: () => void
  onGithubOwnerKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onSelectRecentGithubOwner: (owner: string) => void
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: AppLanguage) => void
  onChangeLauncherBackground: (theme: ResolvedTheme) => void
  onClearLauncherBackground: (theme: ResolvedTheme) => void
  onPreviewSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onCommitSurfaceSetting: (key: SurfaceSetting, value: number) => void
  onInstallationPathChange: (value: string) => void
  onInstallationPathBlur: () => void
  onInstallationPathKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onBrowse: () => void
  onValidatePath: () => void
  onOpenDirectory: (path: string) => void
  onIncludePrereleasesChange: (value: boolean) => void
  onAssetStrategyChange: (value: AppSettings['assetStrategy']) => void
  onRefreshStorageInfo: () => void
  onCleanupLauncherFiles: () => void
  onRequestReset: () => void
  onClearCache: () => void
  onExportInstalledRegistry: () => void
  onImportInstalledRegistry: () => void
  onCopyDiagnostics: () => void
  onRefreshEventLog: () => void
}

export function SettingsSections(props: SettingsSectionsProps) {
  switch (props.activeSection) {
    case 'general':
      return <GeneralSettingsSection {...props} />
    case 'installation':
      return (
        <InstallationSettingsSection
          installationPath={props.settings.installationPath}
          pathValidation={props.pathValidation}
          onInstallationPathChange={props.onInstallationPathChange}
          onInstallationPathBlur={props.onInstallationPathBlur}
          onInstallationPathKeyDown={props.onInstallationPathKeyDown}
          onBrowse={props.onBrowse}
          onValidatePath={props.onValidatePath}
          onOpenDirectory={props.onOpenDirectory}
        />
      )
    case 'updates':
      return (
        <UpdatesSettingsSection
          settings={props.settings}
          onIncludePrereleasesChange={props.onIncludePrereleasesChange}
          onAssetStrategyChange={props.onAssetStrategyChange}
        />
      )
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
