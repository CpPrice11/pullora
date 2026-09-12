import type { AppAppearanceSettings, AppSettings } from '../types'

export const DEFAULT_APPEARANCE: AppAppearanceSettings = {
  density: 'comfortable',
  effectsLevel: 'balanced',
  surfaceTransparency: 42,
  surfaceBlur: 12,
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

export function normalizeAppearance(value: Partial<AppAppearanceSettings> | null | undefined): AppAppearanceSettings {
  return {
    density: value?.density === 'compact' || value?.density === 'comfortable' || value?.density === 'spacious'
      ? value.density
      : DEFAULT_APPEARANCE.density,
    effectsLevel: value?.effectsLevel === 'off' || value?.effectsLevel === 'high'
      ? value.effectsLevel
      : DEFAULT_APPEARANCE.effectsLevel,
    surfaceTransparency: normalizeNumber(value?.surfaceTransparency, DEFAULT_APPEARANCE.surfaceTransparency, 0, 100),
    surfaceBlur: normalizeNumber(value?.surfaceBlur, DEFAULT_APPEARANCE.surfaceBlur, 0, 32),
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  installationPath: '',
  githubToken: null,
  theme: 'auto',
  language: 'uk',
  appearance: DEFAULT_APPEARANCE,
}

export function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    version: settings?.version || DEFAULT_SETTINGS.version,
    installationPath: settings?.installationPath || DEFAULT_SETTINGS.installationPath,
    githubToken: settings?.githubToken ?? DEFAULT_SETTINGS.githubToken,
    theme: settings?.theme || DEFAULT_SETTINGS.theme,
    language: settings?.language === 'en' ? 'en' : DEFAULT_SETTINGS.language,
    appearance: normalizeAppearance(settings?.appearance),
  }
}
