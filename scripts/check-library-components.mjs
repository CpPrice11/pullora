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
  const { APPEARANCE_PRESETS } = await server.ssrLoadModule('/src/utils/settingsDefaults.ts')

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

  const darkSurfaces = appearanceCssVariables({ ...APPEARANCE_PRESETS.github, surfaceTransparency: 40 })
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
  assert.deepEqual([...LIBRARY_FILTERS], ['all', 'installed', 'updates', 'favorites'])
  assert.deepEqual([...LIBRARY_SORTS], ['name', 'launched', 'installed', 'updated'])
  assert.deepEqual([...LIBRARY_DENSITIES], ['normal', 'compact'])

  const densityStyles = readFileSync('src/styles/features/LibraryDensity.css', 'utf8')
  assert.equal((densityStyles.match(/library-density-compact/g) ?? []).length, 1)
  for (const legacyStylesPath of ['src/pages/PageStyles.css', 'src/styles/Cinematic.css']) {
    assert.doesNotMatch(readFileSync(legacyStylesPath, 'utf8'), /library-density-compact/)
  }

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

  const operationsPanel = render(LibraryOperationsPanel, {
    repo,
    installedApp,
    latestVersion: 'v2.0.0',
    installationPath: 'C:\\Pullora',
    onInstall: noop,
    onLaunch: noop,
  })
  assert.match(operationsPanel, /library-ops-panel update/)
  assert.match(operationsPanel, /library-inline-panel--versions/)
  assert.match(operationsPanel, /library-inline-panel--details/)
  assert.match(operationsPanel, /C:\\Pullora\\CpPrice11-demo-app/)

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
  assert.match(sidebar, /library-search/)
  assert.match(sidebar, /library-sidebar-filter-nav/)
  assert.match(sidebar, /library-density-toggle/)
  assert.match(sidebar, /library-sort-control/)
  assert.match(sidebar, /aria-pressed="true"/)
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
  })
  assert.match(batchPanel, /updates-center-row/)
  assert.match(batchPanel, /aria-haspopup="dialog"/)
  assert.match(batchPanel, /aria-busy="false"/)

  const busyBatchPanel = render(BatchUpdatePanel, {
    items: [],
    skippedCount: 0,
    checking: true,
    updating: false,
    versionErrorCount: 0,
    updateMessage: 'Updated',
    error: 'Failed',
    onCheck: noop,
    onUpdateAll: noop,
    onClearSkipped: noop,
    onUpdate: noop,
    onShowDetails: noop,
    onSkip: noop,
  })
  assert.match(busyBatchPanel, /aria-busy="true"/)
  assert.match(busyBatchPanel, /role="status" aria-live="polite"/)
  assert.match(busyBatchPanel, /role="alert"/)

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
    }],
    onCancel: noop,
    onLaunch: noop,
    onOpenFolder: noop,
    onBackToLibrary: noop,
  })
  assert.match(completedDownload, /download-item--completed/)
  assert.match(completedDownload, /aria-busy="false"/)
  assert.equal((completedDownload.match(/download-action-btn primary/g) ?? []).length, 1)

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
    onCleanup: noop,
  })
  assert.match(failedDownload, /download-item--failed/)
  assert.match(failedDownload, /download-recovery" role="alert"/)
  assert.equal((failedDownload.match(/download-action-btn primary/g) ?? []).length, 1)

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
