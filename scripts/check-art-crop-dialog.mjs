import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PULLORA_PLAYWRIGHT_PATH ?? 'playwright')
const BASE_URL = process.env.PULLORA_TEST_BASE_URL ?? 'http://127.0.0.1:4173'
const EDGE_PATH = process.env.PULLORA_BROWSER_PATH
const CAPTURE_BASELINE = process.argv.includes('--capture-baseline')
const BASELINE_DIR = resolve('docs/visual-baseline/design-contract')
const PREVIEW = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="600" height="400" fill="#124c73"/><rect x="600" width="600" height="400" fill="#4fb7d6"/>
    <rect y="400" width="600" height="400" fill="#d2b95b"/><rect x="600" y="400" width="600" height="400" fill="#6e3b68"/>
    <path d="M600 0v800M0 400h1200" stroke="#f4f6f8" stroke-width="12" opacity=".9"/>
    <circle cx="600" cy="400" r="72" fill="none" stroke="#f4f6f8" stroke-width="16"/>
    <text x="48" y="78" fill="#f4f6f8" font-family="Segoe UI, sans-serif" font-size="48" font-weight="700">TOP LEFT</text>
    <text x="1152" y="78" text-anchor="end" fill="#07111a" font-family="Segoe UI, sans-serif" font-size="48" font-weight="700">TOP RIGHT</text>
    <text x="48" y="748" fill="#07111a" font-family="Segoe UI, sans-serif" font-size="48" font-weight="700">BOTTOM LEFT</text>
    <text x="1152" y="748" text-anchor="end" fill="#f4f6f8" font-family="Segoe UI, sans-serif" font-size="48" font-weight="700">BOTTOM RIGHT</text>
  </svg>
`)}`

const repo = {
  id: 1,
  name: 'steam-achievement-manager',
  full_name: 'CpPrice11/steam-achievement-manager',
  owner: { login: 'CpPrice11', avatar_url: PREVIEW },
  description: 'Steam application manager',
  stargazers_count: 42,
  updated_at: '2026-08-12T10:00:00Z',
  html_url: 'https://github.com/CpPrice11/steam-achievement-manager',
  language: 'JavaScript',
  topics: ['desktop'],
  has_releases: true,
  fork: false,
  archived: false,
  private: false,
}

