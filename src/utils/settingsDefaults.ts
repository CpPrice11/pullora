import type { AppSettings } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  installationPath: '',
  autoUpdateCheck: true,
  checkIntervalHours: 24,
  includePrereleases: false,
  assetStrategy: 'portableFirst',
  githubOwner: 'CpPrice11',
  githubToken: null,
  theme: 'auto',
  language: 'uk',
  aiWorkspaceEnabled: false,
  aiWorkspaceRoot: '',
  codexRuntimePreference: 'system',
}

export function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    version: settings?.version || DEFAULT_SETTINGS.version,
    installationPath: settings?.installationPath || DEFAULT_SETTINGS.installationPath,
    autoUpdateCheck: settings?.autoUpdateCheck ?? DEFAULT_SETTINGS.autoUpdateCheck,
    checkIntervalHours: settings?.checkIntervalHours || DEFAULT_SETTINGS.checkIntervalHours,
    includePrereleases: settings?.includePrereleases ?? DEFAULT_SETTINGS.includePrereleases,
    assetStrategy: settings?.assetStrategy || DEFAULT_SETTINGS.assetStrategy,
    githubOwner: settings?.githubOwner ?? DEFAULT_SETTINGS.githubOwner,
    githubToken: settings?.githubToken ?? DEFAULT_SETTINGS.githubToken,
    theme: settings?.theme || DEFAULT_SETTINGS.theme,
    language: settings?.language === 'en' ? 'en' : DEFAULT_SETTINGS.language,
    aiWorkspaceEnabled: settings?.aiWorkspaceEnabled ?? DEFAULT_SETTINGS.aiWorkspaceEnabled,
    aiWorkspaceRoot: settings?.aiWorkspaceRoot ?? DEFAULT_SETTINGS.aiWorkspaceRoot,
    codexRuntimePreference: 'system',
  }
}
