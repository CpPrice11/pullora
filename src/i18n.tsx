import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type AppLanguage = 'uk' | 'en'

export const LANGUAGE_CHANGE_EVENT = 'air-launcher-language-change'

type Dictionary = Record<string, string>

const dictionaries: Record<AppLanguage, Dictionary> = {
  uk: {
    'nav.library': 'Бібліотека',
    'nav.installed': 'Встановлені',
    'nav.favorites': 'Обране',
    'nav.settings': 'Налаштування',
    'nav.about': 'Про застосунок',
    'header.checking': 'Перевіряємо оновлення...',
    'header.checkUpdates': 'Перевірити оновлення',
    'header.availableUpdates': 'Доступно оновлень: {count}',
    'settings.title': 'Налаштування',
    'settings.saving': 'Зберігаємо',
    'settings.saved': 'Збережено',
    'settings.loading': 'Завантажуємо налаштування...',
    'settings.installation': 'Встановлення',
    'settings.installPath': 'Папка встановлення',
    'settings.installPathPlaceholder': 'Обери папку...',
    'settings.choose': 'Обрати...',
    'settings.open': 'Відкрити',
    'settings.updates': 'Оновлення',
    'settings.autoCheck': 'Автоматично перевіряти оновлення',
    'settings.interval': 'Інтервал перевірки',
    'settings.prerelease': 'Показувати prerelease',
    'settings.assets': 'Файли релізів',
    'settings.portableFirst': 'Portable ZIP спочатку',
    'settings.installerFirst': 'EXE/MSI спочатку',
    'settings.manual': 'Вручну',
    'settings.appearance': 'Вигляд',
    'settings.theme': 'Тема',
    'settings.light': 'Світла',
    'settings.dark': 'Темна',
    'settings.auto': 'Авто',
    'settings.language': 'Мова',
    'settings.ukrainian': 'Українська',
    'settings.english': 'English',
    'settings.service': 'Службові дії',
    'settings.reset': 'Скинути налаштування',
    'settings.clearCache': 'Очистити API-кеш',
    'settings.resetConfirm': 'Скинути всі налаштування до стандартних?',
    'settings.cacheCleared': 'Кеш очищено',
    'settings.saveError': 'Не вдалося зберегти налаштування',
    'settings.themeError': 'Не вдалося зберегти тему',
    'library.title': 'Бібліотека',
    'library.refresh': 'Оновити',
    'library.refreshing': 'Оновлюємо...',
    'library.noOwnerTitle': 'Власника GitHub не вказано',
    'library.noOwnerText': 'Вкажи власника у налаштуваннях, щоб завантажити публічні репозиторії з релізами.',
    'library.searchPlaceholder': 'Фільтр бібліотеки...',
    'library.filterLabel': 'Фільтр бібліотеки',
    'library.sortLabel': 'Сортування',
    'library.all': 'Усі',
    'library.installed': 'Встановлені',
    'library.updates': 'Оновлення',
    'library.available': 'Доступні',
    'library.recentlyUpdated': 'Нещодавно оновлені',
    'library.status': 'Статус',
    'library.name': 'Назва',
    'library.tryAgain': 'Спробувати ще',
    'library.launchError': 'Не вдалося запустити застосунок',
    'library.count': '{visible} із {total} репозиторіїв з релізами',
    'library.checkingInstalled': ' · перевіряємо встановлені версії...',
    'library.loading': 'Завантажуємо бібліотеку',
    'library.emptyTitle': 'Релізів не знайдено',
    'library.noMatchesTitle': 'Немає збігів для цього фільтра',
    'library.emptyText': 'У твоїх публічних репозиторіях поки немає GitHub Releases, які можна показати в лаунчері.',
    'library.noMatchesText': 'Зміни фільтр або пошуковий запит, щоб побачити інші проєкти.',
    'library.loadMore': 'Завантажити ще',
    'repo.update': 'Оновлення',
    'repo.installed': 'Встановлено',
    'repo.ready': 'Готово',
    'repo.updateAction': 'Оновити',
    'repo.versions': 'Версії',
    'repo.install': 'Встановити',
    'repo.removeFavorite': 'Прибрати з обраного',
    'repo.addFavorite': 'Додати в обране',
    'repo.launch': 'Запустити',
    'repo.stars': '{count} зірок',
    'repo.active': 'Активна {version}',
    'repo.new': 'Нова {version}',
    'repo.updated': 'Оновлено {date}',
    'about.title': 'Про застосунок',
    'about.version': 'Версія',
    'about.app': 'Застосунок',
    'about.currentVersion': 'Поточна версія',
    'about.stack': 'Стек',
    'about.launcherVersions': 'Версії лаунчера',
    'about.loadingReleases': 'Завантажуємо релізи...',
    'about.noReleases': 'Релізи лаунчера не вдалося завантажити.',
    'about.noDate': 'без дати',
    'about.active': 'Активна',
    'about.activating': 'Активуємо...',
    'about.update': 'Оновити',
    'about.rollback': 'Відкотитися',
    'about.noPortableAsset': 'У цьому релізі немає portable EXE або ZIP. Setup-файли лаунчер не встановлює автоматично.',
    'about.activateError': 'Не вдалося активувати версію лаунчера.',
  },
  en: {
    'nav.library': 'Library',
    'nav.installed': 'Installed',
    'nav.favorites': 'Favorites',
    'nav.settings': 'Settings',
    'nav.about': 'About',
    'header.checking': 'Checking for updates...',
    'header.checkUpdates': 'Check for updates',
    'header.availableUpdates': 'Available updates: {count}',
    'settings.title': 'Settings',
    'settings.saving': 'Saving',
    'settings.saved': 'Saved',
    'settings.loading': 'Loading settings...',
    'settings.installation': 'Installation',
    'settings.installPath': 'Install folder',
    'settings.installPathPlaceholder': 'Choose a folder...',
    'settings.choose': 'Choose...',
    'settings.open': 'Open',
    'settings.updates': 'Updates',
    'settings.autoCheck': 'Check for updates automatically',
    'settings.interval': 'Check interval',
    'settings.prerelease': 'Show prereleases',
    'settings.assets': 'Release files',
    'settings.portableFirst': 'Portable ZIP first',
    'settings.installerFirst': 'EXE/MSI first',
    'settings.manual': 'Manual',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.auto': 'Auto',
    'settings.language': 'Language',
    'settings.ukrainian': 'Ukrainian',
    'settings.english': 'English',
    'settings.service': 'Maintenance',
    'settings.reset': 'Reset settings',
    'settings.clearCache': 'Clear API cache',
    'settings.resetConfirm': 'Reset all settings to defaults?',
    'settings.cacheCleared': 'Cache cleared',
    'settings.saveError': 'Failed to save settings',
    'settings.themeError': 'Failed to save theme',
    'library.title': 'Library',
    'library.refresh': 'Refresh',
    'library.refreshing': 'Refreshing...',
    'library.noOwnerTitle': 'GitHub owner is not set',
    'library.noOwnerText': 'Set the owner in settings to load public repositories with releases.',
    'library.searchPlaceholder': 'Filter library...',
    'library.filterLabel': 'Library filter',
    'library.sortLabel': 'Sort',
    'library.all': 'All',
    'library.installed': 'Installed',
    'library.updates': 'Updates',
    'library.available': 'Available',
    'library.recentlyUpdated': 'Recently updated',
    'library.status': 'Status',
    'library.name': 'Name',
    'library.tryAgain': 'Try again',
    'library.launchError': 'Failed to launch app',
    'library.count': '{visible} of {total} repositories with releases',
    'library.checkingInstalled': ' · checking installed versions...',
    'library.loading': 'Loading library',
    'library.emptyTitle': 'No releases found',
    'library.noMatchesTitle': 'No matches for this filter',
    'library.emptyText': 'Your public repositories do not have GitHub Releases that can be shown in the launcher yet.',
    'library.noMatchesText': 'Change the filter or search query to see other projects.',
    'library.loadMore': 'Load more',
    'repo.update': 'Update',
    'repo.installed': 'Installed',
    'repo.ready': 'Ready',
    'repo.updateAction': 'Update',
    'repo.versions': 'Versions',
    'repo.install': 'Install',
    'repo.removeFavorite': 'Remove from favorites',
    'repo.addFavorite': 'Add to favorites',
    'repo.launch': 'Launch',
    'repo.stars': '{count} stars',
    'repo.active': 'Active {version}',
    'repo.new': 'New {version}',
    'repo.updated': 'Updated {date}',
    'about.title': 'About',
    'about.version': 'Version',
    'about.app': 'App',
    'about.currentVersion': 'Current version',
    'about.stack': 'Stack',
    'about.launcherVersions': 'Launcher versions',
    'about.loadingReleases': 'Loading releases...',
    'about.noReleases': 'Launcher releases could not be loaded.',
    'about.noDate': 'no date',
    'about.active': 'Active',
    'about.activating': 'Activating...',
    'about.update': 'Update',
    'about.rollback': 'Rollback',
    'about.noPortableAsset': 'This release has no portable EXE or ZIP. Setup files are not installed automatically.',
    'about.activateError': 'Failed to activate launcher version.',
  },
}

interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function normalizeLanguage(language: string | null | undefined): AppLanguage {
  return language === 'en' ? 'en' : 'uk'
}

export function notifyLanguage(language: AppLanguage) {
  window.dispatchEvent(
    new CustomEvent<{ language: AppLanguage }>(LANGUAGE_CHANGE_EVENT, {
      detail: { language },
    }),
  )
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: React.ReactNode
  initialLanguage: string
}) {
  const [language, setLanguageState] = useState<AppLanguage>(normalizeLanguage(initialLanguage))

  useEffect(() => {
    setLanguageState(normalizeLanguage(initialLanguage))
  }, [initialLanguage])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<{ language: AppLanguage }>).detail?.language
      if (nextLanguage) {
        setLanguageState(normalizeLanguage(nextLanguage))
      }
    }

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange)
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange)
  }, [])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key, values) => {
      let text = dictionaries[language][key] ?? dictionaries.uk[key] ?? key
      Object.entries(values ?? {}).forEach(([name, value]) => {
        text = text.split(`{${name}}`).join(String(value))
      })
      return text
    },
  }), [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useI18n must be used inside LanguageProvider')
  }
  return context
}