async function seedPage(page, {
  previewPending = false,
  savePending = false,
  theme = 'dark',
  libraryDensity = 'normal',
  appearance = { density: 'comfortable', surfaceTransparency: 42, surfaceBlur: 12 },
  artCrop,
} = {}) {
  await page.addInitScript(({
    repo,
    preview,
    previewPending,
    savePending,
    theme,
    libraryDensity,
    appearance,
    artCrop,
  }) => {
    localStorage.clear()
    localStorage.setItem('pullora-library-view-v1', JSON.stringify({
      version: 1,
      query: '',
      filter: 'all',
      sort: 'updated',
      density: libraryDensity,
      featuredRepoKey: null,
      sidebarScrollTop: 0,
      detailsScrollTop: 0,
    }))
    const callbacks = new Map()
    let callbackId = 1
    const art = {
      owner: 'CpPrice11',
      repo: 'steam-achievement-manager',
      coverPath: 'C:\\Pictures\\cover.png',
      backgroundPath: 'C:\\Pictures\\hero.png',
      coverDataUrl: preview,
      backgroundDataUrl: preview,
      coverCrop: artCrop ?? { focusX: 0.2, focusY: 0.3, zoom: 1.5 },
      backgroundCrop: artCrop ?? { focusX: 0.76, focusY: 0.24, zoom: 1.65 },
      updatedAt: '2026-08-12T10:00:00Z',
    }
    const launcherArt = (artTheme) => ({
      owner: '__pullora__',
      repo: `global-${artTheme}`,
      coverPath: null,
      backgroundPath: `C:\\Pictures\\launcher-${artTheme}.png`,
      coverDataUrl: null,
      backgroundDataUrl: preview,
      coverCrop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
      backgroundCrop: artCrop ?? (artTheme === 'light'
        ? { focusX: 0.83, focusY: 0.27, zoom: 1.8 }
        : { focusX: 0.18, focusY: 0.72, zoom: 1.35 }),
      updatedAt: '2026-08-12T10:00:00Z',
    })
    const artFor = (owner, name) => {
      if (owner === '__pullora__' && name === 'global-light') return launcherArt('light')
      if (owner === '__pullora__' && name === 'global-dark') return launcherArt('dark')
      if (owner === '__pullora__' && name === 'global') return launcherArt(theme)
      if (owner === '__air_launcher__' && name === 'global') return launcherArt(theme)
      return art
    }
    window.__PULLORA_TEST_ART_SAVE_CALLS__ = []
    window.__PULLORA_TEST_ART_PREVIEW_CALLS__ = 0
    window.__PULLORA_TEST_ART_PREVIEW_PENDING__ = previewPending
    window.__PULLORA_TEST_ART_SAVE_PENDING__ = savePending
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback, once = false) {
        const id = callbackId++
        callbacks.set(id, (value) => {
          if (once) callbacks.delete(id)
          callback?.(value)
        })
        return id
      },
      unregisterCallback(id) { callbacks.delete(id) },
      runCallback(id, value) { callbacks.get(id)?.(value) },
      convertFileSrc(path) { return path },
      async invoke(command, args = {}) {
        if (command === 'get_settings') {
          return {
            version: 2,
            installationPath: 'C:\\Users\\Tester\\AppData\\Local\\Pullora\\Apps',
            includePrereleases: false,
            assetStrategy: 'portableFirst',
            githubOwner: 'CpPrice11',
            githubToken: null,
            theme,
            language: 'uk',
            appearance,
          }
        }
        if (command === 'is_first_launch') return false
        if (command === 'list_owner_repositories') {
          return { items: [structuredClone(repo)], page: 1, has_more: false }
        }
        if (command === 'get_releases') return []
        if (command === 'get_launcher_version') return 'v5.17.0'
        if (command === 'get_launcher_installation_mode') return 'portable'
        if (command === 'get_github_rate_limit_status') {
          return {
            core: { remaining: null, limit: null, resetAt: null },
            search: { remaining: null, limit: null, resetAt: null },
          }
        }
        if (command === 'validate_installation_path') return { ok: true, status: 'ok' }
        if (command === 'check_is_favorite') return false
        if (command === 'get_library_folders') return []
        if (command === 'save_library_folders') return structuredClone(args.folders ?? [])
        if (command === 'get_project_art_asset') return structuredClone(artFor(args.owner, args.repo))
        if (command === 'list_project_art_assets') return [structuredClone(art)]
        if (command === 'get_project_art_preview') {
          window.__PULLORA_TEST_ART_PREVIEW_CALLS__ += 1
          if (window.__PULLORA_TEST_ART_PREVIEW_PENDING__) {
            return new Promise((resolve, reject) => {
              window.__PULLORA_TEST_RESOLVE_ART_PREVIEW__ = resolve
              window.__PULLORA_TEST_REJECT_ART_PREVIEW__ = reject
            })
          }
          return preview
        }
        if (command === 'set_project_art_crop_command') {
          window.__PULLORA_TEST_ART_SAVE_CALLS__.push(structuredClone(args))
          if (window.__PULLORA_TEST_ART_SAVE_PENDING__) {
            return new Promise((resolve, reject) => {
              window.__PULLORA_TEST_RESOLVE_ART_SAVE__ = resolve
              window.__PULLORA_TEST_REJECT_ART_SAVE__ = reject
            })
          }
          return { ...structuredClone(art), [`${args.kind}Crop`]: args.crop }
        }
        if (['get_downloads', 'get_favorites', 'get_installed_apps', 'get_event_log'].includes(command)) return []
        if (command === 'plugin:event|listen') return args.handler
        if (command === 'plugin:event|unlisten') return null
        return null
      },
    }
  }, {
    repo,
    preview: PREVIEW,
    previewPending,
    savePending,
    theme,
    libraryDensity,
    appearance,
    artCrop,
  })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByText('steam-achievement-manager', { exact: true }).first().waitFor()
}

async function openCropDialog(page) {
  const card = page.locator('.repo-card').filter({ hasText: 'steam-achievement-manager' }).first()
  await card.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Обкладинка', exact: true }).hover()
  await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click()
  const dialog = page.locator('.art-crop-modal')
  const preview = dialog.locator('.art-crop-preview')
  const image = dialog.locator('.art-crop-canvas > img')
  await dialog.waitFor()
  await image.waitFor()
  await page.waitForFunction((element) => element.complete, await image.elementHandle())
  await preview.waitFor()
  return { card, dialog, preview }
}

async function openArtCropDialog(page, menuItemName) {
  const card = page.locator('.repo-card').filter({ hasText: 'steam-achievement-manager' }).first()
  await card.click({ button: 'right' })
  await page.getByRole('menuitem', {
    name: menuItemName.includes('обкладинку') ? 'Обкладинка' : 'Фон',
    exact: true,
  }).hover()
  await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click()
  const dialog = page.locator('.art-crop-modal')
  const preview = dialog.locator('.art-crop-preview')
  const image = dialog.locator('.art-crop-canvas > img')
  await dialog.waitFor()
  await image.waitFor()
  await page.waitForFunction((element) => element.complete, await image.elementHandle())
  await preview.waitFor()
  return { dialog, preview }
}

async function cropStyle(preview) {
  return preview.evaluate((element) => ({
    x: element.style.getPropertyValue('--art-focus-x'),
    y: element.style.getPropertyValue('--art-focus-y'),
    zoom: element.style.getPropertyValue('--art-zoom'),
  }))
}

async function cropContract(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      x: style.getPropertyValue('--art-focus-x').trim(),
      y: style.getPropertyValue('--art-focus-y').trim(),
      zoom: style.getPropertyValue('--art-zoom').trim(),
    }
  })
}

