import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  plugins: [{
    name: 'component-test-ignore-css',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.css')) return 'export default {}'
    },
  }],
  server: {
    middlewareMode: true,
    watch: { ignored: ['**/src-tauri/target/**'] },
  },
})

try {
  const { LanguageProvider } = await server.ssrLoadModule('/src/i18n.tsx')
  const { default: LibraryHero } = await server.ssrLoadModule('/src/features/library/components/LibraryHero.tsx')
  const { default: LibraryOperationsPanel } = await server.ssrLoadModule('/src/features/library/components/LibraryOperationsPanel.tsx')
  const { default: LibrarySidebar } = await server.ssrLoadModule('/src/features/library/components/LibrarySidebar.tsx')
  const { default: RepoCard } = await server.ssrLoadModule('/src/features/library/components/RepoCard.tsx')
  const { LibraryBulkActions, LibraryBulkConfirmDialog } = await server.ssrLoadModule('/src/features/library/components/LibraryBulkActions.tsx')
  const { default: VersionPanel } = await server.ssrLoadModule('/src/features/library/components/VersionPanel.tsx')
  const { default: ApplicationDetails } = await server.ssrLoadModule('/src/features/library/components/ApplicationDetails.tsx')
  const { default: FolderManager } = await server.ssrLoadModule('/src/features/library/components/FolderManager.tsx')
  const { default: BatchUpdatePanel, BatchUpdateConfirmDialog } = await server.ssrLoadModule('/src/features/library/components/BatchUpdatePanel.tsx')
  const { default: DownloadProgressPanel } = await server.ssrLoadModule('/src/components/Install/DownloadProgress.tsx')
  const { default: StatePanel } = await server.ssrLoadModule('/src/components/State/StatePanel.tsx')
  const { getLibraryAppStatus, getLibraryStatusRank, getUpdateDismissKey } = await server.ssrLoadModule('/src/features/library/libraryStatus.ts')
  const { normalizeSettings } = await server.ssrLoadModule('/src/utils/settingsDefaults.ts')
  const { default: ukDictionary } = await server.ssrLoadModule('/src/i18n/dictionaries/uk.ts')
  const { default: enDictionary } = await server.ssrLoadModule('/src/i18n/dictionaries/en.ts')
  const { sortLibraryRepositories } = await server.ssrLoadModule('/src/features/library/hooks/useLibraryFiltering.ts')
  const {
    toggleSelectedKey,
    selectKeyRange,
    selectVisibleKeys,
    clearSelectedKeys,
  } = await server.ssrLoadModule('/src/features/library/hooks/useLibraryBulkSelection.ts')
  const {
    getInactiveInstalledVersions,
    runSequentialBulk,
  } = await server.ssrLoadModule('/src/features/library/libraryBulkOperations.ts')
  const { parseLibraryViewState } = await server.ssrLoadModule('/src/features/library/libraryViewState.ts')
  const {
    LIBRARY_DENSITIES,
    LIBRARY_FILTERS,
    LIBRARY_SORTS,
  } = await server.ssrLoadModule('/src/features/library/libraryViewControls.ts')
  const { nextMenuItemIndex } = await server.ssrLoadModule('/src/utils/menuKeyboard.ts')
  const { appearanceCssVariables } = await server.ssrLoadModule('/src/utils/theme.ts')
  const { projectArtBackgroundUrl, projectArtCoverUrl } = await server.ssrLoadModule('/src/services/projectArt.ts')
  const { redactSensitiveText } = await server.ssrLoadModule('/src/utils/redactSensitiveText.ts')
  const { parseEventLogEntry } = await server.ssrLoadModule('/src/features/settings/eventLog.ts')

  const noop = () => {}
  const repo = {
    id: 1,
    name: 'demo-app',
    full_name: 'CpPrice11/demo-app',
    owner: { login: 'CpPrice11', avatar_url: 'https://example.com/avatar.png' },
    description: 'Demo application',
    stargazers_count: 42,
    updated_at: '2026-07-16T10:00:00Z',
    html_url: 'https://github.com/CpPrice11/demo-app',
    language: 'TypeScript',
    topics: ['desktop'],
    has_releases: true,
    fork: false,
    archived: false,
    private: false,
  }
  const installedApp = {
    name: 'demo-app',
    owner: 'CpPrice11',
    repo: 'demo-app',
    activeVersion: 'v1.0.0',
    lastLaunchedAt: '2026-07-16T09:00:00Z',
    versions: [{
      tag: 'v1.0.0',
      installedAt: '2026-07-15T10:00:00Z',
      executable: 'demo.exe',
      sizeBytes: 1024,
    }],
  }
  const render = (Component, props) => renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { initialLanguage: 'uk' },
      React.createElement(Component, props),
    ),
  )

  assert.equal(getLibraryAppStatus(undefined, 'v2.0.0'), 'available')
  assert.equal(getLibraryAppStatus(installedApp, 'v1.0.0'), 'installed')
  assert.equal(getLibraryAppStatus(installedApp, 'v2.0.0'), 'update')
  assert.deepEqual(['update', 'installed', 'available'].map(getLibraryStatusRank), [0, 1, 2])
  assert.equal(getUpdateDismissKey('CpPrice11', 'Demo-App', 'V2'), 'cpprice11/demo-app@v2')
  assert.deepEqual(
    ['ArrowDown', 'ArrowUp', 'Home', 'End'].map((key) => nextMenuItemIndex(key, 0, 4)),
    [1, 3, 0, 3],
  )
  assert.equal(nextMenuItemIndex('ArrowDown', -1, 4), 0)
  assert.equal(nextMenuItemIndex('ArrowDown', 0, 0), -1)
  assert.deepEqual([...toggleSelectedKey(new Set(['a']), 'b')], ['a', 'b'])
  assert.deepEqual([...toggleSelectedKey(new Set(['a', 'b']), 'a')], ['b'])
  assert.deepEqual([...selectKeyRange(['a', 'b', 'c', 'd'], 'b', 'd')], ['b', 'c', 'd'])
  assert.deepEqual([...selectKeyRange(['a', 'b', 'c', 'd'], 'd', 'b')], ['b', 'c', 'd'])
  assert.deepEqual([...selectVisibleKeys(['a', 'b', 'c'])], ['a', 'b', 'c'])
  assert.equal(clearSelectedKeys().size, 0)
  assert.equal(getInactiveInstalledVersions([installedApp]).length, 0)
  const appWithOldVersion = {
    ...installedApp,
    versions: [
      installedApp.versions[0],
      { ...installedApp.versions[0], tag: 'v0.9.0', sizeBytes: 512 },
    ],
  }
  assert.deepEqual(
    getInactiveInstalledVersions([installedApp, appWithOldVersion]).map((item) => item.version.tag),
    ['v0.9.0'],
  )
  const partialBulk = await runSequentialBulk(
    ['ok', 'failed', 'ok-2'],
    (item) => item,
    async (item) => {
      if (item === 'failed') throw new Error('expected')
    },
  )
  assert.deepEqual(partialBulk.succeededKeys, ['ok', 'ok-2'])
  assert.deepEqual(partialBulk.failedKeys, ['failed'])
  const diagnostics = redactSensitiveText(
    'token=secret github=ghp_private C:\\Users\\sasha\\Downloads unix=/home/alex/apps',
  )
  assert.equal(
    diagnostics,
    'token=<redacted> github=<redacted> C:\\Users\\<user>\\Downloads unix=/home/<user>/apps',
  )
  assert.deepEqual(
    parseEventLogEntry('[2026-07-18T10:01:00Z] install CpPrice11/demo@v2: download installed successfully'),
    {
      timestamp: '2026-07-18T10:01:00Z',
      level: 'success',
      source: 'install',
      message: 'download installed successfully',
      technical: 'CpPrice11/demo@v2',
    },
  )
  assert.equal(parseEventLogEntry('[2026-07-18T10:02:00Z] startup cleanup failed: denied').level, 'error')
  assert.equal(parseEventLogEntry('2026-07-18T10:03:00Z settings.loaded').source, 'settings')
  assert.equal(parseEventLogEntry('[2026-07-18T10:04:00Z] install CpPrice11/demo@v2: download canceled').level, 'warning')
  assert.equal(parseEventLogEntry('[2026-07-18T10:05:00Z] install CpPrice11/demo@v2: download started').level, 'info')
  assert.deepEqual(
    parseEventLogEntry('[2026-07-18T10:06:00Z] launch CpPrice11/demo@v2: launched C:\\Users\\tester\\Pullora Apps\\demo.exe'),
    {
      timestamp: '2026-07-18T10:06:00Z',
      level: 'success',
      source: 'launch',
      message: 'launched',
      technical: 'CpPrice11/demo@v2\nC:\\Users\\tester\\Pullora Apps\\demo.exe',
    },
  )
  assert.deepEqual(
    parseEventLogEntry('[2026-07-18T10:07:00Z] install CpPrice11/demo@v2: download failed\nC:\\Temp\\package.zip\nAccess denied'),
    {
      timestamp: '2026-07-18T10:07:00Z',
      level: 'error',
      source: 'install',
      message: 'download failed',
      technical: 'CpPrice11/demo@v2\nC:\\Temp\\package.zip\nAccess denied',
    },
  )

  const darkSurfaces = appearanceCssVariables({
    density: 'comfortable',
    surfaceTransparency: 40,
    surfaceBlur: 12,
  }, 'dark')
  assert.equal(darkSurfaces['--surface-1'], 'color-mix(in srgb, #111820 60%, transparent)')
  assert.equal(darkSurfaces['--surface-2'], 'color-mix(in srgb, #18222d 33%, transparent)')
  assert.equal(darkSurfaces['--surface-material'], 'var(--surface-1)')

  const coverOnlyArt = { coverDataUrl: 'data:image/png;base64,cover' }
  const independentArt = {
    ...coverOnlyArt,
    backgroundDataUrl: 'data:image/png;base64,background',
  }
  assert.equal(projectArtCoverUrl(coverOnlyArt), coverOnlyArt.coverDataUrl)
  assert.equal(projectArtBackgroundUrl(coverOnlyArt, { fallbackToCover: false }), null)
  assert.equal(projectArtBackgroundUrl(independentArt, { fallbackToCover: false }), independentArt.backgroundDataUrl)

  const olderRepo = { ...repo, id: 2, name: 'alpha-app', updated_at: '2026-07-14T10:00:00Z' }
  const newerInstall = {
    ...installedApp,
    repo: olderRepo.name,
    lastLaunchedAt: '2026-07-14T09:00:00Z',
    versions: [{ ...installedApp.versions[0], installedAt: '2026-07-16T10:00:00Z' }],
  }
  const installedByRepo = new Map([[repo.name, installedApp], [olderRepo.name, newerInstall]])
  const sortedNames = (sort) => sortLibraryRepositories(
    [repo, olderRepo],
    sort,
    (item) => installedByRepo.get(item.name),
  ).map((item) => item.name)
  assert.deepEqual(sortedNames('name'), ['alpha-app', 'demo-app'])
  assert.deepEqual(sortedNames('launched'), ['demo-app', 'alpha-app'])
  assert.deepEqual(sortedNames('installed'), ['alpha-app', 'demo-app'])
  assert.deepEqual(sortedNames('updated'), ['demo-app', 'alpha-app'])

  const savedView = parseLibraryViewState(JSON.stringify({
    version: 1,
    query: 'demo',
    filter: 'installed',
    sort: 'launched',
    density: 'compact',
    featuredRepoKey: 'cpprice11/demo-app',
    sidebarScrollTop: 120,
    detailsScrollTop: 240,
  }))
  assert.deepEqual(savedView, {
    version: 1,
    query: 'demo',
    filter: 'installed',
    sort: 'launched',
    density: 'compact',
    featuredRepoKey: 'cpprice11/demo-app',
    sidebarScrollTop: 120,
    detailsScrollTop: 240,
  })
  assert.deepEqual(parseLibraryViewState('{broken'), {
    version: 1,
    query: '',
    filter: 'all',
    sort: 'updated',
    density: 'normal',
    featuredRepoKey: null,
    sidebarScrollTop: 0,
    detailsScrollTop: 0,
  })
  assert.equal(parseLibraryViewState(JSON.stringify({ ...savedView, filter: 'favorites' })).filter, 'all')
  assert.deepEqual([...LIBRARY_FILTERS], ['all', 'updates', 'installed'])
  assert.deepEqual([...LIBRARY_SORTS], ['name', 'launched', 'installed', 'updated'])
  assert.deepEqual([...LIBRARY_DENSITIES], ['normal', 'compact'])

  const densityStyles = readFileSync('src/styles/features/LibraryDensity.css', 'utf8')
  assert.equal((densityStyles.match(/library-density-compact/g) ?? []).length, 1)
  for (const legacyStylesPath of ['src/pages/PageStyles.css', 'src/styles/Cinematic.css']) {
    assert.doesNotMatch(readFileSync(legacyStylesPath, 'utf8'), /library-density-compact/)
  }

  const settingsSectionsSource = readFileSync('src/features/settings/components/SettingsSections.tsx', 'utf8')
  const settingsPageSource = readFileSync('src/pages/SettingsPage.tsx', 'utf8')
  const pageStylesSource = readFileSync('src/pages/PageStyles.css', 'utf8')
  const appStylesSource = readFileSync('src/App.css', 'utf8')
  const cinematicStylesSource = readFileSync('src/styles/Cinematic.css', 'utf8')
  const searchComponentsStyles = readFileSync('src/features/library/components/SearchComponents.css', 'utf8')
  const installStyles = readFileSync('src/components/Install/Install.css', 'utf8')
  const libraryPageSource = readFileSync('src/features/library/LibraryPage.tsx', 'utf8')
  const repoCardSource = readFileSync('src/features/library/components/RepoCard.tsx', 'utf8')
  const releaseSelectorSource = readFileSync('src/components/Install/ReleaseSelector.tsx', 'utf8')
  const downloadServiceSource = readFileSync('src/services/download.ts', 'utf8')
  assert.match(settingsSectionsSource, /value=\{settings\.installationPath\}[\s\S]*?readOnly/)
  const migratedSettings = normalizeSettings({ includePrereleases: true, assetStrategy: 'manual', githubOwner: 'OtherOwner' })
  assert.equal(migratedSettings.githubOwner, 'CpPrice11')
  assert.deepEqual(
    migratedSettings,
    normalizeSettings({ includePrereleases: false, assetStrategy: 'portableFirst', githubOwner: 'CpPrice11' }),
  )
  assert.doesNotMatch(settingsPageSource, /id: 'installation'/)
  assert.doesNotMatch(settingsPageSource, /id: 'updates'/)
  assert.doesNotMatch(settingsPageSource, /workspaceSubtitle/)
  assert.doesNotMatch(settingsSectionsSource, /githubOwnerPlaceholder|recentGithubOwners|settings-owner-chips/)
  assert.deepEqual(
    [
      ukDictionary['settings.launcherBackground'],
      ukDictionary['settings.editAction'],
      ukDictionary['settings.resetAction'],
      ukDictionary['settings.underlayAppearance'],
      ukDictionary['art.changeThemeBackground'].replace('{theme}', ukDictionary['settings.light']),
      ukDictionary['art.resetThemeBackground'].replace('{theme}', ukDictionary['settings.dark']),
    ],
    ['Фон', 'Редагувати', 'Скинути', 'Підкладки', 'Редагувати фон — Світла', 'Скинути фон — Темна'],
  )
  assert.deepEqual(
    [
      enDictionary['settings.launcherBackground'],
      enDictionary['settings.editAction'],
      enDictionary['settings.resetAction'],
      enDictionary['settings.underlayAppearance'],
      enDictionary['art.changeThemeBackground'].replace('{theme}', enDictionary['settings.light']),
      enDictionary['art.resetThemeBackground'].replace('{theme}', enDictionary['settings.dark']),
    ],
    ['Background', 'Edit', 'Reset', 'Surfaces', 'Edit background — Light', 'Reset background — Dark'],
  )
  assert.match(settingsSectionsSource, /settings-source-summary settings-grid-wide/)
  assert.match(settingsSectionsSource, /settings-source-summary-owner[\s\S]*?<strong>CpPrice11<\/strong>/)
  assert.match(settingsSectionsSource, /settings-source-summary-copy[\s\S]*?sourceSummaryText[\s\S]*?githubTokenHelp/)
  assert.match(settingsSectionsSource, /settings-source-summary settings-grid-wide[\s\S]*?id="theme"[\s\S]*?id="language"[\s\S]*?launcher-background-control[\s\S]*?underlay-controls[\s\S]*?id="installPath"/)
  assert.match(settingsSectionsSource, /aria-label=\{t\('art\.changeThemeBackground'[\s\S]*?settings\.editAction/)
  assert.match(settingsSectionsSource, /aria-label=\{t\('art\.resetThemeBackground'[\s\S]*?settings\.resetAction/)
  assert.doesNotMatch(settingsSectionsSource, /underlayAppearanceHelp/)
  assert.doesNotMatch(settingsSectionsSource, /settings-reset-control|onRequestReset/)
  assert.match(settingsPageSource, /className="settings-nav-reset"[\s\S]*?setConfirmation\('reset'\)/)
  assert.doesNotMatch(settingsPageSource, /exportInstalledRegistry|importInstalledRegistry|pickJsonFile|pickJsonSavePath|window\.confirm/)
  assert.doesNotMatch(settingsSectionsSource, /exportInstalledRegistry|importInstalledRegistry|registryBusy|settings-diagnostics-card/)
  assert.match(settingsSectionsSource, /settings-storage-title[\s\S]*?settings-diagnostics-title/)
  assert.match(settingsSectionsSource, /settings-storage-title[\s\S]*?openUpdateCache[\s\S]*?cleanupLauncherFiles/)
  assert.match(settingsSectionsSource, /settings-diagnostics-title[\s\S]*?clearCache[\s\S]*?copyDiagnostics/)
  assert.match(settingsPageSource, /normalizeAppearance\(DEFAULT_SETTINGS\.appearance\)/)
  assert.match(settingsPageSource, /saveInstallationPath\(''\)/)
  assert.doesNotMatch(pageStylesSource, /\.settings-reset-control/)
  assert.match(pageStylesSource, /\.project-actions-popover,\s*\.repo-actions-submenu-panel\s*\{[^}]*background:\s*var\(--surface-material-strong\)[^}]*border:\s*1px solid var\(--surface-border-strong\)[^}]*box-shadow:\s*var\(--surface-shadow\)/s)
  assert.doesNotMatch(pageStylesSource, /linear-gradient\(145deg, rgba\(44, 48, 55/)
  assert.equal((repoCardSource.match(/className="repo-actions-menu-separator" role="separator"/g) ?? []).length, 3)
  assert.equal((repoCardSource.match(/setActionsOpen\(false\)/g) ?? []).length, 1)
  assert.match(repoCardSource, /const closeActions = \(restoreFocus = true\)[\s\S]*?cardRef\.current\?\.focus\(\)/)
  assert.match(repoCardSource, /document\.getElementById\('app-overlay-root'\)/)
  assert.match(repoCardSource, /actionsRef\.current\.getBoundingClientRect\(\)/)
  assert.match(repoCardSource, /window\.addEventListener\('scroll', closeAndRestoreFocus, true\)/)
  assert.match(repoCardSource, /REPO_MENU_OPEN_EVENT/)
  assert.doesNotMatch(repoCardSource, /window\.innerWidth - 288/)
  assert.match(pageStylesSource, /\.repo-actions-menu-separator\s*\{[^}]*background:\s*var\(--surface-border\)/s)
  assert.match(pageStylesSource, /\.repo-actions-submenu-trigger span\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(cinematicStylesSource, /\.settings-nav-reset\s*\{[^}]*margin-top:\s*auto/)
  assert.doesNotMatch(pageStylesSource, /\.launcher-background-control\s*\{[^}]*grid-column/)
  assert.doesNotMatch(pageStylesSource, /\.underlay-controls\s*\{[^}]*grid-column/)
  assert.match(pageStylesSource, /\.path-input-row input\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.match(
    appStylesSource,
    /:where\([\s\S]*?button[\s\S]*?\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-primary\)/,
  )
  assert.match(
    appStylesSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition-duration:\s*0\.001ms !important/,
  )
  assert.match(
    pageStylesSource,
    /\.about-toast,\s*\.library-toast\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*var\(--z-notification\);/s,
  )
  assert.match(appStylesSource, /--z-notification:\s*1100;/)
  assert.match(settingsSectionsSource, /pathValidation === 'noWritePermission'[\s\S]*?settings\.pathNoWrite/)
  assert.match(settingsPageSource, /setInstallationPath as saveInstallationPath/)
  assert.match(libraryPageSource, /installationPath=\{settings\.installationPath\}/)
  assert.match(
    libraryPageSource,
    /filter === 'updates' \? \(\s*renderUpdatesCenter\(\)\s*\) : \(\s*<>[\s\S]*?renderHero\(\)[\s\S]*?renderOperationsPanel\(\)/,
  )
  assert.match(
    libraryPageSource,
    /initialLibraryView\.filter === 'updates' \? 0 : initialLibraryView\.detailsScrollTop/,
  )
  assert.match(
    libraryPageSource,
    /nextFilter === 'updates'[\s\S]*?detailsScrollTopRef\.current = 0[\s\S]*?detailsPaneRef\.current\.scrollTop = 0/,
  )
  assert.match(
    libraryPageSource,
    /libraryToastMessage[\s\S]*?createPortal\([\s\S]*?library-toast--\$\{libraryToastError \? 'error' : 'success'\}[\s\S]*?document\.body/,
  )
  assert.match(
    searchComponentsStyles,
    /\.updates-center[\s\S]*?box-sizing: border-box;[\s\S]*?width: 100%;/,
  )
  assert.match(
    searchComponentsStyles,
    /@media \(max-width: 1180px\)[\s\S]*?\.updates-center-main[\s\S]*?grid-template-columns: 1fr;/,
  )
  assert.match(
    installStyles,
    /\.download-panel--compact[\s\S]*?min-width: 0;[\s\S]*?width: 100%;/,
  )
  assert.match(releaseSelectorSource, /useState\(settings\.installationPath \?\? ''\)/)
  assert.match(releaseSelectorSource, /setInstallPath\(dir\)/)
  assert.match(releaseSelectorSource, /setInstallationPath\(installPath\.trim\(\)\)/)
  assert.match(releaseSelectorSource, /validateInstallationPath\(path\)[\s\S]*?installPathValidation !== 'valid'/)
  assert.match(releaseSelectorSource, /release-install-path[\s\S]*?aria-busy=\{installPathValidation === 'checking'\}/)
  assert.match(releaseSelectorSource, /aria-invalid=\{installPathValidation === 'invalid' \? true : undefined\}/)
  assert.match(releaseSelectorSource, /onInstallPathError\?\.\(message\)/)
  assert.doesNotMatch(downloadServiceSource, /installPath/)

  const hero = render(LibraryHero, {
    repo,
    installedApp,
    latestVersion: 'v2.0.0',
    backgroundStyle: { '--library-hero-background': 'url("hero-background")' },
    isFavorite: false,
    favoriteBusy: false,
    canResetCover: false,
    canResetBackground: false,
    onInstall: noop,
    onLaunch: noop,
    onToggleFavorite: noop,
    onShowDetails: noop,
    onOpenFolder: noop,
    onChangeCover: noop,
    onChangeBackground: noop,
    onResetCover: noop,
    onResetBackground: noop,
    onUninstall: noop,
  })
  assert.match(hero, /library-hero/)
  assert.match(hero, /repo-status update/)
  assert.match(hero, /class="library-hero-background" style="--library-hero-background:url\(&quot;hero-background&quot;\)"/)
  assert.match(hero, /class="library-hero-gradient"/)
  assert.match(hero, /class="library-hero-accent"/)
  assert.match(hero, /class="library-hero-content"/)
  assert.doesNotMatch(hero, /<section[^>]+style=/)

  const effectiveInstallPath = 'C:\\Users\\demo\\AppData\\Local\\Pullora\\Apps'
  const operationsPanel = render(LibraryOperationsPanel, {
    repo,
    installedApp,
    latestVersion: 'v2.0.0',
    installationPath: effectiveInstallPath,
    onInstall: noop,
    onLaunch: noop,
  })
  assert.match(operationsPanel, /library-ops-panel update/)
  assert.match(operationsPanel, /library-inline-panel--versions/)
  assert.match(operationsPanel, /library-inline-panel--details/)
  assert.match(operationsPanel, new RegExp(`${effectiveInstallPath.replaceAll('\\', '\\\\')}\\\\CpPrice11-demo-app`))

  const sidebar = render(LibrarySidebar, {
    filter: 'all',
    sort: 'updated',
    density: 'normal',
    query: '',
    groups: [{ id: 'system', label: 'System', sections: [{ id: 'favorites', title: 'Favorites', repositories: [repo] }] }],
    collapsedFolderIds: new Set(),
    showLoading: false,
    showEmpty: false,
    emptyTitle: '',
    emptyMessage: '',
    emptyActionLabel: '',
    loading: false,
    hasMore: false,
    onFilterChange: noop,
    onSortChange: noop,
    onDensityChange: noop,
    onQueryChange: noop,
    onToggleSection: noop,
    onEmptyAction: noop,
    onLoadMore: noop,
    renderRepository: (item) => React.createElement('span', { key: item.id }, item.name),
  })
  assert.match(sidebar, /library-sam-list-pane/)
  const filterNav = sidebar.match(/library-sidebar-filter-nav[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
  const filterLabels = ['library.all', 'library.updates', 'library.installed']
    .map((key) => ukDictionary[key])
  assert.equal((filterNav.match(/<button/g) ?? []).length, 3)
  assert.doesNotMatch(filterNav, /Favorites/)
  assert.ok(filterNav.indexOf(filterLabels[0]) < filterNav.indexOf(filterLabels[1]))
  assert.ok(filterNav.indexOf(filterLabels[1]) < filterNav.indexOf(filterLabels[2]))
  assert.equal((filterNav.match(/library-filter-icon/g) ?? []).length, 2)
  for (const label of filterLabels.slice(1)) {
    assert.ok(filterNav.includes(`aria-label="${label}"`))
    assert.ok(filterNav.includes(`title="${label}"`))
  }
  assert.match(sidebar, /Favorites/)
  assert.match(sidebar, /library-search/)
  assert.match(sidebar, /library-sidebar-filter-nav/)
  assert.match(sidebar, /library-density-toggle/)
  assert.match(sidebar, /library-sort-control/)
  assert.match(sidebar, /aria-pressed="true"/)
  assert.match(sidebar, /role="switch" aria-checked="false"/)
  assert.doesNotMatch(sidebar, new RegExp(ukDictionary['library.viewNormal']))
  assert.match(sidebar, new RegExp(ukDictionary['library.viewCompact']))
  assert.ok(sidebar.indexOf('library-sidebar-filter-nav') < sidebar.indexOf('library-sort-control'))
  assert.ok(sidebar.indexOf('library-sort-control') < sidebar.indexOf('library-search'))
  assert.ok(sidebar.indexOf('library-search') < sidebar.indexOf('library-density-toggle'))
  assert.equal((sidebar.match(/library-sidebar-nav-btn/g) ?? []).length, LIBRARY_FILTERS.length)
  assert.equal((sidebar.match(/library-density-toggle/g) ?? []).length, 1)
  assert.equal((sidebar.match(/<option/g) ?? []).length, LIBRARY_SORTS.length)

  const bulkCard = render(RepoCard, {
    repo,
    installedApp,
    latestVersion: 'v2.0.0',
    isFavorite: false,
    isBulkSelected: true,
    onBulkSelect: noop,
    onPreview: noop,
  })
  assert.match(bulkCard, /bulk-selected/)
  assert.match(bulkCard, /aria-pressed="true"/)
  assert.match(bulkCard, /aria-keyshortcuts="Control\+Space Meta\+Space Shift\+Space"/)

  const bulkActions = render(LibraryBulkActions, {
    selectedCount: 2,
    visibleCount: 3,
    updateCount: 1,
    installedCount: 1,
    cleanupVersionCount: 1,
    busy: false,
    folders: [{ id: 'tools', name: 'Tools' }],
    message: 'Done',
    error: 'Retry',
    onSelectAll: noop,
    onClear: noop,
    onUpdate: noop,
    onMoveToFolder: noop,
    onAddFavorite: noop,
    onRemoveFavorite: noop,
    onRequestCleanup: noop,
    onRequestUninstall: noop,
  })
  assert.match(bulkActions, /library-bulk-actions/)
  assert.match(bulkActions, /aria-live="polite"/)
  assert.match(bulkActions, /role="alert"/)

  const bulkConfirm = render(LibraryBulkConfirmDialog, {
    action: 'cleanup',
    appCount: 2,
    versionCount: 3,
    sizeBytes: 2048,
    busy: false,
    onCancel: noop,
    onConfirm: noop,
  })
  assert.match(bulkConfirm, /role="alertdialog"/)
  assert.match(bulkConfirm, /aria-modal="true"/)
  assert.match(bulkConfirm, /aria-describedby=/)
  assert.match(bulkConfirm, /aria-busy="false"/)
  assert.match(bulkConfirm, /data-autofocus="true"/)
  assert.match(bulkConfirm, /dialog-close-icon/)

  const busyBulkConfirm = render(LibraryBulkConfirmDialog, {
    action: 'uninstall',
    appCount: 2,
    versionCount: 3,
    sizeBytes: 2048,
    busy: true,
    error: 'Test error',
    onCancel: noop,
    onConfirm: noop,
  })
  assert.match(busyBulkConfirm, /aria-busy="true"/)
  assert.match(busyBulkConfirm, /role="alert"/)
  assert.match(busyBulkConfirm, /role="status"/)

  const versionPanel = render(VersionPanel, { repoName: repo.name, installedApp, latestVersion: 'v2.0.0' })
  assert.match(versionPanel, /library-inline-panel--versions/)
  assert.match(versionPanel, /1 КБ/)
  assert.match(render(ApplicationDetails, { repo, updatedDate: '16.07.2026', latestVersion: 'v2.0.0', installPath: 'C:\\Apps\\demo-app' }), /library-inline-panel--details/)
  const folderManager = render(FolderManager, { targetName: repo.name, existingNames: [], onCancel: noop, onConfirm: noop })
  assert.match(folderManager, /role="dialog"/)
  assert.match(folderManager, /tabindex="-1"/)
  const batchPanel = render(BatchUpdatePanel, {
    items: [{ repo, currentVersion: 'v1.0.0', latestVersion: 'v2.0.0' }],
    skippedCount: 1,
    lastChecked: '12:34',
    checking: false,
    updating: false,
    versionErrorCount: 0,
    onCheck: noop,
    onUpdateAll: noop,
    onClearSkipped: noop,
    onUpdate: noop,
    onShowDetails: noop,
    onSkip: noop,
  })
  assert.match(batchPanel, /updates-center-row/)
  assert.match(batchPanel, /updates-center-row-main/)
  assert.match(batchPanel, /updates-center-version-change/)
  assert.match(batchPanel, /updates-center-row-status/)
  assert.match(batchPanel, /v1\.0\.0[^<]*→[^<]*v2\.0\.0/)
  assert.equal((batchPanel.match(/class="updates-center-status"/g) ?? []).length, 3)
  assert.match(batchPanel, /updates-center-statuses" role="status" aria-live="polite"/)
  assert.doesNotMatch(batchPanel, /updates-center-stats/)
  assert.doesNotMatch(batchPanel, /Перевіряй усі встановлені застосунки тут/)
  assert.match(batchPanel, /aria-haspopup="dialog"/)
  assert.match(batchPanel, /aria-busy="false"/)
  assert.match(batchPanel, /updates-clear-skipped/)

  const busyBatchPanel = render(BatchUpdatePanel, {
    items: [],
    skippedCount: 0,
    checking: true,
    updating: false,
    versionErrorCount: 0,
    updateMessage: 'Updated',
    onCheck: noop,
    onUpdateAll: noop,
    onClearSkipped: noop,
    onUpdate: noop,
    onShowDetails: noop,
    onSkip: noop,
  })
  assert.match(busyBatchPanel, /aria-busy="true"/)
  assert.match(busyBatchPanel, /role="status" aria-live="polite"/)
  assert.ok(busyBatchPanel.includes(ukDictionary['updates.emptyChecking']))
  assert.doesNotMatch(busyBatchPanel, /role="alert"/)
  assert.doesNotMatch(busyBatchPanel, /updates-clear-skipped/)

  const emptyBatchPanelProps = {
    items: [],
    skippedCount: 0,
    checking: false,
    updating: false,
    versionErrorCount: 0,
    onCheck: noop,
    onUpdateAll: noop,
    onClearSkipped: noop,
    onUpdate: noop,
    onShowDetails: noop,
    onSkip: noop,
  }
  const notCheckedBatchPanel = render(BatchUpdatePanel, emptyBatchPanelProps)
  const currentBatchPanel = render(BatchUpdatePanel, { ...emptyBatchPanelProps, lastChecked: '12:34' })
  const partialBatchPanel = render(BatchUpdatePanel, {
    ...emptyBatchPanelProps,
    lastChecked: '12:34',
    versionErrorCount: 2,
  })
  assert.ok(notCheckedBatchPanel.includes(ukDictionary['updates.emptyNotChecked'].split('"')[0]))
  assert.ok(currentBatchPanel.includes(ukDictionary['updates.emptyCurrent']))
  assert.ok(partialBatchPanel.includes(ukDictionary['updates.emptyPartial'].replace('{count}', '2')))
  assert.match(notCheckedBatchPanel, /class="hero-primary-btn"[^>]*disabled=""/)
  assert.equal((notCheckedBatchPanel.match(/updates-center-empty/g) ?? []).length, 1)
  assert.equal((currentBatchPanel.match(/updates-center-empty/g) ?? []).length, 1)
  assert.equal((partialBatchPanel.match(/updates-center-empty/g) ?? []).length, 1)

  const download = render(DownloadProgressPanel, {
    downloads: [{
      id: 'download-1',
      fileName: 'demo.zip',
      progress: 48.4,
      totalSize: 1024,
      downloadedSize: 512,
      status: 'downloading',
      stage: 'downloading',
    }],
    onCancel: noop,
  })
  assert.match(download, /role="progressbar"/)
  assert.match(download, /aria-valuenow="48"/)
  assert.match(download, /role="status" aria-live="polite"/)
  assert.match(download, /aria-busy="true"/)
  assert.match(download, /class="cancel-btn"/)
  assert.doesNotMatch(download, /download-action-btn primary/)

  const completedDownload = render(DownloadProgressPanel, {
    downloads: [{
      id: 'download-completed',
      fileName: 'demo.zip',
      progress: 100,
      totalSize: 1024,
      downloadedSize: 1024,
      status: 'completed',
      stage: 'completed',
      owner: 'CpPrice11',
      repo: 'demo-app',
    }],
    onCancel: noop,
    onLaunch: noop,
    onOpenFolder: noop,
    onBackToLibrary: noop,
  })
  assert.match(completedDownload, /download-item--completed/)
  assert.match(completedDownload, /aria-busy="false"/)
  assert.equal((completedDownload.match(/download-action-btn primary/g) ?? []).length, 1)
  assert.ok(completedDownload.includes(ukDictionary['download.launch']))
  assert.ok(completedDownload.includes(ukDictionary['download.openFolder']))
  assert.doesNotMatch(completedDownload, /download-recovery/)

  const completedDownloadWithoutTarget = render(DownloadProgressPanel, {
    downloads: [{
      id: 'download-completed-without-target',
      fileName: 'demo.zip',
      progress: 100,
      totalSize: 1024,
      downloadedSize: 1024,
      status: 'completed',
      stage: 'completed',
    }],
    onCancel: noop,
    onLaunch: noop,
    onOpenFolder: noop,
  })
  assert.doesNotMatch(completedDownloadWithoutTarget, /download-actions/)

  const compactDownload = render(DownloadProgressPanel, {
    compact: true,
    downloads: [{
      id: 'download-active',
      fileName: 'active.zip',
      progress: 50,
      totalSize: 1024,
      downloadedSize: 512,
      status: 'downloading',
      stage: 'downloading',
    }, {
      id: 'download-finished',
      fileName: 'finished.zip',
      progress: 100,
      totalSize: 1024,
      downloadedSize: 1024,
      status: 'completed',
      stage: 'completed',
    }],
    onCancel: noop,
  })
  assert.match(compactDownload, /download-panel--compact/)
  assert.match(compactDownload, /aria-expanded="false"/)
  assert.match(compactDownload, /active\.zip/)
  assert.doesNotMatch(compactDownload, /finished\.zip/)

  const failedDownload = render(DownloadProgressPanel, {
    downloads: [{
      id: 'download-failed',
      fileName: 'demo.zip',
      progress: 50,
      totalSize: 1024,
      downloadedSize: 512,
      status: 'failed',
      stage: 'failed',
    }],
    onCancel: noop,
    onRetry: noop,
    onChooseAnother: noop,
    onOpenFolder: noop,
    onCleanup: noop,
  })
  assert.match(failedDownload, /download-item--failed/)
  assert.match(failedDownload, /download-recovery" role="alert"/)
  assert.equal((failedDownload.match(/download-action-btn primary/g) ?? []).length, 1)
  assert.equal((failedDownload.match(/download-action-btn/g) ?? []).length, 3)
  assert.ok(failedDownload.includes(ukDictionary['download.retry']))
  assert.ok(failedDownload.includes(ukDictionary['download.cleanup']))
  assert.ok(!failedDownload.includes(ukDictionary['download.openFolder']))

  const errorState = render(StatePanel, { kind: 'error', title: 'Failed' })
  assert.match(errorState, /role="alert" aria-live="assertive"/)
  assert.match(render(StatePanel, { kind: 'loading', title: 'Loading' }), /role="status" aria-live="polite" aria-busy="true"/)

  const batchConfirmation = render(BatchUpdateConfirmDialog, {
    items: [{ repo, currentVersion: 'v1.0.0', latestVersion: 'v2.0.0' }],
    onCancel: noop,
    onConfirm: noop,
  })
  assert.match(batchConfirmation, /role="dialog"/)
  assert.match(batchConfirmation, /aria-modal="true"/)
  assert.match(batchConfirmation, /demo-app/)

  console.log('[components] library panels and status rules: ok')
} finally {
  await server.close()
}
