import type { AppLanguage } from '../i18n'

export function appLocale(language: AppLanguage) {
  return language === 'en' ? 'en-US' : 'uk-UA'
}

export function formatNumber(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(appLocale(language)).format(value)
}

export function formatDate(
  value: string | number | Date,
  language: AppLanguage,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(appLocale(language), options).format(new Date(value))
}

export function formatBytes(bytes: number, language: AppLanguage) {
  const units = language === 'en' ? ['B', 'KB', 'MB', 'GB'] : ['Б', 'КБ', 'МБ', 'ГБ']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(appLocale(language), {
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value)} ${units[unit]}`
}

export function compareVersionTags(left: string, right: string) {
  const parse = (tag: string) => tag.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const leftParts = parse(left)
  const rightParts = parse(right)

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff) return diff
  }
  return 0
}