async function surfaceContract(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      opacity: style.getPropertyValue('--surface-opacity').trim(),
      blur: style.getPropertyValue('--surface-blur').trim(),
      surface: style.getPropertyValue('--surface-1').trim(),
      border: style.getPropertyValue('--surface-border').trim(),
    }
  })
}

async function materialContract(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      borderColor: style.borderTopColor,
    }
  })
}

async function renderedCrop(locator, image = false) {
  return locator.evaluate((element, usesImage) => {
    const style = getComputedStyle(element)
    return {
      position: usesImage ? style.objectPosition : style.backgroundPosition,
      transform: style.transform,
    }
  }, image)
}

async function layoutContract(page) {
  return page.locator([
    '.library-sam-workspace',
    '.library-sam-list-pane',
    '.library-sam-details-pane',
    '.library-hero',
    '.library-play-status',
  ].join(', ')).evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect()
    return {
      className: element.className,
      x: Math.round(box.x * 100) / 100,
      y: Math.round(box.y * 100) / 100,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    }
  }))
}

async function assertNoHorizontalOverflow(page, selectors) {
  const overflows = await page.locator(selectors.join(', ')).evaluateAll((elements) => elements
    .map((element) => {
      const style = getComputedStyle(element)
      return {
        className: element.className || element.tagName,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: style.overflowX,
      }
    })
    .filter((item) => item.scrollWidth > item.clientWidth + 1 && !['hidden', 'clip'].includes(item.overflowX)))
  assert.deepEqual(overflows, [])
}

async function assertReducedMotion(locator) {
  const motion = await locator.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element)
    return {
      className: element.className,
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount,
      transitionDuration: style.transitionDuration,
    }
  }))
  const milliseconds = (value) => Math.max(...value.split(',').map((part) => {
    const duration = Number.parseFloat(part)
    return part.trim().endsWith('ms') ? duration : duration * 1000
  }))
  for (const item of motion) {
    assert(milliseconds(item.animationDuration) <= 0.001, item)
    assert(milliseconds(item.transitionDuration) <= 0.001, item)
    assert(item.animationIterationCount.split(',').every((count) => Number(count) <= 1), item)
  }
}

async function assertGlobalBackground(page, expectedCrop, expectedSurface, expectedMaterial, surfaceSelector) {
  const background = page.locator('.cinematic-background')
  const surface = page.locator(surfaceSelector).first()
  await surface.waitFor()
  assert.deepEqual(await cropContract(background), expectedCrop)
  assert.deepEqual(await surfaceContract(surface), expectedSurface)
  assert.deepEqual(await materialContract(surface), expectedMaterial)
}

async function assertPrimaryActionContract(page) {
  const selectors = [
    'primary-btn',
    'hero-primary-btn',
    'install-btn',
    'confirm-primary-btn',
    'release-action-primary',
    'download-action-btn primary',
  ]
  await page.evaluate((classes) => {
    const probe = document.createElement('div')
    probe.id = 'primary-action-contract-probe'
    probe.className = 'modal-content'
    Object.assign(probe.style, {
      display: 'flex',
      gap: '8px',
      left: '12px',
      position: 'fixed',
      top: '12px',
      zIndex: '99999',
    })
    for (const className of classes) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = className
      button.textContent = className
      probe.append(button)
    }
    document.querySelector('.cinematic-shell').append(probe)
  }, selectors)

  const buttons = page.locator('#primary-action-contract-probe > button')
  const baseline = await buttons.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundImage,
      color: style.color,
      textToken: style.getPropertyValue('--action-primary-text').trim(),
    }
  }))
  for (const style of baseline) {
    assert.equal(style.color, 'rgb(255, 255, 255)')
    assert.equal(style.textToken, '#ffffff')
    assert.match(style.background, /linear-gradient/)
  }
  assert.equal(new Set(baseline.map((style) => style.background)).size, 1)

  for (let index = 0; index < selectors.length; index += 1) {
    const button = buttons.nth(index)
    await button.hover()
    await page.waitForTimeout(220)
    const hover = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundImage, color: style.color }
    })
    assert.equal(hover.color, 'rgb(255, 255, 255)')
    assert.notEqual(hover.background, baseline[index].background)

    await button.focus()
    const focus = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
    })
    assert.deepEqual(focus, { outlineStyle: 'solid', outlineWidth: '3px' })

    await button.hover()
    await page.mouse.down()
    await page.waitForTimeout(60)
    const active = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return { filter: style.filter, transform: style.transform }
    })
    await page.mouse.up()
    assert.notEqual(active.filter, 'none')
    assert.notEqual(active.transform, 'none')

    await button.evaluate((element) => element.setAttribute('aria-busy', 'true'))
    assert.equal(await button.evaluate((element) => getComputedStyle(element).cursor), 'progress')

    await button.evaluate((element) => {
      element.removeAttribute('aria-busy')
      element.disabled = true
    })
    await page.waitForTimeout(220)
    const disabled = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        background: style.backgroundImage || style.backgroundColor,
        boxShadow: style.boxShadow,
        cursor: style.cursor,
        opacity: Number(style.opacity),
        transform: style.transform,
      }
    })
    await button.hover()
    await page.waitForTimeout(220)
    const disabledHoverBackground = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      return style.backgroundImage || style.backgroundColor
    })
    assert.equal(disabledHoverBackground, disabled.background)
    assert.equal(disabled.boxShadow, 'none')
    assert.equal(disabled.cursor, 'not-allowed')
    assert(disabled.opacity < 1)
    assert.equal(disabled.transform, 'none')
    await button.evaluate((element) => { element.disabled = false })
  }
  await page.locator('#primary-action-contract-probe').evaluate((element) => element.remove())
}

