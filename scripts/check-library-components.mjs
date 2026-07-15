import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
})

try {
  const [
    { LanguageProvider },
    { default: LibraryHero },
    { default: LibrarySidebar },
    { default: VersionPanel },
    { default: ApplicationDetails },
    { default: FolderManager },
    { default: BatchUpdatePanel },
    { getLibraryAppStatus, getLibraryStatusRank, getUpdateDismissKey },
  ] = await Promise.all([
    server.ssrLoadModule('/src/i18n.tsx'),
    server.ssrLoadModule('/src/features/library/components/LibraryHero.tsx'),
    server.ssrLoadModule('/src/features/library/components/LibrarySidebar.tsx'),
    server.ssrLoadModule('/src/features/library/components/VersionPanel.tsx'),
    server.ssrLoadModule('/src/features/library/components/ApplicationDetails.tsx'),
    server.ssrLoadModule('/src/features/library/components/FolderManager.tsx'),
    server.ssrLoadModule('/src/features/library/components/BatchUpdatePanel.tsx'),
    server.ssrLoadModule('/src/features/library/libraryStatus.ts'),
  ])

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
    viewMode: 'home',
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
    onViewModeChange: noop,
    onQueryChange: noop,
    onToggleSection: noop,
    onEmptyAction: noop,
    onLoadMore: noop,
    renderRepository: (item) => React.createElement('span', { key: item.id }, item.name),
  })
  assert.match(sidebar, /library-sam-list-pane/)
  assert.match(sidebar, /library-search/)

  assert.match(render(VersionPanel, { repoName: repo.name, installedApp, latestVersion: 'v2.0.0' }), /library-inline-panel--versions/)
  assert.match(render(ApplicationDetails, { repo, updatedDate: '16.07.2026', latestVersion: 'v2.0.0', installPath: 'C:\\Apps\\demo-app' }), /library-inline-panel--details/)
  assert.match(render(FolderManager, { targetName: repo.name, existingNames: [], onCancel: noop, onConfirm: noop }), /role="dialog"/)
  assert.match(render(BatchUpdatePanel, {
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
  }), /updates-center-row/)

  console.log('[components] library panels and status rules: ok')
} finally {
  await server.close()
}
