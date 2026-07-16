import assert from 'node:assert/strict'
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
  const { default: LibrarySidebar } = await server.ssrLoadModule('/src/features/library/components/LibrarySidebar.tsx')
  const { default: VersionPanel } = await server.ssrLoadModule('/src/features/library/components/VersionPanel.tsx')
  const { default: ApplicationDetails } = await server.ssrLoadModule('/src/features/library/components/ApplicationDetails.tsx')
  const { default: FolderManager } = await server.ssrLoadModule('/src/features/library/components/FolderManager.tsx')
  const { default: BatchUpdatePanel, BatchUpdateConfirmDialog } = await server.ssrLoadModule('/src/features/library/components/BatchUpdatePanel.tsx')
  const { default: DownloadProgressPanel } = await server.ssrLoadModule('/src/components/Install/DownloadProgress.tsx')
  const { default: StatePanel } = await server.ssrLoadModule('/src/components/State/StatePanel.tsx')
  const { getLibraryAppStatus, getLibraryStatusRank, getUpdateDismissKey } = await server.ssrLoadModule('/src/features/library/libraryStatus.ts')
  const { sortLibraryRepositories } = await server.ssrLoadModule('/src/features/library/hooks/useLibraryFiltering.ts')
  const { parseLibraryViewState } = await server.ssrLoadModule('/src/features/library/libraryViewState.ts')
  const { nextMenuItemIndex } = await server.ssrLoadModule('/src/utils/menuKeyboard.ts')
  const { appearanceCssVariables } = await server.ssrLoadModule('/src/utils/theme.ts')
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

  const hero = render(LibraryHero, {
    repo,
    installedApp,
    latestVersion: 'v2.0.0',
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