async function checkPreviewParity(browser) {
  const scenarios = ['dark', 'light'].flatMap((theme) =>
    ['normal', 'compact'].flatMap((libraryDensity) => [
      { theme, libraryDensity, appearance: { density: 'comfortable', surfaceTransparency: 42, surfaceBlur: 12 } },
      { theme, libraryDensity, appearance: { density: 'comfortable', surfaceTransparency: 68, surfaceBlur: 27 } },
    ]),
  )

  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'uk-UA' })
    const page = await context.newPage()
    await seedPage(page, scenario)

    const librarySurface = page.locator('.library-sam-list-pane')
    const globalBackground = page.locator('.cinematic-background')
    const heroBackground = page.locator('.library-hero-background img')
    await page.locator(`.library-page.library-density-${scenario.libraryDensity}`).waitFor()
    await page.waitForFunction((element) => getComputedStyle(element).backgroundImage !== 'none', await globalBackground.elementHandle())
    await page.waitForFunction((element) => element.complete, await heroBackground.elementHandle())

    const expectedGlobalCrop = await cropContract(globalBackground)
    const expectedSurface = await surfaceContract(librarySurface)
    const expectedMaterial = await materialContract(librarySurface)
    assert.equal(expectedSurface.opacity, `${100 - scenario.appearance.surfaceTransparency}%`)
    assert.equal(expectedSurface.blur, `${scenario.appearance.surfaceBlur}px`)
    if (scenario.libraryDensity === 'normal' && scenario.appearance.surfaceTransparency === 42) {
      await assertPrimaryActionContract(page)
    }

    const primaryAction = page.locator('.library-ops-action-row .hero-primary-btn')
    const readPrimaryAction = () => primaryAction.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        background: style.backgroundImage,
        color: style.color,
        textToken: style.getPropertyValue('--action-primary-text').trim(),
      }
    })
    const primaryStyle = await readPrimaryAction()
    assert.equal(primaryStyle.color, 'rgb(255, 255, 255)')
    assert.equal(primaryStyle.textToken, '#ffffff')
    assert.match(primaryStyle.background, /linear-gradient/)
    await primaryAction.hover()
    const primaryHoverStyle = await readPrimaryAction()
    assert.equal(primaryHoverStyle.color, 'rgb(255, 255, 255)')
    assert.notEqual(primaryHoverStyle.background, primaryStyle.background)

    const expectedHeroCrop = await cropContract(heroBackground)
    const card = page.locator('.repo-card').filter({ hasText: 'steam-achievement-manager' }).first()
    await card.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Фон', exact: true }).hover()
    await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click()
    let dialog = page.locator('.art-crop-modal')
    let preview = dialog.locator('.art-crop-preview')
    assert.equal(await preview.getAttribute('data-preview-mode'), scenario.libraryDensity)
    await dialog.locator('.art-crop-canvas > img').waitFor()
    assert.deepEqual(await cropContract(preview), expectedHeroCrop)
    const [previewBox, heroBox] = await Promise.all([preview.boundingBox(), page.locator('.library-hero').boundingBox()])
    assert(previewBox && heroBox)
    assert(Math.abs(previewBox.width / previewBox.height - heroBox.width / heroBox.height) < 0.01)
    await dialog.getByRole('button', { name: 'Скасувати' }).click()
    await dialog.waitFor({ state: 'hidden' })

    await page.getByRole('button', { name: 'Налаштування' }).click()
    await assertGlobalBackground(page, expectedGlobalCrop, expectedSurface, expectedMaterial, '.settings-workspace')
    const settingsPreview = page.locator('.settings-theme-preview-canvas')
    const settingsPreviewImage = settingsPreview.locator('.settings-theme-preview-image')
    await settingsPreviewImage.waitFor()
    assert.deepEqual(await cropContract(settingsPreviewImage), expectedGlobalCrop)
    const [settingsPreviewBox, globalBackgroundBox] = await Promise.all([
      settingsPreview.boundingBox(),
      globalBackground.boundingBox(),
    ])
    assert(settingsPreviewBox && globalBackgroundBox)
    assert(Math.abs(
      settingsPreviewBox.width / settingsPreviewBox.height - globalBackgroundBox.width / globalBackgroundBox.height,
    ) < 0.01)
    assert.deepEqual(
      await settingsPreviewImage.evaluate((element) => {
        const style = getComputedStyle(element)
        return { filter: style.filter, opacity: style.opacity }
      }),
      await globalBackground.evaluate((element) => {
        const style = getComputedStyle(element)
        return { filter: style.filter, opacity: style.opacity }
      }),
    )
    const themeName = scenario.theme === 'light' ? 'Світла' : 'Темна'
    const themeRow = page.locator('.launcher-background-theme').filter({ hasText: themeName })
    await themeRow.getByRole('button', { name: `Редагувати кадрування фону — ${themeName}` }).click()
    dialog = page.locator('.art-crop-modal')
    preview = dialog.locator('.art-crop-preview')
    await dialog.locator('.art-crop-canvas > img').waitFor()
    assert.deepEqual(await cropContract(preview), expectedGlobalCrop)
    assert.deepEqual(await surfaceContract(dialog.locator('.art-crop-stage')), expectedSurface)
    await dialog.getByRole('button', { name: 'Скасувати' }).click()
    await dialog.waitFor({ state: 'hidden' })

    await page.getByRole('button', { name: 'Про застосунок' }).click()
    await assertGlobalBackground(page, expectedGlobalCrop, expectedSurface, expectedMaterial, '.about-hero')
    await page.getByRole('button', { name: 'Бібліотека' }).click()
    await assertGlobalBackground(page, expectedGlobalCrop, expectedSurface, expectedMaterial, '.library-sam-list-pane')
    await context.close()
  }
}

async function checkLayoutIntegrity(browser) {
  const scenarios = ['dark', 'light'].flatMap((theme) =>
    ['normal', 'compact'].flatMap((libraryDensity) => [
      { theme, libraryDensity, viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 },
      { theme, libraryDensity, viewport: { width: 1707, height: 1067 }, deviceScaleFactor: 1.5 },
      { theme, libraryDensity, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.25 },
    ]),
  )

  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: scenario.deviceScaleFactor,
      colorScheme: scenario.theme,
      locale: 'uk-UA',
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await seedPage(page, {
      theme: scenario.theme,
      libraryDensity: scenario.libraryDensity,
      artCrop: { focusX: 1, focusY: 1, zoom: 4 },
    })
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
    const hero = page.locator('.library-hero')
    const heroBackground = hero.locator(':scope > .library-hero-background')
    await heroBackground.waitFor()
    const clip = await hero.evaluate((element) => {
      const style = getComputedStyle(element)
      return { overflowX: style.overflowX, overflowY: style.overflowY }
    })
    assert.deepEqual(clip, { overflowX: 'hidden', overflowY: 'hidden' })
    assert(await heroBackground.evaluate((element) => element.parentElement?.classList.contains('library-hero')))

    const before = await layoutContract(page)
    await assertNoHorizontalOverflow(page, [
      'html',
      'body',
      '.layout',
      '.layout-content',
      '.library-page',
      '.library-sam-workspace',
      '.library-sam-details-pane',
    ])
    await assertReducedMotion(page.locator('.layout-content, .library-page, .library-hero, .library-hero-background, .library-hero-background img'))

    const { dialog, preview } = await openArtCropDialog(page, 'Редагувати фон')
    const previewBox = await preview.boundingBox()
    const dialogBox = await dialog.boundingBox()
    assert(previewBox && dialogBox)
    assert(dialogBox.width <= scenario.viewport.width - 48 + 2)
    assert(dialogBox.height <= scenario.viewport.height - 48 + 2)
    if (scenario.viewport.width >= 1280) {
      assert(dialogBox.width >= 1190, `Crop dialog width ${dialogBox.width}px is too small at ${scenario.viewport.width}px`)
    }
    if (scenario.viewport.height >= 900) {
      assert(dialogBox.height >= 840, `Crop dialog height ${dialogBox.height}px is too small at ${scenario.viewport.height}px`)
    }
    await preview.focus()
    await preview.press('Home')
    await preview.press('Shift+ArrowRight')
    await preview.press('Shift+ArrowDown')
    const resetBox = await preview.boundingBox()
    assert(resetBox)
    await preview.press('PageUp')
    await preview.press('PageUp')
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const previewAfter = await preview.boundingBox()
    assert(previewAfter)
    assert(previewAfter.width < resetBox.width)
    assert(Math.abs(previewAfter.width / previewAfter.height - resetBox.width / resetBox.height) < 0.01)
    const canvasBox = await dialog.locator('.art-crop-canvas').boundingBox()
    assert(canvasBox)
    assert(previewAfter.x >= canvasBox.x - 2)
    assert(previewAfter.y >= canvasBox.y - 2)
    assert(previewAfter.x + previewAfter.width <= canvasBox.x + canvasBox.width + 2)
    assert(previewAfter.y + previewAfter.height <= canvasBox.y + canvasBox.height + 2)
    assert.deepEqual(await dialog.boundingBox(), dialogBox)
    assert.deepEqual(await layoutContract(page), before)
    await assertNoHorizontalOverflow(page, ['.art-crop-modal', '.art-crop-body', '.art-crop-preview'])
    await assertReducedMotion(page.locator('.modal-overlay, .art-crop-modal, .art-crop-preview, .art-crop-canvas > img'))

    const expectedCrop = await cropContract(preview)
    await dialog.getByRole('button', { name: 'Зберегти' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(
      (crop) => {
        const element = document.querySelector('.library-hero-background img')
        if (!element) return false
        const style = getComputedStyle(element)
        return style.getPropertyValue('--art-focus-x').trim() === crop.x
          && style.getPropertyValue('--art-focus-y').trim() === crop.y
          && style.getPropertyValue('--art-zoom').trim() === crop.zoom
      },
      expectedCrop,
    )
    assert.deepEqual(await layoutContract(page), before)
    await assertNoHorizontalOverflow(page, [
      'html',
      'body',
      '.layout',
      '.layout-content',
      '.library-page',
      '.library-sam-workspace',
      '.library-sam-details-pane',
    ])
    await context.close()
  }
}

async function captureCropBaselines(browser) {
  if (!CAPTURE_BASELINE) return 0
  mkdirSync(BASELINE_DIR, { recursive: true })
  const viewports = [[1000, 700], [1280, 720], [1707, 1067], [1920, 1080]]
  const scales = [1, 1.25]
  const extremes = [
    ['top-left-min', { focusX: 0, focusY: 0, zoom: 1 }],
    ['bottom-right-max', { focusX: 1, focusY: 1, zoom: 4 }],
  ]
  let captured = 0

  for (const theme of ['dark', 'light']) {
    for (const [width, height] of viewports) {
      for (const deviceScaleFactor of scales) {
        for (const [extreme, artCrop] of extremes) {
          const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor,
            colorScheme: theme,
            locale: 'uk-UA',
            reducedMotion: 'reduce',
          })
          const page = await context.newPage()
          await seedPage(page, { theme, artCrop })
          assert.equal(await page.evaluate(() => window.devicePixelRatio), deviceScaleFactor)
          const suffix = `${theme}-${width}x${height}-${deviceScaleFactor === 1 ? '100' : '125'}pct-${extreme}`

          let { dialog, preview } = await openArtCropDialog(page, 'Редагувати обкладинку')
          assert.deepEqual(await cropContract(preview), {
            x: `${artCrop.focusX * 100}%`,
            y: `${artCrop.focusY * 100}%`,
            zoom: String(artCrop.zoom),
          })
          await preview.screenshot({ path: resolve(BASELINE_DIR, `art-crop-cover-${suffix}.png`), animations: 'disabled' })
          captured += 1
          await dialog.getByRole('button', { name: 'Скасувати' }).click()

          ;({ dialog, preview } = await openArtCropDialog(page, 'Редагувати фон'))
          await preview.screenshot({ path: resolve(BASELINE_DIR, `art-crop-hero-${suffix}.png`), animations: 'disabled' })
          captured += 1
          await dialog.getByRole('button', { name: 'Скасувати' }).click()

          await page.getByRole('button', { name: 'Налаштування' }).click()
          const themeName = theme === 'light' ? 'Світла' : 'Темна'
          const themeRow = page.locator('.launcher-background-theme').filter({ hasText: themeName })
          await themeRow.getByRole('button', { name: `Редагувати кадрування фону — ${themeName}` }).click()
          dialog = page.locator('.art-crop-modal')
          preview = dialog.locator('.art-crop-preview')
          await dialog.locator('.art-crop-canvas > img').waitFor()
          await preview.screenshot({ path: resolve(BASELINE_DIR, `art-crop-workspace-${suffix}.png`), animations: 'disabled' })
          captured += 1
          await context.close()
        }
      }
    }
  }

  return captured
}

async function checkCancelAndControls(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'uk-UA' })
  const page = await context.newPage()
  await seedPage(page)
  const { card, dialog, preview } = await openCropDialog(page)
  assert.equal(await dialog.getAttribute('role'), 'dialog')
  assert.equal(await dialog.getAttribute('aria-modal'), 'true')
  assert(await dialog.evaluate((element) => !element.closest('.repo-card') && element.parentElement.classList.contains('modal-overlay')))
  const cancel = dialog.getByRole('button', { name: 'Скасувати' })
  await page.waitForFunction((element) => element === document.activeElement, await cancel.elementHandle())
  assert.deepEqual(await cropStyle(preview), { x: '20%', y: '30%', zoom: '1.5' })

  const initialBox = await preview.boundingBox()
  const canvasBox = await dialog.locator('.art-crop-canvas').boundingBox()
  assert(initialBox && canvasBox)
  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(initialBox.x + initialBox.width / 2 + 24, initialBox.y + initialBox.height / 2 + 18)
  await page.mouse.up()
  const dragged = await cropStyle(preview)
  assert(Number.parseFloat(dragged.x) > 20)
  assert(Number.parseFloat(dragged.y) > 30)

  await preview.focus()
  await preview.press('Shift+ArrowRight')
  assert(Number.parseFloat((await cropStyle(preview)).x) > Number.parseFloat(dragged.x))

  let box = await preview.boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x - canvasBox.width, box.y + box.height / 2)
  await page.mouse.up()
  assert.equal(Number.parseFloat((await cropStyle(preview)).x), 0)

  box = await preview.boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.width * 2, box.y + box.height / 2)
  await page.mouse.up()
  assert(Math.abs(Number.parseFloat((await cropStyle(preview)).x) - 100) < 0.1)

  await dialog.getByRole('button', { name: 'Скинути кадрування' }).click()
  assert.deepEqual(await cropStyle(preview), { x: '50%', y: '50%', zoom: '1' })

  box = await preview.boundingBox()
  assert(box)
  const initialRatio = box.width / box.height
  const handle = dialog.locator('.art-crop-handle--bottom-right')
  const handleBox = await handle.boundingBox()
  assert(handleBox)
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x - box.width * 0.2, handleBox.y - box.height * 0.2)
  await page.mouse.up()
  const resizedBox = await preview.boundingBox()
  const resizedCanvasBox = await dialog.locator('.art-crop-canvas').boundingBox()
  assert(resizedBox && resizedCanvasBox)
  assert(resizedBox.width < box.width)
  assert(Math.abs(resizedBox.width / resizedBox.height - initialRatio) < 0.01)
  assert(Math.abs(resizedBox.x - box.x) < 2)
  assert(Math.abs(resizedBox.y - box.y) < 2)
  assert(Number.parseFloat((await cropStyle(preview)).zoom) > 1)
  assert(resizedBox.x >= resizedCanvasBox.x - 2)
  assert(resizedBox.y >= resizedCanvasBox.y - 2)
  assert(resizedBox.x + resizedBox.width <= resizedCanvasBox.x + resizedCanvasBox.width + 2)
  assert(resizedBox.y + resizedBox.height <= resizedCanvasBox.y + resizedCanvasBox.height + 2)

  const beforeWheel = await cropStyle(preview)
  await preview.dispatchEvent('wheel', { deltaY: -200 })
  assert.deepEqual(await cropStyle(preview), beforeWheel)

  await dialog.getByRole('button', { name: 'Скинути кадрування' }).click()
  await cancel.click()
  await dialog.waitFor({ state: 'hidden' })
  assert(await card.evaluate((element) => element === document.activeElement))
  assert.equal(await page.evaluate(() => window.__PULLORA_TEST_ART_SAVE_CALLS__.length), 0)
  await context.close()
}

async function checkInteractionPerformance(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'uk-UA' })
  const page = await context.newPage()
  await seedPage(page)
  const { dialog, preview } = await openCropDialog(page)
  const image = dialog.locator('.art-crop-canvas > img')

  await image.evaluate((element) => {
    window.__PULLORA_TEST_ART_PERFORMANCE__ = {
      image: element,
      source: element.src,
      loads: 0,
      mutations: 0,
    }
    element.addEventListener('load', () => { window.__PULLORA_TEST_ART_PERFORMANCE__.loads += 1 })
  })
  await preview.evaluate((element) => new MutationObserver((records) => {
    window.__PULLORA_TEST_ART_PERFORMANCE__.mutations += records.length
  }).observe(element, { attributes: true, attributeFilter: ['style'] }))

  const box = await preview.boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const dragMetrics = await preview.evaluate(async (element) => {
    const bounds = element.getBoundingClientRect()
    const frameTimes = []
    const dispatchTimes = []
    for (let step = 1; step <= 60; step += 1) {
      await new Promise(requestAnimationFrame)
      frameTimes.push(performance.now())
      const startedAt = performance.now()
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: bounds.left + bounds.width * (0.5 + step / 240),
        clientY: bounds.top + bounds.height * (0.5 + step / 300),
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      }))
      dispatchTimes.push(performance.now() - startedAt)
    }
    const intervals = frameTimes.slice(1).map((time, index) => time - frameTimes[index]).sort((a, b) => a - b)
    dispatchTimes.sort((a, b) => a - b)
    return {
      maxFrame: Math.max(...intervals),
      p95Frame: intervals[Math.floor(intervals.length * 0.95)],
      maxDispatch: Math.max(...dispatchTimes),
      p95Dispatch: dispatchTimes[Math.floor(dispatchTimes.length * 0.95)],
    }
  })
  await page.mouse.up()

  assert(dragMetrics.p95Frame < 67, `Drag p95 frame interval was ${dragMetrics.p95Frame.toFixed(1)} ms`)
  assert(dragMetrics.maxFrame < 150, `Drag max frame interval was ${dragMetrics.maxFrame.toFixed(1)} ms`)
  assert(dragMetrics.p95Dispatch < 8, `Drag p95 pointer handler was ${dragMetrics.p95Dispatch.toFixed(1)} ms`)
  assert(dragMetrics.maxDispatch < 20, `Drag max pointer handler was ${dragMetrics.maxDispatch.toFixed(1)} ms`)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await preview.evaluate(async (element) => {
    window.__PULLORA_TEST_ART_PERFORMANCE__.mutations = 0
    const bounds = element.getBoundingClientRect()
    for (let step = 1; step <= 200; step += 1) {
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: bounds.left + bounds.width * (0.5 + step / 1000),
        clientY: bounds.top + bounds.height * (0.5 + step / 1200),
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      }))
    }
    await new Promise(requestAnimationFrame)
  })
  await page.mouse.up()
  const dragMutations = await page.evaluate(() => window.__PULLORA_TEST_ART_PERFORMANCE__.mutations)
  assert(dragMutations <= 6, `Burst drag caused ${dragMutations} frame mutations`)

  const handle = dialog.locator('.art-crop-handle--bottom-right')
  const handleBox = await handle.boundingBox()
  assert(handleBox)
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await handle.evaluate(async (element) => {
    window.__PULLORA_TEST_ART_PERFORMANCE__.mutations = 0
    const bounds = element.getBoundingClientRect()
    for (let step = 1; step <= 100; step += 1) {
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        buttons: 1,
        clientX: bounds.left - step / 2,
        clientY: bounds.top - step / 8,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      }))
    }
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  })
  await page.mouse.up()
  const performanceContract = await page.evaluate(() => ({
    previewCalls: window.__PULLORA_TEST_ART_PREVIEW_CALLS__,
    sameImage: window.__PULLORA_TEST_ART_PERFORMANCE__.image === document.querySelector('.art-crop-canvas > img'),
    sameSource: window.__PULLORA_TEST_ART_PERFORMANCE__.source === document.querySelector('.art-crop-canvas > img').src,
    loads: window.__PULLORA_TEST_ART_PERFORMANCE__.loads,
    resizeMutations: window.__PULLORA_TEST_ART_PERFORMANCE__.mutations,
  }))
  assert.equal(performanceContract.previewCalls, 1)
  assert.equal(performanceContract.sameImage, true)
  assert.equal(performanceContract.sameSource, true)
  assert.equal(performanceContract.loads, 0)
  assert(performanceContract.resizeMutations <= 6, `Burst resize caused ${performanceContract.resizeMutations} frame mutations`)
  await context.close()
}

async function checkSaveBlockingAndError(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'uk-UA' })
  const page = await context.newPage()
  await seedPage(page, { savePending: true })
  const { card, dialog, preview } = await openCropDialog(page)
  await preview.focus()
  await preview.press('ArrowRight')
  const expected = await cropStyle(preview)
  await dialog.getByRole('button', { name: 'Зберегти' }).click()
  assert.equal(await dialog.getAttribute('aria-busy'), 'true')
  assert(await dialog.getByRole('button', { name: 'Скасувати' }).isDisabled())
  await page.keyboard.press('Escape')
  assert(await dialog.isVisible())
  await page.evaluate(() => window.__PULLORA_TEST_REJECT_ART_SAVE__(new Error('expected')))
  await dialog.getByRole('alert').waitFor()
  assert((await dialog.getByRole('alert').innerText()).trim())
  assert.equal(await dialog.getAttribute('aria-busy'), 'false')
  const [call] = await page.evaluate(() => window.__PULLORA_TEST_ART_SAVE_CALLS__)
  assert.equal(call.kind, 'cover')
  assert(Math.abs(call.crop.focusX - Number.parseFloat(expected.x) / 100) < 0.000001)
  assert(Math.abs(call.crop.focusY - Number.parseFloat(expected.y) / 100) < 0.000001)
  assert(Math.abs(call.crop.zoom - Number.parseFloat(expected.zoom)) < 0.000001)
  await dialog.getByRole('button', { name: 'Скасувати' }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert(await card.evaluate((element) => element === document.activeElement))
  await context.close()
}

async function checkPreviewBlockingAndError(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'uk-UA' })
  const page = await context.newPage()
  await seedPage(page, { previewPending: true })
  const card = page.locator('.repo-card').filter({ hasText: 'steam-achievement-manager' }).first()
  await card.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Обкладинка', exact: true }).hover()
  await page.getByRole('menuitem', { name: 'Редагувати', exact: true }).click()
  const dialog = page.locator('.art-crop-modal')
  await dialog.waitFor()
  assert(await dialog.getByRole('button', { name: 'Зберегти' }).isDisabled())
  assert.equal(await dialog.locator('.art-crop-preview').count(), 0)
  await page.evaluate(() => window.__PULLORA_TEST_REJECT_ART_PREVIEW__(new Error('expected')))
  await dialog.waitFor({ state: 'hidden' })
  const toast = page.locator('body > .library-toast--error[role="alert"]')
  await toast.waitFor()
  assert((await toast.innerText()).trim())
  assert(await card.evaluate((element) => element === document.activeElement))
  await context.close()
}

const browser = await chromium.launch({ headless: true, executablePath: EDGE_PATH })
try {
  await checkCancelAndControls(browser)
  await checkSaveBlockingAndError(browser)
  await checkPreviewBlockingAndError(browser)
  await checkPreviewParity(browser)
  await checkLayoutIntegrity(browser)
  await checkInteractionPerformance(browser)
  const captured = await captureCropBaselines(browser)
  console.log(`Art crop dialog checks passed${captured ? `; ${captured} visual baselines captured` : ''}`)
} finally {
  await browser.close()
}
